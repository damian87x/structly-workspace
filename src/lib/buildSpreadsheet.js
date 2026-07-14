const FIELD_COLUMNS = ["vendor", "date", "net", "vat", "gross", "category"];
const CONTEXT_COLUMNS = ["location", "billable_client"];
const REPORT_COLUMNS = ["business_purpose", "payment_method"];
const AUDIT_COLUMNS = ["source_uri", "review_status", "review_reasons"];
const COLUMNS = [
  ...FIELD_COLUMNS,
  ...CONTEXT_COLUMNS,
  ...REPORT_COLUMNS,
  ...AUDIT_COLUMNS,
];
const NUMERIC_COLUMNS = new Set(["net", "vat", "gross"]);
const HEADER_ROW = COLUMNS.join(",");
const SCHEMA_VERSION = 1;
const READY_STATUS = {
  EMPTY: "empty",
  NEEDS_REVIEW: "needs_review",
  READY: "ready",
};

function getDefaultXlsx() {
  return require("xlsx");
}

function toSafeEntryBaseName(filename) {
  const raw = typeof filename === "string" ? filename : "";
  const segments = raw
    .split(/[\\/]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== "." && segment !== "..");
  let base = segments.length > 0 ? segments[segments.length - 1] : "";

  base = base
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[\\/]+/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+/, "")
    .trim();

  // Strip a single trailing extension (e.g. .csv / .CSV / .zip).
  base = base.replace(/\.[^.]+$/i, "");

  base = base
    .replace(/[^A-Za-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return base || "receipts";
}

function buildExportManifest(receipts) {
  return {
    schemaVersion: SCHEMA_VERSION,
    columns: [...COLUMNS],
    rowCount: Array.isArray(receipts) ? receipts.length : 0,
  };
}

function encodeUtf8Bytes(text) {
  return new TextEncoder().encode(String(text ?? ""));
}

function buildExportBundleBase64(
  { csv, manifest, baseName } = {},
  dependencies = {},
) {
  const xlsx = dependencies.xlsx || getDefaultXlsx();
  const CFB = xlsx.CFB;
  const safeBase = toSafeEntryBaseName(baseName);
  const zip = CFB.utils.cfb_new();

  CFB.utils.cfb_add(zip, `${safeBase}.csv`, encodeUtf8Bytes(csv));
  CFB.utils.cfb_add(
    zip,
    `${safeBase}.manifest.json`,
    encodeUtf8Bytes(JSON.stringify(manifest, null, 2)),
  );

  return CFB.write(zip, {
    fileType: "zip",
    type: "base64",
    compression: true,
  });
}

function formatCellValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }

  return String(value);
}

function escapeCsvCell(value) {
  const cell = formatCellValue(value);

  if (!/[",\r\n]/.test(cell)) {
    return cell;
  }

  return `"${cell.replace(/"/g, '""')}"`;
}

function getFields(receipt) {
  return receipt?.fields || {};
}

function getContext(receipt) {
  return receipt?.context && typeof receipt.context === "object"
    ? receipt.context
    : {};
}

function getContextFields(receipt) {
  const context = getContext(receipt);
  const billable = context.billable;
  const billableClient =
    billable?.billable === true ? billable?.client : null;

  return {
    billable_client: billableClient,
    location: context.location?.placeName,
  };
}

function getIssues(receipt) {
  const issues = receipt?.validation?.issues;

  return Array.isArray(issues) ? issues : [];
}

function getSourceUri(receipt) {
  return receipt?.sourceUri || receipt?.imageUri || receipt?.uri || null;
}

function getTextValue(...values) {
  for (const value of values) {
    const normalized = normalizeKeyPart(value);

    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function getBusinessPurpose(receipt) {
  const fields = getFields(receipt);
  const context = getContext(receipt);
  const billable = context.billable;
  const billableClient = getTextValue(billable?.client);
  const billableProject = getTextValue(billable?.project);

  if (billable?.billable === true && (billableClient || billableProject)) {
    return [billableClient, billableProject].filter(Boolean).join(" - ");
  }

  return getTextValue(
    context.businessPurpose,
    context.business_purpose,
    fields.businessPurpose,
    fields.business_purpose,
    context.calendar?.title,
    context.calendar?.summary,
  );
}

function getPaymentMethod(receipt) {
  const fields = getFields(receipt);
  const context = getContext(receipt);

  return getTextValue(
    fields.paymentMethod,
    fields.payment_method,
    context.paymentMethod,
    context.payment_method,
    receipt?.paymentMethod,
  );
}

function getIssueReason(issue) {
  if (issue && typeof issue.message === "string" && issue.message.trim()) {
    return issue.message;
  }

  if (issue && typeof issue.type === "string" && issue.type.trim()) {
    return issue.type;
  }

  return "Needs review.";
}

function buildNeedsReviewRows(receipts) {
  return receipts
    .map((receipt, index) => {
      const issues = getIssues(receipt);
      const needsReview = Boolean(receipt?.validation?.needsReview) || issues.length > 0;

      if (!needsReview) {
        return null;
      }

      return {
        index,
        issues,
        reasons: issues.length > 0 ? issues.map(getIssueReason) : ["Needs review."],
        rowNumber: index + 1,
      };
    })
    .filter(Boolean);
}

function hasSourceProof(receipt) {
  return Boolean(getSourceUri(receipt));
}

function buildMissingProofRows(receipts) {
  return receipts
    .map((receipt, index) =>
      hasSourceProof(receipt)
        ? null
        : {
            index,
            rowNumber: index + 1,
          },
    )
    .filter(Boolean);
}

function normalizeKeyPart(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : null;
  }

  const normalized = String(value).trim();

  return normalized ? normalized : null;
}

function getDuplicateKeyParts(fields) {
  const vendor = normalizeKeyPart(fields.vendor);
  const date = normalizeKeyPart(fields.date);
  const gross = normalizeKeyPart(fields.gross);

  if (!vendor || !date || !gross) {
    return null;
  }

  return {
    date,
    gross,
    key: `${vendor.toLowerCase()}|${date}|${gross}`,
    vendor,
  };
}

function buildDuplicates(receipts) {
  const groups = new Map();

  receipts.forEach((receipt, index) => {
    const parts = getDuplicateKeyParts(getFields(receipt));

    if (!parts) {
      return;
    }

    if (!groups.has(parts.key)) {
      groups.set(parts.key, {
        date: parts.date,
        gross: parts.gross,
        key: parts.key,
        rows: [],
        vendor: parts.vendor,
      });
    }

    groups.get(parts.key).rows.push({
      index,
      rowNumber: index + 1,
    });
  });

  return Array.from(groups.values()).filter((group) => group.rows.length > 1);
}

function parseAmount(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim().replace(/[£$€,\s]/g, "");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDate(value) {
  const normalized = normalizeKeyPart(value);

  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`);

  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() + 1 !== Number(month) ||
    date.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  return `${year}-${month}-${day}`;
}

function getPeriodLabel(startDate, endDate) {
  if (!startDate || !endDate) {
    return "No dated rows";
  }

  if (startDate === endDate) {
    return startDate;
  }

  if (startDate.slice(0, 7) === endDate.slice(0, 7)) {
    return startDate.slice(0, 7);
  }

  return `${startDate} to ${endDate}`;
}

function buildPeriod(receipts) {
  const dates = receipts
    .map((receipt) => normalizeDate(getFields(receipt).date))
    .filter(Boolean)
    .sort();
  const startDate = dates[0] || null;
  const endDate = dates[dates.length - 1] || null;

  return {
    datedRowCount: dates.length,
    endDate,
    label: getPeriodLabel(startDate, endDate),
    startDate,
  };
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeBreakdownLabel(value, fallback) {
  const normalized = normalizeKeyPart(value);

  return normalized || fallback;
}

function addBreakdownValue(map, label, gross) {
  const current = map.get(label) || {
    count: 0,
    gross: 0,
  };

  current.count += 1;
  current.gross += gross || 0;
  map.set(label, current);
}

function buildBreakdownRows(map, labelKey) {
  return Array.from(map.entries())
    .sort(([leftLabel, left], [rightLabel, right]) => {
      const grossDifference = right.gross - left.gross;

      return grossDifference || leftLabel.localeCompare(rightLabel);
    })
    .map(([label, value]) => ({
      [labelKey]: label,
      count: value.count,
      gross: roundMoney(value.gross),
    }));
}

function pluralize(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function buildSummary(receipts, validation) {
  const categoryMap = new Map();
  const billableMap = new Map();
  const locationMap = new Map();
  const totals = receipts.reduce(
    (currentTotals, receipt) => {
      const fields = getFields(receipt);
      const contextFields = getContextFields(receipt);
      const gross = parseAmount(fields.gross);
      const net = parseAmount(fields.net);
      const vat = parseAmount(fields.vat);

      if (getBusinessPurpose(receipt)) {
        currentTotals.businessPurposeCount += 1;
      }

      if (getPaymentMethod(receipt)) {
        currentTotals.paymentMethodCount += 1;
      }

      if (gross !== null) {
        currentTotals.totalGross += gross;
      }

      if (net !== null) {
        currentTotals.totalNet += net;
      }

      if (vat !== null) {
        currentTotals.totalVat += vat;
      }

      addBreakdownValue(
        categoryMap,
        normalizeBreakdownLabel(fields.category, "Uncategorised"),
        gross,
      );

      if (contextFields.billable_client) {
        addBreakdownValue(billableMap, contextFields.billable_client, gross);
      }

      if (contextFields.location) {
        addBreakdownValue(locationMap, contextFields.location, gross);
      }

      return currentTotals;
    },
    {
      totalGross: 0,
      totalNet: 0,
      totalVat: 0,
      businessPurposeCount: 0,
      paymentMethodCount: 0,
    },
  );
  const blockers = [];
  const period = buildPeriod(receipts);

  if (validation.needsReviewCount > 0) {
    blockers.push(
      `${validation.needsReviewCount} ${pluralize(
        validation.needsReviewCount,
        "row",
      )} ${validation.needsReviewCount === 1 ? "needs" : "need"} review`,
    );
  }

  if (validation.duplicateCount > 0) {
    blockers.push(
      `${validation.duplicateCount} possible ${pluralize(
        validation.duplicateCount,
        "duplicate",
      )}`,
    );
  }

  if (validation.missingProofCount > 0) {
    blockers.push(
      `${validation.missingProofCount} ${pluralize(
        validation.missingProofCount,
        "row",
      )} missing source proof`,
    );
  }

  return {
    billableTotals: buildBreakdownRows(billableMap, "billableClient"),
    blockerCount: blockers.length,
    blockers,
    businessPurposeCount: totals.businessPurposeCount,
    categoryTotals: buildBreakdownRows(categoryMap, "category"),
    duplicateCount: validation.duplicateCount,
    locationTotals: buildBreakdownRows(locationMap, "location"),
    missingProofCount: validation.missingProofCount,
    needsReviewCount: validation.needsReviewCount,
    period,
    paymentMethodCount: totals.paymentMethodCount,
    ready: receipts.length > 0 && blockers.length === 0,
    rowCount: receipts.length,
    sourceProofCount: receipts.length - validation.missingProofCount,
    status:
      receipts.length === 0
        ? READY_STATUS.EMPTY
        : blockers.length > 0
          ? READY_STATUS.NEEDS_REVIEW
          : READY_STATUS.READY,
    totalGross: roundMoney(totals.totalGross),
    totalNet: roundMoney(totals.totalNet),
    totalVat: roundMoney(totals.totalVat),
  };
}

function buildCsv(receipts) {
  const rows = receipts.map((receipt) => {
    const fields = getFields(receipt);
    const contextFields = getContextFields(receipt);
    const reportFields = {
      business_purpose: getBusinessPurpose(receipt),
      payment_method: getPaymentMethod(receipt),
    };
    const issues = getIssues(receipt);
    const needsReview =
      Boolean(receipt?.validation?.needsReview) || issues.length > 0;
    const auditFields = {
      review_reasons: issues.map(getIssueReason).join("; "),
      review_status: needsReview ? "needs_review" : "ready",
      source_uri: getSourceUri(receipt),
    };

    return [
      ...FIELD_COLUMNS.map((field) => escapeCsvCell(fields[field])),
      ...CONTEXT_COLUMNS.map((field) => escapeCsvCell(contextFields[field])),
      ...REPORT_COLUMNS.map((field) => escapeCsvCell(reportFields[field])),
      ...AUDIT_COLUMNS.map((field) => escapeCsvCell(auditFields[field])),
    ].join(",");
  });

  return [HEADER_ROW, ...rows].join("\n");
}

function getRowValues(receipt) {
  const fields = getFields(receipt);
  const contextFields = getContextFields(receipt);
  const reportFields = {
    business_purpose: getBusinessPurpose(receipt),
    payment_method: getPaymentMethod(receipt),
  };
  const issues = getIssues(receipt);
  const needsReview =
    Boolean(receipt?.validation?.needsReview) || issues.length > 0;
  const auditFields = {
    review_reasons: issues.map(getIssueReason).join("; "),
    review_status: needsReview ? "needs_review" : "ready",
    source_uri: getSourceUri(receipt),
  };

  return [
    ...FIELD_COLUMNS.map((field) => fields[field]),
    ...CONTEXT_COLUMNS.map((field) => contextFields[field]),
    ...REPORT_COLUMNS.map((field) => reportFields[field]),
    ...AUDIT_COLUMNS.map((field) => auditFields[field]),
  ];
}

function toWorkbookCellValue(column, value) {
  if (NUMERIC_COLUMNS.has(column)) {
    if (formatCellValue(value).trim() === "") {
      return undefined;
    }

    const amount = parseAmount(value);

    if (amount !== null) {
      return amount;
    }

    return formatCellValue(value);
  }

  const formatted = formatCellValue(value);

  return formatted === "" ? undefined : formatted;
}

function buildWorkbookBase64(receipts, dependencies = {}) {
  const xlsx = dependencies.xlsx || getDefaultXlsx();
  const receiptList = Array.isArray(receipts) ? receipts : [];
  const rows = receiptList.map((receipt) => {
    const values = getRowValues(receipt);

    return COLUMNS.map((column, index) =>
      toWorkbookCellValue(column, values[index]),
    );
  });
  const worksheet = xlsx.utils.aoa_to_sheet([[...COLUMNS], ...rows]);
  const workbook = xlsx.utils.book_new();
  const manifest = buildExportManifest(receiptList);
  const manifestSheet = xlsx.utils.aoa_to_sheet([
    ["key", "value"],
    ["schema_version", SCHEMA_VERSION],
    ["columns", COLUMNS.join(",")],
    ["row_count", manifest.rowCount],
  ]);

  xlsx.utils.book_append_sheet(workbook, worksheet, "Receipts");
  xlsx.utils.book_append_sheet(workbook, manifestSheet, "Manifest");

  return xlsx.write(workbook, { type: "base64", bookType: "xlsx" });
}

function buildReceiptSheet(receipts) {
  const receiptList = Array.isArray(receipts) ? receipts : [];
  const needsReviewRows = buildNeedsReviewRows(receiptList);
  const duplicates = buildDuplicates(receiptList);
  const missingProofRows = buildMissingProofRows(receiptList);
  const validation = {
    duplicateCount: duplicates.length,
    duplicates,
    missingProofCount: missingProofRows.length,
    missingProofRows,
    needsReviewCount: needsReviewRows.length,
    needsReviewRows,
  };

  return {
    csv: buildCsv(receiptList),
    summary: buildSummary(receiptList, validation),
    validation,
  };
}

module.exports = {
  SCHEMA_VERSION,
  buildExportBundleBase64,
  buildExportManifest,
  buildReceiptSheet,
  buildWorkbookBase64,
  toSafeEntryBaseName,
};

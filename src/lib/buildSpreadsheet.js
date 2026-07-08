const FIELD_COLUMNS = ["vendor", "date", "net", "vat", "gross", "category"];
const CONTEXT_COLUMNS = ["location", "billable_client"];
const COLUMNS = [...FIELD_COLUMNS, ...CONTEXT_COLUMNS];
const HEADER_ROW = COLUMNS.join(",");

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

function buildCsv(receipts) {
  const rows = receipts.map((receipt) => {
    const fields = getFields(receipt);
    const contextFields = getContextFields(receipt);

    return [
      ...FIELD_COLUMNS.map((field) => escapeCsvCell(fields[field])),
      ...CONTEXT_COLUMNS.map((field) => escapeCsvCell(contextFields[field])),
    ].join(",");
  });

  return [HEADER_ROW, ...rows].join("\n");
}

function buildReceiptSheet(receipts) {
  const receiptList = Array.isArray(receipts) ? receipts : [];
  const needsReviewRows = buildNeedsReviewRows(receiptList);
  const duplicates = buildDuplicates(receiptList);

  return {
    csv: buildCsv(receiptList),
    validation: {
      duplicateCount: duplicates.length,
      duplicates,
      needsReviewCount: needsReviewRows.length,
      needsReviewRows,
    },
  };
}

module.exports = {
  buildReceiptSheet,
};

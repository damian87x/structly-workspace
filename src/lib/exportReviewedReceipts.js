const {
  buildExportBundleBase64,
  buildExportManifest,
  buildReceiptSheet,
  buildWorkbookBase64,
  toSafeEntryBaseName,
} = require("./buildSpreadsheet");
const exportShare = require("./exportShare");

const DEFAULT_EXPORT_FILENAME = "reviewed-receipts";

function getReceiptList(receipts) {
  return Array.isArray(receipts) ? receipts : [];
}

function countRowsWithProof(receipts) {
  return receipts.filter((receipt) => {
    return Boolean(receipt?.sourceUri || receipt?.imageUri || receipt?.uri);
  }).length;
}

function buildReceiptSummary(receipts, sheet) {
  const sourceProofCount = countRowsWithProof(receipts);

  return sheet.summary || {
    missingProofCount: receipts.length - sourceProofCount,
    needsReviewCount: sheet.validation?.needsReviewCount || 0,
    rowCount: receipts.length,
    sourceProofCount,
  };
}

function formatMoney(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function pluralize(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function formatBreakdown(rows, labelKey) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return ["- None"];
  }

  return rows.map((row) => {
    return `- ${row[labelKey]}: ${row.count} ${pluralize(
      row.count,
      "row",
    )}, gross ${formatMoney(row.gross)}`;
  });
}

function getDefaultExportFilename(summary) {
  const label = summary?.period?.label;

  if (!summary?.period?.startDate || !label) {
    return DEFAULT_EXPORT_FILENAME;
  }

  return `${DEFAULT_EXPORT_FILENAME}-${label.replace(/\s+to\s+/g, "-to-")}`;
}

function buildHandoffNote(receipts, sheet) {
  const receiptList = getReceiptList(receipts);
  const summary = buildReceiptSummary(receiptList, sheet);
  const status = summary.ready ? "Ready" : "Needs review";

  return [
    "Structly receipt pack handoff",
    "",
    `Status: ${status}`,
    `Rows: ${summary.rowCount}`,
    `Period: ${summary.period?.label || "No dated rows"}`,
    `Rows with source proof: ${summary.sourceProofCount}/${summary.rowCount}`,
    `Rows with business purpose: ${summary.businessPurposeCount || 0}/${summary.rowCount}`,
    `Rows with payment method: ${summary.paymentMethodCount || 0}/${summary.rowCount}`,
    `Gross total: ${formatMoney(summary.totalGross)}`,
    `Net total: ${formatMoney(summary.totalNet)}`,
    `VAT total: ${formatMoney(summary.totalVat)}`,
    "",
    "Blockers:",
    ...(summary.blockers?.length
      ? summary.blockers.map((item) => `- ${item}`)
      : ["- None"]),
    "",
    "Category totals:",
    ...formatBreakdown(summary.categoryTotals, "category"),
    "",
    "Billable clients:",
    ...formatBreakdown(summary.billableTotals, "billableClient"),
    "",
    "Locations:",
    ...formatBreakdown(summary.locationTotals, "location"),
    "",
    "Review any blockers before filing or sending this pack to an accountant.",
  ].join("\n");
}

async function exportReviewedReceipts(receipts, options = {}) {
  const receiptList = getReceiptList(receipts);
  const sheet = buildReceiptSheet(receiptList);
  const summary = buildReceiptSummary(receiptList, sheet);
  const handoffNote = buildHandoffNote(receiptList, sheet);
  const filename = options.filename || getDefaultExportFilename(summary);
  const manifest = buildExportManifest(receiptList);
  const shareDependencies = {
    directory: options.directory,
    share: options.share,
    writeFile: options.writeFile,
  };

  if (options.format === "xlsx") {
    const base64 = buildWorkbookBase64(receiptList, { xlsx: options.xlsx });
    const exportWorkbook = options.exportWorkbook || exportShare.exportWorkbook;
    const exportResult = await exportWorkbook(
      {
        base64,
        filename,
      },
      shareDependencies,
    );

    return {
      exportResult,
      handoffNote,
      manifest,
      sheet,
      summary,
    };
  }

  const baseName = toSafeEntryBaseName(filename);
  const base64 = buildExportBundleBase64(
    {
      baseName,
      csv: sheet.csv,
      manifest,
    },
    { xlsx: options.xlsx },
  );
  const exportBundle = options.exportBundle || exportShare.exportBundle;
  const exportResult = await exportBundle(
    {
      base64,
      filename,
    },
    shareDependencies,
  );

  return {
    exportResult,
    handoffNote,
    manifest,
    sheet,
    summary,
  };
}

module.exports = {
  buildHandoffNote,
  exportReviewedReceipts,
};

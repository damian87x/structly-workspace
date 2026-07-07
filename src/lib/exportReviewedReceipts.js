const { buildReceiptSheet } = require("./buildSpreadsheet");
const exportShare = require("./exportShare");

const DEFAULT_EXPORT_FILENAME = "reviewed-receipts";

function getReceiptList(receipts) {
  return Array.isArray(receipts) ? receipts : [];
}

function buildReceiptSummary(receipts, sheet) {
  return {
    needsReviewCount: sheet.validation?.needsReviewCount || 0,
    rowCount: receipts.length,
  };
}

async function exportReviewedReceipts(receipts, options = {}) {
  const receiptList = getReceiptList(receipts);
  const sheet = buildReceiptSheet(receiptList);
  const exportSheet = options.exportSheet || exportShare.exportSheet;
  const exportResult = await exportSheet(
    {
      csv: sheet.csv,
      filename: options.filename || DEFAULT_EXPORT_FILENAME,
    },
    {
      directory: options.directory,
      share: options.share,
      writeFile: options.writeFile,
    },
  );

  return {
    exportResult,
    sheet,
    summary: buildReceiptSummary(receiptList, sheet),
  };
}

module.exports = {
  exportReviewedReceipts,
};

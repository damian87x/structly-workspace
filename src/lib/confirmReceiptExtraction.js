const { processReceipts } = require("./receiptPipeline");

const EXTRACTION_FAILED_MESSAGE =
  "We couldn't read this receipt right now. Your reviewed receipts are still saved.";

const RECEIPT_FIELD_ROWS = [
  { field: "vendor", label: "Vendor" },
  { field: "date", label: "Date" },
  { field: "net", label: "Net" },
  { field: "vat", label: "VAT" },
  { field: "gross", label: "Gross" },
  { field: "category", label: "Category" },
];

function formatFieldValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function buildReceiptFieldRows(receipt) {
  const fields = receipt?.fields || {};

  return RECEIPT_FIELD_ROWS.map(({ field, label }) => ({
    displayValue: formatFieldValue(fields[field]),
    field,
    label,
    value: fields[field],
  }));
}

async function confirmReceiptExtraction(receiptImage, { vision } = {}) {
  const result = await processReceipts([receiptImage], { vision });
  const receipt = result.receipts[0] || null;

  if (!receipt) {
    const error = new Error(EXTRACTION_FAILED_MESSAGE);
    error.failures = result.failures;
    throw error;
  }

  return {
    failures: result.failures,
    fieldRows: buildReceiptFieldRows(receipt),
    needsReview:
      Boolean(receipt.validation?.needsReview) ||
      Boolean(result.sheet.validation?.needsReviewCount),
    receipt,
    receipts: result.receipts,
    sheet: result.sheet,
  };
}

module.exports = {
  EXTRACTION_FAILED_MESSAGE,
  RECEIPT_FIELD_ROWS,
  buildReceiptFieldRows,
  confirmReceiptExtraction,
};

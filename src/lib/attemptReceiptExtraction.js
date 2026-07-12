const {
  confirmReceiptExtraction,
  EXTRACTION_FAILED_MESSAGE,
} = require("./confirmReceiptExtraction");
const { buildReviewReceipt } = require("./reviewReceipt");

async function attemptReceiptExtraction(receiptImage, { vision } = {}) {
  try {
    const result = await confirmReceiptExtraction(receiptImage, { vision });
    const row = buildReviewReceipt(result.receipt, receiptImage);

    return {
      status: "succeeded",
      failed: false,
      message: null,
      row,
      result,
    };
  } catch (error) {
    return {
      status: "failed",
      failed: true,
      message: EXTRACTION_FAILED_MESSAGE,
      row: null,
      failures: error?.failures || null,
    };
  }
}

module.exports = {
  attemptReceiptExtraction,
};

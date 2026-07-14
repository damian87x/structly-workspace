const { mergeReceiptContextSuggestion } = require("./receiptContextReview");

function isSameReviewedReceipt(currentReceipt, expectedReceipt) {
  return (
    currentReceipt?.capturedAt === expectedReceipt.capturedAt &&
    currentReceipt?.source === expectedReceipt.source &&
    currentReceipt?.sourceUri === expectedReceipt.sourceUri
  );
}

function mergeEnrichedReceiptContext(currentRows, expectedReceipt, enrichedReceipt) {
  const currentReceipt = currentRows[0];

  if (
    !currentReceipt ||
    !enrichedReceipt?.context ||
    !isSameReviewedReceipt(currentReceipt, expectedReceipt)
  ) {
    return currentRows;
  }

  return [
    mergeReceiptContextSuggestion(currentReceipt, enrichedReceipt.context),
    ...currentRows.slice(1),
  ];
}

module.exports = {
  isSameReviewedReceipt,
  mergeEnrichedReceiptContext,
};

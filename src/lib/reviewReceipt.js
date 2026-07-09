function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function getContext(receipt) {
  return isObject(receipt?.context) ? receipt.context : {};
}

function buildReviewReceipt(extractedReceipt, sourceReceipt) {
  const capturedAt = sourceReceipt?.capturedAt ?? null;
  const source = sourceReceipt?.source || null;

  return {
    ...extractedReceipt,
    capturedAt,
    source,
    sourceUri: sourceReceipt?.uri || null,
    context: {
      ...getContext(extractedReceipt),
      ...getContext(sourceReceipt),
      capturedAt,
      source,
    },
  };
}

module.exports = {
  buildReviewReceipt,
};

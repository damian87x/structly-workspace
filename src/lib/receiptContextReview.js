const CONTEXT_REVIEW_DECISIONS = {
  CLEAR: "clear",
  CONFIRM: "confirm",
};

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function getContext(receipt) {
  return isObject(receipt?.context) ? receipt.context : {};
}

function getReceiptContextDisplay(receipt) {
  const context = getContext(receipt);
  const location = normalizeText(context.location?.placeName);
  const billable = isObject(context.billable) ? context.billable : {};
  const billableClient =
    billable.billable === true ? normalizeText(billable.client) : "";

  return {
    billableClient,
    hasContext: Boolean(location || billableClient),
    location,
  };
}

function assertValidIndex(rows, index) {
  if (!Array.isArray(rows)) {
    throw new TypeError("Receipt context review rows must be an array.");
  }

  if (!Number.isInteger(index) || index < 0 || index >= rows.length) {
    throw new RangeError(`Receipt context review index ${index} is out of range.`);
  }
}

function clearReceiptContext(receipt) {
  const baseReceipt = isObject(receipt) ? receipt : {};
  const context = getContext(baseReceipt);

  return {
    ...baseReceipt,
    context: {
      ...context,
      billable: {
        billable: false,
        client: null,
        project: null,
      },
      location: null,
    },
  };
}

function applyReceiptContextDecision(rows, index, decision) {
  assertValidIndex(rows, index);

  if (decision === CONTEXT_REVIEW_DECISIONS.CONFIRM) {
    return rows;
  }

  if (decision !== CONTEXT_REVIEW_DECISIONS.CLEAR) {
    throw new Error(`Unsupported receipt context decision: ${decision}.`);
  }

  return rows.map((row, rowIndex) =>
    rowIndex === index ? clearReceiptContext(row) : row,
  );
}

module.exports = {
  CONTEXT_REVIEW_DECISIONS,
  applyReceiptContextDecision,
  getReceiptContextDisplay,
};

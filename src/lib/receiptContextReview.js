const CONTEXT_REVIEW_DECISIONS = {
  CLEAR: "clear",
  CONFIRM: "confirm",
};

const EMPTY_BILLABLE_CONTEXT = {
  billable: false,
  client: null,
  project: null,
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

function getReviewState(context) {
  return isObject(context?.contextReview) ? context.contextReview : {};
}

function isDecision(decision) {
  return Object.values(CONTEXT_REVIEW_DECISIONS).includes(decision);
}

function getContextDecision(context) {
  const decision = getReviewState(context).decision;

  return isDecision(decision) ? decision : CONTEXT_REVIEW_DECISIONS.CONFIRM;
}

function getSuggestedContext(context) {
  const reviewState = getReviewState(context);
  const location = isObject(reviewState.location)
    ? reviewState.location
    : context.location;
  const billable = isObject(reviewState.billable)
    ? reviewState.billable
    : context.billable;

  return {
    billable: isObject(billable) ? billable : null,
    location: isObject(location) ? location : null,
  };
}

function getBillableClient(billable) {
  return billable?.billable === true ? normalizeText(billable.client) : "";
}

function buildReviewState(context, decision, suggestion) {
  return {
    ...getReviewState(context),
    billable: suggestion.billable,
    decision,
    location: suggestion.location,
  };
}

function getReceiptContextDisplay(receipt) {
  const context = getContext(receipt);
  const suggestion = getSuggestedContext(context);
  const location = normalizeText(suggestion.location?.placeName);
  const billableClient = getBillableClient(suggestion.billable);

  return {
    billableClient,
    decision: getContextDecision(context),
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
  const suggestion = getSuggestedContext(context);

  return {
    ...baseReceipt,
    context: {
      ...context,
      billable: EMPTY_BILLABLE_CONTEXT,
      contextReview: buildReviewState(
        context,
        CONTEXT_REVIEW_DECISIONS.CLEAR,
        suggestion,
      ),
      location: null,
    },
  };
}

function confirmReceiptContext(receipt) {
  const baseReceipt = isObject(receipt) ? receipt : {};
  const context = getContext(baseReceipt);
  const suggestion = getSuggestedContext(context);

  return {
    ...baseReceipt,
    context: {
      ...context,
      billable: suggestion.billable || EMPTY_BILLABLE_CONTEXT,
      contextReview: buildReviewState(
        context,
        CONTEXT_REVIEW_DECISIONS.CONFIRM,
        suggestion,
      ),
      location: suggestion.location,
    },
  };
}

function applyReceiptContextDecision(rows, index, decision) {
  assertValidIndex(rows, index);

  if (decision === CONTEXT_REVIEW_DECISIONS.CONFIRM) {
    return rows.map((row, rowIndex) =>
      rowIndex === index ? confirmReceiptContext(row) : row,
    );
  }

  if (decision !== CONTEXT_REVIEW_DECISIONS.CLEAR) {
    throw new Error(`Unsupported receipt context decision: ${decision}.`);
  }

  return rows.map((row, rowIndex) =>
    rowIndex === index ? clearReceiptContext(row) : row,
  );
}

function mergeReceiptContextSuggestion(receipt, incomingContext) {
  const baseReceipt = isObject(receipt) ? receipt : {};
  const currentContext = getContext(baseReceipt);
  const incoming = isObject(incomingContext) ? incomingContext : {};
  const mergedContext = {
    ...currentContext,
    ...incoming,
  };
  const currentSuggestion = getSuggestedContext(currentContext);
  const suggestion = {
    billable: isObject(incoming.billable)
      ? incoming.billable
      : currentSuggestion.billable,
    location: isObject(incoming.location)
      ? incoming.location
      : currentSuggestion.location,
  };
  const decision = getContextDecision(currentContext);
  const nextContext = {
    ...mergedContext,
    contextReview: buildReviewState(currentContext, decision, suggestion),
  };

  if (decision === CONTEXT_REVIEW_DECISIONS.CLEAR) {
    return {
      ...baseReceipt,
      context: {
        ...nextContext,
        billable: EMPTY_BILLABLE_CONTEXT,
        location: null,
      },
    };
  }

  return {
    ...baseReceipt,
    context: {
      ...nextContext,
      billable: suggestion.billable || EMPTY_BILLABLE_CONTEXT,
      location: suggestion.location,
    },
  };
}

module.exports = {
  CONTEXT_REVIEW_DECISIONS,
  applyReceiptContextDecision,
  getReceiptContextDisplay,
  mergeReceiptContextSuggestion,
};

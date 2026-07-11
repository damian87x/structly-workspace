const { enrichReceipt } = require("./enrichReceipt");
const {
  createMobileLocationSuggestionPayload,
} = require("./mobileIntegrationRuntime");
const { mergeReceiptContextSuggestion } = require("./receiptContextReview");
const { createTriggerPayload } = require("./triggers");

async function buildEnrichedLocationSuggestion({
  enrich = enrichReceipt,
  enrichOptions,
  locationTrigger,
  platform,
  receipt,
  session,
  userId,
} = {}) {
  let enrichedReceipt = receipt;

  try {
    enrichedReceipt = (await enrich(receipt, enrichOptions)) || receipt;
  } catch (error) {
    enrichedReceipt = receipt;
  }

  return {
    enrichedReceipt,
    payload: createMobileLocationSuggestionPayload({
      locationTrigger,
      platform,
      receipt: enrichedReceipt,
      session,
      userId,
    }),
  };
}

function createLocationTriggerCreatePayload({ placeLabel, userId } = {}) {
  const label = typeof placeLabel === "string" ? placeLabel.trim() : "";

  if (!label || !userId) {
    return null;
  }

  return createTriggerPayload({
    name: `Place reminder: ${label}`,
    source: "location:coarse",
    type: "location_visit",
    userId,
  });
}

function getSuggestionDisplayLabel(suggestionEvent) {
  const payload = suggestionEvent?.payload || {};

  return payload.placeLabel || payload.placeId || "Nearby place";
}

function applyLocationSuggestionToReceipt(rows, index, suggestionEvent) {
  const currentRows = Array.isArray(rows) ? rows : [];
  const receipt = currentRows[index];
  const coarseLocation = suggestionEvent?.payload?.coarseLocation;

  if (!receipt || !coarseLocation) {
    return currentRows;
  }

  const merged = mergeReceiptContextSuggestion(receipt, {
    location: {
      accuracy: "coarse",
      latitude: coarseLocation.latitude,
      longitude: coarseLocation.longitude,
      placeName: suggestionEvent.payload.placeLabel || null,
      city: null,
    },
  });

  return currentRows.map((row, rowIndex) =>
    rowIndex === index ? merged : row,
  );
}

module.exports = {
  applyLocationSuggestionToReceipt,
  buildEnrichedLocationSuggestion,
  createLocationTriggerCreatePayload,
  getSuggestionDisplayLabel,
};

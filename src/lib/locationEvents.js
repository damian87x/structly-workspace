const LOCATION_EVENT_TYPE = {
  ENTER: "location_entered",
  EXIT: "location_exited",
  VISIT: "location_visit",
};

function getNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function roundCoordinate(value, precision = 2) {
  const number = getNumber(value);

  if (number === null) {
    return null;
  }

  const factor = 10 ** precision;
  return Math.round(number * factor) / factor;
}

function createCoarseLocation(coords = {}) {
  const latitude = roundCoordinate(coords.latitude);
  const longitude = roundCoordinate(coords.longitude);

  if (latitude === null || longitude === null) {
    return null;
  }

  return {
    accuracy: "coarse",
    latitude,
    longitude,
  };
}

function normalizeText(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function createLocationEvent({
  coords,
  deviceId,
  eventType = LOCATION_EVENT_TYPE.VISIT,
  observedAt = new Date(),
  placeId,
  placeLabel,
  userId,
}) {
  const coarseLocation = createCoarseLocation(coords);
  const observedIso = new Date(observedAt).toISOString();
  const normalizedPlaceId = normalizeText(placeId) || "unknown-place";
  const normalizedDeviceId = normalizeText(deviceId) || "unknown-device";

  return {
    eventKey: `${normalizedDeviceId}:${normalizedPlaceId}:${eventType}:${observedIso}`,
    eventType,
    payload: {
      coarseLocation,
      deviceId: normalizedDeviceId,
      observedAt: observedIso,
      placeId: normalizedPlaceId,
      placeLabel: normalizeText(placeLabel),
    },
    source: "location:coarse",
    userId,
  };
}

function createLocationSuggestion({
  event,
  reason = "nearby_receipt_context",
  receiptCount = 0,
}) {
  return {
    confidence: receiptCount > 0 ? "medium" : "low",
    copy: receiptCount > 0 ? "Nearby receipts may need review." : "Review nearby receipt context.",
    eventKey: event?.eventKey || null,
    reason,
    suggestedAction: "review_receipt_context",
  };
}

function createLocationTriggerPayload({
  action = "record_event",
  event,
  suggestion,
  triggerId,
}) {
  return {
    action,
    eventKey: event.eventKey,
    eventType: event.eventType,
    payload: {
      ...event.payload,
      suggestion,
    },
    source: event.source,
    triggerId,
    userId: event.userId,
  };
}

module.exports = {
  LOCATION_EVENT_TYPE,
  createCoarseLocation,
  createLocationEvent,
  createLocationSuggestion,
  createLocationTriggerPayload,
  roundCoordinate,
};

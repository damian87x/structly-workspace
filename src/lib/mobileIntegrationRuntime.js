const { LOCATION_EVENT_TYPE, createCoarseLocation } = require("./locationEvents");

function getSessionUserId(session, fallbackUserId) {
  return session?.user?.id || fallbackUserId || session?.user?.email || null;
}

function createMobileDeviceId({ platform = "unknown", userId } = {}) {
  const normalizedUser = userId || "anonymous";
  const normalizedPlatform = platform || "unknown";

  return `structly:${normalizedPlatform}:${normalizedUser}`;
}

function createMobileDeviceHeartbeatPayload({
  appState = "active",
  capabilities = {},
  platform = "unknown",
  session,
  userId,
} = {}) {
  const resolvedUserId = getSessionUserId(session, userId);

  return {
    appState,
    capabilities: {
      background: "foreground_resume",
      location: "foreground_permission_required",
      platform,
      ...capabilities,
    },
    deviceId: createMobileDeviceId({ platform, userId: resolvedUserId }),
    platform,
    userId: resolvedUserId,
  };
}

function findLocationTrigger(triggers = []) {
  if (!Array.isArray(triggers)) {
    return null;
  }

  return (
    triggers.find((trigger) => {
      const source = typeof trigger?.source === "string" ? trigger.source : "";
      const status = trigger?.status || "active";

      return source.startsWith("location:") && status === "active";
    }) || null
  );
}

function getReceiptLocation(receipt) {
  const context = receipt?.context || {};
  const location = context.location;

  return location && typeof location === "object" ? location : null;
}

function createMobileLocationSuggestionPayload({
  locationTrigger,
  platform = "unknown",
  receipt,
  session,
  userId,
} = {}) {
  const location = getReceiptLocation(receipt);
  const coarseLocation = createCoarseLocation(location);
  const resolvedUserId = getSessionUserId(session, userId);

  if (!locationTrigger?.id || !coarseLocation || !resolvedUserId) {
    return null;
  }

  const placeLabel = location.placeName || location.city || null;

  return {
    coords: {
      latitude: coarseLocation.latitude,
      longitude: coarseLocation.longitude,
    },
    deviceId: createMobileDeviceId({ platform, userId: resolvedUserId }),
    eventType: LOCATION_EVENT_TYPE.VISIT,
    observedAt:
      receipt?.capturedAt ||
      receipt?.context?.capturedAt ||
      new Date().toISOString(),
    placeId: placeLabel || "receipt-capture",
    placeLabel,
    receiptCount: 1,
    triggerId: locationTrigger.id,
    userId: resolvedUserId,
  };
}

module.exports = {
  createMobileDeviceHeartbeatPayload,
  createMobileDeviceId,
  createMobileLocationSuggestionPayload,
  findLocationTrigger,
  getSessionUserId,
};

const COMPOSIO_SIGNATURE_HEADERS = [
  "composio-signature",
  "x-composio-signature",
  "svix-signature",
];

function getHeader(headers, name) {
  if (!headers) {
    return null;
  }

  if (typeof headers.get === "function") {
    return headers.get(name) || headers.get(name.toLowerCase());
  }

  return headers[name] || headers[name.toLowerCase()] || null;
}

function hasComposioSignature(headers) {
  return COMPOSIO_SIGNATURE_HEADERS.some((name) => Boolean(getHeader(headers, name)));
}

function getComposioReplayTimestamp(headers) {
  return (
    getHeader(headers, "composio-timestamp") ||
    getHeader(headers, "svix-timestamp") ||
    null
  );
}

function parseTimestampSeconds(value) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime())
      ? Math.floor(value.getTime() / 1000)
      : null;
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return null;
  }

  return numeric > 1_000_000_000_000
    ? Math.floor(numeric / 1000)
    : Math.floor(numeric);
}

function isReplayTimestampFresh({
  now = Date.now(),
  timestamp,
  toleranceSeconds = 300,
} = {}) {
  const eventSeconds = parseTimestampSeconds(timestamp);
  const nowSeconds = parseTimestampSeconds(now);

  if (eventSeconds === null || nowSeconds === null) {
    return false;
  }

  return Math.abs(nowSeconds - eventSeconds) <= toleranceSeconds;
}

function normalizeComposioEvent(payload = {}) {
  const eventId = payload.id || payload.event_id || payload.eventId;
  const triggerId = payload.trigger_id || payload.triggerId || payload.trigger?.id;
  const toolkit = payload.toolkit || payload.toolkit_slug || payload.toolkitSlug;

  return {
    eventKey: eventId ? String(eventId) : null,
    payload,
    provider: "composio",
    source: toolkit ? `composio:${toolkit}` : "composio",
    triggerId: triggerId ? String(triggerId) : null,
  };
}

function validateComposioWebhookEnvelope({
  headers,
  now,
  payload,
  toleranceSeconds,
}) {
  if (!hasComposioSignature(headers)) {
    return {
      error: "missing_signature",
      ok: false,
    };
  }

  const timestamp = getComposioReplayTimestamp(headers);

  if (!timestamp) {
    return {
      error: "missing_timestamp",
      ok: false,
    };
  }

  if (!isReplayTimestampFresh({ now, timestamp, toleranceSeconds })) {
    return {
      error: "stale_timestamp",
      ok: false,
    };
  }

  const event = normalizeComposioEvent(payload);

  if (!event.eventKey) {
    return {
      error: "missing_event_key",
      ok: false,
    };
  }

  return {
    error: null,
    event,
    ok: true,
  };
}

module.exports = {
  COMPOSIO_SIGNATURE_HEADERS,
  hasComposioSignature,
  isReplayTimestampFresh,
  normalizeComposioEvent,
  parseTimestampSeconds,
  validateComposioWebhookEnvelope,
};

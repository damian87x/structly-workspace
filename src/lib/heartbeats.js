const HEARTBEAT_STATUS = {
  FAILED: "failed",
  FRESH: "fresh",
  STALE: "stale",
  UNKNOWN: "unknown",
};

const DEFAULT_HEARTBEAT_INTERVAL_MS = 30 * 1000;
const DEFAULT_STALE_AFTER_MS = 90 * 1000;
const DEFAULT_FAIL_AFTER_MS = 5 * 60 * 1000;

function parseTime(value) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.getTime() : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.getTime() : null;
}

function classifyHeartbeat({
  failAfterMs = DEFAULT_FAIL_AFTER_MS,
  lastSeenAt,
  now = Date.now(),
  staleAfterMs = DEFAULT_STALE_AFTER_MS,
} = {}) {
  const lastSeenTime = parseTime(lastSeenAt);
  const nowTime = parseTime(now);

  if (lastSeenTime === null || nowTime === null || lastSeenTime > nowTime) {
    return HEARTBEAT_STATUS.UNKNOWN;
  }

  const age = nowTime - lastSeenTime;

  if (age >= failAfterMs) {
    return HEARTBEAT_STATUS.FAILED;
  }

  if (age >= staleAfterMs) {
    return HEARTBEAT_STATUS.STALE;
  }

  return HEARTBEAT_STATUS.FRESH;
}

function shouldSendHeartbeat({
  intervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
  lastSentAt,
  now = Date.now(),
} = {}) {
  const lastSentTime = parseTime(lastSentAt);
  const nowTime = parseTime(now);

  if (nowTime === null) {
    return false;
  }

  if (lastSentTime === null || lastSentTime > nowTime) {
    return true;
  }

  return nowTime - lastSentTime >= intervalMs;
}

function createDeviceHeartbeat({
  appState = "active",
  capabilities = {},
  deviceId,
  platform,
  userId,
  now = new Date(),
}) {
  return {
    appState,
    capabilities,
    deviceId,
    heartbeatType: "device",
    platform,
    seenAt: new Date(parseTime(now) || Date.now()).toISOString(),
    userId,
  };
}

function createWorkerHeartbeat({
  workerId,
  workerType = "backend",
  now = new Date(),
}) {
  return {
    heartbeatType: "worker",
    seenAt: new Date(parseTime(now) || Date.now()).toISOString(),
    workerId,
    workerType,
  };
}

module.exports = {
  DEFAULT_FAIL_AFTER_MS,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  DEFAULT_STALE_AFTER_MS,
  HEARTBEAT_STATUS,
  classifyHeartbeat,
  createDeviceHeartbeat,
  createWorkerHeartbeat,
  shouldSendHeartbeat,
};

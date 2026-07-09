const SENSITIVE_KEYS = new Set([
  "access_token",
  "apikey",
  "authorization",
  "content",
  "image",
  "password",
  "preciselocation",
  "receipttext",
  "refresh_token",
  "secret",
  "service_role",
  "token",
]);

function shouldRedactKey(key) {
  return SENSITIVE_KEYS.has(String(key).toLowerCase());
}

function redactSensitive(value) {
  if (Array.isArray(value)) {
    return value.map(redactSensitive);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      shouldRedactKey(key) ? "[redacted]" : redactSensitive(entry),
    ]),
  );
}

function buildRunTimeline(run, events = []) {
  return [
    {
      at: run?.createdAt || run?.updatedAt || null,
      label: "Run created",
      status: "created",
    },
    ...events.map((event) => ({
      at: event.at || event.createdAt || null,
      label: event.label || "Run event",
      status: event.status || "event",
    })),
    {
      at: run?.completedAt || run?.updatedAt || null,
      label: "Current status",
      status: run?.status || "unknown",
    },
  ];
}

function buildAuditEvent({
  action,
  diagnosticCode = null,
  eventId,
  runId,
  status,
  timestamp = new Date().toISOString(),
}) {
  return {
    action,
    diagnosticCode,
    eventId,
    runId,
    status,
    timestamp,
    terminal: ["dead_lettered", "denied", "failed", "succeeded"].includes(status),
  };
}

function buildHealthSummary({
  bridge = "unknown",
  cron = "unknown",
  realtime = "unknown",
  webhook = "unknown",
  workerHeartbeat = "unknown",
} = {}) {
  return {
    bridge,
    cron,
    realtime,
    webhook,
    workerHeartbeat,
  };
}

function summarizeRunForUser(run) {
  if (!run) {
    return "No run history yet.";
  }

  if (run.status === "approval_required") {
    return "Needs your approval.";
  }

  if (run.status === "failed" || run.status === "dead_lettered") {
    return "Needs attention.";
  }

  if (run.status === "succeeded") {
    return "Completed.";
  }

  return "In progress.";
}

module.exports = {
  buildAuditEvent,
  buildHealthSummary,
  buildRunTimeline,
  redactSensitive,
  summarizeRunForUser,
};

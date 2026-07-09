const TRIGGER_STATUS = {
  ACTIVE: "active",
  DELETED: "deleted",
  PAUSED: "paused",
};

const TRIGGER_RUN_STATUS = {
  APPROVAL_REQUIRED: "approval_required",
  DEAD_LETTERED: "dead_lettered",
  DENIED: "denied",
  FAILED: "failed",
  QUEUED: "queued",
  RETRYING: "retrying",
  RUNNING: "running",
  SUCCEEDED: "succeeded",
};

const SIDE_EFFECT_ACTIONS = new Set([
  "create_calendar_event",
  "create_payment_link",
  "execute_code",
  "send_email",
  "update_external_sheet",
  "write_external_record",
]);
const SECRET_PATCH_KEYS = new Set([
  "apiKey",
  "api_key",
  "authorization",
  "password",
  "secret",
  "service_role",
  "token",
]);

function normalizeKey(value) {
  return typeof value === "string" ? value.trim() : "";
}

function createTriggerDefinition({
  config = {},
  createdAt = new Date().toISOString(),
  id,
  name,
  source,
  status = TRIGGER_STATUS.ACTIVE,
  type,
  userId,
}) {
  return {
    config,
    createdAt,
    id,
    name,
    source,
    status,
    type,
    userId,
  };
}

function createTriggerMutationPayload(action, trigger, patch = {}) {
  return {
    action,
    patch: sanitizeTriggerPatch(patch),
    triggerId: trigger?.id || patch.id || null,
    userId: trigger?.userId || patch.userId || null,
  };
}

function sanitizeTriggerPatch(patch = {}) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(patch).filter(([key]) => !SECRET_PATCH_KEYS.has(key)),
  );
}

function createTriggerPayload(trigger) {
  return createTriggerMutationPayload("create", null, trigger);
}

function updateTriggerPayload(trigger, patch) {
  return createTriggerMutationPayload("update", trigger, patch);
}

function pauseTriggerPayload(trigger) {
  return createTriggerMutationPayload("pause", trigger);
}

function resumeTriggerPayload(trigger) {
  return createTriggerMutationPayload("resume", trigger);
}

function deleteTriggerPayload(trigger) {
  return createTriggerMutationPayload("delete", trigger);
}

function setTriggerPaused(trigger, paused) {
  return {
    ...trigger,
    status: paused ? TRIGGER_STATUS.PAUSED : TRIGGER_STATUS.ACTIVE,
  };
}

function deleteTrigger(trigger) {
  return {
    ...trigger,
    status: TRIGGER_STATUS.DELETED,
  };
}

function getEventDedupeKey(event) {
  const source = normalizeKey(event?.source);
  const eventKey = normalizeKey(event?.eventKey || event?.idempotencyKey || event?.id);

  if (!source || !eventKey) {
    return null;
  }

  return `${source}:${eventKey}`;
}

function shouldEnqueueEvent(event, existingKeys = new Set()) {
  const key = getEventDedupeKey(event);

  if (!key) {
    return { enqueue: false, key: null, reason: "missing_key" };
  }

  if (existingKeys.has(key)) {
    return { enqueue: false, key, reason: "duplicate" };
  }

  return { enqueue: true, key, reason: null };
}

function actionRequiresApproval(action) {
  return SIDE_EFFECT_ACTIONS.has(normalizeKey(action));
}

function createTriggerRun({
  action,
  event,
  id,
  now = new Date().toISOString(),
  trigger,
}) {
  const requiresApproval = actionRequiresApproval(action);

  return {
    action,
    eventKey: getEventDedupeKey(event),
    id,
    requiresApproval,
    status: requiresApproval
      ? TRIGGER_RUN_STATUS.APPROVAL_REQUIRED
      : TRIGGER_RUN_STATUS.QUEUED,
    triggerId: trigger?.id,
    userId: trigger?.userId,
    updatedAt: now,
  };
}

function transitionTriggerRun(run, status, details = {}) {
  return {
    ...run,
    details: {
      ...(run.details || {}),
      ...details,
    },
    status,
  };
}

function approveTriggerRun(run, approved) {
  if (!run?.requiresApproval) {
    return run;
  }

  if (!approved) {
    return transitionTriggerRun(run, TRIGGER_RUN_STATUS.DENIED, {
      externalActionReady: false,
    });
  }

  return transitionTriggerRun(run, TRIGGER_RUN_STATUS.QUEUED, {
    externalActionReady: true,
  });
}

function getTriggerDisplayStatus(trigger, runs = []) {
  if (!trigger || trigger.status === TRIGGER_STATUS.DELETED) {
    return "Unavailable";
  }

  if (trigger.status === TRIGGER_STATUS.PAUSED) {
    return "Paused";
  }

  const latestRun = runs[0];

  if (!latestRun) {
    return "Ready";
  }

  if (latestRun.status === TRIGGER_RUN_STATUS.APPROVAL_REQUIRED) {
    return "Needs approval";
  }

  if (
    latestRun.status === TRIGGER_RUN_STATUS.FAILED ||
    latestRun.status === TRIGGER_RUN_STATUS.DEAD_LETTERED
  ) {
    return "Needs attention";
  }

  return "Running";
}

module.exports = {
  TRIGGER_RUN_STATUS,
  TRIGGER_STATUS,
  actionRequiresApproval,
  approveTriggerRun,
  createTriggerDefinition,
  createTriggerPayload,
  createTriggerMutationPayload,
  createTriggerRun,
  deleteTrigger,
  deleteTriggerPayload,
  getEventDedupeKey,
  getTriggerDisplayStatus,
  pauseTriggerPayload,
  resumeTriggerPayload,
  sanitizeTriggerPatch,
  setTriggerPaused,
  shouldEnqueueEvent,
  transitionTriggerRun,
  updateTriggerPayload,
};

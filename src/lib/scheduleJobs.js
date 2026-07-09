const SCHEDULE_JOB_STATUS = {
  ACTIVE: "active",
  DISABLED: "disabled",
  FAILED: "failed",
  PAUSED: "paused",
};

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

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : null;
}

function toIso(value) {
  const parsed = parseTime(value);

  return new Date(parsed || Date.now()).toISOString();
}

function normalizeScheduleKey(value) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, "-")
    : "";
}

function createScheduleJob({
  cronExpression = null,
  id,
  intervalMinutes = null,
  lastRunAt = null,
  metadata = {},
  nextRunAt,
  scheduleKey,
  status = SCHEDULE_JOB_STATUS.ACTIVE,
  triggerId,
  userId,
}) {
  const normalizedKey = normalizeScheduleKey(scheduleKey || id);

  return {
    cronExpression,
    id: id || `schedule:${normalizedKey}`,
    intervalMinutes,
    lastRunAt,
    metadata,
    nextRunAt: nextRunAt ? toIso(nextRunAt) : null,
    scheduleKey: normalizedKey,
    status,
    triggerId,
    userId,
  };
}

function getNextRunAt(job, now = Date.now()) {
  const nowTime = parseTime(now);
  const intervalMs =
    typeof job?.intervalMinutes === "number" && job.intervalMinutes > 0
      ? job.intervalMinutes * 60 * 1000
      : null;

  if (!intervalMs || nowTime === null) {
    return null;
  }

  return new Date(nowTime + intervalMs).toISOString();
}

function isScheduleJobDue({ job, now = Date.now() } = {}) {
  if (!job || job.status !== SCHEDULE_JOB_STATUS.ACTIVE) {
    return false;
  }

  const nextRunTime = parseTime(job.nextRunAt);
  const nowTime = parseTime(now);

  if (nextRunTime === null || nowTime === null) {
    return false;
  }

  return nextRunTime <= nowTime;
}

function markScheduleJobRun(job, now = Date.now()) {
  return {
    ...job,
    lastRunAt: toIso(now),
    nextRunAt: getNextRunAt(job, now) || job.nextRunAt,
  };
}

function createScheduleEvent({ job, now = Date.now() }) {
  const runAt = toIso(now);

  return {
    eventKey: `${job.scheduleKey}:${runAt}`,
    eventType: "schedule_tick",
    payload: {
      jobId: job.id,
      metadata: job.metadata || {},
      scheduleKey: job.scheduleKey,
      triggeredAt: runAt,
    },
    source: `schedule:${job.scheduleKey}`,
    triggerId: job.triggerId,
    userId: job.userId,
  };
}

function createScheduleTriggerPayload({ action = "record_event", job, now }) {
  const event = createScheduleEvent({ job, now });

  return {
    action,
    eventKey: event.eventKey,
    eventType: event.eventType,
    payload: event.payload,
    source: event.source,
    triggerId: event.triggerId,
    userId: event.userId,
  };
}

module.exports = {
  SCHEDULE_JOB_STATUS,
  createScheduleEvent,
  createScheduleJob,
  createScheduleTriggerPayload,
  getNextRunAt,
  isScheduleJobDue,
  markScheduleJobRun,
  normalizeScheduleKey,
};

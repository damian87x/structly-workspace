const { validateComposioWebhookEnvelope } = require("./composioBroker");
const {
  HEARTBEAT_STATUS,
  classifyHeartbeat,
  createDeviceHeartbeat,
  createWorkerHeartbeat,
} = require("./heartbeats");
const {
  createCodeExecutionRequest,
  createCodeExecutionTriggerPayload,
  validateCodeExecutionRequest,
} = require("./codeExecutionBridge");
const {
  createLocationEvent,
  createLocationSuggestion,
  createLocationTriggerPayload,
} = require("./locationEvents");
const {
  createScheduleJob,
  createScheduleTriggerPayload,
  isScheduleJobDue,
  markScheduleJobRun,
} = require("./scheduleJobs");
const {
  TRIGGER_RUN_STATUS,
  createTriggerDefinition,
  createTriggerRun,
  getEventDedupeKey,
  shouldEnqueueEvent,
} = require("./triggers");

function ok(data, status = 200) {
  return { data, status };
}

function fail(error, status) {
  return { data: { error }, status };
}

function requireAuth({ service = false, token } = {}) {
  if (!token) {
    return fail("missing_auth", 401);
  }

  if (service && token !== "service-role") {
    return fail("service_role_required", 403);
  }

  return null;
}

function createMemoryStore(seed = {}) {
  return {
    auditLogs: [...(seed.auditLogs || [])],
    codeExecutionRequests: [...(seed.codeExecutionRequests || [])],
    deadLetters: [...(seed.deadLetters || [])],
    deviceHeartbeats: [...(seed.deviceHeartbeats || [])],
    integrationEvents: [...(seed.integrationEvents || [])],
    integrationSources: [...(seed.integrationSources || [])],
    locationEvents: [...(seed.locationEvents || [])],
    scheduleJobs: [...(seed.scheduleJobs || [])],
    triggerRuns: [...(seed.triggerRuns || [])],
    triggers: [...(seed.triggers || [])],
    workerHeartbeats: [...(seed.workerHeartbeats || [])],
  };
}

function findByKey(rows, key, value) {
  return rows.find((row) => row[key] === value) || null;
}

function upsertByKey(rows, key, nextRow) {
  const index = rows.findIndex((row) => row[key] === nextRow[key]);

  if (index === -1) {
    rows.push(nextRow);
    return { created: true, row: nextRow };
  }

  rows[index] = {
    ...rows[index],
    ...nextRow,
  };

  return { created: false, row: rows[index] };
}

function isProviderTrigger(trigger) {
  const source = typeof trigger?.source === "string" ? trigger.source : "";

  return !(
    source === "schedule" ||
    source.startsWith("schedule:") ||
    source.startsWith("location:") ||
    source.startsWith("code:")
  );
}

function handleHeartbeatIngest({
  body = {},
  now = Date.now(),
  store,
  token,
  workerToken = "worker-token",
}) {
  if (body.workerId) {
    if (token !== workerToken) {
      return fail("missing_worker_auth", 401);
    }

    const heartbeat = createWorkerHeartbeat({
      now,
      workerId: body.workerId,
      workerType: body.workerType || "backend",
    });
    const result = upsertByKey(store.workerHeartbeats, "workerId", heartbeat);

    return ok({
      heartbeat: result.row,
      status: HEARTBEAT_STATUS.FRESH,
      upserted: result.created ? "created" : "updated",
    });
  }

  const authError = requireAuth({ token });

  if (authError) {
    return authError;
  }

  if (!body.userId) {
    return fail("missing_user_id", 400);
  }

  if (!body.deviceId) {
    return fail("missing_heartbeat_id", 400);
  }

  const heartbeat = createDeviceHeartbeat({
    appState: body.appState,
    capabilities: body.capabilities || {},
    deviceId: body.deviceId,
    now,
    platform: body.platform,
    userId: body.userId,
  });
  const key = `${heartbeat.userId}:${heartbeat.deviceId}`;
  const result = upsertByKey(store.deviceHeartbeats, "key", {
    ...heartbeat,
    key,
  });

  return ok({
    heartbeat: result.row,
    status: HEARTBEAT_STATUS.FRESH,
    upserted: result.created ? "created" : "updated",
  });
}

function handleTriggerDispatch({ body = {}, now = Date.now(), store, token }) {
  const authError = requireAuth({ token });

  if (authError) {
    return authError;
  }

  if (!body.userId || !body.triggerId) {
    return fail("missing_trigger_scope", 400);
  }

  const event = {
    eventKey: body.eventKey,
    id: body.eventKey,
    source: body.source,
  };
  const dedupeKey = getEventDedupeKey(event);

  if (!dedupeKey) {
    return fail("missing_event_key", 400);
  }

  const existingKeys = new Set(
    store.integrationEvents.map((storedEvent) => storedEvent.dedupeKey),
  );
  const enqueue = shouldEnqueueEvent(event, existingKeys);
  const runScopeKey = `${body.triggerId}:${dedupeKey}`;
  const existingRun = findByKey(store.triggerRuns, "scopeKey", runScopeKey);

  if (!enqueue.enqueue && existingRun) {
    return ok({
      deduped: true,
      idempotencyKey: dedupeKey,
      run: existingRun,
    });
  }

  const integrationEvent = {
    dedupeKey,
    eventKey: body.eventKey,
    eventType: body.eventType || "manual",
    id: `event:${dedupeKey}`,
    payload: body.payload || {},
    receivedAt: new Date(now).toISOString(),
    source: body.source,
    userId: body.userId,
  };
  if (enqueue.enqueue) {
    store.integrationEvents.push(integrationEvent);
  }

  const trigger =
    findByKey(store.triggers, "id", body.triggerId) ||
    createTriggerDefinition({
      id: body.triggerId,
      name: body.triggerName || "Trigger",
      source: body.source,
      type: body.eventType || "manual",
      userId: body.userId,
    });
  const run = createTriggerRun({
    action: body.action || "record_event",
    event,
    id: `run:${dedupeKey}`,
    now: new Date(now).toISOString(),
    trigger,
  });
  const storedRun = {
    ...run,
    idempotencyKey: dedupeKey,
    integrationEventId: integrationEvent.id,
    scopeKey: runScopeKey,
  };
  const result = upsertByKey(store.triggerRuns, "scopeKey", storedRun);

  return ok({
    deduped: !result.created,
    idempotencyKey: dedupeKey,
    run: result.row,
  });
}

function handleScheduleJobTick({ body = {}, now = Date.now(), store, token }) {
  const authError = requireAuth({ service: body.service === true, token });

  if (authError) {
    return authError;
  }

  if (!body.userId || !body.triggerId || !body.scheduleKey) {
    return fail("missing_schedule_scope", 400);
  }

  const seededJob =
    findByKey(store.scheduleJobs, "scheduleKey", body.scheduleKey) || {};
  const job = createScheduleJob({
    ...seededJob,
    cronExpression: body.cronExpression || seededJob.cronExpression,
    id: body.jobId || seededJob.id,
    intervalMinutes: body.intervalMinutes || seededJob.intervalMinutes,
    metadata: body.metadata || seededJob.metadata || {},
    nextRunAt: body.nextRunAt || seededJob.nextRunAt || now,
    scheduleKey: body.scheduleKey,
    status: body.status || seededJob.status,
    triggerId: body.triggerId,
    userId: body.userId,
  });

  if (!isScheduleJobDue({ job, now })) {
    upsertByKey(store.scheduleJobs, "scheduleKey", job);
    return ok({ due: false, job, queued: false });
  }

  const ranJob = markScheduleJobRun(job, now);
  upsertByKey(store.scheduleJobs, "scheduleKey", ranJob);

  const dispatch = handleTriggerDispatch({
    body: createScheduleTriggerPayload({ job: ranJob, now }),
    now,
    store,
    token: token || "schedule-worker",
  });

  return ok({
    dispatch: dispatch.data,
    due: true,
    job: ranJob,
    queued: dispatch.status === 200,
  }, dispatch.status);
}

function handleLocationSuggestion({ body = {}, now = Date.now(), store, token }) {
  const authError = requireAuth({ token });

  if (authError) {
    return authError;
  }

  if (!body.userId || !body.triggerId || !body.deviceId) {
    return fail("missing_location_scope", 400);
  }

  const event = createLocationEvent({
    coords: body.coords,
    deviceId: body.deviceId,
    eventType: body.eventType,
    observedAt: body.observedAt || now,
    placeId: body.placeId,
    placeLabel: body.placeLabel,
    userId: body.userId,
  });

  if (!event.payload.coarseLocation) {
    return fail("missing_location", 400);
  }

  const suggestion = createLocationSuggestion({
    event,
    receiptCount: body.receiptCount || 0,
  });
  store.locationEvents.push({
    ...event,
    suggestion,
  });

  const dispatch = handleTriggerDispatch({
    body: createLocationTriggerPayload({
      event,
      suggestion,
      triggerId: body.triggerId,
    }),
    now,
    store,
    token,
  });

  return ok({
    dispatch: dispatch.data,
    queued: dispatch.status === 200,
    suggestion,
  }, dispatch.status);
}

function handleCodeExecutionRequest({ body = {}, now = Date.now(), store, token }) {
  const authError = requireAuth({ token });

  if (authError) {
    return authError;
  }

  const request = createCodeExecutionRequest({
    code: body.code,
    command: body.command,
    environment: body.environment,
    id: body.id,
    language: body.language,
    now,
    provider: body.provider,
    purpose: body.purpose,
    timeoutSeconds: body.timeoutSeconds,
    triggerRunId: body.triggerRunId,
    userId: body.userId,
    workingDirectory: body.workingDirectory,
  });
  const validation = validateCodeExecutionRequest(request);

  if (!validation.ok) {
    return fail(validation.reason, 400);
  }

  const result = upsertByKey(store.codeExecutionRequests, "id", request);
  let dispatch = null;

  if (body.triggerId) {
    dispatch = handleTriggerDispatch({
      body: createCodeExecutionTriggerPayload({
        request,
        triggerId: body.triggerId,
      }),
      now,
      store,
      token,
    });
  }

  return ok({
    queued: true,
    request: result.row,
    run: dispatch?.data?.run || null,
  }, dispatch?.status || 202);
}

function handleComposioWebhook({
  body = {},
  headers,
  now = Date.now(),
  store,
}) {
  const envelope = validateComposioWebhookEnvelope({
    headers,
    now,
    payload: body,
  });

  if (!envelope.ok) {
    return fail(envelope.error, envelope.error === "missing_event_key" ? 400 : 401);
  }

  const userId = body.user_id || body.userId || "provider-user";

  return handleTriggerDispatch({
    body: {
      action: body.action || "record_event",
      eventKey: envelope.event.eventKey,
      eventType: body.event_type || body.eventType || "composio_event",
      payload: envelope.event.payload,
      source: envelope.event.source,
      triggerId: envelope.event.triggerId || body.triggerId || "composio-trigger",
      userId,
    },
    now,
    store,
    token: "provider-webhook",
  });
}

function handleStatusRead({ now = Date.now(), store, token, userId }) {
  const authError = requireAuth({ token });

  if (authError) {
    return authError;
  }

  const latestDevice = store.deviceHeartbeats
    .filter((heartbeat) => !userId || heartbeat.userId === userId)
    .sort((a, b) => new Date(b.seenAt) - new Date(a.seenAt))[0];
  const latestWorker = store.workerHeartbeats
    .sort((a, b) => new Date(b.seenAt) - new Date(a.seenAt))[0];

  return ok({
    backend: "available",
    bridge:
      store.integrationSources?.some((source) => source.enabled) ||
      store.triggers.some(
        (trigger) => trigger.status === "active" && isProviderTrigger(trigger),
      ) ||
      store.integrationEvents.some((event) => String(event.source).startsWith("mcp"))
        ? "available"
        : "unavailable",
    codeExecution:
      store.codeExecutionRequests.length > 0 ? "available" : "unknown",
    cron: store.scheduleJobs.length > 0 ? "available" : "unknown",
    deviceHeartbeat: classifyHeartbeat({
      lastSeenAt: latestDevice?.seenAt,
      now,
    }),
    locationSuggestionCount: store.locationEvents.filter(
      (event) => !userId || event.userId === userId,
    ).length,
    realtime: "unknown",
    runCount: store.triggerRuns.filter((run) => !userId || run.userId === userId)
      .length,
    workerHeartbeat: classifyHeartbeat({
      lastSeenAt: latestWorker?.seenAt,
      now,
    }),
  });
}

function handleMobileSync({ store, token, userId }) {
  const authError = requireAuth({ token });

  if (authError) {
    return authError;
  }

  return ok({
    codeExecutionRequests: store.codeExecutionRequests.filter(
      (request) => !userId || request.userId === userId,
    ),
    connectors: [],
    locationSuggestions: store.locationEvents.filter(
      (event) => !userId || event.userId === userId,
    ),
    runHistory: store.triggerRuns.filter((run) => !userId || run.userId === userId),
    scheduleJobs: store.scheduleJobs.filter((job) => !userId || job.userId === userId),
    triggerDefinitions: store.triggers.filter(
      (trigger) => !userId || trigger.userId === userId,
    ),
  });
}

module.exports = {
  createMemoryStore,
  handleCodeExecutionRequest,
  handleComposioWebhook,
  handleHeartbeatIngest,
  handleLocationSuggestion,
  handleMobileSync,
  handleScheduleJobTick,
  handleStatusRead,
  handleTriggerDispatch,
};

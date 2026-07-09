const { CAPABILITY_STATUS, getDefaultIntegrationHealth } = require("./integrationCapabilities");
const {
  TRIGGER_RUN_STATUS,
  TRIGGER_STATUS,
  createTriggerDefinition,
  getTriggerDisplayStatus,
} = require("./triggers");

const TRIGGER_LIST_STATE = {
  EMPTY: "empty",
  ERROR: "error",
  LOADED: "loaded",
  LOADING: "loading",
};

function getProviderState({ backendReady, providerConfigured } = {}) {
  if (!backendReady) {
    return {
      copy: "Backend offline",
      status: CAPABILITY_STATUS.OFFLINE,
    };
  }

  if (!providerConfigured) {
    return {
      copy: "Connectors unavailable",
      status: CAPABILITY_STATUS.UNAVAILABLE,
    };
  }

  return {
    copy: "Ready",
    status: CAPABILITY_STATUS.AVAILABLE,
  };
}

function getTriggerListState({ error, loading, triggers } = {}) {
  if (loading) {
    return TRIGGER_LIST_STATE.LOADING;
  }

  if (error) {
    return TRIGGER_LIST_STATE.ERROR;
  }

  if (!Array.isArray(triggers) || triggers.length === 0) {
    return TRIGGER_LIST_STATE.EMPTY;
  }

  return TRIGGER_LIST_STATE.LOADED;
}

function normalizeTriggerDefinition(trigger = {}) {
  return createTriggerDefinition({
    config: trigger.config || {},
    createdAt: trigger.createdAt || trigger.created_at || new Date().toISOString(),
    id: trigger.id,
    name: trigger.name || trigger.trigger_name || "Trigger",
    source: trigger.source,
    status: trigger.status || TRIGGER_STATUS.ACTIVE,
    type: trigger.type || trigger.triggerType || trigger.trigger_type,
    userId: trigger.userId || trigger.user_id,
  });
}

function normalizeTriggerRun(run = {}) {
  return {
    ...run,
    id: run.id,
    status: run.status,
    triggerId: run.triggerId || run.trigger_id,
    updatedAt: run.updatedAt || run.updated_at,
    userId: run.userId || run.user_id,
  };
}

function getDefaultTriggerDashboard(options = {}) {
  const health = getDefaultIntegrationHealth(options);
  const backendReady = health.backend === CAPABILITY_STATUS.AVAILABLE;
  const provider = getProviderState({
    backendReady,
    providerConfigured: options.providerConfigured === true,
  });
  const trigger = createTriggerDefinition({
    config: { catalogSource: "backend" },
    id: "receipt-export-follow-up",
    name: "Receipt follow-up",
    source: "backend_catalog",
    status:
      backendReady && provider.status === CAPABILITY_STATUS.AVAILABLE
        ? TRIGGER_STATUS.ACTIVE
        : TRIGGER_STATUS.PAUSED,
    type: "receipt_reviewed",
    userId: options.userId || null,
  });
  const fallbackRuns = [
    {
      id: "run-approval-required",
      status: TRIGGER_RUN_STATUS.APPROVAL_REQUIRED,
      triggerId: trigger.id,
    },
    {
      id: "run-succeeded",
      status: TRIGGER_RUN_STATUS.SUCCEEDED,
      triggerId: trigger.id,
    },
    {
      id: "run-retrying",
      status: TRIGGER_RUN_STATUS.RETRYING,
      triggerId: trigger.id,
    },
    {
      id: "run-failed",
      status: TRIGGER_RUN_STATUS.FAILED,
      triggerId: trigger.id,
    },
    {
      id: "run-dead-lettered",
      status: TRIGGER_RUN_STATUS.DEAD_LETTERED,
      triggerId: trigger.id,
    },
  ];
  const syncHydrated = options.syncHydrated === true;
  const runs = syncHydrated
    ? (options.runHistory || []).map(normalizeTriggerRun)
    : fallbackRuns;
  const triggers = syncHydrated
    ? (options.triggers || []).map(normalizeTriggerDefinition)
    : [trigger];

  return {
    health,
    provider,
    runHistory: runs,
    triggerControls: {
      canCreate: provider.status === CAPABILITY_STATUS.AVAILABLE,
      canDelete: provider.status === CAPABILITY_STATUS.AVAILABLE,
      canEdit: provider.status === CAPABILITY_STATUS.AVAILABLE,
      canPause: provider.status === CAPABILITY_STATUS.AVAILABLE,
      canResume: provider.status === CAPABILITY_STATUS.AVAILABLE,
    },
    triggerListState: getTriggerListState({
      error: options.syncError,
      loading: options.syncLoading,
      triggers,
    }),
    triggers: triggers.map((nextTrigger) => ({
      ...nextTrigger,
      displayStatus: getTriggerDisplayStatus(
        nextTrigger,
        runs.filter((run) => run.triggerId === nextTrigger.id),
      ),
    })),
  };
}

module.exports = {
  TRIGGER_LIST_STATE,
  getDefaultTriggerDashboard,
  getProviderState,
  getTriggerListState,
  normalizeTriggerDefinition,
  normalizeTriggerRun,
};

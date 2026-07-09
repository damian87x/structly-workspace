const CAPABILITY_STATUS = {
  AVAILABLE: "available",
  CONSTRAINED: "constrained",
  DENIED: "denied",
  OFFLINE: "offline",
  STALE: "stale",
  UNAVAILABLE: "unavailable",
  UNKNOWN: "unknown",
};

const BACKGROUND_EXECUTION_NOTE =
  "Background work is best effort. Backend triggers continue without the app staying open.";

function isGranted(permission) {
  return permission?.granted === true || permission?.status === "granted";
}

function isDenied(permission) {
  return permission?.granted === false || permission?.status === "denied";
}

function getPermissionCapability(permission, providerAvailable = true) {
  if (!providerAvailable) {
    return CAPABILITY_STATUS.UNAVAILABLE;
  }

  if (!permission) {
    return CAPABILITY_STATUS.UNKNOWN;
  }

  if (isGranted(permission)) {
    return CAPABILITY_STATUS.AVAILABLE;
  }

  if (isDenied(permission)) {
    return CAPABILITY_STATUS.DENIED;
  }

  return CAPABILITY_STATUS.UNKNOWN;
}

function getBackendCapability({ reachable, stale, unauthorized } = {}) {
  if (unauthorized) {
    return CAPABILITY_STATUS.DENIED;
  }

  if (reachable === false) {
    return CAPABILITY_STATUS.OFFLINE;
  }

  if (stale) {
    return CAPABILITY_STATUS.STALE;
  }

  if (reachable === true) {
    return CAPABILITY_STATUS.AVAILABLE;
  }

  return CAPABILITY_STATUS.UNKNOWN;
}

function getBackgroundCapability({ configured, supported } = {}) {
  if (supported === false) {
    return CAPABILITY_STATUS.UNAVAILABLE;
  }

  if (configured === true && supported === true) {
    return CAPABILITY_STATUS.CONSTRAINED;
  }

  return CAPABILITY_STATUS.UNKNOWN;
}

function getTriggerCapability({ backendStatus, providerConfigured } = {}) {
  if (backendStatus !== CAPABILITY_STATUS.AVAILABLE) {
    return CAPABILITY_STATUS.OFFLINE;
  }

  return providerConfigured ? CAPABILITY_STATUS.AVAILABLE : CAPABILITY_STATUS.UNAVAILABLE;
}

function getSchedulerCapability({ backendStatus, configured } = {}) {
  if (backendStatus !== CAPABILITY_STATUS.AVAILABLE) {
    return CAPABILITY_STATUS.OFFLINE;
  }

  return configured ? CAPABILITY_STATUS.AVAILABLE : CAPABILITY_STATUS.UNKNOWN;
}

function getCodeExecutionCapability({ backendStatus, configured } = {}) {
  if (backendStatus !== CAPABILITY_STATUS.AVAILABLE) {
    return CAPABILITY_STATUS.OFFLINE;
  }

  return configured ? CAPABILITY_STATUS.CONSTRAINED : CAPABILITY_STATUS.UNKNOWN;
}

function getDefaultIntegrationHealth(options = {}) {
  const backend = getBackendCapability(options.backend);
  const location = getPermissionCapability(
    options.locationPermission,
    options.locationProviderAvailable !== false,
  );
  const calendar = getPermissionCapability(
    options.calendarPermission,
    options.calendarProviderAvailable !== false,
  );
  const background = getBackgroundCapability(options.background);
  const triggers = getTriggerCapability({
    backendStatus: backend,
    providerConfigured: options.providerConfigured === true,
  });
  const scheduler = getSchedulerCapability({
    backendStatus: backend,
    configured:
      options.schedulerConfigured === true ||
      options.scheduler?.configured === true,
  });
  const codeExecution = getCodeExecutionCapability({
    backendStatus: backend,
    configured:
      options.codeExecutionConfigured === true ||
      options.codeExecution?.configured === true,
  });

  return {
    background,
    backgroundNote: BACKGROUND_EXECUTION_NOTE,
    backend,
    calendar,
    codeExecution,
    location,
    scheduler,
    triggers,
  };
}

function isIntegrationReady(health) {
  return (
    health?.backend === CAPABILITY_STATUS.AVAILABLE &&
    health?.triggers === CAPABILITY_STATUS.AVAILABLE
  );
}

function getHealthRows(health) {
  return [
    ["Location", health.location],
    ["Calendar", health.calendar],
    ["Backend", health.backend],
    ["Triggers", health.triggers],
    ["Schedule Jobs", health.scheduler],
    ["Code Runs", health.codeExecution],
    ["Background", health.background],
  ].map(([label, status]) => ({ label, status }));
}

module.exports = {
  BACKGROUND_EXECUTION_NOTE,
  CAPABILITY_STATUS,
  getBackendCapability,
  getCodeExecutionCapability,
  getDefaultIntegrationHealth,
  getHealthRows,
  getPermissionCapability,
  getSchedulerCapability,
  isIntegrationReady,
};

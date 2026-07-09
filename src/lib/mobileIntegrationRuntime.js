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

module.exports = {
  createMobileDeviceHeartbeatPayload,
  createMobileDeviceId,
  getSessionUserId,
};

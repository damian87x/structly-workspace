const CODE_EXECUTION_PROVIDER = {
  DAYTONA: "daytona",
};

const CODE_EXECUTION_STATUS = {
  APPROVAL_REQUIRED: "approval_required",
  DENIED: "denied",
  FAILED: "failed",
  QUEUED: "queued",
  RUNNING: "running",
  SUCCEEDED: "succeeded",
};

const SUPPORTED_CODE_LANGUAGES = new Set([
  "javascript",
  "python",
  "shell",
  "typescript",
]);

const SECRET_ENV_KEYS = new Set([
  "api_key",
  "apikey",
  "authorization",
  "password",
  "secret",
  "service_role",
  "token",
]);

function normalizeText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function hasSecretName(key) {
  const normalized = normalizeText(key).toLowerCase();

  return [...SECRET_ENV_KEYS].some((secretKey) => normalized.includes(secretKey));
}

function sanitizeEnvironment(environment = {}) {
  if (!environment || typeof environment !== "object" || Array.isArray(environment)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(environment).filter(([key]) => !hasSecretName(key)),
  );
}

function normalizeLanguage(language) {
  const normalized = normalizeText(language).toLowerCase();

  return SUPPORTED_CODE_LANGUAGES.has(normalized) ? normalized : null;
}

function normalizeTimeoutSeconds(value, fallback = 10) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.min(60, Math.round(value)));
}

function createCodeExecutionRequest({
  code = null,
  command = null,
  environment = {},
  id,
  language = "typescript",
  now = new Date(),
  provider = CODE_EXECUTION_PROVIDER.DAYTONA,
  purpose = "trigger_action",
  timeoutSeconds = 10,
  triggerRunId = null,
  userId,
  workingDirectory = "workspace",
}) {
  const normalizedLanguage = normalizeLanguage(language);
  const requestId =
    id ||
    `code:${provider}:${userId || "unknown"}:${new Date(now).toISOString()}`;

  return {
    approvalRequired: true,
    code,
    command,
    environment: sanitizeEnvironment(environment),
    id: requestId,
    language: normalizedLanguage,
    mobileExecution: false,
    provider,
    purpose,
    status: CODE_EXECUTION_STATUS.APPROVAL_REQUIRED,
    timeoutSeconds: normalizeTimeoutSeconds(timeoutSeconds),
    triggerRunId,
    userId,
    workingDirectory: normalizeText(workingDirectory) || "workspace",
  };
}

function validateCodeExecutionRequest(request) {
  if (!request?.userId) {
    return { ok: false, reason: "missing_user_id" };
  }

  if (request.provider !== CODE_EXECUTION_PROVIDER.DAYTONA) {
    return { ok: false, reason: "unsupported_provider" };
  }

  if (!request.language) {
    return { ok: false, reason: "unsupported_language" };
  }

  if (!normalizeText(request.code) && !normalizeText(request.command)) {
    return { ok: false, reason: "missing_code_or_command" };
  }

  return { ok: true, reason: null };
}

function createCodeExecutionTriggerPayload({ request, triggerId }) {
  return {
    action: "execute_code",
    eventKey: request.id,
    eventType: "code_execution_requested",
    payload: {
      language: request.language,
      mobileExecution: false,
      provider: request.provider,
      purpose: request.purpose,
      timeoutSeconds: request.timeoutSeconds,
      workingDirectory: request.workingDirectory,
    },
    source: `code:${request.provider}`,
    triggerId,
    userId: request.userId,
  };
}

module.exports = {
  CODE_EXECUTION_PROVIDER,
  CODE_EXECUTION_STATUS,
  createCodeExecutionRequest,
  createCodeExecutionTriggerPayload,
  sanitizeEnvironment,
  validateCodeExecutionRequest,
};

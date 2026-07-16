const {
  DEVICE_SIGNAL_DECISIONS,
  classifySelectionResult,
} = require("./deviceSignalGate");

/**
 * Importable capture controller — behaviourally testable orchestration for
 * the device-signal gate continuations. Every public async method resolves
 * to the normalized triple { status, receipt, error } and never throws.
 */
function createCaptureSession({
  gate,
  showRationale,
  initialDecision = DEVICE_SIGNAL_DECISIONS.PENDING,
} = {}) {
  if (typeof gate !== "function") {
    throw new Error("createCaptureSession requires a gate function");
  }

  let decision = initialDecision;
  /** @type {{ resume: Function, decline: Function } | null} */
  let continuation = null;
  let inFlight = false;

  function normalize(result) {
    const classified = classifySelectionResult(result);

    if (classified.kind === "rationale") {
      return { status: "rationale", receipt: null, error: null };
    }

    if (classified.kind === "cancelled") {
      return { status: "cancelled", receipt: null, error: null };
    }

    if (classified.kind === "error") {
      return {
        status: "error",
        receipt: null,
        error: classified.captureError,
      };
    }

    // Retain result.receipt itself — never discard the selected object.
    return { status: "receipt", receipt: result.receipt, error: null };
  }

  async function runExclusive(fn) {
    if (inFlight) {
      return { status: "in-flight", receipt: null, error: null };
    }

    inFlight = true;
    try {
      return normalize(await fn());
    } catch (e) {
      // Rejecting resume/decline/gate → error triple; decision + continuation
      // UNCHANGED (failed capture neither grants nor revokes authority).
      return {
        status: "error",
        receipt: null,
        error: e?.message || String(e),
      };
    } finally {
      inFlight = false;
    }
  }

  async function requestCapture() {
    return runExclusive(async () => {
      // ALLOWED + live continuation → reuse resume (fresh GRANT per call).
      if (
        decision === DEVICE_SIGNAL_DECISIONS.ALLOWED &&
        continuation &&
        typeof continuation.resume === "function"
      ) {
        return continuation.resume();
      }

      // ALLOWED + none (stale/restored) → reset PENDING, then mint new continuation.
      // NEVER a grantless capture on this row.
      if (
        decision === DEVICE_SIGNAL_DECISIONS.ALLOWED &&
        !continuation
      ) {
        decision = DEVICE_SIGNAL_DECISIONS.PENDING;
      }

      // DECLINED → gate direct grantless path (mints nothing, by design).
      if (decision === DEVICE_SIGNAL_DECISIONS.DECLINED) {
        continuation = null;
        return gate({
          source: "camera",
          decision: DEVICE_SIGNAL_DECISIONS.DECLINED,
        });
      }

      // PENDING (+ showRationale forwarded into the gate call).
      const result = await gate({
        source: "camera",
        decision: DEVICE_SIGNAL_DECISIONS.PENDING,
        showRationale,
      });

      if (
        result &&
        result.status === "rationale-required" &&
        typeof result.resume === "function" &&
        typeof result.decline === "function"
      ) {
        continuation = {
          resume: result.resume,
          decline: result.decline,
        };
      }

      return result;
    });
  }

  async function continueRationale() {
    return runExclusive(async () => {
      if (!continuation || typeof continuation.resume !== "function") {
        throw new Error("Nothing to continue");
      }

      const result = await continuation.resume();
      // Keep continuation for reuse; only commit ALLOWED after resume settles
      // without throwing (cancelled/error results still mean the user allowed).
      decision = DEVICE_SIGNAL_DECISIONS.ALLOWED;
      return result;
    });
  }

  async function declineRationale() {
    return runExclusive(async () => {
      if (!continuation || typeof continuation.decline !== "function") {
        throw new Error("Nothing to decline");
      }

      const result = await continuation.decline();
      decision = DEVICE_SIGNAL_DECISIONS.DECLINED;
      // Cleared — later DECLINED captures go through the gate's direct path.
      continuation = null;
      return result;
    });
  }

  function getDecision() {
    return decision;
  }

  return {
    requestCapture,
    continueRationale,
    declineRationale,
    getDecision,
  };
}

module.exports = {
  createCaptureSession,
};

const DEVICE_SIGNAL_DECISIONS = {
  PENDING: "pending",
  ALLOWED: "allowed",
  DECLINED: "declined",
};

// Module-private sentinel. Never exported. The only mint site is the
// resume() closure returned by selectReceiptWithGate on camera+PENDING.
const GRANT = Symbol("device-signal-grant");

const DEVICE_SIGNAL_RATIONALE = {
  title: "Use location and calendar",
  body:
    "We use location and calendar to add the place to a receipt and match a receipt to a client meeting.",
  continueLabel: "Continue",
  declineLabel: "Not now",
};

function isGrant(x) {
  return x === GRANT;
}

function resolveDeviceSignalOptions(decision) {
  if (decision === DEVICE_SIGNAL_DECISIONS.DECLINED) {
    return { useLocation: false, useCalendar: false };
  }

  return { useLocation: true, useCalendar: true };
}

async function selectReceiptWithGate({
  decision,
  source,
  showRationale,
  capture,
} = {}) {
  // Lazy require keeps the cycle free: leaves top-level require this module
  // for isGrant; this module only loads receiptCapture at call time.
  const captureApi = capture || require("./receiptCapture");

  if (source === "camera" && decision === DEVICE_SIGNAL_DECISIONS.PENDING) {
    if (typeof showRationale === "function") {
      showRationale();
    }

    // resume is the ONLY mint site — closes over GRANT unconditionally.
    // Closure is reusable: each call captures with a fresh grant reference.
    return {
      status: "rationale-required",
      receipt: null,
      error: null,
      resume: async () =>
        captureApi.takeReceiptPhoto({ useLocation: true, grant: GRANT }),
      decline: async () => captureApi.takeReceiptPhoto({ useLocation: false }),
    };
  }

  // Direct non-PENDING camera path: capture WITHOUT grant.
  // resolveDeviceSignalOptions confers NO authority; decision values mint nothing.
  if (source === "camera") {
    const options = resolveDeviceSignalOptions(decision);
    return captureApi.takeReceiptPhoto({ useLocation: options.useLocation });
  }

  return captureApi.pickReceiptFromLibrary();
}

/**
 * Pure branch decision for handleReceiptSelection results.
 * Keeps App.js fall-through logic unit-testable (no false first-tap error).
 *
 * @returns {{ kind: "rationale"|"cancelled"|"error"|"receipt", captureError: string|null }}
 */
function classifySelectionResult(result) {
  if (!result || typeof result !== "object") {
    return {
      kind: "error",
      captureError: "Unable to select a receipt image.",
    };
  }

  if (result.status === "rationale-required") {
    return { kind: "rationale", captureError: null };
  }

  if (result.status === "cancelled") {
    return { kind: "cancelled", captureError: null };
  }

  if (result.error || !result.receipt) {
    return {
      kind: "error",
      captureError:
        result.error?.message || "Unable to select a receipt image.",
    };
  }

  return { kind: "receipt", captureError: null };
}

module.exports = {
  DEVICE_SIGNAL_DECISIONS,
  DEVICE_SIGNAL_RATIONALE,
  isGrant,
  resolveDeviceSignalOptions,
  selectReceiptWithGate,
  classifySelectionResult,
};

const {
  attachCalendarContext,
  getReceiptCalendarContext,
} = require("./calendarContext");
const { attachLocation, getReceiptLocation } = require("./locationContext");

const ENRICHMENT_TIMEOUT_MS = 750;

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function getReceiptContext(receipt) {
  return isObject(receipt?.context) ? receipt.context : {};
}

function withContextSource(receipt) {
  const context = getReceiptContext(receipt);

  return {
    ...receipt,
    context: {
      ...context,
      source: context.source || receipt.source,
    },
  };
}

function getCapturedAt(receipt) {
  return (
    receipt?.capturedAt ||
    receipt?.context?.capturedAt ||
    receipt?.createdAt ||
    receipt?.timestamp ||
    null
  );
}

function getEventsCalendar(events) {
  if (!Array.isArray(events)) {
    return null;
  }

  return {
    async getEventsAsync() {
      return events;
    },
    async requestCalendarPermissionsAsync() {
      return { status: "granted" };
    },
  };
}

function resolveSafely(operation, fallback) {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (value) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve(value);
    };

    const timeout = setTimeout(() => {
      finish(fallback);
    }, ENRICHMENT_TIMEOUT_MS);

    Promise.resolve()
      .then(operation)
      .then(finish)
      .catch(() => {
        finish(fallback);
      });
  });
}

async function enrichReceipt(receipt, { location, calendar, events } = {}) {
  if (!isObject(receipt) || receipt.source !== "camera") {
    return receipt;
  }

  const capturedAt = getCapturedAt(receipt);
  const calendarProvider = getEventsCalendar(events) || calendar;
  const [locationContext, calendarContext] = await Promise.all([
    resolveSafely(() => getReceiptLocation({ location }), null),
    resolveSafely(
      () =>
        capturedAt
          ? getReceiptCalendarContext(capturedAt, { calendar: calendarProvider })
          : null,
      null,
    ),
  ]);

  let enrichedReceipt = receipt;

  if (locationContext) {
    enrichedReceipt = attachLocation(
      withContextSource(enrichedReceipt),
      locationContext,
    );
  }

  if (calendarContext) {
    enrichedReceipt = attachCalendarContext(
      withContextSource(enrichedReceipt),
      calendarContext,
    );
  }

  return enrichedReceipt;
}

module.exports = {
  ENRICHMENT_TIMEOUT_MS,
  enrichReceipt,
};

const DEFAULT_WINDOW_MINUTES = 90;
const MINUTE_MS = 60 * 1000;

const PERSONAL_TITLE_PATTERN =
  /\b(lunch|gym|dentist|doctor|school run|holiday|vacation|family|personal|private|birthday|workout|commute)\b/i;
const GENERIC_CLIENT_LABELS = new Set([
  "1",
  "1:1",
  "call",
  "catch up",
  "catchup",
  "daily",
  "internal",
  "meeting",
  "review",
  "standup",
  "sync",
  "weekly",
]);
const PERSONAL_EMAIL_DOMAINS = new Set([
  "aol.com",
  "gmail.com",
  "hotmail.com",
  "icloud.com",
  "live.com",
  "me.com",
  "outlook.com",
  "proton.me",
  "protonmail.com",
  "yahoo.com",
]);

const { isGrant } = require("./deviceSignalGate");

function getDefaultCalendar() {
  return require("expo-calendar");
}

function normalizeText(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function parseDate(value) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null;
  }

  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function getWindowMinutes(options) {
  const configured = Number(options?.windowMinutes);

  if (!Number.isFinite(configured) || configured < 0) {
    return DEFAULT_WINDOW_MINUTES;
  }

  return configured;
}

function getEventStart(event) {
  return parseDate(event?.startDate ?? event?.start ?? event?.beginDate);
}

function getEventEnd(event) {
  return parseDate(event?.endDate ?? event?.end ?? event?.finishDate);
}

function findEventForReceipt(capturedAt, events, options = {}) {
  const capturedDate = parseDate(capturedAt);

  if (!capturedDate || !Array.isArray(events) || events.length === 0) {
    return null;
  }

  const capturedTime = capturedDate.getTime();

  for (const event of events) {
    const start = getEventStart(event);
    const end = getEventEnd(event);

    if (!start || !end) {
      continue;
    }

    if (start.getTime() <= capturedTime && capturedTime <= end.getTime()) {
      return event;
    }
  }

  const windowMs = getWindowMinutes(options) * MINUTE_MS;
  let nearest = null;

  for (const event of events) {
    const start = getEventStart(event);

    if (!start) {
      continue;
    }

    const distance = Math.abs(start.getTime() - capturedTime);

    if (distance > windowMs) {
      continue;
    }

    if (!nearest || distance < nearest.distance) {
      nearest = { distance, event };
    }
  }

  return nearest?.event || null;
}

function getEventTitle(event) {
  return (
    normalizeText(event?.title) ||
    normalizeText(event?.summary) ||
    normalizeText(event?.name)
  );
}

function normalizeLabel(value) {
  return normalizeText(value)?.replace(/\s+/g, " ") || null;
}

function isLikelyClientLabel(value) {
  const label = normalizeLabel(value);

  if (!label || label.length < 2) {
    return false;
  }

  const normalized = label.toLowerCase();

  if (GENERIC_CLIENT_LABELS.has(normalized)) {
    return false;
  }

  return !PERSONAL_TITLE_PATTERN.test(label);
}

function parseClientProjectFromTitle(title) {
  const match = title.match(/^(.+?)\s*(?:-|:|\/|\|)\s*(.+)$/);

  if (!match) {
    return null;
  }

  const client = normalizeLabel(match[1]);
  const project = normalizeLabel(match[2]);

  if (!isLikelyClientLabel(client) || !project) {
    return null;
  }

  return { client, project };
}

function titleCase(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function getEmailDomain(email) {
  const normalized = normalizeText(email)?.toLowerCase();
  const parts = normalized?.split("@");

  if (!parts || parts.length !== 2) {
    return null;
  }

  return parts[1];
}

function clientFromEmail(email) {
  const domain = getEmailDomain(email);

  if (!domain || PERSONAL_EMAIL_DOMAINS.has(domain)) {
    return null;
  }

  const name = domain.split(".")[0].replace(/[-_]+/g, " ");
  return titleCase(name);
}

function getParticipantClient(participant) {
  if (!participant) {
    return null;
  }

  if (typeof participant === "string") {
    return clientFromEmail(participant);
  }

  if (participant.isCurrentUser) {
    return null;
  }

  const organization =
    normalizeLabel(participant.organization) ||
    normalizeLabel(participant.company);

  if (organization && isLikelyClientLabel(organization)) {
    return organization;
  }

  return clientFromEmail(participant.email || participant.url);
}

function findExternalClient(event) {
  const attendees = Array.isArray(event?.attendees) ? event.attendees : [];

  for (const attendee of attendees) {
    const client = getParticipantClient(attendee);

    if (client) {
      return client;
    }
  }

  return getParticipantClient(event?.organizer);
}

function getNonBillable() {
  return {
    billable: false,
    client: null,
    project: null,
  };
}

function deriveBillable(event) {
  const title = getEventTitle(event);

  if (!event || (title && PERSONAL_TITLE_PATTERN.test(title))) {
    return getNonBillable();
  }

  if (title) {
    const titledClient = parseClientProjectFromTitle(title);

    if (titledClient) {
      return {
        billable: true,
        client: titledClient.client,
        project: titledClient.project,
      };
    }
  }

  const externalClient = findExternalClient(event);

  if (externalClient) {
    return {
      billable: true,
      client: externalClient,
      project: null,
    };
  }

  return getNonBillable();
}

function serializeDate(value) {
  const date = parseDate(value);
  return date ? date.toISOString() : null;
}

function normalizeCalendarEvent(event) {
  return {
    calendarId: normalizeText(event?.calendarId) || null,
    endDate: serializeDate(event?.endDate ?? event?.end),
    eventId: normalizeText(event?.id) || null,
    location: normalizeText(event?.location) || null,
    startDate: serializeDate(event?.startDate ?? event?.start),
    title: getEventTitle(event),
  };
}

function hasCalendarPermission(permission) {
  return permission?.granted === true || permission?.status === "granted";
}

function getCalendarIds(calendars) {
  if (!Array.isArray(calendars)) {
    return [];
  }

  return calendars.map((calendar) => calendar?.id).filter(Boolean);
}

async function getProviderEvents(calendar, calendarIds, startDate, endDate) {
  if (calendarIds) {
    return calendar.getEventsAsync(calendarIds, startDate, endDate);
  }

  if (calendar.getEventsAsync.length <= 2) {
    return calendar.getEventsAsync(startDate, endDate);
  }

  return calendar.getEventsAsync([], startDate, endDate);
}

async function getReceiptCalendarContext(capturedAt, options = {}) {
  const settings = options || {};
  // FIRST statement (before settings.calendar || getDefaultCalendar and
  // requestCalendarPermissionsAsync): no authority without a real grant.
  if (!isGrant(settings.grant)) {
    return null;
  }

  const capturedDate = parseDate(capturedAt);

  if (!capturedDate) {
    return null;
  }

  const calendar = settings.calendar || getDefaultCalendar();

  if (
    !calendar ||
    typeof calendar.requestCalendarPermissionsAsync !== "function" ||
    typeof calendar.getEventsAsync !== "function"
  ) {
    return null;
  }

  const permission = await calendar.requestCalendarPermissionsAsync();

  if (!hasCalendarPermission(permission)) {
    return null;
  }

  const calendarIds =
    typeof calendar.getCalendarsAsync === "function"
      ? getCalendarIds(
          await calendar.getCalendarsAsync(calendar.EntityTypes?.EVENT),
        )
      : null;

  if (calendarIds && calendarIds.length === 0) {
    return null;
  }

  const windowMs = getWindowMinutes(settings) * MINUTE_MS;
  const startDate = new Date(capturedDate.getTime() - windowMs);
  const endDate = new Date(capturedDate.getTime() + windowMs);
  const events = await getProviderEvents(
    calendar,
    calendarIds,
    startDate,
    endDate,
  );
  const event = findEventForReceipt(capturedDate, events, settings);

  if (!event) {
    return null;
  }

  return {
    billable: deriveBillable(event),
    calendar: normalizeCalendarEvent(event),
  };
}

function attachCalendarContext(receipt, calContext) {
  const baseReceipt =
    receipt && typeof receipt === "object" && !Array.isArray(receipt)
      ? receipt
      : {};
  const context =
    baseReceipt.context && typeof baseReceipt.context === "object"
      ? baseReceipt.context
      : {};

  return {
    ...baseReceipt,
    context: {
      ...context,
      billable: calContext?.billable || getNonBillable(),
      calendar: calContext?.calendar || null,
    },
  };
}

module.exports = {
  attachCalendarContext,
  deriveBillable,
  findEventForReceipt,
  getReceiptCalendarContext,
};

const AMOUNT_FIELDS = ["net", "vat", "gross"];
const LOW_CONFIDENCE_THRESHOLD = 0.75;
const REQUIRED_FIELDS = ["vendor", "date", "net", "vat", "gross", "category"];
const VAT_TOLERANCE = 0.01;

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getDefaultClient() {
  return {
    async extractReceipt(image) {
      const endpoint =
        process.env.STRUCTLY_RECEIPT_EXTRACT_ENDPOINT ||
        process.env.EXPO_PUBLIC_RECEIPT_EXTRACT_ENDPOINT;

      if (!endpoint) {
        throw new Error("Receipt extraction endpoint is not configured.");
      }

      if (typeof fetch !== "function") {
        throw new Error("Receipt extraction requires fetch support.");
      }

      const headers = {
        "Content-Type": "application/json",
      };
      const apiKey = process.env.STRUCTLY_RECEIPT_EXTRACT_API_KEY;

      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }

      const response = await fetch(endpoint, {
        body: JSON.stringify({ image }),
        headers,
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Receipt extraction failed.");
      }

      return response.json();
    },
  };
}

function getFieldValue(rawFields, field) {
  const raw = rawFields?.[field];

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw.value;
  }

  return raw;
}

function getFieldConfidence(rawFields, rawConfidences, field) {
  const raw = rawFields?.[field];

  if (
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    typeof raw.confidence === "number"
  ) {
    return raw.confidence;
  }

  if (typeof rawConfidences?.[field] === "number") {
    return rawConfidences[field];
  }

  return null;
}

function normalizeText(value) {
  if (typeof value !== "string") {
    return value || null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeAmount(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/[^\d,.-]/g, "").replace(/,/g, "");
  const amount = Number.parseFloat(normalized);

  return Number.isFinite(amount) ? amount : null;
}

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDate(value);
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  const isoDateMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (isoDateMatch) {
    return normalized;
  }

  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return formatDate(parsed);
}

function normalizeFields(rawResponse) {
  const rawFields = rawResponse?.fields || rawResponse || {};
  const rawConfidences = rawResponse?.confidences || {};
  const fields = {};
  const confidence = {};

  for (const field of REQUIRED_FIELDS) {
    const rawValue = getFieldValue(rawFields, field);

    if (AMOUNT_FIELDS.includes(field)) {
      fields[field] = normalizeAmount(rawValue);
    } else if (field === "date") {
      fields[field] = normalizeDate(rawValue);
    } else {
      fields[field] = normalizeText(rawValue);
    }

    confidence[field] = getFieldConfidence(rawFields, rawConfidences, field);
  }

  return { confidence, fields };
}

function issue(type, field, message, extra = {}) {
  return {
    field,
    message,
    type,
    ...extra,
  };
}

function validateFields(fields, confidence) {
  const issues = [];

  for (const field of REQUIRED_FIELDS) {
    if (fields[field] === null || fields[field] === undefined) {
      issues.push(issue("missing-field", field, `${field} is missing.`));
      continue;
    }

    if (
      typeof confidence[field] === "number" &&
      confidence[field] < LOW_CONFIDENCE_THRESHOLD
    ) {
      issues.push(
        issue("low-confidence", field, `${field} confidence is low.`, {
          confidence: confidence[field],
          threshold: LOW_CONFIDENCE_THRESHOLD,
        }),
      );
    }
  }

  if (
    typeof fields.net === "number" &&
    typeof fields.vat === "number" &&
    typeof fields.gross === "number"
  ) {
    const expectedGross = fields.net + fields.vat;
    const difference = Math.abs(expectedGross - fields.gross);

    if (difference > VAT_TOLERANCE) {
      issues.push(
        issue("vat-mismatch", "gross", "net plus VAT does not equal gross.", {
          difference: Number(difference.toFixed(2)),
          expectedGross: Number(expectedGross.toFixed(2)),
          tolerance: VAT_TOLERANCE,
        }),
      );
    }
  }

  return {
    issues,
    needsReview: issues.length > 0,
  };
}

async function extractReceipt(image, { client = getDefaultClient() } = {}) {
  const rawResponse = await client.extractReceipt(image);
  const { confidence, fields } = normalizeFields(rawResponse);
  const validation = validateFields(fields, confidence);

  return {
    fields,
    validation,
  };
}

module.exports = {
  LOW_CONFIDENCE_THRESHOLD,
  VAT_TOLERANCE,
  extractReceipt,
};

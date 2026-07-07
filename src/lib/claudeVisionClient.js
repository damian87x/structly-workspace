const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-opus-4-8";
const DEFAULT_MEDIA_TYPE = "image/jpeg";
const MAX_TOKENS = 1024;
const RECEIPT_FIELDS = ["vendor", "date", "net", "vat", "gross", "category"];

function getDefaultFileSystem() {
  return require("expo-file-system");
}

async function defaultReadImageBase64(uri) {
  const FileSystem = getDefaultFileSystem();

  if (typeof FileSystem?.readAsStringAsync !== "function") {
    throw new Error("Receipt image reading requires expo-file-system support.");
  }

  return FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType?.Base64 || "base64",
  });
}

function getFetch(fetchImpl) {
  if (typeof fetchImpl === "function") {
    return fetchImpl;
  }

  if (typeof globalThis.fetch === "function") {
    return globalThis.fetch;
  }

  throw new Error("Receipt extraction requires fetch support.");
}

function requireNonEmptyString(value, message) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(message);
  }

  return value.trim();
}

function normalizeMediaType(mimeType) {
  return typeof mimeType === "string" && mimeType.trim()
    ? mimeType.trim()
    : DEFAULT_MEDIA_TYPE;
}

function createPrompt() {
  return [
    "Extract receipt data from the image.",
    "Return one STRICT JSON object only, with no markdown or prose.",
    "Use this exact shape:",
    '{"fields":{"vendor":string|null,"date":"YYYY-MM-DD"|null,"net":number|null,"vat":number|null,"gross":number|null,"category":string|null},"confidences":{"vendor":number,"date":number,"net":number,"vat":number,"gross":number,"category":number}}',
    "Confidence values must be numbers from 0 to 1 for each field: vendor, date, net, vat, gross, category.",
  ].join(" ");
}

function createRequestBody({ base64Data, mediaType, model }) {
  return {
    max_tokens: MAX_TOKENS,
    messages: [
      {
        content: [
          {
            source: {
              data: base64Data,
              media_type: mediaType,
              type: "base64",
            },
            type: "image",
          },
          {
            text: createPrompt(),
            type: "text",
          },
        ],
        role: "user",
      },
    ],
    model,
  };
}

function getResponseText(message) {
  const content = Array.isArray(message?.content) ? message.content : [];
  return content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function findFirstJsonObject(text) {
  const start = text.indexOf("{");

  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const character = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = inString;
      continue;
    }

    if (character === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

function normalizeModelOutput(parsed) {
  const fields = parsed?.fields && typeof parsed.fields === "object"
    ? parsed.fields
    : parsed;
  const confidences =
    parsed?.confidences && typeof parsed.confidences === "object"
      ? parsed.confidences
      : {};

  return {
    confidences,
    fields: RECEIPT_FIELDS.reduce((normalized, field) => {
      normalized[field] = fields?.[field] ?? null;
      return normalized;
    }, {}),
  };
}

function parseReceiptExtraction(message) {
  const text = getResponseText(message);

  if (!text) {
    throw new Error("Receipt extraction response did not contain text output.");
  }

  const jsonText = findFirstJsonObject(text);

  if (!jsonText) {
    throw new Error("Receipt extraction response did not contain a JSON object.");
  }

  try {
    return normalizeModelOutput(JSON.parse(jsonText));
  } catch (error) {
    throw new Error("Receipt extraction response contained unparseable JSON.");
  }
}

function createClaudeVisionClient({
  apiKey,
  fetchImpl,
  model = DEFAULT_MODEL,
  readImageBase64 = defaultReadImageBase64,
} = {}) {
  return {
    async extractReceipt(image) {
      const key = requireNonEmptyString(
        apiKey,
        "Receipt extraction API key is not configured.",
      );
      const modelName = requireNonEmptyString(
        model,
        "Receipt extraction model is not configured.",
      );
      const uri = requireNonEmptyString(
        image?.uri,
        "Receipt image URI is required for extraction.",
      );

      if (typeof readImageBase64 !== "function") {
        throw new Error("Receipt image base64 reader is not configured.");
      }

      const fetchRequest = getFetch(fetchImpl);
      const base64Data = requireNonEmptyString(
        await readImageBase64(uri),
        "Receipt image data could not be read.",
      );
      const response = await fetchRequest(ANTHROPIC_MESSAGES_URL, {
        body: JSON.stringify(
          createRequestBody({
            base64Data,
            mediaType: normalizeMediaType(image?.mimeType),
            model: modelName,
          }),
        ),
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": ANTHROPIC_VERSION,
          "x-api-key": key,
        },
        method: "POST",
      });

      if (!response?.ok) {
        const status = response?.status ? ` (${response.status})` : "";
        throw new Error(`Receipt extraction API request failed${status}.`);
      }

      let message;

      try {
        message = await response.json();
      } catch (error) {
        throw new Error("Receipt extraction API returned invalid JSON.");
      }

      return parseReceiptExtraction(message);
    },
  };
}

module.exports = {
  ANTHROPIC_MESSAGES_URL,
  ANTHROPIC_VERSION,
  DEFAULT_MODEL,
  createClaudeVisionClient,
};

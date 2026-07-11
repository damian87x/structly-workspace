const {
  createPrompt,
  defaultReadImageBase64,
  normalizeMediaType,
  parseReceiptText,
} = require("./claudeVisionClient");

const OPENROUTER_CHAT_COMPLETIONS_URL =
  "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";
const MAX_TOKENS = 1024;

function getFetch(fetchImpl) {
  if (typeof fetchImpl === "function") {
    return fetchImpl;
  }

  if (typeof globalThis.fetch === "function") {
    return globalThis.fetch.bind(globalThis);
  }

  throw new Error("Receipt extraction requires fetch support.");
}

function requireNonEmptyString(value, message) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(message);
  }

  return value;
}

function createRequestBody({ base64Data, mediaType, model }) {
  return {
    max_tokens: MAX_TOKENS,
    messages: [
      {
        content: [
          { text: createPrompt(), type: "text" },
          {
            image_url: { url: `data:${mediaType};base64,${base64Data}` },
            type: "image_url",
          },
        ],
        role: "user",
      },
    ],
    model,
  };
}

function getResponseText(completion) {
  const content = completion?.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("\n");
  }

  return null;
}

function createOpenRouterVisionClient({
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
      const response = await fetchRequest(OPENROUTER_CHAT_COMPLETIONS_URL, {
        body: JSON.stringify(
          createRequestBody({
            base64Data,
            mediaType: normalizeMediaType(image?.mimeType),
            model: modelName,
          }),
        ),
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!response?.ok) {
        const status = response?.status ? ` (${response.status})` : "";
        throw new Error(`Receipt extraction API request failed${status}.`);
      }

      let completion;

      try {
        completion = await response.json();
      } catch (error) {
        throw new Error("Receipt extraction API returned invalid JSON.");
      }

      return parseReceiptText(getResponseText(completion));
    },
  };
}

module.exports = {
  DEFAULT_MODEL,
  OPENROUTER_CHAT_COMPLETIONS_URL,
  createOpenRouterVisionClient,
};

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const jsonHeaders = { "Content-Type": "application/json" };
const OPENROUTER_CHAT_COMPLETIONS_URL =
  "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";
const DEFAULT_MEDIA_TYPE = "image/jpeg";
const MAX_TOKENS = 1024;
const RECEIPT_FIELDS = ["vendor", "date", "net", "vat", "gross", "category"];

async function getAuthenticatedUserId(request) {
  const authorization = request.headers.get("authorization") || "";
  const endpoint = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return { error: "missing_auth", status: 401, userId: null };
  }

  if (!endpoint || !anonKey) {
    return { error: "auth_not_configured", status: 503, userId: null };
  }

  const response = await fetch(`${endpoint}/auth/v1/user`, {
    headers: {
      Authorization: authorization,
      apikey: anonKey,
    },
  });

  if (!response.ok) {
    return { error: "invalid_auth", status: 401, userId: null };
  }

  const user = await response.json().catch(() => null);

  if (!user?.id) {
    return { error: "invalid_auth", status: 401, userId: null };
  }

  return { error: null, status: 200, userId: String(user.id) };
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
  const normalized = {};

  for (const field of RECEIPT_FIELDS) {
    normalized[field] = fields?.[field] ?? null;
  }

  return { confidences, fields: normalized };
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

function fail(error, status) {
  return new Response(JSON.stringify({ error }), {
    headers: jsonHeaders,
    status,
  });
}

serve(async (request) => {
  if (request.method !== "POST") {
    return fail("method_not_allowed", 405);
  }

  const auth = await getAuthenticatedUserId(request);

  if (auth.error) {
    return fail(auth.error, auth.status);
  }

  const apiKey = Deno.env.get("OPENROUTER_API_KEY");

  if (!apiKey) {
    return fail("extraction_not_configured", 503);
  }

  const body = await request.json().catch(() => null);
  const image = typeof body?.image === "string" ? body.image.trim() : "";

  if (!image) {
    return fail("missing_image", 400);
  }

  const mediaType = typeof body?.mediaType === "string" && body.mediaType
    ? body.mediaType
    : DEFAULT_MEDIA_TYPE;
  const model = Deno.env.get("OPENROUTER_MODEL") || DEFAULT_MODEL;
  const completionResponse = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
    body: JSON.stringify({
      max_tokens: MAX_TOKENS,
      messages: [
        {
          content: [
            { text: createPrompt(), type: "text" },
            {
              image_url: { url: `data:${mediaType};base64,${image}` },
              type: "image_url",
            },
          ],
          role: "user",
        },
      ],
      model,
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!completionResponse.ok) {
    return fail("extraction_upstream_failed", 502);
  }

  const completion = await completionResponse.json().catch(() => null);
  const text = getResponseText(completion);
  const jsonText = text ? findFirstJsonObject(text) : null;

  if (!jsonText) {
    return fail("extraction_unparseable", 502);
  }

  let parsed;

  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return fail("extraction_unparseable", 502);
  }

  return new Response(JSON.stringify(normalizeModelOutput(parsed)), {
    headers: jsonHeaders,
    status: 200,
  });
});

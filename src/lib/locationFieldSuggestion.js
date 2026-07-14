/**
 * Derive vendor/category suggestions from receipt location.placeName.
 * Pure: no Date, no random, no locale-sensitive casing. Derive-on-read only —
 * never store the result on the row.
 */

const CATEGORY_KEYWORDS = [
  // Meals (first — declared ambiguity order)
  ["cafe", "Meals"],
  ["coffee", "Meals"],
  ["restaurant", "Meals"],
  ["diner", "Meals"],
  ["bistro", "Meals"],
  ["kitchen", "Meals"],
  ["pub", "Meals"],
  ["bar", "Meals"],
  // Travel
  ["hotel", "Travel"],
  ["inn", "Travel"],
  ["lodge", "Travel"],
  ["airport", "Travel"],
  ["station", "Travel"],
  ["fuel", "Travel"],
  ["petrol", "Travel"],
  ["garage", "Travel"],
  // Office
  ["office", "Office"],
  ["stationery", "Office"],
  ["supplies", "Office"],
  ["print", "Office"],
  ["copy", "Office"],
];

const BOUNDARY = "[\\p{L}\\p{N}]";

function fold(text) {
  return String(text || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/\p{Cf}/gu, "")
    .toLowerCase();
}

function matchesKeyword(folded, keyword) {
  return new RegExp(`(?<!${BOUNDARY})${keyword}(?!${BOUNDARY})`, "u").test(
    folded,
  );
}

function isEmptyField(value) {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === "string") {
    return value.trim() === "";
  }

  return false;
}

function matchCategory(placeName) {
  const folded = fold(placeName);

  for (const [keyword, category] of CATEGORY_KEYWORDS) {
    if (matchesKeyword(folded, keyword)) {
      return category;
    }
  }

  return null;
}

/**
 * @param {object} row review row with fields + context.location
 * @returns {{ vendor?: string, category?: string } | null}
 */
function deriveLocationFieldSuggestion(row) {
  const location = row?.context?.location;

  if (!location || typeof location !== "object") {
    return null;
  }

  const placeNameRaw = location.placeName;
  if (placeNameRaw === null || placeNameRaw === undefined) {
    return null;
  }

  const placeName =
    typeof placeNameRaw === "string" ? placeNameRaw.trim() : String(placeNameRaw).trim();

  if (!placeName) {
    return null;
  }

  const fields = row?.fields || {};
  const suggestion = {};

  if (isEmptyField(fields.vendor)) {
    suggestion.vendor = placeName;
  }

  if (isEmptyField(fields.category)) {
    const category = matchCategory(placeName);
    if (category) {
      suggestion.category = category;
    }
  }

  if (!Object.keys(suggestion).length) {
    return null;
  }

  return suggestion;
}

module.exports = {
  deriveLocationFieldSuggestion,
};

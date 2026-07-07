const AMOUNT_FIELDS = ["net", "vat", "gross"];
const REQUIRED_FIELDS = ["vendor", "date", "net", "vat", "gross", "category"];
const VAT_TOLERANCE = 0.01;

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

function normalizeFields(fields) {
  const normalized = { ...fields };

  for (const field of REQUIRED_FIELDS) {
    if (AMOUNT_FIELDS.includes(field)) {
      normalized[field] = normalizeAmount(normalized[field]);
    } else {
      normalized[field] = normalizeText(normalized[field]);
    }
  }

  return normalized;
}

function issue(type, field, message, extra = {}) {
  return {
    field,
    message,
    type,
    ...extra,
  };
}

function validateFields(fields) {
  const issues = [];

  for (const field of REQUIRED_FIELDS) {
    if (fields[field] === null || fields[field] === undefined) {
      issues.push(issue("missing-field", field, `${field} is missing.`));
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

function assertValidIndex(rows, index) {
  if (!Array.isArray(rows)) {
    throw new TypeError("Review queue rows must be an array.");
  }

  if (!Number.isInteger(index) || index < 0 || index >= rows.length) {
    throw new RangeError(`Review queue index ${index} is out of range.`);
  }
}

function applyCorrection(rows, index, patch) {
  assertValidIndex(rows, index);

  return rows.map((row, rowIndex) => {
    if (rowIndex !== index) {
      return row;
    }

    const fields = normalizeFields({
      ...(row?.fields || {}),
      ...(patch || {}),
    });

    return {
      ...row,
      fields,
      validation: validateFields(fields),
    };
  });
}

module.exports = {
  applyCorrection,
};

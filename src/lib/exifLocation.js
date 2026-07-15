/**
 * Pure EXIF GPS parser for imported (library) receipt photos.
 * Total: never throws. Returns coords-only location or null.
 *
 * Platform rule: abs() first, then apply hemisphere ref.
 * Android (expo-image-picker) may supply a signed decimal AND a ref;
 * iOS supplies magnitude + ref. abs-then-ref is correct for both.
 */

function toMagnitude(v) {
  if (typeof v === "number") {
    return Number.isFinite(v) ? Math.abs(v) : null;
  }
  if (
    Array.isArray(v) &&
    v.length === 3 &&
    v.every((n) => typeof n === "number" && Number.isFinite(n))
  ) {
    const [d, m, s] = v;
    if (d < 0 || m < 0 || m >= 60 || s < 0 || s >= 60) {
      return null;
    }
    return Math.abs(d) + m / 60 + s / 3600;
  }
  return null;
}

function signedLat(v, ref) {
  const mag = toMagnitude(v);
  if (mag === null) {
    return null;
  }
  const r = typeof ref === "string" ? ref.trim().toUpperCase() : null;
  if (r === "N") {
    return mag;
  }
  if (r === "S") {
    return -mag;
  }
  return null;
}

function signedLng(v, ref) {
  const mag = toMagnitude(v);
  if (mag === null) {
    return null;
  }
  const r = typeof ref === "string" ? ref.trim().toUpperCase() : null;
  if (r === "E") {
    return mag;
  }
  if (r === "W") {
    return -mag;
  }
  return null;
}

/**
 * @param {unknown} exif
 * @returns {{ latitude: number, longitude: number, placeName: null, city: null, region: null, country: null } | null}
 */
function parseExifLocation(exif) {
  try {
    if (!exif || typeof exif !== "object" || Array.isArray(exif)) {
      return null;
    }

    const latitude = signedLat(exif.GPSLatitude, exif.GPSLatitudeRef);
    const longitude = signedLng(exif.GPSLongitude, exif.GPSLongitudeRef);

    if (latitude === null || longitude === null) {
      return null;
    }

    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return null;
    }

    // Null Island — broken-camera sentinel, not a real pin.
    if (latitude === 0 && longitude === 0) {
      return null;
    }

    return {
      latitude,
      longitude,
      placeName: null,
      city: null,
      region: null,
      country: null,
    };
  } catch {
    return null;
  }
}

module.exports = {
  parseExifLocation,
};

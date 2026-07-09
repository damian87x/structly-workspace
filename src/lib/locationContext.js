function getDefaultLocation() {
  return require("expo-location");
}

function normalizeText(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function hasLocationPermission(permission) {
  return permission?.granted === true || permission?.status === "granted";
}

function getCoordinate(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getCoordinates(coords) {
  const latitude = getCoordinate(coords?.latitude);
  const longitude = getCoordinate(coords?.longitude);

  if (latitude === null || longitude === null) {
    return null;
  }

  return { latitude, longitude };
}

function getPlaceName(address) {
  return (
    normalizeText(address?.name) ||
    normalizeText(address?.street) ||
    normalizeText(address?.district) ||
    null
  );
}

function normalizeLocation(latitude, longitude, addresses) {
  const address = Array.isArray(addresses) ? addresses[0] : null;

  return {
    latitude,
    longitude,
    placeName: getPlaceName(address),
    city: normalizeText(address?.city),
    region: normalizeText(address?.region),
    country: normalizeText(address?.country),
  };
}

function hasLocationProvider(location) {
  return (
    location &&
    typeof location.requestForegroundPermissionsAsync === "function" &&
    typeof location.getCurrentPositionAsync === "function" &&
    typeof location.reverseGeocodeAsync === "function"
  );
}

async function getReverseGeocodedLocation(provider, latitude, longitude) {
  let addresses = [];

  try {
    addresses = await provider.reverseGeocodeAsync({
      latitude,
      longitude,
    });
  } catch (error) {
    addresses = [];
  }

  return normalizeLocation(latitude, longitude, addresses);
}

async function getReceiptLocation({ location, coords } = {}) {
  try {
    const capturedCoords = getCoordinates(coords);
    const provider = location || getDefaultLocation();

    if (capturedCoords) {
      if (!provider || typeof provider.reverseGeocodeAsync !== "function") {
        return normalizeLocation(
          capturedCoords.latitude,
          capturedCoords.longitude,
          [],
        );
      }

      return getReverseGeocodedLocation(
        provider,
        capturedCoords.latitude,
        capturedCoords.longitude,
      );
    }

    if (!hasLocationProvider(provider)) {
      return null;
    }

    const permission = await provider.requestForegroundPermissionsAsync();

    if (!hasLocationPermission(permission)) {
      return null;
    }

    const position = await provider.getCurrentPositionAsync({});
    const latitude = getCoordinate(position?.coords?.latitude);
    const longitude = getCoordinate(position?.coords?.longitude);

    if (latitude === null || longitude === null) {
      return null;
    }

    return getReverseGeocodedLocation(provider, latitude, longitude);
  } catch (error) {
    return null;
  }
}

function attachLocation(receipt, locationContext) {
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
      location: locationContext || null,
    },
  };
}

module.exports = {
  attachLocation,
  getReceiptLocation,
};

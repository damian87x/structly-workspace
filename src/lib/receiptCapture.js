const PERMISSION_DENIED_ERROR = "Receipt photo permission was denied.";

function getDefaultImagePicker() {
  return require("expo-image-picker");
}

function getDefaultLocation() {
  return require("expo-location");
}

function hasPermission(permission) {
  return permission?.granted === true || permission?.status === "granted";
}

function getImageOptions(imagePicker) {
  return {
    allowsEditing: false,
    allowsMultipleSelection: false,
    mediaTypes: imagePicker.MediaTypeOptions?.Images || "Images",
    quality: 0.9,
  };
}

function getCoordinate(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeCapturedLocation(position) {
  const latitude = getCoordinate(position?.coords?.latitude);
  const longitude = getCoordinate(position?.coords?.longitude);

  if (latitude === null || longitude === null) {
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
}

function hasLocationCaptureProvider(location) {
  return (
    location &&
    typeof location.requestForegroundPermissionsAsync === "function" &&
    typeof location.getCurrentPositionAsync === "function"
  );
}

async function getCapturedLocation(location) {
  try {
    if (!hasLocationCaptureProvider(location)) {
      return null;
    }

    const permission = await location.requestForegroundPermissionsAsync();

    if (!hasPermission(permission)) {
      return null;
    }

    return normalizeCapturedLocation(
      await location.getCurrentPositionAsync({}),
    );
  } catch (error) {
    return null;
  }
}

function normalizeReceipt(asset, source, capturedAt, context) {
  if (!asset?.uri) {
    return null;
  }

  const receipt = {
    capturedAt,
    fileName: asset.fileName || null,
    height: asset.height || null,
    mimeType: asset.mimeType || asset.type || null,
    source,
    uri: asset.uri,
    width: asset.width || null,
  };

  if (context && Object.keys(context).length > 0) {
    receipt.context = context;
  }

  return receipt;
}

function normalizePickerResult(
  result,
  source,
  getCapturedAt = () => null,
  context,
) {
  if (result?.canceled || result?.cancelled) {
    return { error: null, receipt: null, status: "cancelled" };
  }

  const asset = result?.assets?.[0];
  const receipt = normalizeReceipt(
    asset,
    source,
    asset?.uri ? getCapturedAt(asset) : null,
    context,
  );

  if (!receipt) {
    return {
      error: new Error("No receipt image was selected."),
      receipt: null,
      status: "empty",
    };
  }

  return { error: null, receipt, status: "selected" };
}

async function takeReceiptPhoto({
  imagePicker,
  location,
  now = () => new Date().toISOString(),
  useLocation = true,
} = {}) {
  const useDefaultProviders = !imagePicker && location === undefined;
  const picker = imagePicker || getDefaultImagePicker();
  const locationProvider = location === undefined
    ? useDefaultProviders
      ? getDefaultLocation()
      : null
    : location;
  const permission = await picker.requestCameraPermissionsAsync();

  if (!hasPermission(permission)) {
    return {
      error: new Error(PERMISSION_DENIED_ERROR),
      receipt: null,
      status: "permission-denied",
    };
  }

  const result = await picker.launchCameraAsync(getImageOptions(picker));
  // Resolve picker first so cancelled / empty results never request location.
  const normalized = normalizePickerResult(result, "camera", () => now());

  if (normalized.status !== "selected") {
    return normalized;
  }

  if (useLocation) {
    const capturedLocation = await getCapturedLocation(locationProvider);

    if (capturedLocation) {
      normalized.receipt.context = { location: capturedLocation };
    }
  }

  return normalized;
}

async function pickReceiptFromLibrary({ imagePicker = getDefaultImagePicker() } = {}) {
  const permission = await imagePicker.requestMediaLibraryPermissionsAsync(false);

  if (!hasPermission(permission)) {
    return {
      error: new Error(PERMISSION_DENIED_ERROR),
      receipt: null,
      status: "permission-denied",
    };
  }

  const result = await imagePicker.launchImageLibraryAsync(getImageOptions(imagePicker));
  return normalizePickerResult(
    result,
    "library",
    (asset) => asset.creationTime ?? null,
  );
}

module.exports = {
  PERMISSION_DENIED_ERROR,
  pickReceiptFromLibrary,
  takeReceiptPhoto,
};

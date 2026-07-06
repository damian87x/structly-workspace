const PERMISSION_DENIED_ERROR = "Receipt photo permission was denied.";

function getDefaultImagePicker() {
  return require("expo-image-picker");
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

function normalizeReceipt(asset, source) {
  if (!asset?.uri) {
    return null;
  }

  return {
    fileName: asset.fileName || null,
    height: asset.height || null,
    mimeType: asset.mimeType || asset.type || null,
    source,
    uri: asset.uri,
    width: asset.width || null,
  };
}

function normalizePickerResult(result, source) {
  if (result?.canceled || result?.cancelled) {
    return { error: null, receipt: null, status: "cancelled" };
  }

  const receipt = normalizeReceipt(result?.assets?.[0], source);

  if (!receipt) {
    return {
      error: new Error("No receipt image was selected."),
      receipt: null,
      status: "empty",
    };
  }

  return { error: null, receipt, status: "selected" };
}

async function takeReceiptPhoto({ imagePicker = getDefaultImagePicker() } = {}) {
  const permission = await imagePicker.requestCameraPermissionsAsync();

  if (!hasPermission(permission)) {
    return {
      error: new Error(PERMISSION_DENIED_ERROR),
      receipt: null,
      status: "permission-denied",
    };
  }

  const result = await imagePicker.launchCameraAsync(getImageOptions(imagePicker));
  return normalizePickerResult(result, "camera");
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
  return normalizePickerResult(result, "library");
}

module.exports = {
  PERMISSION_DENIED_ERROR,
  pickReceiptFromLibrary,
  takeReceiptPhoto,
};

const DEFAULT_EXPORT_DIRECTORY = "file:///tmp/structly-exports/";
const DEFAULT_FILENAME = "receipts.csv";

function getDefaultFileSystem() {
  return require("expo-file-system");
}

function getDefaultSharing() {
  return require("expo-sharing");
}

function normalizeDirectory(directory) {
  if (typeof directory !== "string" || !directory.trim()) {
    return DEFAULT_EXPORT_DIRECTORY;
  }

  const trimmed = directory.trim();

  return /\/$/.test(trimmed) ? trimmed : `${trimmed}/`;
}

function getDefaultExportDirectory(fileSystem) {
  return normalizeDirectory(
    fileSystem?.cacheDirectory || fileSystem?.documentDirectory,
  );
}

function createDefaultWriteFile(fileSystem) {
  return async function writeCsvFile(uri, contents) {
    await fileSystem.writeAsStringAsync(uri, contents, {
      encoding: fileSystem.EncodingType?.UTF8 || "utf8",
    });
  };
}

function createDefaultShare() {
  const Sharing = getDefaultSharing();

  return async function shareCsvFile(uri) {
    await Sharing.shareAsync(uri, {
      mimeType: "text/csv",
      UTI: "public.comma-separated-values-text",
    });
  };
}

function getCleanFilenameSegment(filename) {
  const rawFilename = typeof filename === "string" ? filename : "";
  const segments = rawFilename
    .split(/[\\/]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== "." && segment !== "..");
  const finalSegment = segments.length > 0 ? segments[segments.length - 1] : "";

  return finalSegment
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[\\/]+/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+/, "")
    .trim();
}

function sanitizeFilename(filename) {
  const baseName = getCleanFilenameSegment(filename) || DEFAULT_FILENAME;

  if (/\.csv$/i.test(baseName)) {
    return baseName.replace(/\.csv$/i, ".csv");
  }

  return `${baseName}.csv`;
}

function assertExportableCsv(csv) {
  if (typeof csv !== "string" || !csv.trim()) {
    throw new Error("CSV content is required to export a sheet.");
  }
}

async function exportSheet({ csv, filename } = {}, dependencies = {}) {
  assertExportableCsv(csv);

  const hasInjectedWriteFile = typeof dependencies.writeFile === "function";
  const hasInjectedShare = typeof dependencies.share === "function";
  const fileSystem =
    hasInjectedWriteFile && hasInjectedShare ? null : getDefaultFileSystem();
  const writeFile = hasInjectedWriteFile
    ? dependencies.writeFile
    : createDefaultWriteFile(fileSystem);
  const share = hasInjectedShare ? dependencies.share : createDefaultShare();
  const directory = dependencies.directory
    ? normalizeDirectory(dependencies.directory)
    : getDefaultExportDirectory(fileSystem);
  const uri = `${directory}${sanitizeFilename(filename)}`;

  await writeFile(uri, csv);
  await share(uri);

  return { uri, shared: true };
}

module.exports = {
  exportSheet,
};

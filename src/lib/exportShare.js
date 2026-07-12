const DEFAULT_EXPORT_DIRECTORY = "file:///tmp/structly-exports/";
const DEFAULT_FILENAME = "receipts.csv";
const CSV_EXTENSION = ".csv";
const XLSX_EXTENSION = ".xlsx";
const CSV_MIME_TYPE = "text/csv";
const XLSX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const CSV_UTI = "public.comma-separated-values-text";
const ENCODING_UTF8 = "utf8";
const ENCODING_BASE64 = "base64";

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
  return async function writeFile(uri, contents, options = {}) {
    const encoding =
      options.encoding ||
      fileSystem.EncodingType?.UTF8 ||
      ENCODING_UTF8;

    await fileSystem.writeAsStringAsync(uri, contents, {
      encoding,
    });
  };
}

function createDefaultShare() {
  const Sharing = getDefaultSharing();

  return async function share(uri, options = {}) {
    const shareOptions = {
      mimeType: options.mimeType || CSV_MIME_TYPE,
    };

    if (options.uti) {
      shareOptions.UTI = options.uti;
    }

    await Sharing.shareAsync(uri, shareOptions);
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

function sanitizeFilename(filename, extension = CSV_EXTENSION) {
  const normalizedExtension =
    typeof extension === "string" && extension.startsWith(".")
      ? extension.toLowerCase()
      : `.${String(extension || CSV_EXTENSION).replace(/^\./, "").toLowerCase() || "csv"}`;
  const defaultName =
    normalizedExtension === XLSX_EXTENSION ? "receipts.xlsx" : DEFAULT_FILENAME;
  const baseName = getCleanFilenameSegment(filename) || defaultName;
  const escapedExtension = normalizedExtension.replace(/\./g, "\\.");
  const extensionPattern = new RegExp(`${escapedExtension}$`, "i");

  if (extensionPattern.test(baseName)) {
    return baseName.replace(extensionPattern, normalizedExtension);
  }

  return `${baseName}${normalizedExtension}`;
}

function assertExportableCsv(csv) {
  if (typeof csv !== "string" || !csv.trim()) {
    throw new Error("CSV content is required to export a sheet.");
  }
}

function assertExportableBase64(base64) {
  if (typeof base64 !== "string" || !base64.trim()) {
    throw new Error("Workbook content is required to export a sheet.");
  }
}

async function exportFile(
  { content, encoding, mimeType, uti, filename, extension } = {},
  dependencies = {},
) {
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
  const uri = `${directory}${sanitizeFilename(filename, extension)}`;

  await writeFile(uri, content, { encoding });
  await share(uri, { mimeType, uti });

  return { uri, shared: true };
}

async function exportSheet({ csv, filename } = {}, dependencies = {}) {
  assertExportableCsv(csv);

  return exportFile(
    {
      content: csv,
      encoding: ENCODING_UTF8,
      extension: CSV_EXTENSION,
      filename,
      mimeType: CSV_MIME_TYPE,
      uti: CSV_UTI,
    },
    dependencies,
  );
}

async function exportWorkbook({ base64, filename } = {}, dependencies = {}) {
  assertExportableBase64(base64);

  return exportFile(
    {
      content: base64,
      encoding: ENCODING_BASE64,
      extension: XLSX_EXTENSION,
      filename,
      mimeType: XLSX_MIME_TYPE,
    },
    dependencies,
  );
}

module.exports = {
  exportSheet,
  exportWorkbook,
};

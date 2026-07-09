const { buildReceiptSheet } = require("./buildSpreadsheet");
const { extractReceipt } = require("./extractReceipt");

function normalizeError(error) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
    };
  }

  return {
    message: String(error),
    name: "Error",
  };
}

async function processReceipts(images, { vision } = {}) {
  const imageList = Array.isArray(images) ? images : [];
  const receipts = [];
  const failures = [];

  for (const [index, image] of imageList.entries()) {
    try {
      const receipt = await extractReceipt(image, { client: vision });
      receipts.push({
        ...receipt,
        sourceUri: receipt.sourceUri || image?.uri || null,
      });
    } catch (error) {
      failures.push({
        error: normalizeError(error),
        image,
        index,
      });
    }
  }

  return {
    failures,
    receipts,
    sheet: buildReceiptSheet(receipts),
  };
}

module.exports = {
  processReceipts,
};

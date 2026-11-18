const attachmentTypes = new Map([
  [".pdf", "application/pdf"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
]);

export function getAttachmentMimeType(extension: string) {
  return attachmentTypes.get(extension);
}

export function hasExpectedFileSignature(bytes: Buffer, extension: string) {
  if (extension === ".pdf") return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  if (extension === ".png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (extension === ".jpg" || extension === ".jpeg") return bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
  if (extension === ".webp") {
    return bytes.subarray(0, 4).toString("ascii") === "RIFF"
      && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  }
  if (extension === ".docx" || extension === ".pptx") {
    return bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]));
  }
  return false;
}

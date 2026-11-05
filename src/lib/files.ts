export type AllowedFile = "jpeg" | "png" | "pdf";

export function sniffFile(bytes: Uint8Array): AllowedFile | "rejected" {
  if (bytes.length < 12) return "rejected";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  const head = Buffer.from(bytes.subarray(0, 5)).toString("latin1");
  if (head === "%PDF-") return "pdf";
  return "rejected";
}

export function assertUpload(bytes: Uint8Array, maxBytes = 5_000_000) {
  if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) {
    throw new Error("err_file_size");
  }
  const kind = sniffFile(bytes);
  if (kind === "rejected") throw new Error("err_file_type");
  const sample = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 4096))).toString("latin1").toLowerCase();
  if (sample.includes("<script") || sample.includes("<?php") || bytes[0] === 0x4d && bytes[1] === 0x5a) {
    throw new Error("err_file_type");
  }
  return kind;
}

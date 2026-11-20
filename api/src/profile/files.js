// Uploaded files are untrusted (profile spec): their type is decided from their
// first bytes, never from the name or the Content-Type the sender chose.

const SIGNATURES = [
  { type: "image/jpeg", test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/png", test: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: "image/webp", test: (b) => b.length > 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP" },
  { type: "application/pdf", test: (b) => b.length > 5 && b.toString("latin1", 0, 5) === "%PDF-" },
];

// → "image/png" | "image/jpeg" | "image/webp" | "application/pdf" | null
export function detectFileType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  return SIGNATURES.find((s) => s.test(buffer))?.type ?? null;
}

// A display name for the résumé: no path, no control characters, bounded length,
// always ending in .pdf.
export function safeFilename(raw) {
  let name = "";
  try {
    name = decodeURIComponent(String(raw ?? ""));
  } catch {
    name = "";
  }
  name = name.split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f"]/g, "").trim().slice(0, 120);
  if (!name) name = "resume";
  return /\.pdf$/i.test(name) ? name : `${name}.pdf`;
}

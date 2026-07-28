import { ALLOWED_MIME_TYPES } from './constants';

// Magic-byte detection for the only four content types intake accepts.
//
// Why this exists rather than a library call: `file-type` 16.x hangs forever on
// a crafted ASF header (GHSA-5v7r-6r5c-r473) — a 118-byte payload is enough —
// and the hang is *synchronous*. That detail is what makes it dangerous: the
// event loop stops, so a `Promise.race` timeout can never fire to rescue it, and
// with single-threaded Node one upload takes the whole API down for every
// tenant. The MIME allowlist gave no protection either, because the parse that
// hangs runs in order to *determine* the type, strictly before any allowlist
// check on its result.
//
// Detecting these four signatures ourselves is not a downgrade: for PNG, JPEG,
// PDF and WEBP a library does the same leading-byte comparison. It simply means
// no attacker-chosen container parser is ever reached.

const startsWith = (buf: Buffer, bytes: readonly number[], offset = 0): boolean =>
  buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);

interface Signature {
  readonly mime: string;
  readonly test: (buf: Buffer) => boolean;
}

const SIGNATURES: readonly Signature[] = [
  // \x89 P N G \r \n \x1a \n
  { mime: 'image/png', test: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  // SOI + the first marker byte; covers JFIF, Exif and raw JPEG alike.
  { mime: 'image/jpeg', test: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  // "%PDF-"
  { mime: 'application/pdf', test: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d]) },
  // "RIFF" ???? "WEBP" — bytes 4..7 are the little-endian chunk size, so the
  // form type at offset 8 is what actually identifies a WEBP.
  {
    mime: 'image/webp',
    test: (b) => startsWith(b, [0x52, 0x49, 0x46, 0x46])
      && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8),
  },
];

// Every signature must map to a type the platform actually accepts; kept as an
// exported list so a parity spec can assert the two never drift apart.
export const MAGIC_SNIFFABLE_MIME_TYPES: readonly string[] = SIGNATURES.map((s) => s.mime);

// Returns the detected MIME type, or null when the buffer does not open with one
// of the accepted signatures. Null means "reject" — never "unknown, allow".
export function sniffAllowedMime(buffer: Buffer): string | null {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  for (const sig of SIGNATURES) {
    if (sig.test(buffer)) return sig.mime;
  }
  return null;
}

// Guard against the two lists drifting: adding a type to ALLOWED_MIME_TYPES
// without a signature here would silently reject every upload of that type.
export const missingSignatures = (): string[] =>
  ALLOWED_MIME_TYPES.filter((m) => !MAGIC_SNIFFABLE_MIME_TYPES.includes(m));

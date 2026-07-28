import { ALLOWED_MIME_TYPES } from './constants';
import { missingSignatures, sniffAllowedMime } from './magic-bytes';

// Helper: a buffer starting with `bytes`, padded so length is never the reason
// a check fails.
const withPrefix = (bytes: number[], pad = 64): Buffer =>
  Buffer.concat([Buffer.from(bytes), Buffer.alloc(pad)]);

const PNG = withPrefix([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = withPrefix([0xff, 0xd8, 0xff, 0xe0]);
const PDF = withPrefix([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]), // chunk size — deliberately arbitrary
  Buffer.from('WEBP', 'ascii'),
  Buffer.alloc(64),
]);

describe('sniffAllowedMime', () => {
  it('detects each accepted type from its signature', () => {
    expect(sniffAllowedMime(PNG)).toBe('image/png');
    expect(sniffAllowedMime(JPEG)).toBe('image/jpeg');
    expect(sniffAllowedMime(PDF)).toBe('application/pdf');
    expect(sniffAllowedMime(WEBP)).toBe('image/webp');
  });

  it('covers every type the platform accepts', () => {
    // A type in ALLOWED_MIME_TYPES with no signature would reject all its uploads.
    expect(missingSignatures()).toEqual([]);
  });

  it('rejects a RIFF container that is not WEBP', () => {
    const wav = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.from([0x24, 0x00, 0x00, 0x00]),
      Buffer.from('WAVE', 'ascii'),
      Buffer.alloc(64),
    ]);
    expect(sniffAllowedMime(wav)).toBeNull();
  });

  it('rejects empty, short and non-buffer input rather than defaulting to allow', () => {
    expect(sniffAllowedMime(Buffer.alloc(0))).toBeNull();
    expect(sniffAllowedMime(Buffer.from([0x89, 0x50]))).toBeNull(); // truncated PNG
    expect(sniffAllowedMime(undefined as unknown as Buffer)).toBeNull();
  });

  it('does not treat a client-renamed text file as an image', () => {
    expect(sniffAllowedMime(Buffer.from('<?php echo 1; ?>', 'utf8'))).toBeNull();
  });

  // Regression for the DoS this module exists to prevent. `file-type` 16.x hangs
  // the event loop *synchronously* on this payload (GHSA-5v7r-6r5c-r473): a
  // 1s heartbeat timer never fires, so no timeout can rescue it. Our signature
  // table must reject it outright, and return promptly.
  it('rejects the crafted ASF header that hangs file-type, without hanging', () => {
    const asf = Buffer.concat([
      // ASF_Header_Object GUID
      Buffer.from([
        0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11,
        0xa6, 0xd9, 0x00, 0xaa, 0x00, 0x62, 0xce, 0x6c,
      ]),
      Buffer.from([0x1e, 0, 0, 0, 0, 0, 0, 0]), // header object size
      Buffer.from([0x05, 0, 0, 0]), // claims 5 sub-objects
      Buffer.from([0x01, 0x02]), // reserved
      Buffer.alloc(16, 0x00), // sub-header GUID
      Buffer.alloc(8, 0x00), // sub-header size of ZERO — the reader never advances
      Buffer.alloc(64),
    ]);

    const started = Date.now();
    expect(sniffAllowedMime(asf)).toBeNull();
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('ALLOWED_MIME_TYPES', () => {
  it('still lists exactly the four intake types the copy promises', () => {
    // The user-facing error names PNG, JPEG, WEBP and PDF; keep them in step.
    expect([...ALLOWED_MIME_TYPES].sort()).toEqual(
      ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
    );
  });
});

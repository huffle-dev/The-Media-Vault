// Is this file's start the start of a picture? A download that "succeeds" with an error page or an
// empty body is saved as if it were a cover, and a tile then shows nothing for it forever; this lets
// the download notice and refuse it. Pure — test/mobileImageBytes.test.js runs it.
export function looksLikeImage(bytes) {
  if (!bytes || bytes.length < 12) return false;
  const b = bytes;
  if (b[0] === 0xff && b[1] === 0xd8) return true;                                              // JPEG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true;           // PNG
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return true;                            // GIF
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
    && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return true;        // WEBP
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return true;           // AVIF / HEIC ("ftyp")
  if (b[0] === 0x42 && b[1] === 0x4d) return true;                                              // BMP
  if (b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00) return true;           // ICO
  return false;
}

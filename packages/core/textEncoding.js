// Pure, side-effect-free byte-decoding helper. Split out from main.js so
// this has direct unit test coverage without needing Electron context.
// See test/textEncoding.test.js.

// Windows-1252's 0x80-0x9F range holds real printable characters (smart
// quotes, en/em-dash, ellipsis, €) where Latin-1/ISO-8859-1 has only
// unprintable C1 control codes — Excel's default Windows CSV export uses
// this encoding, not UTF-8, so those characters (and accented letters like
// ō/ú) otherwise read back as mojibake.
const CP1252_HIGH_RANGE = {
  0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…",
  0x86: "†", 0x87: "‡", 0x88: "ˆ", 0x89: "‰", 0x8A: "Š",
  0x8B: "‹", 0x8C: "Œ", 0x8E: "Ž", 0x91: "‘", 0x92: "’",
  0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—",
  0x98: "˜", 0x99: "™", 0x9A: "š", 0x9B: "›", 0x9C: "œ",
  0x9E: "ž", 0x9F: "Ÿ",
};

function decodeCp1252(buffer) {
  let out = "";
  for (const byte of buffer) out += CP1252_HIGH_RANGE[byte] || String.fromCharCode(byte);
  return out;
}

module.exports = { decodeCp1252, CP1252_HIGH_RANGE };

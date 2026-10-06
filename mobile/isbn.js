// Turning what a barcode scanner reads into an ISBN to search for. Pure —
// test/mobileIsbn.test.js runs it without Expo.

const digitsOnly = (text) => String(text || "").replace(/[\s-]/g, "");

export function isValidIsbn13(code) {
  if (!/^\d{13}$/.test(code)) return false;
  const sum = [...code].reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
  return sum % 10 === 0;
}

export function isValidIsbn10(code) {
  if (!/^\d{9}[\dXx]$/.test(code)) return false;
  const sum = [...code].reduce((acc, ch, i) => acc + (ch.toUpperCase() === "X" ? 10 : Number(ch)) * (10 - i), 0);
  return sum % 11 === 0;
}

// The ISBN a scan means, or null when it is not a book barcode (a price add-on
// code, a UPC on a DVD or game, a damaged read). Books carry an EAN-13 starting
// 978 or 979; older ones an ISBN-10.
export function isbnFromBarcode(data) {
  const code = digitsOnly(data);
  if (/^97[89]\d{10}$/.test(code) && isValidIsbn13(code)) return code;
  if (isValidIsbn10(code)) return code.toUpperCase();
  return null;
}

// The Open Library search that finds one book by ISBN.
export const isbnQuery = (isbn) => `isbn:${isbn}`;

// Any retail barcode (UPC-A 12 digits, EAN-13, EAN-8): digits with a correct
// GTIN check digit. This is what a CD or vinyl case carries.
export function gtinFromBarcode(data) {
  const code = digitsOnly(data);
  if (!/^(\d{8}|\d{12}|\d{13})$/.test(code)) return null;
  const digits = [...code].map(Number);
  const check = digits.pop();
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check ? code : null;
}

// The Discogs search that finds a release by barcode (Add -> Music understands it).
export const barcodeQuery = (code) => `barcode:${code}`;
export const barcodeFromQuery = (query) => (/^barcode:(\d{8,13})$/.exec(String(query || "").trim()) || [])[1] || null;

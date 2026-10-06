import { describe, it, expect } from "vitest";
import { isbnFromBarcode, isValidIsbn13, isValidIsbn10, isbnQuery } from "../mobile/isbn.js";

describe("ISBN checks", () => {
  it("accepts real ISBN-13s and rejects a wrong check digit", () => {
    expect(isValidIsbn13("9780306406157")).toBe(true);
    expect(isValidIsbn13("9780306406158")).toBe(false);
    expect(isValidIsbn13("978030640615")).toBe(false);
  });
  it("accepts ISBN-10s including a trailing X", () => {
    expect(isValidIsbn10("0306406152")).toBe(true);
    expect(isValidIsbn10("080442957X")).toBe(true);
    expect(isValidIsbn10("0306406153")).toBe(false);
  });
});

describe("isbnFromBarcode", () => {
  it("returns the ISBN for a book barcode, ignoring spaces and dashes", () => {
    expect(isbnFromBarcode("9780306406157")).toBe("9780306406157");
    expect(isbnFromBarcode("978-0-306-40615-7")).toBe("9780306406157");
    expect(isbnFromBarcode("080442957x")).toBe("080442957X");
  });
  it("returns null for anything that is not a book", () => {
    expect(isbnFromBarcode("012345678905")).toBeNull(); // a UPC-A
    expect(isbnFromBarcode("5012345678900")).toBeNull(); // an EAN-13 that is not 978/979
    expect(isbnFromBarcode("9780306406158")).toBeNull(); // bad check digit
    expect(isbnFromBarcode("")).toBeNull();
    expect(isbnFromBarcode(null)).toBeNull();
  });
  it("builds the Open Library query", () => expect(isbnQuery("9780306406157")).toBe("isbn:9780306406157"));
});

describe("gtinFromBarcode / barcode queries (CDs and records)", async () => {
  const { gtinFromBarcode, barcodeQuery, barcodeFromQuery } = await import("../mobile/isbn.js");
  it("accepts UPC-A, EAN-13 and EAN-8 with a correct check digit", () => {
    expect(gtinFromBarcode("036000291452")).toBe("036000291452"); // UPC-A
    expect(gtinFromBarcode("5012345678900")).toBe("5012345678900"); // EAN-13
    expect(gtinFromBarcode("96385074")).toBe("96385074"); // EAN-8
    expect(gtinFromBarcode("0 36000 29145 2")).toBe("036000291452");
  });
  it("rejects a wrong check digit, odd lengths and junk", () => {
    expect(gtinFromBarcode("036000291453")).toBeNull();
    expect(gtinFromBarcode("12345")).toBeNull();
    expect(gtinFromBarcode("abc")).toBeNull();
    expect(gtinFromBarcode(null)).toBeNull();
  });
  it("round-trips the Discogs barcode query", () => {
    expect(barcodeQuery("036000291452")).toBe("barcode:036000291452");
    expect(barcodeFromQuery("barcode:036000291452")).toBe("036000291452");
    expect(barcodeFromQuery("Pink Floyd")).toBeNull();
    expect(barcodeFromQuery("barcode:12")).toBeNull();
  });
});

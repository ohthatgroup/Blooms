import { describe, expect, it } from "vitest";
import {
  buildBarcodeCandidates,
  matchesBarcodeQuery,
  pickSearchValueFromScan,
} from "./barcode";

describe("barcode helpers", () => {
  it("normalizes UPC and EAN candidates", () => {
    const upcCandidates = buildBarcodeCandidates("032797004947");
    expect(upcCandidates).toHaveLength(2);
    expect(upcCandidates).toEqual(
      expect.arrayContaining(["032797004947", "0032797004947"]),
    );

    const eanCandidates = buildBarcodeCandidates("0032797004947");
    expect(eanCandidates).toHaveLength(2);
    expect(eanCandidates).toEqual(
      expect.arrayContaining(["032797004947", "0032797004947"]),
    );
  });

  it("prefers UPC-A search value from scans", () => {
    expect(pickSearchValueFromScan("032797004947")).toBe("032797004947");
    expect(pickSearchValueFromScan("0032797004947")).toBe("032797004947");
  });

  it("matches query across UPC/EAN variants", () => {
    expect(matchesBarcodeQuery("32797004947", "032797004947")).toBe(true);
    expect(matchesBarcodeQuery("032797004947", "32797004947")).toBe(true);
    expect(matchesBarcodeQuery("032797004947", "004947")).toBe(true);
    expect(matchesBarcodeQuery("032797004947", "no-match")).toBe(false);
  });
});

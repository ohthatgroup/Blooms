function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function buildBarcodeCandidates(value: string): string[] {
  const digits = digitsOnly(String(value ?? "").trim());
  if (!digits) return [];

  const candidates = [digits];

  // Many scanners return EAN-13 for a UPC-A (leading "0").
  if (digits.length === 13 && digits.startsWith("0")) {
    candidates.push(digits.slice(1));
  }

  // UPC-A can also be compared as EAN-13 by prefixing 0.
  if (digits.length === 12) {
    candidates.push(`0${digits}`);
  }

  return uniq(candidates);
}

export function pickSearchValueFromScan(scannedValue: string): string {
  const trimmed = String(scannedValue ?? "").trim();
  const candidates = buildBarcodeCandidates(trimmed);
  if (candidates.length === 0) return trimmed;

  const upcA = candidates.find((candidate) => candidate.length === 12);
  return upcA ?? candidates[0];
}

export function matchesBarcodeQuery(upc: string, query: string): boolean {
  const rawUpc = String(upc ?? "");
  const rawQuery = String(query ?? "");
  const trimmedQuery = rawQuery.trim();
  if (!trimmedQuery) return true;

  const upcCandidates = buildBarcodeCandidates(rawUpc);
  const queryCandidates = buildBarcodeCandidates(trimmedQuery);

  // If query has no digits, keep legacy substring behavior for manual text input.
  if (queryCandidates.length === 0) {
    return rawUpc.toLowerCase().includes(trimmedQuery.toLowerCase());
  }
  if (upcCandidates.length === 0) return false;

  return upcCandidates.some((upcCandidate) =>
    queryCandidates.some(
      (queryCandidate) =>
        upcCandidate.includes(queryCandidate) || queryCandidate.includes(upcCandidate),
    ),
  );
}

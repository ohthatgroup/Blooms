import pdf from "pdf-parse";
import { parseDealsMatrixText } from "@/lib/deals/matrix";

export async function parseDealsPdfBuffer(buffer: Buffer) {
  const parsed = await pdf(buffer);
  return parseDealsMatrixText(parsed.text ?? "");
}

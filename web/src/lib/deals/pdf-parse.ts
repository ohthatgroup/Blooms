import { parseDealsMatrixText } from "@/lib/deals/matrix";
import {
  parseDealsFromTablePages,
  type DealsParseDiagnostics,
  type PositionedTextPage,
} from "@/lib/deals/pdf-table-parser";

interface PdfJsTextItem {
  str?: string;
  width?: number;
  height?: number;
  transform?: number[];
}

interface PdfJsPageTextContent {
  items: PdfJsTextItem[];
}

async function extractPositionedPages(buffer: Buffer): Promise<{
  pages: PositionedTextPage[];
  rawText: string;
}> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    const message = args.map((value) => String(value)).join(" ");
    if (message.includes("TT: undefined function")) {
      return;
    }
    originalWarn(...args);
  };

  try {
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      verbosity: pdfjs.VerbosityLevel.ERRORS,
    });
    const document = await loadingTask.promise;

    const pages: PositionedTextPage[] = [];
    const textByPage: string[] = [];

    for (let pageNo = 1; pageNo <= document.numPages; pageNo += 1) {
      const page = await document.getPage(pageNo);
      const content = (await page.getTextContent()) as PdfJsPageTextContent;

      const items = content.items
        .filter((item): item is PdfJsTextItem & { str: string; transform: number[] } => {
          return (
            item &&
            typeof item.str === "string" &&
            Array.isArray(item.transform) &&
            item.transform.length >= 6
          );
        })
        .map((item) => ({
          str: item.str,
          x: Number(item.transform[4]) || 0,
          y: Number(item.transform[5]) || 0,
          width: Number(item.width) || 0,
          height: Number(item.height) || 0,
        }));

      pages.push({
        page_number: pageNo,
        items,
      });

      textByPage.push(
        items
          .map((item) => item.str)
          .filter((item) => item.trim().length > 0)
          .join(" "),
      );
    }

    return {
      pages,
      rawText: textByPage.join("\n"),
    };
  } finally {
    console.warn = originalWarn;
  }
}

function fallbackDiagnostics(pagesCount: number): DealsParseDiagnostics {
  return {
    parsed_pages: pagesCount,
    table_headers_detected: 0,
    sku_rows_detected: 0,
    sku_rows_with_free_tiers: 0,
    rows_skipped_non_free: 0,
    rows_skipped_no_tiers: 0,
    parser_engine: "pdfjs-dist",
    used_legacy_fallback: true,
  };
}

export async function parseDealsPdfBuffer(buffer: Buffer) {
  const { pages, rawText } = await extractPositionedPages(buffer);

  try {
    return parseDealsFromTablePages(pages, rawText);
  } catch (tableError) {
    const tableMessage =
      tableError instanceof Error ? tableError.message : "Table parser failed.";

    try {
      const legacy = parseDealsMatrixText(rawText);
      return {
        ...legacy,
        diagnostics: fallbackDiagnostics(pages.length),
        warnings: [...legacy.warnings, `Table parser fallback: ${tableMessage}`],
      };
    } catch (legacyError) {
      const legacyMessage =
        legacyError instanceof Error ? legacyError.message : "Legacy parser failed.";
      throw new Error(`${tableMessage} Legacy fallback failed: ${legacyMessage}`);
    }
  }
}

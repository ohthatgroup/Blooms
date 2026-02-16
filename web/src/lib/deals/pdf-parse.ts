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

const SUPPRESSED_PDF_WARNINGS: RegExp[] = [
  /TT:\s*undefined function/i,
  /Cannot load "@napi-rs\/canvas"/i,
  /Cannot polyfill `DOMMatrix`/i,
  /Cannot polyfill `ImageData`/i,
  /Cannot polyfill `Path2D`/i,
];

function shouldSuppressPdfWarning(message: string): boolean {
  return SUPPRESSED_PDF_WARNINGS.some((pattern) => pattern.test(message));
}

function installMinimalImageDataPolyfill() {
  const globalScope = globalThis as typeof globalThis & {
    ImageData?: typeof ImageData;
  };
  if (typeof globalScope.ImageData !== "undefined") return;

  class ImageDataPolyfill {
    data: Uint8ClampedArray;
    width: number;
    height: number;

    constructor(dataOrWidth: Uint8ClampedArray | number, width?: number, height?: number) {
      if (typeof dataOrWidth === "number") {
        this.width = dataOrWidth;
        this.height = width ?? dataOrWidth;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
        return;
      }

      this.data = dataOrWidth;
      this.width = width ?? 0;
      this.height = height ?? 0;
    }
  }

  globalScope.ImageData = ImageDataPolyfill as unknown as typeof ImageData;
}

function installMinimalPath2DPolyfill() {
  const globalScope = globalThis as typeof globalThis & {
    Path2D?: typeof Path2D;
  };
  if (typeof globalScope.Path2D !== "undefined") return;

  class Path2DPolyfill {
    addPath() {}
    moveTo() {}
    lineTo() {}
    rect() {}
    closePath() {}
    arc() {}
    quadraticCurveTo() {}
    bezierCurveTo() {}
  }

  globalScope.Path2D = Path2DPolyfill as unknown as typeof Path2D;
}

async function ensurePdfJsPolyfills() {
  const globalScope = globalThis as typeof globalThis & {
    DOMMatrix?: typeof DOMMatrix;
    ImageData?: typeof ImageData;
    Path2D?: typeof Path2D;
  };

  if (
    typeof globalScope.DOMMatrix !== "undefined" &&
    typeof globalScope.ImageData !== "undefined" &&
    typeof globalScope.Path2D !== "undefined"
  ) {
    return;
  }

  try {
    const canvas = await import("@napi-rs/canvas");
    if (typeof globalScope.DOMMatrix === "undefined" && canvas.DOMMatrix) {
      globalScope.DOMMatrix = canvas.DOMMatrix as unknown as typeof DOMMatrix;
    }
    if (typeof globalScope.ImageData === "undefined" && canvas.ImageData) {
      globalScope.ImageData = canvas.ImageData as unknown as typeof ImageData;
    }
    if (typeof globalScope.Path2D === "undefined" && canvas.Path2D) {
      globalScope.Path2D = canvas.Path2D as unknown as typeof Path2D;
    }
  } catch {
    // Optional native package; ignore load failures and continue with JS fallback.
  }

  if (typeof globalScope.DOMMatrix === "undefined") {
    try {
      const dommatrix = await import("@thednp/dommatrix");
      const DOMMatrixCtor = dommatrix.default;
      if (DOMMatrixCtor) {
        globalScope.DOMMatrix = DOMMatrixCtor as unknown as typeof DOMMatrix;
      }
    } catch {
      // Keep going; if DOMMatrix is still missing below, we'll fail fast with a clear error.
    }
  }

  installMinimalImageDataPolyfill();
  installMinimalPath2DPolyfill();
}

async function extractPositionedPages(buffer: Buffer): Promise<{
  pages: PositionedTextPage[];
  rawText: string;
}> {
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    const message = args.map((value) => String(value)).join(" ");
    if (shouldSuppressPdfWarning(message)) {
      return;
    }
    originalWarn(...args);
  };

  try {
    await ensurePdfJsPolyfills();
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

    if (typeof (globalThis as { DOMMatrix?: unknown }).DOMMatrix === "undefined") {
      throw new Error(
        "DOMMatrix is not available in this runtime. Install @napi-rs/canvas or provide a DOMMatrix polyfill.",
      );
    }

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

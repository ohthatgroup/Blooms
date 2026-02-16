declare module "pdf-parse" {
  interface PDFParseResult {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    text: string;
    version: string;
  }

  export default function pdfParse(
    dataBuffer: Buffer | Uint8Array,
  ): Promise<PDFParseResult>;
}

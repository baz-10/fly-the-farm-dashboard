import * as pdfjsLib from "pdfjs-dist";
import { getPublicAssetUrl } from "../config/environment";

// Reuse the same bundled worker as sprayRecParser
pdfjsLib.GlobalWorkerOptions.workerSrc = getPublicAssetUrl("pdf.worker.min.js");

/**
 * Fetch a PDF from a URL and extract all text content.
 * Works with URLs served from the public directory (e.g. /docs/grazon-extra-label.pdf).
 */
export async function extractPdfText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const pdfDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item: any) => item.str).join(" ");
    pages.push(text);
  }

  return pages.join("\n\n");
}

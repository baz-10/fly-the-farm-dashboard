/**
 * Spray Recommendation PDF Parser
 * Extracts chemical names, rates, application rates, client/field info from PDF spray recs.
 * Supports both text-based and image-based (scanned) PDFs via OCR fallback.
 */
import * as pdfjsLib from 'pdfjs-dist';
import Tesseract from 'tesseract.js';
import { getPublicAssetUrl } from '../config/environment';
import { findTreatmentByBrand, getAllBrands } from '../data/chemicals';
import { ChemicalEntry } from '../types/fieldManagement';
import { searchAPVMAProducts } from './apvmaService';
import { saveAPVMAProduct } from './savedChemicals';

// Use the bundled worker
pdfjsLib.GlobalWorkerOptions.workerSrc = getPublicAssetUrl('pdf.worker.min.js');

// ─── Types ──────────────────────────────────────────────────

export interface SprayRecExtraction {
  chemicals: ChemicalEntry[];
  waterRateLHa: string;
  weedTarget: string;
  clientName: string;
  propertyName: string;
  fieldName: string;
  totalHa: string;
  contractor: string;
  dateSprayed: string;
  windDirection: string;
  rawText: string;
  confidence: 'high' | 'medium' | 'low';
  extractedItems: ExtractedItem[];
  ocrUsed: boolean;
}

export interface ExtractedItem {
  label: string;
  value: string;
  source: 'chemical' | 'rate' | 'waterRate' | 'client' | 'field' | 'property' | 'weed' | 'area' | 'contractor' | 'date' | 'wind';
  confidence: 'high' | 'medium' | 'low';
}

// ─── PDF Text Extraction (pdfjs) ────────────────────────────

async function extractTextFromPdf(dataUrl: string): Promise<{ text: string; pdfDoc: any }> {
  const base64 = dataUrl.split(',')[1];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const pdfDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item: any) => item.str).join(' ');
    pages.push(text);
  }

  return { text: pages.join('\n\n'), pdfDoc };
}

// ─── OCR Fallback (Tesseract.js) ────────────────────────────

async function ocrPdfPages(
  dataUrl: string,
  maxPages: number = 5,
  onProgress?: (msg: string) => void,
): Promise<string> {
  const base64 = dataUrl.split(',')[1];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Strategy 1: Extract embedded JPEG images directly from the PDF binary
  onProgress?.('Extracting images from PDF...');
  const jpegImages = extractJpegFromPdf(bytes);
  console.log(`Found ${jpegImages.length} embedded JPEG images in PDF`);

  if (jpegImages.length > 0) {
    onProgress?.('Initialising OCR engine...');
    const worker = await Tesseract.createWorker('eng');
    const ocrTexts: string[] = [];
    const imagesToOcr = jpegImages.slice(0, maxPages);

    for (let i = 0; i < imagesToOcr.length; i++) {
      onProgress?.(`OCR processing image ${i + 1} of ${imagesToOcr.length}...`);
      const jpegBlob = new Blob([Uint8Array.from(imagesToOcr[i])], { type: 'image/jpeg' });
      const jpegUrl = URL.createObjectURL(jpegBlob);

      try {
        const result = await worker.recognize(jpegUrl);
        console.log(`=== OCR IMAGE ${i + 1} (${result.data.text.length} chars) ===`);
        console.log(result.data.text.substring(0, 800));
        ocrTexts.push(result.data.text);
      } finally {
        URL.revokeObjectURL(jpegUrl);
      }
    }

    await worker.terminate();
    if (ocrTexts.join('').replace(/\s/g, '').length > 50) {
      return ocrTexts.join('\n\n--- PAGE BREAK ---\n\n');
    }
    console.log('JPEG extraction OCR produced too little text, trying canvas render...');
  }

  // Strategy 2: Fall back to pdfjs canvas rendering
  onProgress?.('Rendering PDF pages for OCR...');
  const pdfDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pagesToOcr = Math.min(pdfDoc.numPages, maxPages);
  const ocrTexts: string[] = [];

  const worker = await Tesseract.createWorker('eng');

  for (let i = 1; i <= pagesToOcr; i++) {
    onProgress?.(`OCR processing page ${i} of ${pagesToOcr}...`);
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: 4.0 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;

    // Binarize for better OCR
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let p = 0; p < data.length; p += 4) {
      const gray = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
      const bw = gray < 160 ? 0 : 255;
      data[p] = bw;
      data[p + 1] = bw;
      data[p + 2] = bw;
    }
    ctx.putImageData(imageData, 0, 0);

    const pageImageData = canvas.toDataURL('image/png');
    console.log(`Page ${i} canvas: ${canvas.width}x${canvas.height}`);

    const result = await worker.recognize(pageImageData);
    console.log(`=== OCR PAGE ${i} (${result.data.text.length} chars) ===`);
    console.log(result.data.text.substring(0, 800));
    ocrTexts.push(result.data.text);
  }

  await worker.terminate();
  return ocrTexts.join('\n\n--- PAGE BREAK ---\n\n');
}

/**
 * Extract JPEG images directly from PDF binary data.
 * JPEG images in PDFs start with FF D8 FF and end with FF D9.
 * Only returns images larger than 10KB (likely page scans, not thumbnails).
 */
function extractJpegFromPdf(pdfBytes: Uint8Array): Uint8Array[] {
  const images: Uint8Array[] = [];
  const minSize = 10000; // 10KB minimum — skip tiny thumbnails

  let i = 0;
  while (i < pdfBytes.length - 2) {
    // Look for JPEG SOI marker: FF D8 FF
    if (pdfBytes[i] === 0xFF && pdfBytes[i + 1] === 0xD8 && pdfBytes[i + 2] === 0xFF) {
      const start = i;
      // Scan for JPEG EOI marker: FF D9
      let j = i + 3;
      while (j < pdfBytes.length - 1) {
        if (pdfBytes[j] === 0xFF && pdfBytes[j + 1] === 0xD9) {
          const end = j + 2;
          const imgSize = end - start;
          if (imgSize > minSize) {
            images.push(pdfBytes.slice(start, end));
            console.log(`Found JPEG at offset ${start}, size: ${imgSize} bytes`);
          }
          i = end;
          break;
        }
        j++;
      }
      if (j >= pdfBytes.length - 1) break;
    } else {
      i++;
    }
  }

  return images;
}

// ─── OCR Text Pre-processing ────────────────────────────────

/**
 * Pre-process OCR text to handle table layouts where labels and values
 * end up on separate lines. Merges short adjacent lines and normalises whitespace.
 */
function preprocessOcrText(text: string): string {
  // Normalise line breaks
  let processed = text.replace(/\r\n/g, '\n');

  // For table-style OCR, try joining lines where a label line is followed by a value line.
  // e.g. "Application volume (L mix/ha)\n50.00" → "Application volume (L mix/ha) 50.00"
  const lines = processed.split('\n');
  const merged: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const next = i + 1 < lines.length ? lines[i + 1].trim() : '';
    // If current line looks like a label (ends with text/parens, no number at end)
    // and next line is short and numeric, merge them
    if (
      line.length > 5 &&
      next.length > 0 &&
      next.length < 30 &&
      /^\d+(\.\d+)?$/.test(next) &&
      !/\d+(\.\d+)?\s*$/.test(line)
    ) {
      merged.push(`${line} ${next}`);
      i++; // skip next line
    } else {
      merged.push(line);
    }
  }
  processed = merged.join('\n');

  // Also create a version where all lines are joined with spaces (for patterns that span lines)
  return processed;
}

// ─── Pattern Matching ───────────────────────────────────────

// Chemical mix lines like: "Glymac 450 @ 4L/ha ;;Starane @ 1.8L/ha ;;Endorse @ 1L/100L"
// or "Roundup @ 3 L/ha" or "Metsulfuron 600 @ 5g/ha"
const CHEMICAL_MIX_PATTERNS = [
  // "Product @ rate/ha" format (common in ops plans)
  /([A-Z][a-zA-Z0-9\s]+?)\s*@\s*(\d+(?:\.\d+)?)\s*(L|mL|g|kg)\/(?:ha|100\s*L)/gi,
  // Standard "Product rate L/ha"
  /([A-Z][a-zA-Z0-9\s]+?)\s+(\d+(?:\.\d+)?)\s*(L|mL|g|kg)\/ha/gi,
];

const RATE_PATTERNS = [
  /(\d+(?:\.\d+)?)\s*(L|mL|g|kg|litres?|grams?)\/ha/gi,
  /(\d+(?:\.\d+)?)(L|mL|g|kg)\/ha/gi,
  /rate[:\s]*(\d+(?:\.\d+)?)\s*(L|mL|g|kg|litres?|grams?)\s*(?:\/|per)\s*ha/gi,
  /@\s*(\d+(?:\.\d+)?)\s*(L|mL|g|kg)\s*\/\s*(?:ha|100\s*L)/gi,
];

const WATER_RATE_PATTERNS = [
  // "Application volume (L mix/ha) 50.00" — value may be on same or next line
  /[Aa]pplication\s*volume[^0-9\n]*(\d+(?:\.\d+)?)/g,
  // More flexible: "volume" near a number with "L" and "ha"
  /(?:application\s*volume|app(?:lication)?\s*vol)[^0-9]*(\d+(?:\.\d+)?)/gi,
  // "L per Ha" format — "600.00 L" on a line with "per Ha" or "L/Ha" nearby
  /(?:L\s*per\s*Ha)[.\s]*(\d+(?:\.\d+)?)\s*L/gi,
  // "NNN.NN L" followed by growth stage (table row: "600.00 L Silking")
  /(\d{2,4}(?:\.\d+)?)\s*L\s+(?:Silking|tassel|vegetative|flowering|emergence|pre.?em)/gi,
  // "L mix/ha" or "L/ha" with number before
  /(\d+(?:\.\d+)?)\s*L\s*(?:mix\s*)?\/\s*ha/gi,
  /(?:water\s*(?:rate|volume)|application\s*(?:rate|volume)|spray\s*volume|total\s*volume)[:\s]*(\d+(?:\.\d+)?)\s*(L|litres?)(?:\s*\/\s*|\s*per\s*)ha/gi,
  /(\d+(?:\.\d+)?)\s*L\/ha\s*(?:water|application|spray)\s*(?:rate|volume)/gi,
  /(?:apply|applied|application)\s*(?:in|at|with)\s*(\d+(?:\.\d+)?)\s*(L|litres?)(?:\s*\/\s*|\s*per\s*)(?:ha|hectare)/gi,
];

const CLIENT_PATTERNS = [
  // "HQPlantations responsible officer" + name — ops plan format
  /(?:responsible\s*officer|hqp(?:lantations)?\s*(?:rep|representative))[:\s]+([A-Z][a-zA-Z\s'-]{2,40}?)(?:\s*$|\s*\n|\s*task|\s*,)/gim,
  // "Supervisors Name" pattern (farm spray recs)
  /(?:supervisors?)[:\s]+([A-Z][a-zA-Z\s'-]{2,40}?)(?:\s+operators|\s*$|\s*\n)/gim,
  /(?:grower|client|farmer|landholder|property\s*owner|customer)[:\s]+([A-Z][a-zA-Z\s'-]{2,40}?)(?:\s*$|\s*\n|\s*,|\s*\.|\s*phone|\s*mob|\s*email|\s*address)/gim,
  /(?:prepared\s*for|attention|attn|to)[:\s]+([A-Z][a-zA-Z\s'-]{2,40}?)(?:\s*$|\s*\n|\s*,|\s*\.)/gim,
];

const CONTRACTOR_PATTERNS = [
  // Allow OCR variations of "Contractor" with flexible whitespace
  /[Cc]ontractor[:\s]+([A-Z][a-zA-Z\s.'&-]{2,40}?)(?:\s*$|\s*\n|\s*,|\s*purchase|\s*start)/gm,
  /(?:contractor)[:\s]+([A-Z][a-zA-Z\s.'&-]{2,40}?)(?:\s*$|\s*\n|\s*,|\s*purchase|\s*start)/gim,
];

const PROPERTY_PATTERNS = [
  /(?:property|station|farm|plantation)\s*(?:name)?[:\s]+([A-Z][a-zA-Z\s'-]{2,50}?)(?:\s*$|\s*\n|\s*,|\s*\.)/gim,
];

const FIELD_PATTERNS = [
  // "Location/Stand" — HQPlantations format (OCR may produce "Location/Stand" then value on next line)
  /(?:location\s*\/?\s*stand)[:\s]*\n?\s*(?:net\s*\(?\s*treated\s*\)?\s*ha\s*\n?\s*)?([A-Za-z0-9][a-zA-Z0-9\s_'-]{1,50}?)(?:\s+(?:design|net|planted|fallow))?\s*(?:\d+\.\d+)?(?:\s*$|\s*\n)/gim,
  // "Task description : Twins 317 holding spray drone"
  /(?:task\s*description)[:\s]+([A-Za-z0-9][a-zA-Z0-9\s_'-]{2,60}?)(?:\s*$|\s*\n|\s*total)/gim,
  // Farm block codes like "MFCW 03 B" or "MFCP 02" (uppercase letters + numbers)
  /\b(MFC[A-Z]\s*\d{2,3}\s*[A-Z]?)\b/g,
  // Standalone "NNN_NAME_NNN" pattern (forest compartment codes)
  /\b(\d{2,4}_[A-Z][A-Za-z]+_\d{2,4})\b/g,
  /(?:location\s*\/?\s*stand|compartment|coupe)[:\s]+([A-Za-z0-9][a-zA-Z0-9\s_'-]{1,50}?)(?:\s*$|\s*\n|\s*,|\s*\.|\s*\d+\.\d+)/gim,
  /(?:paddock|field|block|area\s*name|area\s*treated)[:\s]+([A-Z][a-zA-Z0-9\s'-]{1,50}?)(?:\s*$|\s*\n|\s*,|\s*\.|\s*\()/gim,
];

const WEED_PATTERNS = [
  /(?:target\s*(?:weed|pest|disease)|weed\s*target|target\s*pest|weeds?\s*(?:present|targeted|treated))[:\s]+([A-Za-z][a-zA-Z\s,&'-]{2,80}?)(?:\s*$|\s*\n|\s*\.)/gim,
  /(?:for\s*(?:the\s*)?control\s*of)\s+([A-Za-z][a-zA-Z\s,&'-]{2,80}?)(?:\s*$|\s*\n|\s*\.|\s*in\s)/gim,
  /(?:declared\s*pests?\s*\/?\s*weeds?)[:\s]*([A-Za-z][a-zA-Z\s,&'-]{2,80}?)(?:\s*$|\s*\n|\s*\.)/gim,
  // Chemical table "Target" column — e.g. "Sweet corn - Heliothis caterpillar"
  /(?:Sweet\s*corn|corn|cotton|sorghum|sugarcane|wheat|barley|canola)\s*[-–]\s*([A-Za-z][a-zA-Z\s]{2,40}?)(?:\s+\d|\s*$|\s*\n)/gim,
];

const AREA_PATTERNS = [
  // "Total ha 60.81" or "total treated ha 60.81" or "Net (treated) ha 60.81"
  /(?:total\s*(?:treated\s*)?ha|net\s*\(?treated\)?\s*ha|total\s*area)[:\s]*(\d+(?:\.\d+)?)/gi,
  /(\d+(?:\.\d+)?)\s*(?:ha|hectares?)\s*(?:total|treated|net)/gi,
  // "N Fields NNN.NN Ha" format (farm spray recs summary line)
  /\d+\s*Fields?\s*(\d+(?:\.\d+)?)\s*Ha/gi,
  // "Total ha" on one line, number on next (OCR table format)
  /(?:total\s*ha)\s*\n\s*(\d+(?:\.\d+)?)/gim,
  // Standalone "X.XXHa" (no space between number and Ha)
  /(\d+\.\d+)\s*Ha\b/gi,
];

const DATE_PATTERNS = [
  /(?:start\s*date|date\s*sprayed?|spray\s*date|application\s*date|planned\s*date|date\s*completed)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi,
  /(\d{1,2}\/\d{1,2}\/\d{4})/g,
  /(\d{1,2}\/\d{1,2}\/\d{2})\b/g,
];

const WIND_PATTERNS = [
  // Allow value on same line or next line
  /(?:preferred\s*wind\s*direction|wind\s*direction|wind\s*dir)[:\s]*\n?\s*(N|NE|E|SE|S|SW|W|NW|N\/NE|NE\/E|E\/SE|SE\/S|S\/SW|SW\/W|W\/NW|NW\/N)\b/gim,
];

// ─── Chemical Detection ────────────────────────────────────

function parseMixLine(mixLine: string, found: { name: string; rate: string; position: number }[]) {
  // Split by ";;" or ";" or ","
  const parts = mixLine.split(/\s*;;\s*|\s*;\s*/).filter(Boolean);
  for (const part of parts) {
    // Match "Product Name @ amount unit/ha" or "Product Name 450 @ amount unit/ha"
    const atMatch = part.match(/^\s*([A-Za-z][A-Za-z0-9\s]*?)\s*@\s*(\d+(?:\.\d+)?)\s*(L|mL|g|kg)\s*\/\s*(ha|100\s*L)\s*$/i);
    if (atMatch) {
      const name = atMatch[1].trim();
      const amount = atMatch[2];
      const unit = atMatch[3];
      const per = atMatch[4];
      const rateStr = per.replace(/\s/g, '').toLowerCase() === '100l'
        ? `${amount} ${unit}/100L`
        : `${amount} ${unit}/ha`;
      if (!found.some(f => f.name.toLowerCase() === name.toLowerCase())) {
        found.push({ name, rate: rateStr, position: 0 });
      }
    } else {
      // Try looser match: "Name @ number unit / ha" with possible OCR spacing issues
      const looseMatch = part.match(/^\s*([A-Za-z][A-Za-z0-9\s]*?)\s*@\s*(\d+(?:\.\d+)?)\s*(L|mL|g|kg)\s*(?:\/\s*(?:ha|100\s*L))?\s*$/i);
      if (looseMatch) {
        const name = looseMatch[1].trim();
        const amount = looseMatch[2];
        const unit = looseMatch[3];
        const rateStr = `${amount} ${unit}/ha`;
        if (!found.some(f => f.name.toLowerCase() === name.toLowerCase())) {
          found.push({ name, rate: rateStr, position: 0 });
        }
      }
    }
  }
}

function findChemicalsInText(text: string, allBrands: string[]): { name: string; rate: string }[] {
  const found: { name: string; rate: string; position: number }[] = [];

  // First try to parse "Product @ rate" format (HQPlantations style)
  // e.g. "Glymac 450 @ 4L/ha ;;Starane @ 1.8L/ha ;;Endorse @ 1L/100L"
  // Try multiple approaches — labeled line, standalone ;; line, or individual @ patterns
  const mixLineMatch = text.match(/(?:chemical\s*mix[^:]*:|product[^:]*:)\s*([^\n]+)/i)
    || text.match(/((?:[A-Z][a-zA-Z0-9\s]*@[^;]+;;?)+[A-Z][a-zA-Z0-9\s]*@[^\n;]+)/i);

  if (mixLineMatch) {
    const mixLine = mixLineMatch[1] || mixLineMatch[0];
    parseMixLine(mixLine, found);
  }

  // Also scan every line for "Product @ rate/ha" patterns (handles OCR where chemicals
  // appear on their own line without a "chemical mix:" label)
  if (found.length === 0) {
    const lines = text.split('\n');
    for (const line of lines) {
      // Check if line contains @ rate patterns (at least one "@ number unit/ha")
      if (/@\s*\d+(?:\.\d+)?\s*(?:L|mL|g|kg)\s*\/?\s*(?:ha|100\s*L)/i.test(line)) {
        parseMixLine(line, found);
      }
    }
  }

  // Fallback: use global regex to find all "Name @ rate" patterns anywhere in text
  if (found.length === 0) {
    const globalAtPattern = /([A-Z][a-zA-Z0-9\s]{1,30}?)\s*@\s*(\d+(?:\.\d+)?)\s*(L|mL|g|kg)\s*\/?\s*(ha|100\s*L)/gi;
    let match;
    while ((match = globalAtPattern.exec(text)) !== null) {
      const name = match[1].trim();
      const amount = match[2];
      const unit = match[3];
      const per = match[4] || 'ha';
      const rateStr = per.replace(/\s/g, '').toLowerCase() === '100l'
        ? `${amount} ${unit}/100L`
        : `${amount} ${unit}/ha`;
      if (!found.some(f => f.name.toLowerCase() === name.toLowerCase())) {
        found.push({ name, rate: rateStr, position: match.index });
      }
    }
  }

  // Table format fallback: find all "rate/Ha" or "rateL/Ha" patterns and look backwards for product names
  // Handles formats like:
  //   "Coragen Insecticide Sweet corn - 0.1L/Ha"
  //   "Nu Film 17 Surfactant Sweet corn - 0.3L/Ha"
  //   or multi-line where "0.1L/Ha" is on a different line from the name
  if (found.length === 0) {
    // Find all rate patterns in the text
    const rateRegex = /(\d+(?:\.\d+)?)\s*(L|mL|g|kg)\s*\/\s*Ha\b/gi;
    let match;
    const ratePositions: { amount: string; unit: string; index: number }[] = [];
    while ((match = rateRegex.exec(text)) !== null) {
      ratePositions.push({ amount: match[1], unit: match[2], index: match.index });
    }

    // For each rate, look backwards in the text for a product name
    for (const rp of ratePositions) {
      // Get the 300 chars before the rate
      const lookbackStart = Math.max(0, rp.index - 300);
      const context = text.substring(lookbackStart, rp.index);
      const lines = context.split('\n').filter(l => l.trim().length > 0);

      // Search lines backwards for a product name
      for (let li = lines.length - 1; li >= Math.max(0, lines.length - 5); li--) {
        const line = lines[li].trim();
        // Look for a line that starts with a product name (before type keywords)
        const nameMatch = line.match(/^([A-Za-z][A-Za-z0-9\s]*?)(?:\s{2,}|\s+(?:Insecticide|Herbicide|Fungicide|Surfactant|Biological|Adjuvant|Organic|Growth))/i)
          || line.match(/^([A-Za-z][A-Za-z0-9\s]{1,25}?)(?:\s+(?:Sweet|corn|cotton|sorghum|wheat)|\s{2,})/i);
        if (nameMatch) {
          let name = nameMatch[1].trim();
          // Clean up OCR artifacts and trailing numbers
          name = name.replace(/\s+\d+$/, '').trim();
          // Skip header rows and non-chemical words
          if (name && name.length > 2 && name.length < 40 &&
              !/^(Name|Type|Target|Rate|Tank|Batch|Qty|Chemicals|Weather|Wind|Date)$/i.test(name)) {
            const rateStr = `${rp.amount} ${rp.unit}/ha`;
            if (!found.some(f => f.name.toLowerCase() === name.toLowerCase())) {
              found.push({ name, rate: rateStr, position: rp.index });
              break;
            }
          }
        }
      }
    }
  }

  // Then also try matching known brands from our database
  const textLower = text.toLowerCase();
  const sortedBrands = [...allBrands].sort((a, b) => b.length - a.length);

  for (const brand of sortedBrands) {
    if (brand.length < 3) continue;
    const brandLower = brand.toLowerCase();
    let searchFrom = 0;

    while (true) {
      const idx = textLower.indexOf(brandLower, searchFrom);
      if (idx === -1) break;

      const charBefore = idx > 0 ? text[idx - 1] : ' ';
      const charAfter = idx + brand.length < text.length ? text[idx + brand.length] : ' ';
      const isBoundary = /[\s,.:;()\-/]/.test(charBefore) || idx === 0;
      const isEndBoundary = /[\s,.:;()\-/@]/.test(charAfter) || idx + brand.length === text.length;

      if (isBoundary && isEndBoundary) {
        if (!found.some(f => f.name.toLowerCase() === brandLower)) {
          const nearbyText = text.substring(idx, Math.min(idx + 200, text.length));
          const rate = extractNearbyRate(nearbyText);
          found.push({ name: brand, rate, position: idx });
        }
      }
      searchFrom = idx + 1;
    }
  }

  return found.sort((a, b) => a.position - b.position).map(({ name, rate }) => ({ name, rate }));
}

function extractNearbyRate(text: string): string {
  for (const pattern of RATE_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) {
      const amount = match[1];
      let unit = match[2];
      if (unit.toLowerCase().startsWith('litre')) unit = 'L';
      if (unit.toLowerCase().startsWith('gram')) unit = 'g';
      return `${amount} ${unit}/ha`;
    }
  }
  return '';
}

// ─── Water Rate Extraction ──────────────────────────────────

function extractWaterRate(text: string): string {
  for (const pattern of WATER_RATE_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) {
      return match[1];
    }
  }
  // Look for "L per Ha" header followed by a number on a nearby line
  const lPerHaMatch = text.match(/L\s*per\s*Ha[\s\S]{0,100}?(\d{2,4}(?:\.\d+)?)\s*L\b/i);
  if (lPerHaMatch) return lPerHaMatch[1];
  return '';
}

// ─── Label Extraction Helper ────────────────────────────────

function extractFirstMatch(text: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return '';
}

// ─── Check if text extraction was sufficient ────────────────

function hasUsefulText(text: string): boolean {
  // Strip whitespace and check if there's meaningful content
  const stripped = text.replace(/\s+/g, ' ').trim();
  // If we got less than 100 meaningful characters, it's probably image-based
  return stripped.length > 100;
}

// ─── Main Parser ────────────────────────────────────────────

export async function parseSprayRec(
  dataUrl: string,
  onProgress?: (msg: string) => void,
): Promise<SprayRecExtraction> {
  const allBrands = getAllBrands();
  const extractedItems: ExtractedItem[] = [];
  let ocrUsed = false;

  // Step 1: Try pdfjs text extraction
  onProgress?.('Extracting text from PDF...');
  let rawText = '';
  try {
    const { text } = await extractTextFromPdf(dataUrl);
    rawText = text;
  } catch (e) {
    console.warn('pdfjs extraction failed:', e);
  }

  // Step 2: If pdfjs got nothing useful, fall back to OCR
  if (!hasUsefulText(rawText)) {
    onProgress?.('PDF is image-based — running OCR (this may take a moment)...');
    try {
      rawText = await ocrPdfPages(dataUrl, 5, onProgress);
      ocrUsed = true;
    } catch (e) {
      console.error('OCR failed:', e);
    }
  }

  // Pre-process OCR text to handle table layouts
  if (ocrUsed) {
    rawText = preprocessOcrText(rawText);
  }

  // Log raw text for debugging
  console.log('=== SPRAY REC RAW TEXT ===');
  console.log(rawText.substring(0, 3000));
  console.log('=== END RAW TEXT ===');

  onProgress?.('Analysing content...');

  // Extract chemicals
  const chemicalsFound = findChemicalsInText(rawText, allBrands);
  const chemicals: ChemicalEntry[] = [];

  // First pass: match against local database
  const unmatchedChemicals: { name: string; rate: string; index: number }[] = [];
  for (let i = 0; i < chemicalsFound.length; i++) {
    const cf = chemicalsFound[i];
    const treatment = findTreatmentByBrand(cf.name);
    if (treatment) {
      chemicals.push({
        product: cf.name,
        activeIngredient: treatment.activeIngredient,
        ratePerHa: cf.rate || treatment.aerialRate || '',
        treatmentId: treatment.id,
      });
      extractedItems.push({
        label: 'Chemical',
        value: cf.name + (cf.rate ? ` @ ${cf.rate}` : ''),
        source: 'chemical',
        confidence: 'high',
      });
    } else {
      unmatchedChemicals.push({ name: cf.name, rate: cf.rate, index: i });
      // Placeholder — will be updated if APVMA search succeeds
      chemicals.push({
        product: cf.name,
        activeIngredient: '',
        ratePerHa: cf.rate || '',
        treatmentId: null,
      });
    }
  }

  // Second pass: search APVMA for unmatched chemicals
  if (unmatchedChemicals.length > 0) {
    onProgress?.(`Looking up ${unmatchedChemicals.length} chemical(s) on APVMA register...`);
    for (const uc of unmatchedChemicals) {
      try {
        const apvmaResults = await searchAPVMAProducts(uc.name);
        if (apvmaResults.length > 0) {
          // Find best match — prefer exact product name match
          const nameLower = uc.name.toLowerCase().trim();
          const exactMatch = apvmaResults.find(
            (p) => p.productName.toLowerCase() === nameLower
          );
          const partialMatch = apvmaResults.find(
            (p) => p.productName.toLowerCase().includes(nameLower) ||
                   nameLower.includes(p.productName.toLowerCase())
          );
          const bestMatch = exactMatch || partialMatch || apvmaResults[0];

          // Save to local database so it's available next time
          const savedTreatment = saveAPVMAProduct(bestMatch);
          console.log(`APVMA match for "${uc.name}": ${bestMatch.productName} (${bestMatch.category})`);

          // Update the chemical entry with APVMA data
          chemicals[uc.index] = {
            product: bestMatch.productName,
            activeIngredient: bestMatch.category || savedTreatment.activeIngredient || '',
            ratePerHa: uc.rate || '',
            treatmentId: savedTreatment.id,
          };

          extractedItems.push({
            label: 'Chemical',
            value: bestMatch.productName + (uc.rate ? ` @ ${uc.rate}` : '') + ' (APVMA)',
            source: 'chemical',
            confidence: 'medium',
          });
        } else {
          // No APVMA match — add with empty active ingredient
          extractedItems.push({
            label: 'Chemical',
            value: uc.name + (uc.rate ? ` @ ${uc.rate}` : '') + ' (not in database)',
            source: 'chemical',
            confidence: 'low',
          });
        }
      } catch (err) {
        console.warn(`APVMA lookup failed for "${uc.name}":`, err);
        extractedItems.push({
          label: 'Chemical',
          value: uc.name + (uc.rate ? ` @ ${uc.rate}` : ''),
          source: 'chemical',
          confidence: 'low',
        });
      }
    }
  }

  // Extract water/application rate
  const waterRate = extractWaterRate(rawText);
  if (waterRate) {
    extractedItems.push({ label: 'Application Rate', value: `${waterRate} L/ha`, source: 'waterRate', confidence: 'high' });
  }

  // Extract contractor
  const contractor = extractFirstMatch(rawText, CONTRACTOR_PATTERNS);
  if (contractor) {
    extractedItems.push({ label: 'Contractor', value: contractor, source: 'contractor', confidence: 'medium' });
  }

  // Extract client/grower name
  const clientName = extractFirstMatch(rawText, CLIENT_PATTERNS);
  if (clientName) {
    extractedItems.push({ label: 'Client/Grower', value: clientName, source: 'client', confidence: 'medium' });
  }

  // Extract property name
  const propertyName = extractFirstMatch(rawText, PROPERTY_PATTERNS);
  if (propertyName) {
    extractedItems.push({ label: 'Property', value: propertyName, source: 'property', confidence: 'medium' });
  }

  // Extract field/paddock/location
  const fieldName = extractFirstMatch(rawText, FIELD_PATTERNS);
  if (fieldName) {
    extractedItems.push({ label: 'Field/Location', value: fieldName, source: 'field', confidence: 'medium' });
  }

  // Extract total hectares
  const totalHa = extractFirstMatch(rawText, AREA_PATTERNS);
  if (totalHa) {
    extractedItems.push({ label: 'Total Hectares', value: `${totalHa} ha`, source: 'area', confidence: 'high' });
  }

  // Extract weed target
  const weedTarget = extractFirstMatch(rawText, WEED_PATTERNS);
  if (weedTarget) {
    extractedItems.push({ label: 'Target Weed/Pest', value: weedTarget, source: 'weed', confidence: 'medium' });
  }

  // Extract date
  const dateSprayed = extractFirstMatch(rawText, DATE_PATTERNS);
  if (dateSprayed) {
    extractedItems.push({ label: 'Date', value: dateSprayed, source: 'date', confidence: 'medium' });
  }

  // Extract wind direction
  const windDirection = extractFirstMatch(rawText, WIND_PATTERNS);
  if (windDirection) {
    extractedItems.push({ label: 'Wind Direction', value: windDirection.toUpperCase(), source: 'wind', confidence: 'medium' });
  }

  // Determine overall confidence
  const confidence: 'high' | 'medium' | 'low' =
    chemicals.length > 0 && waterRate ? 'high' :
    chemicals.length > 0 || waterRate ? 'medium' : 'low';

  return {
    chemicals: chemicals.length > 0 ? chemicals : [],
    waterRateLHa: waterRate,
    weedTarget,
    clientName,
    propertyName,
    fieldName,
    totalHa,
    contractor,
    dateSprayed,
    windDirection,
    rawText,
    confidence,
    extractedItems,
    ocrUsed,
  };
}

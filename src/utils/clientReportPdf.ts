import jsPDF from 'jspdf';
import { ClientReport, OperatorBriefing } from '../ai/orchestrator/generateClientReport';
import { InvokeInput } from '../ai/types/invoke';

const PRIMARY: [number, number, number] = [30, 77, 43];
const PRIMARY_LIGHT: [number, number, number] = [232, 245, 233];
const GREY: [number, number, number] = [100, 100, 100];
const LIGHT_GREY: [number, number, number] = [210, 210, 210];
const BLACK: [number, number, number] = [33, 33, 33];
const WHITE: [number, number, number] = [255, 255, 255];

// PDF-safe status colours
const STATUS_OK: [number, number, number] = [46, 125, 50];    // green
const STATUS_WARN: [number, number, number] = [230, 150, 0];  // amber
const STATUS_BLOCK: [number, number, number] = [198, 40, 40]; // red

type StatusType = 'ok' | 'warn' | 'block' | null;

// ─── PDF text sanitiser ──────────────────────────
// Strips all Unicode that helvetica cannot render and replaces
// status emoji with readable text labels.

function sanitizePdfText(text: string): string {
  let s = text;

  // Replace status emoji with text labels
  s = s.replace(/\u2705\s*/g, 'OK: ');
  s = s.replace(/\u26A0\uFE0F?\s*/g, 'CAUTION: ');
  s = s.replace(/\u26D4\s*/g, 'BLOCKER: ');

  // Replace em-dash / en-dash with plain ASCII dash
  s = s.replace(/[\u2014\u2013]/g, '-');

  // Replace curly quotes with straight quotes
  s = s.replace(/[\u2018\u2019]/g, "'");
  s = s.replace(/[\u201C\u201D]/g, '"');

  // Replace other common Unicode that helvetica can't render
  s = s.replace(/\u2022/g, '-');   // bullet (we draw our own)
  s = s.replace(/\u00B7/g, '-');   // middle dot
  s = s.replace(/\u2026/g, '...'); // ellipsis

  // Strip variation selectors and zero-width characters
  s = s.replace(/[\uFE00-\uFE0F]/g, '');
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, '');

  // Strip any remaining non-ASCII control or symbol chars that
  // fall outside the Latin-1 range jsPDF supports safely
  s = s.replace(/[^\x20-\x7E\xA0-\xFF]/g, '');

  // Collapse multiple spaces left by removals
  s = s.replace(/ {2,}/g, ' ').trim();

  return s;
}

// Detect status type from the raw text (before sanitisation)
function detectStatus(text: string): StatusType {
  if (text.startsWith('\u2705')) return 'ok';
  if (text.startsWith('\u26A0')) return 'warn';
  if (text.startsWith('\u26D4')) return 'block';
  if (text.startsWith('OK:')) return 'ok';
  if (text.startsWith('CAUTION:')) return 'warn';
  if (text.startsWith('BLOCKER:')) return 'block';
  return null;
}

function statusColor(s: StatusType): [number, number, number] {
  if (s === 'ok') return STATUS_OK;
  if (s === 'warn') return STATUS_WARN;
  if (s === 'block') return STATUS_BLOCK;
  return BLACK;
}

function statusLabel(s: StatusType): string {
  if (s === 'ok') return 'OK:';
  if (s === 'warn') return 'CAUTION:';
  if (s === 'block') return 'BLOCKER:';
  return '';
}

// Strip the status prefix from already-sanitised text so we can
// render the label in bold/colour and the rest in normal/black.
function stripStatusPrefix(text: string): string {
  return text
    .replace(/^OK:\s*/, '')
    .replace(/^CAUTION:\s*/, '')
    .replace(/^BLOCKER:\s*/, '');
}

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 20;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_Y = PAGE_H - 12;
const BODY_BOTTOM = FOOTER_Y - 8;

const HEADER_H = 38;
const LOGO_H = 18;
const LOGO_W = Math.round((302 / 132) * LOGO_H); // maintain aspect ratio: ~41mm

const OPERATOR_SECTIONS: { key: keyof OperatorBriefing; label: string; icon: string }[] = [
  { key: 'criticalBlockers', label: 'Critical Blockers', icon: '🚫' },
  { key: 'keyCautions', label: 'Key Cautions', icon: '⚠️' },
  { key: 'legalComplianceActions', label: 'Legal / Compliance Actions Required', icon: '📋' },
  { key: 'priorityConstraints', label: 'Priority Operational Constraints', icon: '🎯' },
];

// Selected client report sections for Operator Briefing PDF
const SELECTED_CLIENT_SECTIONS: { key: keyof ClientReport; label: string }[] = [
  { key: 'jobOverview', label: 'Job Overview' },
  { key: 'siteRisks', label: 'Site Risks' },
  { key: 'applicationSettings', label: 'Application Settings' },
  { key: 'finalRecommendation', label: 'Final Recommendation' },
];

function formatDate(): string {
  return new Date().toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatDateShort(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function sanitiseFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
}

// Filter out outdated or contradictory content
function filterOutdatedContent(items: string[]): string[] {
  return items.filter(item => {
    const lowerItem = item.toLowerCase();
    // Skip outdated messages when we have extracted data
    if (lowerItem.includes('label source data not available') ||
        lowerItem.includes('manual label review required')) {
      return false;
    }
    // Skip redundant constraint dumps
    if (lowerItem.startsWith('do not') && lowerItem.length > 100) {
      return false;
    }
    return true;
  });
}

// Limit constraints to top priority items
function limitConstraints(constraints: string[], maxItems: number = 7): string[] {
  // Prioritize critical constraints (blockers, weather, safety)
  const priorityTerms = ['wind', 'temperature', 'rain', 'withholding', 'waterway', 'buffer', 'spray drift', 'applicator', 'ppe'];

  const prioritized = constraints.sort((a, b) => {
    const aScore = priorityTerms.reduce((score, term) => score + (a.toLowerCase().includes(term) ? 1 : 0), 0);
    const bScore = priorityTerms.reduce((score, term) => score + (b.toLowerCase().includes(term) ? 1 : 0), 0);
    return bScore - aScore;
  });

  return prioritized.slice(0, maxItems);
}

async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const response = await fetch('/logo.png');
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateClientReportPdf(
  report: ClientReport,
  input: InvokeInput,
  operatorBriefing?: OperatorBriefing
): Promise<void> {
  const doc = new jsPDF('p', 'mm', 'a4');
  let y = MARGIN;

  const setColor = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
  const setFill = (c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
  const setDraw = (c: [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2]);

  const drawRule = (yPos: number) => {
    setDraw(LIGHT_GREY);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, yPos, PAGE_W - MARGIN, yPos);
  };

  const checkPage = (needed: number) => {
    if (y + needed > BODY_BOTTOM) {
      doc.addPage();
      y = MARGIN;
    }
  };

  // ─── Load logo ───────────────────────────────────
  const logoDataUrl = await loadLogoDataUrl();

  // ─── Header band ─────────────────────────────────
  setFill(PRIMARY);
  doc.rect(0, 0, PAGE_W, HEADER_H, 'F');

  // Logo - right side, vertically centred
  if (logoDataUrl) {
    const logoX = PAGE_W - MARGIN - LOGO_W;
    const logoY = (HEADER_H - LOGO_H) / 2;
    doc.addImage(logoDataUrl, 'PNG', logoX, logoY, LOGO_W, LOGO_H);
  }

  // Text - always left-aligned
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  setColor(WHITE);
  doc.text('Fly The Farm', MARGIN, 16);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  setColor([200, 230, 200]);
  doc.text('Spray Advisory Report', MARGIN, 24);

  // Subtitle line: Product | Aircraft | Date
  const subtitleParts: string[] = [];
  const productName = operatorBriefing?.cleanProductName || input.chemical;
  if (productName) subtitleParts.push(`Product: ${productName}`);
  if (input.aircraft) subtitleParts.push(`Aircraft: ${input.aircraft}`);
  subtitleParts.push(formatDate());

  doc.setFontSize(8.5);
  setColor([180, 215, 180]);
  doc.text(subtitleParts.join('   |   '), MARGIN, 32);

  y = 48;

  // ─── Primary Content: Operator Briefing ──────────────────────
  if (operatorBriefing) {
    // Mission Status banner with full-width background
    checkPage(20);
    const missionStatus = operatorBriefing.missionStatus;
    const statusColor = missionStatus.status === 'GO' ? STATUS_OK :
                       missionStatus.status === 'CONDITIONAL' ? STATUS_WARN :
                       STATUS_BLOCK;

    setFill(statusColor);
    doc.roundedRect(MARGIN, y - 4, CONTENT_W, 14, 3, 3, 'F');

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    setColor(WHITE);
    doc.text(`MISSION STATUS: ${missionStatus.status}`, MARGIN + 6, y + 4);

    y += 18;

    // Mission reason (if status not GO)
    if (missionStatus.status !== 'GO' && missionStatus.reason) {
      checkPage(12);
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'normal');
      setColor(BLACK);
      const reasonLines = doc.splitTextToSize(sanitizePdfText(missionStatus.reason), CONTENT_W - 8);
      for (const line of reasonLines) {
        checkPage(5);
        doc.text(line, MARGIN + 4, y);
        y += 4;
      }
      y += 6;
    }

    // Critical Blockers and Key Cautions
    for (const section of OPERATOR_SECTIONS.slice(0, 2)) { // Only blockers and cautions
      const items = operatorBriefing[section.key] as any[];
      if (!items || items.length === 0) continue;

      checkPage(22);

      // Section heading
      setFill(PRIMARY_LIGHT);
      doc.roundedRect(MARGIN, y - 5, CONTENT_W, 9, 2, 2, 'F');

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      setColor(PRIMARY);
      const iconText = section.key === 'criticalBlockers' ? 'BLOCKER' : 'CAUTION';
      doc.text(`${iconText}: ${section.label}`, MARGIN + 4, y + 1);
      y += 10;

      // Issue items
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'normal');
      setColor(BLACK);

      const sectionColor = section.key === 'criticalBlockers' ? STATUS_BLOCK : STATUS_WARN;

      for (const operatorIssue of items) {
        checkPage(15);

        // Issue title (bold, colored)
        doc.setFont('helvetica', 'bold');
        setColor(sectionColor as [number, number, number]);
        doc.text(sanitizePdfText(operatorIssue.title), MARGIN + 4, y);
        y += 5;

        // Issue why/reason (concise)
        doc.setFont('helvetica', 'normal');
        setColor(BLACK);
        const whyLines = doc.splitTextToSize(sanitizePdfText(operatorIssue.why), CONTENT_W - 12);
        for (const line of whyLines) {
          checkPage(5);
          doc.text(line, MARGIN + 8, y);
          y += 4;
        }

        // Action to resolve (if available)
        if (operatorIssue.actionToResolve) {
          y += 1;
          doc.setFont('helvetica', 'italic');
          setColor(GREY);
          const actionText = `Action: ${sanitizePdfText(operatorIssue.actionToResolve)}`;
          const actionLines = doc.splitTextToSize(actionText, CONTENT_W - 12);
          for (const line of actionLines) {
            checkPage(5);
            doc.text(line, MARGIN + 8, y);
            y += 4;
          }
          doc.setFont('helvetica', 'normal');
          setColor(BLACK);
        }

        y += 3;
      }

      y += 3;
      drawRule(y);
      y += 8;
    }

    // Legal Compliance Actions (checklist style)
    if (operatorBriefing.legalComplianceActions.length > 0) {
      checkPage(18);

      // Section heading
      setFill(PRIMARY_LIGHT);
      doc.roundedRect(MARGIN, y - 5, CONTENT_W, 9, 2, 2, 'F');

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      setColor(PRIMARY);
      doc.text('COMPLIANCE: Legal / Compliance Actions Required', MARGIN + 4, y + 1);
      y += 10;

      // Compliance items as checklist
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'normal');
      setColor(BLACK);

      for (const action of operatorBriefing.legalComplianceActions) {
        checkPage(8);

        // Checkbox bullet
        setColor([30, 118, 190] as [number, number, number]);
        doc.text('□', MARGIN + 4, y);
        setColor(BLACK);

        const actionLines = doc.splitTextToSize(sanitizePdfText(action), CONTENT_W - 16);
        for (let i = 0; i < actionLines.length; i++) {
          checkPage(5);
          doc.text(actionLines[i], MARGIN + 12, y);
          y += 5;
        }
        y += 1;
      }

      y += 3;
      drawRule(y);
      y += 8;
    }

    // Priority Operational Constraints (limited to top 7)
    if (operatorBriefing.priorityConstraints.length > 0) {
      checkPage(18);

      const limitedConstraints = limitConstraints(operatorBriefing.priorityConstraints);

      // Section heading
      setFill(PRIMARY_LIGHT);
      doc.roundedRect(MARGIN, y - 5, CONTENT_W, 9, 2, 2, 'F');

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      setColor(PRIMARY);
      doc.text('CONSTRAINT: Priority Operational Constraints', MARGIN + 4, y + 1);
      y += 10;

      // Constraint items
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'normal');
      setColor(BLACK);

      for (const constraint of limitedConstraints) {
        checkPage(8);

        setColor([56, 142, 60] as [number, number, number]);
        doc.text('-', MARGIN + 4, y);
        setColor(BLACK);

        const constraintLines = doc.splitTextToSize(sanitizePdfText(constraint), CONTENT_W - 12);
        for (let i = 0; i < constraintLines.length; i++) {
          checkPage(5);
          doc.text(constraintLines[i], MARGIN + 10, y);
          y += 5;
        }
        y += 1;
      }

      y += 3;
      drawRule(y);
      y += 8;
    }
  }

  // ─── Supporting Information ────────────────────────────
  // Add operator requirements summary
  if (operatorBriefing?.operatorRequirements) {
    checkPage(20);

    // Section heading
    setFill(PRIMARY_LIGHT);
    doc.roundedRect(MARGIN, y - 5, CONTENT_W, 9, 2, 2, 'F');

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    setColor(PRIMARY);
    doc.text('Operator Requirements Summary', MARGIN + 4, y + 1);
    y += 10;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    setColor(BLACK);

    const requirements = operatorBriefing.operatorRequirements;
    const reqItems = [
      ['Water Rate:', requirements.waterRate],
      ['Droplet Class:', requirements.dropletClass],
      ['Wind Limits:', requirements.windLimits],
      ['Temperature:', requirements.temperatureLimits],
      ['Withholding:', requirements.withholding],
      ['Buffer Status:', requirements.bufferStatus]
    ].filter(([_, value]) => value && value.trim() !== '');

    for (const [label, value] of reqItems) {
      checkPage(5);
      doc.setFont('helvetica', 'bold');
      doc.text(label, MARGIN + 4, y);
      doc.setFont('helvetica', 'normal');
      doc.text(value, MARGIN + 35, y);
      y += 5;
    }

    y += 3;
    drawRule(y);
    y += 8;
  }

  // ─── Selected Supporting Sections ──────────────────────
  for (const section of SELECTED_CLIENT_SECTIONS) {
    const items = report[section.key];
    if (!items || items.length === 0) continue;

    // Filter outdated content
    const filteredItems = filterOutdatedContent(items);
    if (filteredItems.length === 0) continue;

    checkPage(22);

    // Section heading
    setFill(PRIMARY_LIGHT);
    doc.roundedRect(MARGIN, y - 5, CONTENT_W, 9, 2, 2, 'F');

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    setColor(PRIMARY);
    doc.text(section.label, MARGIN + 4, y + 1);
    y += 10;

    // Section items
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    setColor(BLACK);

    for (const rawItem of filteredItems) {
      // Detect status from raw text before sanitisation
      const status = detectStatus(rawItem);
      const safeItem = sanitizePdfText(rawItem);

      // Skip separator headings in concise view
      if (rawItem.startsWith('---') && rawItem.endsWith('---')) {
        continue;
      }

      // Text to render
      const bodyText = status ? stripStatusPrefix(safeItem) : safeItem;
      const textIndent = status ? MARGIN + 24 : MARGIN + 10;

      checkPage(8);
      const lines = doc.splitTextToSize(bodyText, CONTENT_W - (textIndent - MARGIN) - 2);
      for (let i = 0; i < lines.length; i++) {
        checkPage(5.5);
        if (i === 0) {
          if (status) {
            // Colored status label
            doc.setFont('helvetica', 'bold');
            setColor(statusColor(status));
            doc.text(statusLabel(status), MARGIN + 4, y);
            doc.setFont('helvetica', 'normal');
            setColor(BLACK);
            doc.text(lines[i], textIndent, y);
          } else {
            // Standard bullet
            setColor(PRIMARY);
            doc.text('-', MARGIN + 4, y);
            setColor(BLACK);
            doc.text(lines[i], MARGIN + 10, y);
          }
        } else {
          doc.text(lines[i], textIndent, y);
        }
        y += 5;
      }
      y += 1.5;
    }

    y += 3;
    drawRule(y);
    y += 8;
  }

  // ─── Disclaimer ──────────────────────────────────
  checkPage(18);
  y += 4;
  drawRule(y);
  y += 6;

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'italic');
  setColor(GREY);
  const disclaimer = sanitizePdfText(
    'This report is operational guidance only. Always read and follow the product label. ' +
    'Fly The Farm accepts no liability for application decisions made using this report.'
  );
  const disclaimerLines = doc.splitTextToSize(disclaimer, CONTENT_W);
  for (const line of disclaimerLines) {
    doc.text(line, MARGIN, y);
    y += 4;
  }

  // ─── Footer on every page ────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Thin rule above footer
    setDraw(LIGHT_GREY);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, FOOTER_Y - 3, PAGE_W - MARGIN, FOOTER_Y - 3);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    setColor(GREY);
    doc.text(
      'Fly The Farm - Professional Drone Application Services',
      MARGIN,
      FOOTER_Y
    );
    doc.text(
      `Page ${i} of ${pageCount}`,
      PAGE_W - MARGIN,
      FOOTER_Y,
      { align: 'right' }
    );
  }

  // ─── Save ────────────────────────────────────────
  const finalProductName = operatorBriefing?.cleanProductName || input.chemical;
  const product = finalProductName ? sanitiseFilename(finalProductName) : 'General';
  const aircraft = input.aircraft ? sanitiseFilename(input.aircraft) : 'Unspecified';
  const dateStr = formatDateShort();
  const reportType = operatorBriefing ? 'OperatorBriefing' : 'Report';
  doc.save(`FTF_${reportType}_${product}_${aircraft}_${dateStr}.pdf`);
}

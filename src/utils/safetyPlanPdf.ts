import jsPDF from 'jspdf';

import type { SafetyPlan, SafetyPlanFieldValue, SafetyPlanVersion } from '../types/safetyPlan';

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 18;
const FOOTER_Y = 287;
const CONTENT_BOTTOM = 276;
const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);
const PRIMARY: [number, number, number] = [30, 77, 43];
const GREY: [number, number, number] = [90, 100, 94];

export interface SafetyPlanPdfCompany {
  name: string;
  abn?: string;
  reocNumber?: string;
}

export interface SafetyPlanPdfOptions {
  clientCopy?: boolean;
}

type InstrumentedDocument = jsPDF & { __safetyPlanText?: string[] };

function stableFileId(seed: string): string {
  const hex = seed.replace(/[^a-fA-F0-9]/g, '').toUpperCase();
  if (hex.length >= 32) return hex.slice(0, 32);
  let state = 2166136261;
  let output = '';
  for (let round = 0; round < 4; round += 1) {
    for (let index = 0; index < seed.length; index += 1) {
      state ^= seed.charCodeAt(index) + round;
      state = Math.imul(state, 16777619) >>> 0;
    }
    output += state.toString(16).padStart(8, '0');
  }
  return output.toUpperCase().slice(0, 32);
}

function sanitisePdfText(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u2014\u2013]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

export function sanitiseSafetyPlanFilename(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'Job';
}

export function safetyPlanPdfFilename(jobName: string, version: string): string {
  return `Safety_Plan_${sanitiseSafetyPlanFilename(jobName)}_${sanitiseSafetyPlanFilename(version)}.pdf`;
}

function valueText(value: SafetyPlanFieldValue | undefined): string {
  if (Array.isArray(value)) return value.join('; ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return value == null || value === '' ? 'Not recorded' : String(value);
}

export async function buildSafetyPlanPdf(
  plan: SafetyPlan,
  version: SafetyPlanVersion,
  company: SafetyPlanPdfCompany,
  options: SafetyPlanPdfOptions = {}
): Promise<jsPDF> {
  if (version.planId !== plan.id || !plan.versions.some((item) => item.id === version.id)) {
    throw new Error('Safety Plan version does not belong to this plan.');
  }
  if (version.status !== 'approved' || !version.approvedAt || !version.contentDigest) {
    throw new Error('Only an immutable approved Safety Plan version can be exported.');
  }

  const doc = new jsPDF('p', 'mm', 'a4') as InstrumentedDocument;
  const captured: string[] = [];
  const bodyPositions: number[] = [];
  Object.defineProperty(doc, '__safetyPlanText', { value: captured, enumerable: false });
  Object.defineProperty(doc, '__safetyPlanBodyY', { value: bodyPositions, enumerable: false });
  doc.setCreationDate(new Date(version.sourceSnapshot.capturedAt));
  doc.setFileId(stableFileId(version.contentDigest));
  doc.setProperties({
    title: `Safety Plan ${version.version} - ${version.sourceSnapshot.job.name}`,
    subject: options.clientCopy ? 'Approved Safety Plan client copy' : 'Approved Safety Plan controlled record',
    author: company.name,
    creator: 'Safety Plan Command',
    keywords: `safety-plan,${version.version},${version.contentDigest}`,
  });
  let y = 20;

  const addPage = () => {
    doc.addPage();
    y = 20;
  };
  const ensureSpace = (height: number) => {
    if (y + height > CONTENT_BOTTOM) addPage();
  };
  const text = (
    raw: unknown,
    settings: { size?: number; bold?: boolean; color?: [number, number, number]; indent?: number } = {}
  ) => {
    const value = sanitisePdfText(raw);
    if (!value) return;
    captured.push(value);
    const size = settings.size ?? 9;
    const indent = settings.indent ?? 0;
    doc.setFont('helvetica', settings.bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...(settings.color ?? [33, 33, 33]));
    const lines = doc.splitTextToSize(value, CONTENT_WIDTH - indent) as string[];
    const lineHeight = size * 0.42;
    for (const line of lines) {
      ensureSpace(lineHeight + 2);
      bodyPositions.push(y);
      doc.text(line, MARGIN + indent, y);
      y += lineHeight;
    }
    y += 2;
  };
  const heading = (raw: string) => {
    ensureSpace(12);
    y += 3;
    text(raw, { size: 12, bold: true, color: PRIMARY });
    doc.setDrawColor(...PRIMARY);
    doc.line(MARGIN, y - 1, PAGE_WIDTH - MARGIN, y - 1);
    y += 2;
  };

  text('JOB SAFETY PLAN', { size: 20, bold: true, color: PRIMARY });
  text(options.clientCopy ? 'Client copy' : 'Controlled record', { size: 10, bold: true, color: GREY });
  text(company.name, { size: 13, bold: true });
  if (company.abn) text(`ABN: ${company.abn}`);
  if (company.reocNumber) text(`ReOC: ${company.reocNumber}`);
  text(version.sourceSnapshot.job.name, { size: 15, bold: true });
  text(`Version ${version.version}`);
  text(`Snapshot captured: ${version.sourceSnapshot.capturedAt}`);
  text(version.templateSnapshot.notice);

  heading('Job and source snapshot');
  text(`Job: ${version.sourceSnapshot.job.name}`);
  text(`Client: ${version.sourceSnapshot.client?.name ?? version.sourceSnapshot.job.clientName ?? 'Not recorded'}`);
  text(`Property: ${version.sourceSnapshot.property?.name ?? version.sourceSnapshot.job.propertyName ?? 'Not recorded'}`);
  text(`Field: ${version.sourceSnapshot.field?.name ?? version.sourceSnapshot.job.fieldName ?? 'Not recorded'}`);
  text(`Location: ${version.sourceSnapshot.job.location ?? 'Not recorded'}`);
  text(`Operating dates: ${version.sourceSnapshot.job.operatingDates ?? 'Not recorded'}`);
  text(`Missions: ${version.sourceSnapshot.missions.map((mission) => mission.name).join('; ') || 'None linked at capture'}`);

  if (!options.clientCopy) {
    text(`Source references: ${version.sourceSnapshot.sourceLinks.map((link) =>
      `${link.sourceType}:${link.sourceId}${link.sourceItemId ? `:${link.sourceItemId}` : ''}`
    ).join('; ') || 'None'}`);
  }

  for (const section of version.sections) {
    heading(section.title || section.id);
    if (section.helpText) text(section.helpText, { color: GREY });
    for (const field of section.fields) {
      text(field.label, { bold: true });
      text(valueText(field.value), { indent: 4 });
    }
  }

  heading('Approval');
  text(`Approved by: ${version.approvedBy?.name ?? 'Not recorded'}`);
  text(`Approved at: ${version.approvedAt}`);

  heading('Acknowledgements');
  if (!version.acknowledgements.length) text('No acknowledgements recorded.');
  for (const acknowledgement of version.acknowledgements) {
    text(`${acknowledgement.actor.name} - ${acknowledgement.assignedRole} - ${acknowledgement.acknowledgedAt}`);
    text(acknowledgement.statement, { indent: 4 });
  }

  heading('Revision history');
  for (const historical of plan.versions) {
    text(`Version ${historical.version} - ${historical.status} - ${historical.updatedAt}`);
  }

  heading('Attachment manifest');
  if (!version.attachments.length) text('No attachments recorded.');
  for (const attachment of version.attachments) {
    text(`${attachment.fileName} - ${attachment.contentType} - ${attachment.sizeBytes} bytes`);
    text(`Digest: ${attachment.contentDigest}`, { indent: 4 });
  }

  heading('Record integrity');
  text(`Content digest: ${version.contentDigest}`);
  if (!options.clientCopy) {
    text(`Version record ID: ${version.id}`);
  }
  heading('Important notice');
  text(version.templateSnapshot.notice);

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GREY);
    doc.text(`Safety Plan ${version.version} | Page ${page} of ${pageCount}`, MARGIN, FOOTER_Y);
  }
  return doc;
}

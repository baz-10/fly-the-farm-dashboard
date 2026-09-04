const { TextEncoder, TextDecoder } = require('util');
if (!global.TextEncoder) global.TextEncoder = TextEncoder;
if (!global.TextDecoder) global.TextDecoder = TextDecoder;
const { jsPDF } = require('jspdf');
const { renderMissionPackPdf } = require('./mission-pack-renderer');
const { renderMissionSummaryPdf } = require('./mission-summary-renderer');
const { buildMissionSummaryViewModel } = require('./report-view-models');

const GREEN = [17, 68, 36];
const GREEN_LIGHT = [237, 246, 239];
const INK = [21, 42, 28];
const MUTED = [85, 103, 90];
const LINE = [209, 221, 212];
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 16;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function get(object, ...paths) {
  for (const path of paths) {
    let current = object;
    for (const part of path.split('.')) current = current == null ? undefined : current[part];
    if (current !== undefined && current !== null) return current;
  }
  return undefined;
}

function humanise(key) {
  return String(key || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b(id|abn|crs|kml|kmz|jsa|gps|pic|api)\b/gi, match => match.toUpperCase())
    .replace(/^./, character => character.toUpperCase());
}

function display(value) {
  if (value === null || value === undefined || value === '') return 'Not recorded';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value).replace(/[\u2010-\u2015]/g, '-');
}

function rows(value, prefix = '', output = []) {
  if (output.length >= 160) return output;
  if (Array.isArray(value)) {
    if (!value.length) output.push([humanise(prefix || 'Items'), 'None recorded']);
    value.forEach((item, index) => rows(item, `${prefix}${prefix ? ' ' : ''}${index + 1}`, output));
    return output;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) output.push([humanise(prefix || 'Details'), 'None recorded']);
    entries.forEach(([key, item]) => rows(item, `${prefix}${prefix ? ' - ' : ''}${humanise(key)}`, output));
    return output;
  }
  output.push([prefix || 'Value', display(value)]);
  return output;
}

function reportSections(reportType, evidence) {
  if (reportType === 'MISSION_PACK') {
    const pack = get(evidence, 'missionPackRevision.pack_snapshot', 'missionPackRevision.packSnapshot', 'missionPackRevision') || {};
    const authorised = get(pack, 'evidence', 'authorisation.evidence_manifest', 'authorisation.evidenceManifest') || {};
    return [
      ['Planning Evidence', authorised.planning || {}],
      ['Pre-flight Evidence', authorised.preflight || {}],
      ['Mission Readiness', pack.readiness || get(pack, 'authorisation.readiness_snapshot', 'authorisation.readinessSnapshot') || {}],
    ];
  }
  const completion = evidence.completionRevision || {};
  if (completion.daily_evidence_digest || completion.dailyEvidenceDigest) {
    const model = buildMissionSummaryViewModel({ evidence: { missionId: evidence.missionId || evidence.mission_id, completionRevision: completion } });
    const frozenSections = [['Frozen Mission Scope', model.scope], ['CRP and JSA Authority', model.approval], ...model.operatingDays.map(day => [`Operating Day - ${day.workDate}`, day]), ['Recorded Exceptions', model.exceptions || []]];
    if (model.evidenceGaps.length) frozenSections.push(['Evidence Availability', model.evidenceGaps]);
    frozenSections.push(['Final Sign-off', model.finalSignoff]);
    return frozenSections;
  }
  const snapshot = completion.completion_snapshot || completion.completionSnapshot || {};
  const authorisation = snapshot.planningAndPreflightAuthorisation || snapshot.planning_and_preflight_authorisation || {};
  const manifest = authorisation.evidence_manifest || authorisation.evidenceManifest || {};
  const completionSummary = {
    revisionId: completion.id,
    version: completion.version_number || completion.version,
    declaration: completion.declaration,
    completedAt: completion.completed_at || snapshot.completedAt,
    flightLinesOverride: completion.flight_lines_override,
    overrideReason: completion.override_reason,
    historicalFlag: snapshot.historicalFlag,
  };
  return [
    ['Planning Evidence', manifest.planning || {}],
    ['Pre-flight Evidence', manifest.preflight || {}],
    ['Operational Evidence', snapshot.operationalEvidence || snapshot.operational_evidence || {}],
    ['Completion Evidence', completionSummary],
    ['Mission Outcomes', evidence.missionOutcomes || []],
    ['Customer Outcome', evidence.customerOutcomes || []],
  ];
}

function evidenceRegister(evidence) {
  const register = [];
  const visit = (value, path = '') => {
    if (register.length >= 100 || value == null) return;
    if (Array.isArray(value)) return value.forEach((item, index) => visit(item, `${path}[${index + 1}]`));
    if (typeof value === 'object') return Object.entries(value).forEach(([key, item]) => visit(item, path ? `${path}.${key}` : key));
    if (/(^|_)(id|checksum|version|version_number)$/i.test(path.split('.').pop() || '') || /RevisionId|FileId|checksum|version/i.test(path)) register.push([humanise(path), display(value)]);
  };
  visit(evidence);
  return register.length ? register : [['Mission ID', display(evidence.missionId || evidence.mission_id)]];
}

function brandingDetails(branding) {
  const profile = branding.profile || {};
  return {
    name: branding.displayName || profile.report_display_name || profile.trading_name || profile.legal_business_name || profile.name || 'Organisation',
    legalName: branding.legalBusinessName || profile.legal_business_name,
    identifierType: get(branding, 'businessIdentifier.type') || profile.business_identifier_type,
    identifierValue: get(branding, 'businessIdentifier.value') || profile.business_identifier_value,
    email: get(branding, 'contact.email') || profile.primary_email,
    phone: get(branding, 'contact.phone') || profile.primary_phone,
    website: get(branding, 'contact.website') || profile.website,
    attribution: branding.attribution || branding.attributionText || 'Generated by Spray Command',
    logoData: branding.logoData || branding.logoDataUri || get(branding, 'logo.dataUri'),
    logoType: branding.logoType || get(branding, 'logo.contentType'),
  };
}

function renderReportPdf({ reportType, templateVersion = 2, branding = {}, evidence = {}, artefact = {} }) {
  if (reportType === 'MISSION_PACK') return renderMissionPackPdf({ reportType, templateVersion, branding, evidence, artefact });
  if (reportType === 'MISSION_SUMMARY') return renderMissionSummaryPdf({ reportType, templateVersion, branding, evidence, artefact });
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: false, putOnlyUsedFonts: true });
  doc.setFileId('00000000000000000000000000000000');
  doc.setCreationDate(new Date(artefact.createdAt || '2000-01-01T00:00:00.000Z'));
  const title = reportType === 'MISSION_RECORD' ? 'Mission Record' : 'Mission Pack';
  doc.setProperties({ title, author: 'Spray Command', creator: 'Spray Command', subject: `Artefact ${artefact.id || ''}` });
  const identity = brandingDetails(branding);
  let y = 0;

  const addHeader = first => {
    doc.setFillColor(...GREEN);
    doc.rect(0, 0, PAGE_WIDTH, first ? 46 : 22, 'F');
    if (first && identity.logoData) {
      try { doc.addImage(identity.logoData, identity.logoType?.includes('png') ? 'PNG' : 'JPEG', MARGIN, 8, 30, 18, undefined, 'FAST'); } catch { /* retain report if a historical logo cannot be rendered */ }
    }
    const left = first && identity.logoData ? 50 : MARGIN;
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(first ? 17 : 11);
    doc.text(identity.name, left, first ? 15 : 10);
    doc.setFontSize(first ? 22 : 14);
    doc.text(title, left, first ? 29 : 17);
    if (first) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      const contact = [identity.email, identity.phone, identity.website].filter(Boolean).join('  |  ');
      if (contact) doc.text(contact, left, 38);
      const identifier = [identity.identifierType, identity.identifierValue].filter(Boolean).join(' ');
      if (identifier) doc.text(identifier, PAGE_WIDTH - MARGIN, 15, { align: 'right' });
      doc.text(`Report v${artefact.version || artefact.version_number || 1}  |  Template v${templateVersion}`, PAGE_WIDTH - MARGIN, 29, { align: 'right' });
    }
    doc.setTextColor(...INK);
    y = first ? 55 : 30;
  };

  const newPage = () => { doc.addPage(); addHeader(false); };
  const ensure = height => {
    if (y + height > 278) { newPage(); return true; }
    return false;
  };

  const section = (heading, value, suppliedRows) => {
    const sectionRows = suppliedRows || rows(value);
    const drawSectionHeading = continued => {
      doc.setFillColor(...GREEN_LIGHT);
      doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 10, 2, 2, 'F');
      doc.setTextColor(...GREEN);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11.5);
      doc.text(`${heading}${continued ? ' (continued)' : ''}`, MARGIN + 4, y + 6.7);
      doc.setTextColor(...INK);
      y += 14;
    };
    ensure(14);
    drawSectionHeading(false);
    if (!sectionRows.length) sectionRows.push(['Status', 'No evidence recorded']);
    for (const [label, entry] of sectionRows) {
      const labelLines = doc.splitTextToSize(display(label), 54);
      const valueLines = doc.splitTextToSize(display(entry), 112);
      const height = Math.max(labelLines.length, valueLines.length) * 4.5 + 4;
      if (ensure(height)) drawSectionHeading(true);
      doc.setDrawColor(...LINE);
      doc.line(MARGIN, y + height, PAGE_WIDTH - MARGIN, y + height);
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...MUTED);
      doc.text(labelLines, MARGIN + 2, y + 4.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...INK);
      doc.text(valueLines, MARGIN + 62, y + 4.5);
      y += height;
    }
    y += 6;
  };

  addHeader(true);
  ensure(28);
  doc.setFillColor(247, 250, 247);
  doc.setDrawColor(...LINE);
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 24, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text('MISSION', MARGIN + 5, y + 7);
  doc.text('ARTEFACT', MARGIN + 69, y + 7);
  doc.text('GENERATED', MARGIN + 130, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  doc.text(display(evidence.missionId || evidence.mission_id), MARGIN + 5, y + 15, { maxWidth: 58 });
  doc.text(display(artefact.id || 'Pending'), MARGIN + 69, y + 15, { maxWidth: 55 });
  doc.text(display(artefact.createdAt || 'Not recorded'), MARGIN + 130, y + 15, { maxWidth: 43 });
  y += 32;

  for (const [heading, content] of reportSections(reportType, evidence)) section(heading, content);
  section('Evidence Manifest', null, evidenceRegister(evidence));

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...LINE);
    doc.line(MARGIN, 285, PAGE_WIDTH - MARGIN, 285);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(identity.attribution, MARGIN, 291);
    doc.text(`${title}  |  ${artefact.id || 'Pending'}`, PAGE_WIDTH / 2, 291, { align: 'center' });
    doc.text(`Page ${page} of ${pages}`, PAGE_WIDTH - MARGIN, 291, { align: 'right' });
  }
  return Buffer.from(doc.output('arraybuffer'));
}

module.exports = { renderReportPdf };

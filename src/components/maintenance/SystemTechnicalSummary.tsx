import React from 'react';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import {
  Box,
  ButtonBase,
  Chip,
  Collapse,
  Divider,
  Stack,
  Typography,
} from '@mui/material';
import type {
  OrganisationFluidPreference,
  OrganisationPartPreference,
  TechnicalFluidCatalogueItem,
  TechnicalPartCatalogueItem,
} from '../../services/technicalCatalogueApi';

export type ScopedTechnicalPart = TechnicalPartCatalogueItem;
export type ScopedTechnicalFluid = TechnicalFluidCatalogueItem;

const value = (record: Record<string, unknown> | undefined, ...keys: string[]) => {
  for (const key of keys) {
    const candidate = record?.[key];
    if (candidate !== undefined && candidate !== null && candidate !== '') return candidate;
  }
  return undefined;
};

export const authorityLabel = (authority: unknown) => ({
  MANUFACTURER: 'Manufacturer',
  ORGANISATION_STANDARD: 'Organisation standard',
  VERIFIED_TECHNICAL_SOURCE: 'Verified technical source',
} as Record<string, string>)[String(authority)] || String(authority || 'Authority unavailable').replaceAll('_', ' ').toLowerCase();

export const evidenceLabel = (evidenceValue: unknown) => {
  const evidence = evidenceValue && typeof evidenceValue === 'object' ? evidenceValue as Record<string, unknown> : {};
  const title = value(evidence, 'title', 'documentTitle', 'document_title', 'sourceTitle', 'source_title');
  const reference = value(evidence, 'reference', 'referenceCode', 'reference_code');
  const page = value(evidence, 'page', 'pageNumber', 'page_number');
  if (title && reference && page !== undefined) return `${title} · ${reference} · page ${page}`;
  if (title && reference) return `${title} · ${reference}`;
  if (title && page !== undefined) return `${title} · page ${page}`;
  if (reference && page !== undefined) return `${reference} · page ${page}`;
  if (title) return String(title);
  if (reference) return String(reference);
  if (page !== undefined) return `page ${page}`;
  return 'Evidence reference unavailable';
};

const titleCase = (input: unknown) => String(input || '').toLowerCase().replaceAll('_', ' ').replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
const sentenceCase = (input: unknown) => {
  const words = String(input || '').toLowerCase().replaceAll('_', ' ');
  return words ? words[0].toUpperCase() + words.slice(1) : words;
};

const PreferenceLine = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <Box>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
    <Typography variant="body2">{children}</Typography>
  </Box>
);

function PartPreferenceSummary({ part, preference }: { part: ScopedTechnicalPart; preference: OrganisationPartPreference }) {
  const description = value(part.partVersion, 'technical_description', 'description') || titleCase(part.applicationCode);
  return (
    <Box sx={{ py: 1.5 }}>
      <Typography fontWeight={700}>{String(description)}</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} flexWrap="wrap" sx={{ mt: 0.75 }}>
        {value(preference, 'preferred_supplier') && <PreferenceLine label="Preferred supplier">{String(value(preference, 'preferred_supplier'))}</PreferenceLine>}
        {value(preference, 'supplier_sku') && <PreferenceLine label="Supplier SKU">{String(value(preference, 'supplier_sku'))}</PreferenceLine>}
        {value(preference, 'internal_sku') && <PreferenceLine label="Internal SKU">{String(value(preference, 'internal_sku'))}</PreferenceLine>}
      </Stack>
    </Box>
  );
}

function FluidPreferenceSummary({ fluid, preference }: { fluid: ScopedTechnicalFluid; preference: OrganisationFluidPreference }) {
  const grade = value(fluid.specificationVersion, 'viscosity_or_grade', 'viscosityOrGrade') || value(fluid.specification, 'display_name', 'name');
  const packageQuantity = value(preference, 'package_quantity', 'packageQuantity');
  const packageUnit = value(preference, 'package_unit_code', 'packageUnitCode') || fluid.unitCode;
  return (
    <Box sx={{ py: 1.5 }}>
      <Typography fontWeight={700}>{String(grade || titleCase(fluid.servicePoint))}</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} flexWrap="wrap" sx={{ mt: 0.75 }}>
        <PreferenceLine label="Preferred product">{String(value(preference, 'preferred_product') || 'Not recorded')}</PreferenceLine>
        {value(preference, 'preferred_brand') && <PreferenceLine label="Preferred brand">{String(value(preference, 'preferred_brand'))}</PreferenceLine>}
        {packageQuantity && <PreferenceLine label="Package">{String(packageQuantity)} {String(packageUnit)} package</PreferenceLine>}
      </Stack>
    </Box>
  );
}

function PartRequirement({ part, positions }: {
  part: ScopedTechnicalPart;
  positions: Array<{ id: string; code: string; name: string }>;
}) {
  const version = part.partVersion;
  const identity = part.part;
  const positionName = part.componentPositionName || positions.find((candidate) => candidate.id === part.componentPositionId || candidate.code === part.componentPositionCode)?.name;
  const description = value(version, 'technical_description', 'description') || titleCase(part.applicationCode);
  const partNumber = value(version, 'manufacturer_part_number', 'manufacturerPartNumber') || value(identity, 'manufacturer_part_number', 'manufacturerPartNumber');
  const authority = value(version, 'authority_type', 'authorityType');
  return (
    <Box sx={{ py: 1.5 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'flex-start' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography fontWeight={700}>{String(description)}</Typography>
          {positionName && <Typography variant="caption" color="text.secondary">{positionName}</Typography>}
          <Typography variant="body2">{String(partNumber || 'Part number unavailable')} · {part.quantity} {part.unitCode}</Typography>
        </Box>
        <Chip label={authorityLabel(authority)} size="small" variant="outlined" color="primary" />
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
        {evidenceLabel(value(version, 'evidence'))}
      </Typography>
    </Box>
  );
}

function FluidRequirement({ fluid, positions }: {
  fluid: ScopedTechnicalFluid;
  positions: Array<{ id: string; code: string; name: string }>;
}) {
  const version = fluid.specificationVersion;
  const positionName = fluid.componentPositionName || positions.find((candidate) => candidate.id === fluid.componentPositionId || candidate.code === fluid.componentPositionCode)?.name;
  const grade = value(version, 'viscosity_or_grade', 'viscosityOrGrade') || value(fluid.specification, 'display_name', 'name');
  const standards = value(version, 'technical_standards', 'technicalStandards');
  const authority = value(version, 'authority_type', 'authorityType');
  return (
    <Box sx={{ py: 1.5 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'flex-start' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography fontWeight={700}>{String(grade || titleCase(fluid.servicePoint))}</Typography>
          {positionName && <Typography variant="caption" color="text.secondary">{positionName}</Typography>}
          {Array.isArray(standards) && standards.length > 0 && (
            <Typography variant="body2">
              {standards.map((standard, index) => (
                <React.Fragment key={`${String(standard)}-${index}`}>
                  {index > 0 ? ' · ' : ''}{String(standard)}
                </React.Fragment>
              ))}
            </Typography>
          )}
          <Typography variant="body2">{fluid.quantity} {fluid.unitCode} · {sentenceCase(fluid.capacitySemantics)}</Typography>
          {(fluid.approximate || fluid.tolerance) && (
            <Typography variant="caption" color="text.secondary">
              {fluid.approximate ? 'Approximate' : 'Manufacturer tolerance'}{fluid.tolerance ? ` · ${fluid.tolerance}` : ''}
            </Typography>
          )}
        </Box>
        <Chip label={authorityLabel(authority)} size="small" variant="outlined" color="primary" />
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
        {evidenceLabel(value(version, 'evidence'))}
      </Typography>
    </Box>
  );
}

export function SystemTechnicalSummary({
  system,
  positions,
  parts,
  fluids,
  partPreferences,
  fluidPreferences,
  expanded,
  onToggle,
}: {
  system: { id: string; code: string; name: string };
  positions: Array<{ id: string; code: string; name: string }>;
  parts: ScopedTechnicalPart[];
  fluids: ScopedTechnicalFluid[];
  partPreferences: OrganisationPartPreference[];
  fluidPreferences: OrganisationFluidPreference[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const count = parts.length + fluids.length;
  const panelId = `technical-system-${system.id}`;
  const partSummary = `${parts.length} ${parts.length === 1 ? 'part' : 'parts'}`;
  const fluidSummary = `${fluids.length} ${fluids.length === 1 ? 'fluid' : 'fluids'}`;
  const kindSummary = parts.length > 0 && fluids.length > 0
    ? `${partSummary} · ${fluidSummary}`
    : parts.length > 0 ? partSummary : fluidSummary;
  const preferredParts = parts.filter((part) => partPreferences.some((preference) => preference.technical_part_id === String(value(part.part, 'id'))));
  const preferredFluids = fluids.filter((fluid) => fluidPreferences.some((preference) => preference.technical_fluid_specification_id === String(value(fluid.specification, 'id'))));
  return (
    <Box sx={{ border: '1px solid', borderColor: expanded ? 'primary.main' : 'divider', borderRadius: 2, overflow: 'hidden', bgcolor: 'background.paper' }}>
      <ButtonBase
        onClick={onToggle}
        aria-label={`${system.name} · ${count} ${count === 1 ? 'specification' : 'specifications'}`}
        aria-expanded={expanded}
        aria-controls={panelId}
        sx={{ width: '100%', px: { xs: 1.5, sm: 2 }, py: 1.5, justifyContent: 'space-between', textAlign: 'left', '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.light', outlineOffset: -3 } }}
      >
        <Box>
          <Typography fontWeight={700}>{system.name}</Typography>
          <Typography variant="caption" color="text.secondary">{kindSummary}</Typography>
        </Box>
        <ExpandMoreRoundedIcon aria-hidden sx={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 160ms ease', '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }} />
      </ButtonBase>
      <Collapse in={expanded} unmountOnExit>
        <Box id={panelId} sx={{ borderTop: '1px solid', borderColor: 'divider', p: { xs: 1.5, sm: 2 } }}>
          <Box component="section" role="region" aria-label="Technical requirement">
            <Typography variant="overline" color="primary.main">Technical requirement</Typography>
            <Typography variant="body2" color="text.secondary">Authoritative fit, specification and quantity.</Typography>
            <Stack divider={<Divider flexItem />} sx={{ mt: 0.5 }}>
              {parts.map((part) => <PartRequirement key={part.requirementId || part.applicabilityId} part={part} positions={positions} />)}
              {fluids.map((fluid) => <FluidRequirement key={fluid.requirementId || fluid.applicabilityId} fluid={fluid} positions={positions} />)}
            </Stack>
          </Box>
          <Divider sx={{ my: 1.5 }} />
          <Box component="section" role="region" aria-label="Our preference">
            <Typography variant="overline" color="success.dark">Our preference</Typography>
            <Typography variant="body2" color="text.secondary">Private purchasing choices for this organisation. They do not change the technical requirement.</Typography>
            {preferredParts.length === 0 && preferredFluids.length === 0 ? (
              <Typography variant="body2" sx={{ mt: 1 }}>No organisation preference recorded.</Typography>
            ) : (
              <Stack divider={<Divider flexItem />} sx={{ mt: 0.5 }}>
                {preferredParts.map((part) => <PartPreferenceSummary key={part.requirementId || part.applicabilityId} part={part} preference={partPreferences.find((preference) => preference.technical_part_id === String(value(part.part, 'id')))!} />)}
                {preferredFluids.map((fluid) => <FluidPreferenceSummary key={fluid.requirementId || fluid.applicabilityId} fluid={fluid} preference={fluidPreferences.find((preference) => preference.technical_fluid_specification_id === String(value(fluid.specification, 'id')))!} />)}
              </Stack>
            )}
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}

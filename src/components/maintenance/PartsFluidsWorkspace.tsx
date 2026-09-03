import React from 'react';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  Link,
  Stack,
  Typography,
} from '@mui/material';
import type {
  ApplicableServiceTemplateAggregate,
  AssetSource,
  AssetTechnicalCatalogue,
  OrganisationTechnicalPreferences,
  ResolvedAssetRoute,
} from '../../services/technicalCatalogueApi';
import {
  authorityLabel,
  evidenceLabel,
  SystemTechnicalSummary,
} from './SystemTechnicalSummary';

export type TechnicalWorkspaceCatalogue = AssetTechnicalCatalogue;

export interface TechnicalWorkspaceApi {
  resolveAssetRoute(source: AssetSource, sourceRecordId: string): Promise<ResolvedAssetRoute>;
  lookupAsset(assetId: string, asOf: string): Promise<TechnicalWorkspaceCatalogue>;
  readPreferences(): Promise<OrganisationTechnicalPreferences>;
  readServiceTemplateVersion(assetId: string, templateVersionId: string, asOf: string): Promise<ApplicableServiceTemplateAggregate>;
}

const titleCase = (input: unknown) => String(input || '').toLowerCase().replaceAll('_', ' ').replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
const recordValue = (record: Record<string, unknown> | undefined, ...keys: string[]) => {
  for (const key of keys) {
    const candidate = record?.[key];
    if (candidate !== undefined && candidate !== null && candidate !== '') return candidate;
  }
  return undefined;
};

const conditionLabel = (conditionValue: unknown) => {
  if (typeof conditionValue === 'string') return conditionValue;
  const condition = conditionValue && typeof conditionValue === 'object' ? conditionValue as Record<string, unknown> : undefined;
  return String(recordValue(condition, 'summary', 'description', 'requirement', 'when') || '');
};

const detailEvidenceLabel = (evidenceValue: unknown) => {
  if (typeof evidenceValue === 'string') return evidenceValue;
  const evidence = evidenceValue && typeof evidenceValue === 'object' ? evidenceValue as Record<string, unknown> : undefined;
  if (recordValue(evidence, 'photo') === true) return 'Photo required';
  const expectation = recordValue(evidence, 'summary', 'description', 'type');
  return expectation ? String(expectation) : evidenceLabel(evidenceValue);
};

function DetailMetadata({ condition, evidence, notes }: { condition?: unknown; evidence?: unknown; notes?: unknown }) {
  const conditionText = conditionLabel(condition);
  if (!conditionText && !evidence && !notes) return null;
  return (
    <Stack spacing={0.5} sx={{ mt: 0.5 }}>
      {conditionText && <Box><Typography variant="caption" color="text.secondary">Condition</Typography><Typography variant="body2">{conditionText}</Typography></Box>}
      {Boolean(notes) && <Box><Typography variant="caption" color="text.secondary">Notes</Typography><Typography variant="body2">{String(notes)}</Typography></Box>}
      {Boolean(evidence) && <Box><Typography variant="caption" color="text.secondary">Evidence</Typography><Typography variant="body2">{detailEvidenceLabel(evidence)}</Typography></Box>}
    </Stack>
  );
}

const applicabilityScopeLabel = (applicability: Record<string, unknown>) => {
  const manufacturer = recordValue(applicability, 'manufacturerScope', 'manufacturer_scope');
  const model = recordValue(applicability, 'modelScope', 'model_scope');
  const system = recordValue(applicability, 'systemCode', 'system_code');
  const position = recordValue(applicability, 'componentPositionCode', 'component_position_code');
  if (manufacturer && model && system && position) return `${manufacturer} · ${model} · ${titleCase(system)} · ${titleCase(position)}`;
  if (manufacturer && model && system) return `${manufacturer} · ${model} · ${titleCase(system)}`;
  if (manufacturer && model) return `${manufacturer} · ${model}`;
  if (system && position) return `${titleCase(system)} · ${titleCase(position)}`;
  if (system) return titleCase(system);
  return 'Exact asset scope';
};

function ServiceKitDetails({ aggregate }: { aggregate: ApplicableServiceTemplateAggregate }) {
  return (
    <Stack spacing={2}>
      <Box>
        <Typography fontWeight={700}>Version {aggregate.version.versionNumber} · {titleCase(aggregate.version.lifecycleState)}</Typography>
        <Typography variant="body2" color="text.secondary">{aggregate.version.description}</Typography>
        <Typography variant="caption" color="text.secondary">{evidenceLabel(aggregate.version.evidence)}</Typography>
      </Box>
      {aggregate.applicability.length > 0 && <Box><Typography component="h3" variant="overline">Applicability</Typography>{aggregate.applicability.map((applicability) => <Box key={applicability.id} sx={{ py: 0.75 }}><Typography variant="body2" fontWeight={700}>{applicabilityScopeLabel(applicability)}</Typography><DetailMetadata notes={recordValue(applicability, 'notes', 'applicabilityNotes', 'applicability_notes')} evidence={recordValue(applicability, 'evidence')} /></Box>)}</Box>}
      {aggregate.actions.length > 0 && <Box><Typography component="h3" variant="overline">Actions</Typography>{aggregate.actions.map((action) => <Box key={action.id} sx={{ py: 0.75 }}><Typography variant="body2">{action.description} · {titleCase(action.disposition)}</Typography><DetailMetadata condition={recordValue(action, 'condition', 'conditionData', 'condition_data')} evidence={recordValue(action, 'expectedEvidence', 'expected_evidence')} /></Box>)}</Box>}
      {aggregate.partLines.length > 0 && <Box><Typography component="h3" variant="overline">Parts</Typography>{aggregate.partLines.map((line) => <Box key={line.id} sx={{ py: 0.75 }}><Typography variant="body2">{String(recordValue(line.partVersion, 'description', 'technical_description') || recordValue(line.part, 'manufacturerPartNumber', 'manufacturer_part_number'))} · {line.quantity} {line.unitCode} · {titleCase(recordValue(line, 'disposition'))}</Typography><DetailMetadata condition={recordValue(line, 'condition', 'conditionData', 'condition_data')} notes={recordValue(line, 'notes', 'lineNotes', 'line_notes')} evidence={recordValue(line.partVersion, 'evidence')} /></Box>)}</Box>}
      {aggregate.fluidLines.length > 0 && <Box><Typography component="h3" variant="overline">Fluids</Typography>{aggregate.fluidLines.map((line) => <Box key={line.id} sx={{ py: 0.75 }}><Typography variant="body2">{String(recordValue(line.specificationVersion, 'viscosityOrGrade', 'viscosity_or_grade') || recordValue(line.specification, 'name', 'display_name'))} · {line.quantity} {line.unitCode} · {titleCase(recordValue(line, 'disposition'))}</Typography><DetailMetadata condition={recordValue(line, 'condition', 'conditionData', 'condition_data')} notes={recordValue(line, 'notes', 'lineNotes', 'line_notes')} evidence={recordValue(line.specificationVersion, 'evidence')} /></Box>)}</Box>}
      {aggregate.inspections.length > 0 && <Box><Typography component="h3" variant="overline">Inspections</Typography>{aggregate.inspections.map((inspection) => <Box key={inspection.id} sx={{ py: 0.75 }}><Typography variant="body2">{inspection.description} · {titleCase(inspection.disposition)}</Typography><DetailMetadata condition={recordValue(inspection, 'condition', 'conditionData', 'condition_data')} evidence={recordValue(inspection, 'expectedEvidence', 'expected_evidence')} /></Box>)}</Box>}
      {aggregate.replacements.length > 0 && <Box><Typography component="h3" variant="overline">Replacement actions</Typography>{aggregate.replacements.map((replacement) => <Box key={replacement.id} sx={{ py: 0.75 }}><Typography variant="body2">{String(recordValue(replacement, 'expectation', 'replacementExpectation', 'replacement_expectation') || 'Replacement')} · {titleCase(recordValue(replacement, 'disposition'))} · {authorityLabel(recordValue(replacement, 'authorityType', 'authority_type'))}</Typography><DetailMetadata condition={recordValue(replacement, 'condition', 'conditionData', 'condition_data')} evidence={recordValue(replacement, 'evidence')} /></Box>)}</Box>}
      {aggregate.requirementLinks.length > 0 && (
        <Box>
          <Typography component="h3" variant="overline">Requirement links</Typography>
          <Typography variant="body2" color="text.secondary">A requirement link links this recipe to an authoritative maintenance requirement version; it does not schedule or decide when work is due.</Typography>
          {aggregate.requirementLinks.map((link) => <Box key={link.id} sx={{ py: 0.75 }}><Typography variant="body2" fontWeight={700}>{link.maintenanceRequirementVersionId}</Typography><Typography variant="caption" color="text.secondary">{titleCase(link.disposition)} · schema {link.requirementSchemaVersion}</Typography><DetailMetadata condition={recordValue(link, 'condition', 'conditionData', 'condition_data')} /></Box>)}
        </Box>
      )}
    </Stack>
  );
}

function ServiceKitSummary({
  template,
  expanded,
  onToggle,
  aggregate,
  loading,
  error,
  onRetry,
}: {
  template: TechnicalWorkspaceCatalogue['serviceTemplates'][number];
  expanded: boolean;
  onToggle: () => void;
  aggregate?: ApplicableServiceTemplateAggregate;
  loading: boolean;
  error?: string;
  onRetry: () => void;
}) {
  const panelId = `service-kit-${template.templateVersionId}`;
  return (
    <Box sx={{ border: '1px solid', borderColor: expanded ? 'primary.main' : 'divider', borderRadius: 2, overflow: 'hidden', bgcolor: 'background.paper' }}>
      <ButtonBase
        onClick={onToggle}
        aria-label={`${template.name} · ${authorityLabel(template.authorityType)}`}
        aria-expanded={expanded}
        aria-controls={panelId}
        sx={{ width: '100%', px: { xs: 1.5, sm: 2 }, py: 1.5, justifyContent: 'space-between', textAlign: 'left', '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.light', outlineOffset: -3 } }}
      >
        <Box>
          <Typography fontWeight={700}>{template.name}</Typography>
          <Typography variant="caption" color="text.secondary">{authorityLabel(template.authorityType)}</Typography>
        </Box>
        <ExpandMoreRoundedIcon aria-hidden sx={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 160ms ease', '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }} />
      </ButtonBase>
      <Collapse in={expanded} unmountOnExit>
        <Box id={panelId} sx={{ borderTop: '1px solid', borderColor: 'divider', p: { xs: 1.5, sm: 2 } }}>
          {loading && <Box role="status" aria-live="polite" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><CircularProgress size={18} />Loading authoritative Service Kit…</Box>}
          {error && <Alert severity="error" action={<Button color="inherit" onClick={onRetry}>Retry Service Kit</Button>}>{error}</Alert>}
          {aggregate && <ServiceKitDetails aggregate={aggregate} />}
        </Box>
      </Collapse>
    </Box>
  );
}

export function PartsFluidsWorkspace({ assetSource, sourceRecordId, asOf, api, view = 'all' }: {
  assetSource: AssetSource;
  sourceRecordId: string;
  asOf: string;
  api: TechnicalWorkspaceApi;
  view?: 'parts-fluids' | 'service-kits' | 'all';
}) {
  const [catalogue, setCatalogue] = React.useState<TechnicalWorkspaceCatalogue>();
  const [preferences, setPreferences] = React.useState<OrganisationTechnicalPreferences>();
  const [resolvedAsset, setResolvedAsset] = React.useState<ResolvedAssetRoute>();
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [expandedKey, setExpandedKey] = React.useState<string>();
  const [kitAggregates, setKitAggregates] = React.useState<Record<string, ApplicableServiceTemplateAggregate>>({});
  const [kitLoading, setKitLoading] = React.useState<string>();
  const [kitError, setKitError] = React.useState<Record<string, string>>({});
  const scopeKey = `${assetSource}:${sourceRecordId}:${asOf}:${view}`;
  const renderedScopeRef = React.useRef(scopeKey);
  const scopeGenerationRef = React.useRef(0);
  const scopeChanged = renderedScopeRef.current !== scopeKey;

  const clearScopeState = React.useCallback(() => {
    setLoading(true);
    setError('');
    setCatalogue(undefined);
    setPreferences(undefined);
    setResolvedAsset(undefined);
    setExpandedKey(undefined);
    setKitAggregates({});
    setKitLoading(undefined);
    setKitError({});
  }, []);

  const load = React.useCallback(async (generation: number) => {
    if (scopeGenerationRef.current !== generation) return;
    try {
      const resolved = await api.resolveAssetRoute(assetSource, sourceRecordId);
      if (scopeGenerationRef.current !== generation) return;
      const [nextCatalogue, nextPreferences] = await Promise.all([
        api.lookupAsset(resolved.registryId, asOf),
        view === 'service-kits' ? Promise.resolve({ parts: [], fluids: [] }) : api.readPreferences(),
      ]);
      if (scopeGenerationRef.current !== generation) return;
      setResolvedAsset(resolved);
      setCatalogue(nextCatalogue);
      setPreferences(nextPreferences);
    } catch (caught) {
      if (scopeGenerationRef.current !== generation) return;
      setError(caught instanceof Error ? caught.message : 'Technical information could not be loaded.');
    } finally {
      if (scopeGenerationRef.current === generation) setLoading(false);
    }
  }, [api, asOf, assetSource, sourceRecordId, view]);

  React.useEffect(() => {
    const generation = scopeGenerationRef.current + 1;
    scopeGenerationRef.current = generation;
    renderedScopeRef.current = scopeKey;
    clearScopeState();
    void load(generation);
    return () => {
      scopeGenerationRef.current += 1;
    };
  }, [clearScopeState, load, scopeKey]);

  const retryMain = () => {
    const generation = scopeGenerationRef.current + 1;
    scopeGenerationRef.current = generation;
    clearScopeState();
    void load(generation);
  };

  const toggleSystem = (systemId: string) => setExpandedKey((current) => current === `system:${systemId}` ? undefined : `system:${systemId}`);
  const loadKit = async (templateVersionId: string) => {
    const generation = scopeGenerationRef.current;
    const stateKey = `${generation}:${templateVersionId}`;
    if (kitLoading === stateKey) return;
    setKitLoading(stateKey);
    setKitError((current) => ({ ...current, [stateKey]: '' }));
    try {
      if (!resolvedAsset) throw new Error('Authoritative asset identity is unavailable.');
      const aggregate = await api.readServiceTemplateVersion(resolvedAsset.registryId, templateVersionId, asOf);
      if (scopeGenerationRef.current !== generation) return;
      setKitAggregates((current) => ({ ...current, [stateKey]: aggregate }));
    } catch (caught) {
      if (scopeGenerationRef.current !== generation) return;
      setKitError((current) => ({ ...current, [stateKey]: caught instanceof Error ? caught.message : 'Service Kit could not be loaded.' }));
    } finally {
      if (scopeGenerationRef.current === generation) setKitLoading((current) => current === stateKey ? undefined : current);
    }
  };
  const toggleKit = (templateVersionId: string) => {
    const stateKey = `${scopeGenerationRef.current}:${templateVersionId}`;
    const key = `kit:${stateKey}`;
    if (expandedKey === key) { setExpandedKey(undefined); return; }
    setExpandedKey(key);
    if (!kitAggregates[stateKey]) void loadKit(templateVersionId);
  };

  if (scopeChanged || loading) return <Box role="status" aria-live="polite" sx={{ mt: 2, p: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}><CircularProgress size={22} />Loading authoritative technical information…</Box>;
  if (error || !catalogue || !preferences || !resolvedAsset) return <Alert severity="error" sx={{ mt: 2 }} action={<Button color="inherit" onClick={retryMain}>Try again</Button>}>{error || 'Technical information could not be loaded.'}</Alert>;

  const systems = [
    ...catalogue.systems,
    ...[...catalogue.parts, ...catalogue.fluids]
      .filter((item) => item.systemId === null && !catalogue.systems.some((system) => system.code === item.systemCode))
      .map((item) => ({ id: `scope:${item.systemCode}`, code: item.systemCode, name: item.systemName })),
  ].filter((system, index, all) => all.findIndex((candidate) => candidate.id === system.id) === index);

  return (
    <Box sx={{ mt: 2 }}>
      {view !== 'service-kits' && <>
        <Box sx={{ mb: 2 }}>
          <Typography component="h2" variant="h5">Parts &amp; Fluids</Typography>
          <Typography variant="body2" color="text.secondary">Open one system to see authoritative fit, fluids and your organisation’s separate preferences.</Typography>
        </Box>
        <Stack spacing={1}>
          {systems.map((system) => {
            const parts = catalogue.parts.filter((part) => part.systemId === system.id || part.systemCode === system.code);
            const fluids = catalogue.fluids.filter((fluid) => fluid.systemId === system.id || fluid.systemCode === system.code);
            return (
              <SystemTechnicalSummary
                key={system.id}
                system={system}
                positions={catalogue.positions}
                parts={parts}
                fluids={fluids}
                partPreferences={preferences.parts}
                fluidPreferences={preferences.fluids}
                expanded={expandedKey === `system:${system.id}`}
                onToggle={() => toggleSystem(system.id)}
              />
            );
          })}
          {systems.length === 0 && <Alert severity="info">No technical systems are configured for this asset.</Alert>}
        </Stack>

        {catalogue.attachedAssets.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="overline" color="text.secondary">Attached assets</Typography>
            <Stack spacing={1}>
              {catalogue.attachedAssets.map((asset) => (
                <Link
                  key={asset.registryId}
                  href={`/assets/${asset.source}/${asset.sourceRecordId}/parts-fluids`}
                  aria-label={`${asset.identity} · Service information`}
                  underline="none"
                  sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid', borderColor: 'divider', borderRadius: 2, px: 2, py: 1.5, color: 'text.primary', '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.light' } }}
                >
                  <Typography fontWeight={700}>{asset.identity}</Typography>
                  <Typography variant="caption" color="text.secondary">Service information</Typography>
                </Link>
              ))}
            </Stack>
          </Box>
        )}
      </>}

      {view === 'all' && <Divider sx={{ my: 3 }} />}
      {view !== 'parts-fluids' && <>
        <Box sx={{ mb: 2 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
            <Typography component="h2" variant="h5">Service Kits</Typography>
            <Chip label="Optional" size="small" variant="outlined" />
          </Stack>
          <Typography variant="body2" color="text.secondary">Reusable, versioned recipes. They describe the work; they do not decide when it is due.</Typography>
        </Box>
        <Stack spacing={1}>
          {catalogue.serviceTemplates.map((template) => {
            const stateKey = `${scopeGenerationRef.current}:${template.templateVersionId}`;
            return <ServiceKitSummary
              key={template.templateVersionId}
              template={template}
              expanded={expandedKey === `kit:${stateKey}`}
              onToggle={() => void toggleKit(template.templateVersionId)}
              aggregate={kitAggregates[stateKey]}
              loading={kitLoading === stateKey}
              error={kitError[stateKey]}
              onRetry={() => void loadKit(template.templateVersionId)}
            />;
          })}
          {catalogue.serviceTemplates.length === 0 && <Alert severity="info">No optional Service Kits apply to this asset.</Alert>}
        </Stack>
      </>}
    </Box>
  );
}

import React from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Link,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  explainMaintenanceThreshold,
  getControllingMaintenanceThreshold,
  rankMaintenanceRequirements,
} from '../../domain/maintenance/dueState';
import { maintenanceApi } from '../../services/maintenanceApi';
import { technicalCatalogueApi, type AssetSource } from '../../services/technicalCatalogueApi';
import type {
  MaintenanceDueResult,
  MaintenanceDueState,
  MaintenanceEvidence,
  MaintenanceRequirementDueResult,
  MaintenanceThresholdResult,
} from '../../types/fleetMaintenance';

type RouteReader = Pick<typeof technicalCatalogueApi, 'resolveAssetRoute'>;
type DueReader = Pick<typeof maintenanceApi, 'readDueState'>;

export interface MaintenanceWorkspaceProps {
  assetSource: AssetSource;
  sourceRecordId: string;
  asOf: string;
  routeApi?: RouteReader;
  api?: DueReader;
}

type GroupKey = 'DUE_NOW' | 'DUE_SOON' | 'CURRENT' | 'NEEDS_ATTENTION';

const GROUPS: Array<{
  key: GroupKey;
  label: string;
  tone: string;
  background: string;
  includes: readonly MaintenanceDueState[];
}> = [
  { key: 'DUE_NOW', label: 'Due now', tone: '#a3261f', background: '#fff4f2', includes: ['OVERDUE', 'DUE'] },
  { key: 'DUE_SOON', label: 'Due soon', tone: '#99620b', background: '#fff8e8', includes: ['DUE_SOON'] },
  { key: 'CURRENT', label: 'Current', tone: '#377542', background: '#f3f8f3', includes: ['CURRENT'] },
  { key: 'NEEDS_ATTENTION', label: 'Needs attention', tone: '#665d45', background: '#f7f5ef', includes: ['INSUFFICIENT_DATA'] },
];

const STATE_LABELS: Record<MaintenanceDueState, string> = {
  CURRENT: 'Current',
  DUE_SOON: 'Due soon',
  DUE: 'Due',
  OVERDUE: 'Overdue',
  INSUFFICIENT_DATA: 'Needs attention',
};

const titleCase = (value: string): string => value
  .replaceAll('_', ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatNumber = (value: number): string => new Intl.NumberFormat('en-AU', {
  maximumFractionDigits: 2,
}).format(value);

const unitLabel = (unitCode: string | null, value: number): string => {
  if (unitCode === 'DAY') return Math.abs(value) === 1 ? 'day' : 'days';
  return unitCode ?? '';
};

const formatValue = (value: number, unitCode: string | null): string =>
  `${formatNumber(value)}${unitLabel(unitCode, value) ? ` ${unitLabel(unitCode, value)}` : ''}`;

const formatDate = (value: string): string => new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
}).format(new Date(`${value}T00:00:00.000Z`));

const authorityLabel = (requirement: MaintenanceRequirementDueResult): string => {
  if (requirement.authorityType === 'MANUFACTURER') return 'Manufacturer requirement';
  if (requirement.authorityType === 'ORGANISATION_STANDARD') return 'Organisation standard';
  return 'Condition-based authority';
};

const authorityTone = (requirement: MaintenanceRequirementDueResult) => requirement.authorityType === 'MANUFACTURER'
  ? { color: '#315b78', borderColor: '#8aa8bd', backgroundColor: '#f2f7fa' }
  : requirement.authorityType === 'ORGANISATION_STANDARD'
    ? { color: '#245f31', borderColor: '#8eb899', backgroundColor: '#edf6ef' }
    : { color: '#765412', borderColor: '#c9ad70', backgroundColor: '#fff8e8' };

const thresholdLabel = (threshold: MaintenanceThresholdResult): string => threshold.thresholdType === 'CALENDAR'
  ? 'Calendar'
  : threshold.thresholdType === 'METER'
    ? titleCase(threshold.meterType ?? 'Meter')
    : titleCase(threshold.thresholdType);

const remainingLabel = (threshold: MaintenanceThresholdResult): string => {
  const explanation = explainMaintenanceThreshold(threshold);
  if (!explanation.remaining) return 'Authoritative evidence required';
  const { value, unitCode } = explanation.remaining;
  if (value < 0) return `Overdue by ${formatValue(Math.abs(value), unitCode)}`;
  if (value === 0) return 'Due now';
  return `Due in ${formatValue(value, unitCode)}`;
};

function EvidenceList({ evidence }: { evidence: MaintenanceEvidence | null }) {
  if (!evidence) return <Typography variant="body2" color="text.secondary">No evidence reference returned.</Typography>;
  return (
    <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(110px, auto) 1fr' }, gap: 0.5, m: 0 }}>
      {Object.entries(evidence).map(([key, value]) => (
        <React.Fragment key={key}>
          <Typography component="dt" variant="caption" color="text.secondary">{titleCase(key)}</Typography>
          <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere' }}>
            {typeof value === 'string' || typeof value === 'number' ? String(value) : JSON.stringify(value)}
          </Typography>
        </React.Fragment>
      ))}
    </Box>
  );
}

function EvidenceFact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography component="dt" variant="caption" color="text.secondary" sx={{ letterSpacing: '0.04em' }}>{label}</Typography>
      <Typography component="dd" variant="body2" fontWeight={700} sx={{ m: 0 }}>{children}</Typography>
    </Box>
  );
}

function RequirementDetail({
  requirement,
  source,
  sourceRecordId,
}: {
  requirement: MaintenanceRequirementDueResult;
  source: AssetSource;
  sourceRecordId: string;
}) {
  const controlling = getControllingMaintenanceThreshold(requirement);
  const explanation = explainMaintenanceThreshold(controlling);
  return (
    <Box
      role="region"
      aria-label={`${requirement.requirementName} details`}
      sx={{ borderTop: '1px solid', borderColor: 'divider', px: { xs: 2, sm: 2.5 }, py: 2.25, backgroundColor: '#fff' }}
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'center' }} justifyContent="space-between">
        <Typography variant="h6" sx={{ color: '#0b3217', fontWeight: 850 }}>{remainingLabel(controlling)}</Typography>
        <Chip
          size="small"
          variant="outlined"
          label={authorityLabel(requirement)}
          sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, fontWeight: 800, ...authorityTone(requirement) }}
        />
      </Stack>

      <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 2, my: 2.25 }}>
        <EvidenceFact label="Controlling threshold">{thresholdLabel(controlling)}</EvidenceFact>
        {explanation.current?.value !== null && explanation.current?.value !== undefined && (
          <EvidenceFact label="Current">{formatValue(explanation.current.value, controlling.unitCode)}</EvidenceFact>
        )}
        {explanation.due?.value !== null && explanation.due?.value !== undefined && (
          <EvidenceFact label="Due">{formatValue(explanation.due.value, controlling.unitCode)}</EvidenceFact>
        )}
        {explanation.due?.date && <EvidenceFact label="Due date">{formatDate(explanation.due.date)}</EvidenceFact>}
        {explanation.dueSoonRule && <EvidenceFact label="Due-soon window">{formatValue(explanation.dueSoonRule.value, explanation.dueSoonRule.unitCode)}</EvidenceFact>}
        <EvidenceFact label="Requirement version">{requirement.requirementVersionId}</EvidenceFact>
      </Box>

      <Stack spacing={1} sx={{ mb: 2 }}>
        {requirement.thresholds.map((threshold) => (
          <Box key={threshold.thresholdId} sx={{ borderLeft: threshold.thresholdId === requirement.controllingThresholdId ? '3px solid #377542' : '3px solid #d9e4da', pl: 1.5 }}>
            <Typography variant="body2" fontWeight={800}>
              {thresholdLabel(threshold)}{threshold.thresholdId === requirement.controllingThresholdId ? ' · Controlling' : ''}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {remainingLabel(threshold)}{threshold.dueDate ? ` · ${formatDate(threshold.dueDate)}` : ''}
            </Typography>
          </Box>
        ))}
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
        <Paper variant="outlined" sx={{ p: 1.75, borderColor: '#d9e4da' }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Authority evidence</Typography>
          <EvidenceList evidence={requirement.evidence} />
        </Paper>
        <Paper variant="outlined" sx={{ p: 1.75, borderColor: '#d9e4da' }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Baseline evidence</Typography>
          <EvidenceList evidence={explanation.baseline?.evidence ?? null} />
        </Paper>
      </Box>

      <Box sx={{ mt: 2 }}>
        {requirement.serviceKitVersionId ? (
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'center' }}>
            <Chip label="Service Kit linked" size="small" variant="outlined" />
            <Link href={`/assets/${source}/${sourceRecordId}/service-kits`} underline="hover" fontWeight={800}>Open linked Service Kit</Link>
          </Stack>
        ) : <Typography variant="body2" color="text.secondary">No Service Kit linked</Typography>}
      </Box>
    </Box>
  );
}

function RequirementCard({
  requirement,
  expanded,
  onToggle,
  source,
  sourceRecordId,
}: {
  requirement: MaintenanceRequirementDueResult;
  expanded: boolean;
  onToggle: () => void;
  source: AssetSource;
  sourceRecordId: string;
}) {
  const controlling = getControllingMaintenanceThreshold(requirement);
  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden', borderColor: expanded ? '#8eb899' : '#d9e4da', borderRadius: 2 }}>
      <Button
        fullWidth
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`requirement-${requirement.requirementVersionId}`}
        aria-label={`${requirement.requirementName} · ${STATE_LABELS[requirement.state]}`}
        sx={{ color: 'text.primary', textTransform: 'none', justifyContent: 'space-between', textAlign: 'left', px: { xs: 2, sm: 2.5 }, py: 1.6 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography fontWeight={850} noWrap>{requirement.requirementName}</Typography>
          <Typography variant="body2" color="text.secondary">{remainingLabel(controlling)} · {authorityLabel(requirement)}</Typography>
        </Box>
        <Stack direction="row" alignItems="center" gap={1} sx={{ ml: 1 }}>
          <Chip label={STATE_LABELS[requirement.state]} size="small" variant="outlined" />
          <ExpandMoreIcon sx={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease', '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }} />
        </Stack>
      </Button>
      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <Box id={`requirement-${requirement.requirementVersionId}`}>
          <RequirementDetail requirement={requirement} source={source} sourceRecordId={sourceRecordId} />
        </Box>
      </Collapse>
    </Paper>
  );
}

function AttachedMaintenance({ result }: { result: MaintenanceDueResult }) {
  if (result.attachedAssetSummaries.length === 0) return null;
  const attention = result.attachedAssetSummaries.flatMap((attached) =>
    rankMaintenanceRequirements(attached.dueState.requirements)
      .filter((requirement) => requirement.state !== 'CURRENT')
      .map((requirement) => ({ registryId: attached.registryId, requirement })));
  return (
    <Paper component="section" role="region" aria-label="Attached equipment maintenance" variant="outlined" sx={{ mt: 2, borderColor: attention.length ? '#d3b268' : '#d9e4da', borderRadius: 2, overflow: 'hidden' }}>
      <Box sx={{ borderLeft: `4px solid ${attention.length ? '#99620b' : '#377542'}`, px: 2, py: 1.75 }}>
        <Typography variant="overline" color="text.secondary">Attached equipment</Typography>
        <Typography variant="h6" sx={{ color: '#0b3217', fontWeight: 850 }}>
          {attention.length ? 'Attached equipment requires attention' : 'Attached equipment is current'}
        </Typography>
        <Typography variant="body2" color="text.secondary">Child requirements stay with the child asset and do not change this asset’s maintenance state.</Typography>
      </Box>
      {attention.length > 0 && (
        <Stack spacing={0} divider={<Box sx={{ borderTop: '1px solid', borderColor: 'divider' }} />}>
          {attention.map(({ registryId, requirement }) => (
            <Stack key={`${registryId}:${requirement.requirementVersionId}`} direction={{ xs: 'column', sm: 'row' }} gap={0.5} justifyContent="space-between" sx={{ px: 2, py: 1.25 }}>
              <Box>
                <Typography fontWeight={800}>{requirement.requirementName}</Typography>
                <Typography variant="caption" color="text.secondary">Attached registry {registryId}</Typography>
              </Box>
              <Typography variant="body2" fontWeight={800} color="#765412">{STATE_LABELS[requirement.state]}</Typography>
            </Stack>
          ))}
        </Stack>
      )}
    </Paper>
  );
}

export function MaintenanceWorkspace({
  assetSource,
  sourceRecordId,
  asOf,
  routeApi = technicalCatalogueApi,
  api = maintenanceApi,
}: MaintenanceWorkspaceProps) {
  const [result, setResult] = React.useState<MaintenanceDueResult>();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [retry, setRetry] = React.useState(0);
  const [expandedGroup, setExpandedGroup] = React.useState<GroupKey>();
  const [expandedRequirement, setExpandedRequirement] = React.useState<string>();
  const generationRef = React.useRef(0);

  React.useEffect(() => {
    const generation = ++generationRef.current;
    setResult(undefined);
    setLoading(true);
    setError('');
    setExpandedGroup(undefined);
    setExpandedRequirement(undefined);
    void (async () => {
      try {
        const resolved = await routeApi.resolveAssetRoute(assetSource, sourceRecordId);
        const projection = await api.readDueState(resolved.registryId, asOf);
        if (generationRef.current !== generation) return;
        setResult(projection);
      } catch (caught) {
        if (generationRef.current !== generation) return;
        setError(caught instanceof Error ? caught.message : 'Maintenance projection could not be loaded.');
      } finally {
        if (generationRef.current === generation) setLoading(false);
      }
    })();
    return () => { if (generationRef.current === generation) generationRef.current += 1; };
  }, [api, asOf, assetSource, retry, routeApi, sourceRecordId]);

  if (loading) return (
    <Box role="status" aria-live="polite" sx={{ mt: 2, p: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <CircularProgress size={22} />Loading authoritative maintenance…
    </Box>
  );
  if (error || !result) return (
    <Alert severity="error" sx={{ mt: 2 }} action={<Button color="inherit" onClick={() => setRetry((value) => value + 1)}>Try again</Button>}>
      {error || 'Maintenance projection could not be loaded.'}
    </Alert>
  );

  const ranked = rankMaintenanceRequirements(result.requirements);
  const empty = ranked.length === 0 && result.attachedAssetSummaries.length === 0;
  return (
    <Box component="section" aria-labelledby="maintenance-workspace-title" sx={{ mt: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'end' }} justifyContent="space-between" sx={{ mb: 2 }}>
        <Box>
          <Typography id="maintenance-workspace-title" component="h2" variant="h5" sx={{ color: '#0b3217', fontWeight: 900 }}>Maintenance</Typography>
          <Typography variant="body2" color="text.secondary">Authoritative requirements at {result.asOf} · {result.timezone}</Typography>
        </Box>
        <Chip label="Read-only due state" size="small" variant="outlined" sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }} />
      </Stack>

      {empty ? <Alert severity="info">No maintenance requirements apply at this time.</Alert> : (
        <Stack spacing={1}>
          {GROUPS.map((group) => {
            const requirements = ranked.filter((requirement) => group.includes.includes(requirement.state));
            const open = expandedGroup === group.key;
            const countLabel = `${requirements.length} ${requirements.length === 1 ? 'requirement' : 'requirements'}`;
            return (
              <Paper key={group.key} variant="outlined" sx={{ overflow: 'hidden', borderColor: open ? group.tone : '#d9e4da', borderRadius: 2 }}>
                <Button
                  fullWidth
                  disabled={requirements.length === 0}
                  onClick={() => {
                    setExpandedGroup(open ? undefined : group.key);
                    setExpandedRequirement(undefined);
                  }}
                  aria-expanded={open}
                  aria-controls={`maintenance-group-${group.key}`}
                  aria-label={`${group.label} · ${countLabel}`}
                  sx={{ minHeight: 56, borderLeft: `4px solid ${group.tone}`, borderRadius: 0, color: 'text.primary', textTransform: 'none', justifyContent: 'space-between', px: 2, backgroundColor: open ? group.background : '#fff' }}
                >
                  <Typography variant="overline" fontWeight={900} sx={{ color: group.tone, letterSpacing: '0.08em' }}>{group.label}</Typography>
                  <Stack direction="row" alignItems="center" gap={1}>
                    <Typography fontWeight={900}>{requirements.length}</Typography>
                    <ExpandMoreIcon sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease', '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }} />
                  </Stack>
                </Button>
                <Collapse in={open} timeout="auto" unmountOnExit>
                  <Stack id={`maintenance-group-${group.key}`} role="region" aria-label={`${group.label} requirements`} spacing={1} sx={{ p: 1.25, backgroundColor: '#fafcf9' }}>
                    {requirements.map((requirement) => (
                      <RequirementCard
                        key={requirement.requirementVersionId}
                        requirement={requirement}
                        expanded={expandedRequirement === requirement.requirementVersionId}
                        onToggle={() => setExpandedRequirement((current) => current === requirement.requirementVersionId ? undefined : requirement.requirementVersionId)}
                        source={assetSource}
                        sourceRecordId={sourceRecordId}
                      />
                    ))}
                  </Stack>
                </Collapse>
              </Paper>
            );
          })}
        </Stack>
      )}
      <AttachedMaintenance result={result} />
    </Box>
  );
}

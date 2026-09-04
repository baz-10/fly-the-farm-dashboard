import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Divider, Stack, TextField, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useNavigate, useParams } from 'react-router-dom';
import { calculateFinancialActualV1 } from '../domain/financialActuals/calculation';
import { createFinancialActualsApi, FinancialActualApiError } from '../services/financialActualsApi';
import type { FinancialActualDetail, FinancialDraft, FinancialHistoricalRevision, FinancialRevisionHistory } from '../types/financialActuals';
import { FinancialDraftEditor } from '../components/financialActuals/FinancialDraftEditor';
import { FinancialPrefillReview } from '../components/financialActuals/FinancialPrefillReview';
import { RevisionHistory } from '../components/financialActuals/RevisionHistory';
import { useAuth } from '../contexts/AuthContext';
import { authorityScopeKey } from '../services/authorityScope';

const api = createFinancialActualsApi();
const money = (value: string | null | undefined) => value == null ? '—' : new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(value));
const reasonValid = (value: string, maxLength = 1000) => value.trim().length > 0 && value.trim().length <= maxLength && !Array.from(value).some(character => { const code = character.charCodeAt(0); return code <= 31 || code === 127; });

function preview(draft: FinancialDraft) {
  const inputs = draft.revenueInputs as Record<string, unknown>;
  const mode = String(inputs['revenue/mode'] || 'HOURLY');
  const revenue = mode === 'AREA'
    ? { mode: 'AREA' as const, actualHectares: String(inputs['revenue/actualHectares'] || '0.000000'), ratePerHectare: String(inputs['revenue/ratePerHectare'] || '0.000000') }
    : { mode: 'HOURLY' as const, hourlyRate: String(inputs['revenue/hourlyRate'] || '0.000000') };
  return calculateFinancialActualV1({ formulaVersion: 'FINANCIAL_ACTUAL_V1', currencyCode: 'AUD', revenue, workEntries: draft.workEntries, costLines: draft.costLines });
}

export default function ActualDetail() {
  const { actualId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const scopeKey = `${actualId}:${authorityScopeKey(user)}`;
  const scopeRef = useRef(scopeKey);
  const generation = useRef(0);
  const historyGeneration = useRef(0);
  const [resolved, setResolved] = useState<{ scope: string; value: FinancialActualDetail } | null>(null);
  const [historyState, setHistoryState] = useState<{ scope: string; value: FinancialRevisionHistory } | null>(null);
  const [historicalState, setHistoricalState] = useState<{ scope: string; value: FinancialHistoricalRevision } | null>(null);
  const [historyBusyScope, setHistoryBusyScope] = useState<string | null>(null);
  const [loadingScope, setLoadingScope] = useState(scopeKey);
  const [busyScope, setBusyScope] = useState<string | null>(null);
  const [errorState, setErrorState] = useState<{ scope: string; message: string } | null>(null);
  const [conflictScope, setConflictScope] = useState<string | null>(null);
  const [prefillState, setPrefillState] = useState<{ scope: string; value: any } | null>(null);
  const [correctionOpenScope, setCorrectionOpenScope] = useState<string | null>(null);
  const [correctionReason, setCorrectionReason] = useState('');
  const [archiveOpenScope, setArchiveOpenScope] = useState<string | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [exportBusyScope, setExportBusyScope] = useState<string | null>(null);
  scopeRef.current = scopeKey;

  const detail = resolved?.scope === scopeKey ? resolved.value : null;
  const history = historyState?.scope === scopeKey ? historyState.value : null;
  const historical = historicalState?.scope === scopeKey ? historicalState.value : null;
  const historyBusy = historyBusyScope === scopeKey;
  const loading = loadingScope === scopeKey;
  const busy = busyScope === scopeKey;
  const error = errorState?.scope === scopeKey ? errorState.message : '';
  const conflict = conflictScope === scopeKey;
  const prefill = prefillState?.scope === scopeKey ? prefillState.value : null;
  const permissions = new Set<string>(Array.isArray((user as any)?.permissions) ? (user as any).permissions : []);
  const privilegedRole = ['admin', 'organisation_admin'].includes(String((user as any)?.role || '').toLowerCase());
  const canUpdate = privilegedRole || permissions.has('*') || permissions.has('financial_actuals.update');
  const canArchive = privilegedRole || permissions.has('*') || permissions.has('financial_actuals.archive');
  const canExport = permissions.has('*') || (permissions.has('financial_actuals.read') && permissions.has('financial_actuals.export'));

  const load = useCallback(async (requestScope = scopeKey) => {
    const active = ++generation.current;
    historyGeneration.current++;
    setLoadingScope(requestScope);
    setErrorState(null);
    setHistoricalState(null);
    try {
      const next = await api.read(actualId);
      if (active === generation.current && scopeRef.current === requestScope) setResolved({ scope: requestScope, value: next });
      const historyReader = (api as any).revisionHistory;
      if (typeof historyReader === 'function') {
        const nextHistory = await historyReader({ actualId, pageSize: 100 });
        if (active === generation.current && scopeRef.current === requestScope) setHistoryState({ scope: requestScope, value: nextHistory });
      }
    } catch (caught) {
      if (active === generation.current && scopeRef.current === requestScope) setErrorState({ scope: requestScope, message: caught instanceof Error ? caught.message : 'Financial Actual could not be loaded.' });
    } finally {
      if (active === generation.current && scopeRef.current === requestScope) setLoadingScope('');
    }
  }, [actualId, scopeKey]);

  useEffect(() => {
    setCorrectionOpenScope(null); setCorrectionReason(''); setArchiveOpenScope(null); setArchiveReason('');
    void load(scopeKey);
    const detailRequest = generation.current;
    const historyRequest = historyGeneration.current;
    return () => { if (generation.current === detailRequest) generation.current++; if (historyGeneration.current === historyRequest) historyGeneration.current++; };
  }, [load, scopeKey]);

  const draft = detail?.draft;
  const calculation = useMemo(() => { try { return draft ? preview(draft) : null; } catch { return null; } }, [draft]);

  const command = async (work: () => Promise<unknown>) => {
    const commandScope = scopeKey;
    setBusyScope(commandScope); setErrorState(null); setConflictScope(null);
    try {
      await work();
      if (scopeRef.current === commandScope) await load(commandScope);
    } catch (caught) {
      if (scopeRef.current === commandScope) {
        if (caught instanceof FinancialActualApiError && caught.code === 'FINANCIAL_ACTUAL_CONFLICT') setConflictScope(commandScope);
        else setErrorState({ scope: commandScope, message: caught instanceof Error ? caught.message : 'Financial Actual request failed.' });
      }
    } finally {
      if (scopeRef.current === commandScope) setBusyScope(null);
    }
  };

  const selectRevision = async (revisionId: string) => {
    const selected = history?.rows.find(row => row.id === revisionId);
    if (!selected || selected.status !== 'FINAL') return;
    const requestScope = scopeKey;
    const active = ++historyGeneration.current;
    setHistoricalState(null); setErrorState(null);
    try {
      const value = await api.historicalRevision({ actualId, revisionId });
      if (active === historyGeneration.current && scopeRef.current === requestScope) setHistoricalState({ scope: requestScope, value });
    } catch (caught) {
      if (active === historyGeneration.current && scopeRef.current === requestScope) setErrorState({ scope: requestScope, message: caught instanceof Error ? caught.message : 'Historical revision could not be loaded.' });
    }
  };

  const loadOlderRevisions = async () => {
    if (!history?.nextBeforeRevisionNumber || historyBusy) return;
    const requestScope = scopeKey;
    const active = ++historyGeneration.current;
    setHistoryBusyScope(requestScope); setErrorState(null);
    try {
      const page = await api.revisionHistory({ actualId, beforeRevisionNumber: history.nextBeforeRevisionNumber, pageSize: 100 });
      if (active !== historyGeneration.current || scopeRef.current !== requestScope) return;
      if (page.financialActualId !== history.financialActualId || page.reference !== history.reference || page.currentFinalRevisionId !== history.currentFinalRevisionId || page.activeDraftRevisionId !== history.activeDraftRevisionId || page.archivedAt !== history.archivedAt) throw new Error('Revision history authority changed while loading.');
      const existing = new Set(history.rows.map(row => row.id));
      if (page.rows.some(row => existing.has(row.id))) throw new Error('Revision history continuation overlapped an earlier page.');
      setHistoryState({ scope: requestScope, value: { ...history, rows: [...history.rows, ...page.rows], nextBeforeRevisionNumber: page.nextBeforeRevisionNumber } });
    } catch (caught) {
      if (active === historyGeneration.current && scopeRef.current === requestScope) setErrorState({ scope: requestScope, message: caught instanceof Error ? caught.message : 'Older revisions could not be loaded.' });
    } finally {
      if (active === historyGeneration.current && scopeRef.current === requestScope) setHistoryBusyScope(null);
    }
  };

  const exportRevision = async (revisionId: string) => {
    const requestScope = `${scopeKey}:${revisionId}`;
    setExportBusyScope(requestScope); setErrorState(null);
    try {
      const output = await api.exportFinal({ actualId, revisionId });
      if (scopeRef.current !== scopeKey) return;
      const url = URL.createObjectURL(output.blob), anchor = document.createElement('a');
      try { anchor.href = url; anchor.download = output.filename; anchor.click(); } finally { URL.revokeObjectURL(url); }
    } catch (caught) {
      if (scopeRef.current === scopeKey) setErrorState({ scope: scopeKey, message: caught instanceof Error ? caught.message : 'Financial Actual export failed.' });
    } finally { if (scopeRef.current === scopeKey) setExportBusyScope(null); }
  };

  if (!detail && loading) return <CircularProgress aria-label="Loading Financial Actual" />;
  if (error && !detail) return <Alert severity="error">{error}</Alert>;
  if (!detail) return <CircularProgress aria-label="Loading Financial Actual" />;
  const hierarchy = detail.hierarchy as any;

  return <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
    <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/financials')} sx={{ mb: 2 }}>Financial Actuals</Button>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2} mb={3}>
      <Box><Typography variant="h4" component="h1" fontWeight={800} color="primary.dark">{detail.record.reference}</Typography><Typography color="text.secondary">{hierarchy.client?.label} · {hierarchy.job?.label}</Typography></Box>
      <Stack direction="row" gap={1}><Chip label={detail.record.archivedAt ? 'ARCHIVED' : draft ? 'CORRECTION DRAFT' : 'FINAL'} color={detail.record.archivedAt ? 'default' : draft ? 'warning' : 'success'} />{draft && detail.final && <Chip label="CURRENT FINAL RETAINED" color="success" variant="outlined" />}</Stack>
    </Stack>
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {conflict && <Alert severity="warning" sx={{ mb: 2 }} action={<Button onClick={() => load(scopeKey)}>Reload authoritative Draft</Button>}>This Financial Actual changed in another session. Your changes were not written.</Alert>}
    {detail.record.archivedAt && <Alert severity="info" sx={{ mb: 2 }}>Archived Financial Actual. Immutable revision evidence remains available below.</Alert>}

    {draft && detail.final && <><Alert severity="info" sx={{ mb: 2 }}>A correction Draft is in progress. The existing FINAL remains authoritative until the correction finalises successfully.</Alert><Final detail={detail} />{canExport&&<Button sx={{mt:2}} variant="outlined" disabled={exportBusyScope===`${scopeKey}:${detail.final.id}`} onClick={()=>exportRevision(detail.final!.id)}>Export current FINAL</Button>}</>}
    {draft && <Box sx={{ mt: detail.final ? 2 : 0 }}><Card variant="outlined" sx={{ mb: 2 }}><CardContent><Typography variant="h6">Correction Draft</Typography><Typography variant="body2" color="text.secondary">Revision {draft.revisionNumber} · version {draft.rowVersion}</Typography><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mt={2}><TextField type="date" label="Start date" value={draft.startDate} InputLabelProps={{ shrink: true }} disabled fullWidth /><TextField type="date" label="End date" value={draft.endDate} InputLabelProps={{ shrink: true }} disabled fullWidth /></Stack><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} mt={2}><Button variant="outlined" disabled={busy || !detail.record.missionId} onClick={async () => { const requestScope = scopeKey; setErrorState(null); try { const value = await api.prefill(detail.record.id); if (scopeRef.current === requestScope) setPrefillState({ scope: requestScope, value }); } catch (caught) { if (scopeRef.current === requestScope) setErrorState({ scope: requestScope, message: caught instanceof Error ? caught.message : 'Operational prefill unavailable.' }); } }}>Review operational prefill</Button><Button color="success" variant="contained" disabled={busy || !calculation} onClick={() => command(() => api.finalise({ actualId: detail.record.id, revisionId: draft.id, expectedAggregateVersion: detail.record.rowVersion, expectedRevisionVersion: draft.rowVersion }))}>Finalise correction</Button></Stack></CardContent></Card><FinancialDraftEditor draft={draft} busy={busy} onSave={payload => command(() => api.updateDraft({ actualId: detail.record.id, revisionId: draft.id, expectedVersion: draft.rowVersion, payload }))} />{prefill && <FinancialPrefillReview prefill={prefill} busy={busy} onSubmit={payload => command(() => api.acceptPrefill({ actualId: detail.record.id, revisionId: draft.id, expectedVersion: draft.rowVersion, payload }))} />}<Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>{['Revenue', 'Labour', 'Products', 'Aircraft & Equipment', 'Travel', 'Other Costs'].map(section => <Box key={section}><Accordion variant="outlined"><AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography fontWeight={700}>{section}</Typography></AccordionSummary><AccordionDetails><Typography color="text.secondary">Authoritative entries are retained in this Draft.</Typography></AccordionDetails></Accordion></Box>)}</Box>{calculation && <Card variant="outlined" sx={{ mt: 2, borderTop: 4, borderTopColor: 'primary.main' }}><CardContent><Typography variant="h6">Calculation Preview</Typography><Alert severity="info" sx={{ my: 1 }}>Preview uses TypeScript FINANCIAL_ACTUAL_V1. PostgreSQL becomes authoritative only when finalised.</Alert><Metrics calculation={calculation} /></CardContent></Card>}</Box>}
    {!draft && detail.final && <><Final detail={detail} />{canExport&&<Button sx={{mt:2}} variant="outlined" disabled={exportBusyScope===`${scopeKey}:${detail.final.id}`} onClick={()=>exportRevision(detail.final!.id)}>Export current FINAL</Button>}</>}

    {!detail.record.archivedAt && detail.final && <Card variant="outlined" sx={{ mt: 2 }}><CardContent><Typography variant="h6">Governed actions</Typography>{!draft && canUpdate && <>{correctionOpenScope !== scopeKey ? <Button variant="outlined" onClick={() => setCorrectionOpenScope(scopeKey)}>Correct Financial Actual</Button> : <Stack spacing={1.5} mt={1}><Alert severity="info">This creates a numbered correction Draft. The current FINAL remains authoritative until successful finalisation.</Alert><TextField label="Correction reason" value={correctionReason} onChange={event => setCorrectionReason(event.target.value)} multiline minRows={2} inputProps={{ maxLength: 1000 }} /><Stack direction="row" gap={1}><Button variant="contained" disabled={busy || !reasonValid(correctionReason)} onClick={() => command(() => api.createCorrection({ actualId, expectedAggregateVersion: detail.record.rowVersion, expectedFinalRevisionId: detail.final!.id, expectedFinalRevisionVersion: detail.final!.rowVersion, correctionReason: correctionReason.trim() }))}>Create correction Draft</Button><Button onClick={() => { setCorrectionOpenScope(null); setCorrectionReason(''); }}>Cancel</Button></Stack></Stack>}</>}{draft && <Alert severity="warning" sx={{ mt: 1 }}>Archive unavailable while correction Draft exists.</Alert>}{!draft && canArchive && <Box sx={{ mt: 2 }}>{archiveOpenScope !== scopeKey ? <Button color="warning" variant="outlined" onClick={() => setArchiveOpenScope(scopeKey)}>Archive Financial Actual</Button> : <Stack spacing={1.5}><TextField label="Archive reason" value={archiveReason} onChange={event => setArchiveReason(event.target.value)} multiline minRows={2} inputProps={{ maxLength: 500 }} /><Stack direction="row" gap={1}><Button color="warning" variant="contained" disabled={busy || !reasonValid(archiveReason, 500)} onClick={() => command(() => api.archive({ actualId, expectedAggregateVersion: detail.record.rowVersion, archiveReason: archiveReason.trim() }))}>Confirm archive</Button><Button onClick={() => { setArchiveOpenScope(null); setArchiveReason(''); }}>Cancel</Button></Stack></Stack>}</Box>}</CardContent></Card>}

    {history && <Box sx={{ mt: 2 }}><RevisionHistory history={history} selectedRevisionId={historical?.revision.id || null} onSelect={selectRevision} onLoadMore={loadOlderRevisions} loadingMore={historyBusy} /></Box>}
    {historical && <Card variant="outlined" sx={{ mt: 2, borderTop: 4, borderTopColor: historical.current ? 'success.main' : 'grey.500' }}><CardContent><Typography variant="h5">Historical frozen authority</Typography><Typography color="text.secondary">Revision {historical.revision.revisionNumber} · {historical.current ? 'Current FINAL' : 'Superseded FINAL'} · {historical.revision.correctionReason || 'Original'}</Typography><Alert severity="info" sx={{ my: 2 }}>Rendered from the immutable frozen snapshot. It is not recalculated using current code.</Alert><Metrics calculation={historical.revision.calculation} />{canExport&&<Button sx={{mt:2}} variant="outlined" disabled={exportBusyScope===`${scopeKey}:${historical.revision.id}`} onClick={()=>exportRevision(historical.revision.id)}>Export revision {historical.revision.revisionNumber}</Button>}</CardContent></Card>}
  </Box>;
}

function Metric({ label, value }: { label: string; value: string }) { return <Box><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h6">{value}</Typography></Box>; }
function Metrics({ calculation }: { calculation: any }) { return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}><Metric label="Operational days" value={String(calculation.operationalDays)} /><Metric label="Total hours" value={String(calculation.totalHours)} /><Metric label="Revenue" value={money(calculation.revenue)} /><Metric label="Total cost" value={money(calculation.totalCost)} /><Metric label="Gross profit" value={money(calculation.grossProfit)} /><Metric label="Gross margin" value={calculation.grossMarginPercentage ? `${calculation.grossMarginPercentage}%` : '—'} /></Box>; }
function Final({ detail }: { detail: FinancialActualDetail }) { const final = detail.final!; return <Card variant="outlined" sx={{ borderTop: 4, borderTopColor: 'success.main' }}><CardContent><Typography variant="h5">Frozen FINAL result</Typography><Typography color="text.secondary">Revision {final.revisionNumber} · finalised {new Date(final.finalisedAt).toLocaleString('en-AU')}</Typography><Alert severity="success" sx={{ my: 2 }}>FINAL is immutable and rendered from the authoritative PostgreSQL snapshot.</Alert><Metrics calculation={final.calculation} /><Divider sx={{ my: 2 }} /><Typography variant="body2">Evidence digest: {final.inputDigest.slice(0, 12)}…</Typography></CardContent></Card>; }

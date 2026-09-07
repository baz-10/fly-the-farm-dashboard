import React from 'react';
import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import type {
  MissionDayChemicalActualLineInput,
  MissionDayChemicalActualRevision,
  MissionDayChemicalProposal,
} from '../../types/missionOperations';

export interface MissionDayChemicalOption {
  id: string;
  label: string;
}

export interface MissionDayChemicalProductOption extends MissionDayChemicalOption {
  platformProductId: string;
  platformProductVersionId: string;
  registerEntryId: string | null;
  productName: string;
  rate: string;
  rateUnit: MissionDayChemicalActualLineInput['rateUnit'];
  appliedQuantity: string;
  quantityUnit: MissionDayChemicalActualLineInput['quantityUnit'];
}

interface Confirmation {
  lines: MissionDayChemicalActualLineInput[];
  notes: string | null;
}

interface Props {
  plan: MissionDayChemicalProposal[];
  actual: MissionDayChemicalActualRevision | null;
  fieldOptions: MissionDayChemicalOption[];
  aircraftOptions?: MissionDayChemicalOption[];
  productOptions?: MissionDayChemicalProductOption[];
  readOnly?: boolean;
  onConfirm: (confirmation: Confirmation) => Promise<unknown>;
}

type Draft = MissionDayChemicalActualLineInput & { draftKey: string };

function draftFromProposal(proposal: MissionDayChemicalProposal, draftKey: string): Draft {
  return {
    draftKey,
    fieldId: '',
    plannedLineId: proposal.plannedLineId,
    platformProductId: proposal.platformProductId,
    platformProductVersionId: proposal.platformProductVersionId,
    registerEntryId: proposal.registerEntryId,
    productName: proposal.productName,
    rate: proposal.rate,
    rateUnit: proposal.rateUnit,
    appliedQuantity: proposal.plannedQuantity,
    quantityUnit: proposal.quantityUnit,
    batchLot: null,
    aircraftId: null,
  };
}

function draftFromActual(line: MissionDayChemicalActualRevision['lines'][number]): Draft {
  const { id, productSnapshot, ...input } = line;
  return { ...input, draftKey: `actual-${id}` };
}

function draftFromProduct(option: MissionDayChemicalProductOption, draftKey: string): Draft {
  return {
    draftKey,
    fieldId: '',
    plannedLineId: null,
    platformProductId: option.platformProductId,
    platformProductVersionId: option.platformProductVersionId,
    registerEntryId: option.registerEntryId,
    productName: option.productName,
    rate: option.rate,
    rateUnit: option.rateUnit,
    appliedQuantity: option.appliedQuantity,
    quantityUnit: option.quantityUnit,
    batchLot: null,
    aircraftId: null,
  };
}

export default function MissionDayChemicalActuals({
  plan,
  actual,
  fieldOptions,
  aircraftOptions = [],
  productOptions = [],
  readOnly = false,
  onConfirm,
}: Props) {
  const nextDraftKey = React.useRef(0);
  const makeDraftKey = React.useCallback(() => `new-${nextDraftKey.current++}`, []);
  const initialDrafts = React.useCallback(() => actual
    ? actual.lines.map(draftFromActual)
    : plan.map((proposal) => draftFromProposal(proposal, makeDraftKey())), [actual, makeDraftKey, plan]);
  const [drafts, setDrafts] = React.useState<Draft[]>(initialDrafts);
  const [notes, setNotes] = React.useState(actual?.notes || '');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    setDrafts(initialDrafts());
    setNotes(actual?.notes || '');
  }, [actual, initialDrafts]);

  const update = (index: number, patch: Partial<Draft>) => {
    setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };

  const addPlannedApplication = (proposal: MissionDayChemicalProposal) => {
    setDrafts((current) => [...current, draftFromProposal(proposal, makeDraftKey())]);
  };

  const addProductApplication = (option: MissionDayChemicalProductOption) => {
    setDrafts((current) => [...current, draftFromProduct(option, makeDraftKey())]);
  };

  const confirm = async () => {
    setError('');
    if (!drafts.length || drafts.some((line) => !line.fieldId)) {
      setError('Select the exact Field for every chemical application.');
      return;
    }
    if (drafts.some((line) => !/^(?:0|[1-9]\d{0,11})\.\d{6}$/.test(line.rate) || Number(line.rate) <= 0
      || !/^(?:0|[1-9]\d{0,11})\.\d{6}$/.test(line.appliedQuantity) || Number(line.appliedQuantity) <= 0)) {
      setError('Rates and quantities require exactly six decimal places.');
      return;
    }
    if (drafts.some((line) => (line.batchLot?.trim().length || 0) > 200)) {
      setError('Batch or lot provenance cannot exceed 200 characters.');
      return;
    }
    setBusy(true);
    try {
      await onConfirm({
        lines: drafts.map(({ draftKey, ...line }) => ({
          ...line,
          batchLot: line.batchLot?.trim() || null,
        })),
        notes: notes.trim() || null,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Chemical actuals could not be confirmed.');
    } finally {
      setBusy(false);
    }
  };

  return <Stack spacing={2}>
    <Stack spacing={0.5}>
      <Typography variant="h6">Daily chemical applications</Typography>
      <Alert severity="info">Proposed from Mission plan</Alert>
      <Typography variant="body2">
        Planned products and rates are proposals until you explicitly confirm the exact day and Field application.
      </Typography>
    </Stack>

    {plan.map((proposal) => <Stack key={proposal.plannedLineId} spacing={0.25}>
      <Typography fontWeight={700}>{proposal.productName}</Typography>
      <Typography variant="body2">{proposal.rate} {proposal.rateUnit} · proposed {proposal.plannedQuantity} {proposal.quantityUnit}</Typography>
      {!readOnly && <Button size="small" sx={{ alignSelf: 'flex-start' }} onClick={() => addPlannedApplication(proposal)}>
        Add another application for {proposal.productName}
      </Button>}
    </Stack>)}

    {actual && <Stack spacing={1}>
      <Alert severity="success">Actual application recorded</Alert>
      {actual.materialVariance && <Alert severity="warning">
        Variance retained against the approved Mission plan. The approved plan has not been rewritten.
      </Alert>}
      {actual.lines.map((line) => <Stack key={line.id} spacing={0.25}>
        <Typography fontWeight={700}>{line.productName}</Typography>
        <Typography variant="body2">{line.appliedQuantity} {line.quantityUnit}</Typography>
        <Typography variant="caption">Field {line.fieldId} · {line.rate} {line.rateUnit}{line.batchLot ? ` · batch/lot ${line.batchLot}` : ''}</Typography>
      </Stack>)}
    </Stack>}

    {!readOnly && <Stack spacing={1.5}>
      {productOptions.map((option) => <Button
        key={option.id}
        size="small"
        variant="outlined"
        sx={{ alignSelf: 'flex-start' }}
        onClick={() => addProductApplication(option)}
      >
        Add substituted product {option.label}
      </Button>)}
      {drafts.map((line, index) => <Stack key={line.draftKey} spacing={1}>
        <Typography variant="subtitle2">Confirm {line.productName}</Typography>
        {drafts.length > 1 && <Button
          size="small"
          color="inherit"
          sx={{ alignSelf: 'flex-start' }}
          onClick={() => setDrafts((current) => current.filter((item) => item.draftKey !== line.draftKey))}
        >
          Remove {line.productName} application
        </Button>}
        <TextField
          select
          required
          label={`Field for ${line.productName}`}
          value={line.fieldId}
          disabled={busy}
          SelectProps={{ native: true }}
          onChange={(event) => update(index, { fieldId: event.target.value })}
        >
          <option value="">Select Field</option>
          {fieldOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </TextField>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <TextField
            required
            label={`Rate for ${line.productName}`}
            value={line.rate}
            disabled={busy}
            helperText={line.rateUnit}
            onChange={(event) => update(index, { rate: event.target.value })}
          />
          <TextField
            required
            label={`Applied quantity for ${line.productName}`}
            value={line.appliedQuantity}
            disabled={busy}
            helperText={line.quantityUnit}
            onChange={(event) => update(index, { appliedQuantity: event.target.value })}
          />
          <TextField
            label={`Batch or lot for ${line.productName}`}
            value={line.batchLot || ''}
            disabled={busy}
            inputProps={{ maxLength: 200 }}
            onChange={(event) => update(index, { batchLot: event.target.value || null })}
          />
          {aircraftOptions.length > 0 && <TextField
            select
            label={`Aircraft for ${line.productName}`}
            value={line.aircraftId || ''}
            disabled={busy}
            SelectProps={{ native: true }}
            onChange={(event) => update(index, { aircraftId: event.target.value || null })}
          >
            <option value="">Not attributed</option>
            {aircraftOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </TextField>}
        </Stack>
      </Stack>)}
      {error && <Alert severity="error">{error}</Alert>}
      <TextField
        label="Chemical application notes"
        multiline
        minRows={2}
        value={notes}
        disabled={busy}
        onChange={(event) => setNotes(event.target.value)}
      />
      <Button variant="contained" disabled={busy || !drafts.length} onClick={() => void confirm()}>
        {actual ? 'Record chemical revision' : 'Confirm chemical actuals'}
      </Button>
    </Stack>}
  </Stack>;
}

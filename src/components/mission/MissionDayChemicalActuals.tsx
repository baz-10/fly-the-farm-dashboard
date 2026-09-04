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

interface Confirmation {
  lines: MissionDayChemicalActualLineInput[];
  notes: string | null;
}

interface Props {
  plan: MissionDayChemicalProposal[];
  actual: MissionDayChemicalActualRevision | null;
  fieldOptions: MissionDayChemicalOption[];
  aircraftOptions?: MissionDayChemicalOption[];
  readOnly?: boolean;
  onConfirm: (confirmation: Confirmation) => Promise<unknown>;
}

type Draft = MissionDayChemicalActualLineInput;

function draftFromProposal(proposal: MissionDayChemicalProposal): Draft {
  return {
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

export default function MissionDayChemicalActuals({
  plan,
  actual,
  fieldOptions,
  aircraftOptions = [],
  readOnly = false,
  onConfirm,
}: Props) {
  const [drafts, setDrafts] = React.useState<Draft[]>(() => plan.map(draftFromProposal));
  const [notes, setNotes] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => setDrafts(plan.map(draftFromProposal)), [plan]);

  const update = (index: number, patch: Partial<Draft>) => {
    setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
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
    setBusy(true);
    try {
      await onConfirm({ lines: drafts, notes: notes.trim() || null });
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

    {!actual && !readOnly && <Stack spacing={1.5}>
      {drafts.map((line, index) => <Stack key={`${line.plannedLineId}-${index}`} spacing={1}>
        <Typography variant="subtitle2">Confirm {line.productName}</Typography>
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
            onChange={(event) => update(index, { batchLot: event.target.value.trimStart() || null })}
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
        Confirm chemical actuals
      </Button>
    </Stack>}
  </Stack>;
}

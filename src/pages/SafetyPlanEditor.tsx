import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Stack,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import RefreshIcon from '@mui/icons-material/Refresh';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import { Link, useParams } from 'react-router-dom';

import EmergencyPlanningStep from '../components/safety-plan/EmergencyPlanningStep';
import HazardsControlsStep from '../components/safety-plan/HazardsControlsStep';
import JobDetailsStep from '../components/safety-plan/JobDetailsStep';
import PeopleAssetsStep from '../components/safety-plan/PeopleAssetsStep';
import ReviewSubmitStep from '../components/safety-plan/ReviewSubmitStep';
import SafetyPlanReadiness from '../components/safety-plan/SafetyPlanReadiness';
import SafetyPlanStepper, { type SafetyPlanStep } from '../components/safety-plan/SafetyPlanStepper';
import SaveIndicator from '../components/safety-plan/SaveIndicator';
import SourceRefreshDialog from '../components/safety-plan/SourceRefreshDialog';
import { useAuth } from '../contexts/AuthContext';
import { useSafetyPlans, type SaveState } from '../contexts/SafetyPlanContext';
import type {
  SafetyPlan,
  SafetyPlanActor,
  SafetyPlanFieldValue,
  SafetyPlanSection,
  SafetyPlanSourceSnapshot,
} from '../types/safetyPlan';
import {
  applySourceRefresh,
  diffSafetyPlanSources,
  type SourceRefreshAction,
  type SourceRefreshDecision,
} from '../utils/safetyPlanSourceSync';

const STEPS: SafetyPlanStep[] = [
  { label: 'Job details', shortLabel: 'Job details' },
  { label: 'People and assets', shortLabel: 'People & assets' },
  { label: 'Hazards and controls', shortLabel: 'Hazards & controls' },
  { label: 'Emergency planning', shortLabel: 'Emergency planning' },
  { label: 'Review and submit', shortLabel: 'Review & submit' },
];

const SECTION_GROUPS = [
  [
    'plan_identity_scope_version',
    'company_responsibilities_operational_authority',
    'job_client_property_location_operating_dates',
  ],
  [
    'crew_roles_acknowledgements',
    'aircraft_vehicles_trailers_equipment',
    'chemicals_payloads_sds_hazardous_substances',
  ],
  [
    'site_access_public_protection_signage_exclusion',
    'airspace_weather_operational_constraints',
    'consolidated_jsa_hazards_controls',
  ],
  [
    'communications_command_lost_contact',
    'emergency_incident_fire_response',
    'first_aid_spill_environmental_protection',
  ],
  [
    'attachments_supporting_evidence',
    'submission_approval_revision_acknowledgements',
  ],
];

function currentVersion(plan: SafetyPlan) {
  return plan.versions.find((version) => version.id === plan.currentVersionId);
}

function sectionGroups(sections: SafetyPlanSection[]): SafetyPlanSection[][] {
  const assigned = new Set(SECTION_GROUPS.flat());
  const groups = SECTION_GROUPS.map((ids) => ids
    .map((id) => sections.find((section) => section.id === id))
    .filter((section): section is SafetyPlanSection => Boolean(section)));
  const custom = sections.filter((section) => !assigned.has(section.id));
  if (custom.length) groups[4] = [...groups[4], ...custom];
  return groups;
}

function fieldPresent(value: SafetyPlanFieldValue | undefined) {
  return value != null && value !== '' && (!Array.isArray(value) || value.length > 0);
}

function actorFor(user: NonNullable<ReturnType<typeof useAuth>['user']>): SafetyPlanActor {
  return {
    userId: user.id,
    name: user.name,
    role: user.role === 'admin' ? 'admin' : 'contractor',
    operationalAuthority: user.safetyPlanAuthority,
  };
}

function hasSourceChanges(diff: ReturnType<typeof diffSafetyPlanSources>): boolean {
  return [
    diff.added,
    diff.changed,
    diff.removed,
    diff.contextAdded,
    diff.contextChanged,
    diff.contextRemoved,
    diff.fieldAdded,
    diff.fieldChanged,
    diff.fieldRemoved,
  ].some((changes) => changes.length > 0);
}

export interface SafetyPlanEditorProps {
  planId?: string;
  /** Supplied by the Job integration boundary; absent means the saved snapshot is current. */
  latestSourceSnapshot?: SafetyPlanSourceSnapshot;
}

export default function SafetyPlanEditor({
  planId: explicitPlanId,
  latestSourceSnapshot,
}: SafetyPlanEditorProps) {
  const params = useParams();
  const planId = explicitPlanId ?? params.planId;
  const { user } = useAuth();
  const {
    plans,
    saveState,
    lastSavedAt,
    error,
    saveDraft,
    retrySave,
    resolveConflict,
  } = useSafetyPlans();
  const storedPlan = plans.find((plan) => plan.id === planId);
  const [draft, setDraft] = useState<SafetyPlan | undefined>(storedPlan);
  const version = draft ? currentVersion(draft) : undefined;
  const restoredStep = Number(
    version?.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === 'editor_last_step')?.value ?? 0
  );
  const [activeStep, setActiveStep] = useState(
    Number.isInteger(restoredStep) && restoredStep >= 0 && restoredStep < STEPS.length
      ? restoredStep
      : 0
  );
  const [localSaveState, setLocalSaveState] = useState<SaveState>('idle');
  const [refreshOpen, setRefreshOpen] = useState(false);
  const [refreshDecisions, setRefreshDecisions] = useState<SourceRefreshDecision[]>([]);
  const loadedPlanIdRef = useRef(planId);
  const hasPendingLocalEditsRef = useRef(false);

  useEffect(() => {
    const planIdentityChanged = loadedPlanIdRef.current !== planId;
    if (planIdentityChanged) {
      loadedPlanIdRef.current = planId;
      hasPendingLocalEditsRef.current = false;
      setDraft(storedPlan);
      const nextVersion = storedPlan ? currentVersion(storedPlan) : undefined;
      const nextStep = Number(nextVersion?.sections
        .flatMap((section) => section.fields)
        .find((field) => field.id === 'editor_last_step')?.value ?? 0);
      setActiveStep(
        Number.isInteger(nextStep) && nextStep >= 0 && nextStep < STEPS.length
          ? nextStep
          : 0
      );
      return;
    }
    if (!draft && storedPlan) {
      setDraft(storedPlan);
      const nextVersion = currentVersion(storedPlan);
      const nextStep = Number(nextVersion?.sections
        .flatMap((section) => section.fields)
        .find((field) => field.id === 'editor_last_step')?.value ?? 0);
      setActiveStep(
        Number.isInteger(nextStep) && nextStep >= 0 && nextStep < STEPS.length
          ? nextStep
          : 0
      );
    }
  }, [draft, planId, storedPlan]);

  useEffect(() => {
    if (
      saveState === 'saved'
      && storedPlan
      && draft?.id === storedPlan.id
      && storedPlan.revision >= draft.revision
    ) {
      hasPendingLocalEditsRef.current = false;
      setDraft(storedPlan);
    }
  }, [draft?.id, draft?.revision, saveState, storedPlan]);

  const groups = useMemo(
    () => sectionGroups(version?.sections ?? []),
    [version?.sections]
  );
  const sourceDiff = useMemo(
    () => version && latestSourceSnapshot
      ? diffSafetyPlanSources(version.sourceSnapshot, latestSourceSnapshot)
      : undefined,
    [latestSourceSnapshot, version]
  );
  const sourceChanged = Boolean(sourceDiff && hasSourceChanges(sourceDiff));
  const effectiveSaveState = saveState === 'idle' && localSaveState !== 'idle'
    ? localSaveState
    : saveState;

  if (!user || user.role === 'client') return null;
  if (!draft || !version) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">This Safety Plan could not be found.</Alert>
      </Box>
    );
  }

  const persist = async (nextPlan: SafetyPlan) => {
    hasPendingLocalEditsRef.current = true;
    setDraft(nextPlan);
    setLocalSaveState('saving');
    try {
      await saveDraft({
        plan: nextPlan,
        expectedRevision: draft.revision,
        actor: actorFor(user),
      });
      setLocalSaveState('saved');
    } catch {
      setLocalSaveState('pending_retry');
    }
  };

  const updateField = (fieldId: string, value: SafetyPlanFieldValue) => {
    const nextPlan: SafetyPlan = {
      ...draft,
      updatedAt: new Date().toISOString(),
      versions: draft.versions.map((candidate) => candidate.id === version.id
        ? {
          ...candidate,
          updatedAt: new Date().toISOString(),
          sections: candidate.sections.map((section) => ({
            ...section,
            fields: section.fields.map((field) => field.id === fieldId
              ? { ...field, value }
              : field),
          })),
        }
        : candidate),
    };
    void persist(nextPlan);
  };

  const changeStep = (nextStep: number) => {
    setActiveStep(nextStep);
    const hasStepField = version.sections.some((section) =>
      section.fields.some((field) => field.id === 'editor_last_step')
    );
    const nextSections = version.sections.map((section, index) => ({
      ...section,
      fields: hasStepField
        ? section.fields.map((field) => field.id === 'editor_last_step'
          ? { ...field, value: String(nextStep) }
          : field)
        : index === 0
          ? [...section.fields, {
            id: 'editor_last_step',
            label: 'Editor last step',
            helpText: '',
            type: 'text' as const,
            required: false,
            companyEditable: false,
            value: String(nextStep),
          }]
          : section.fields,
    }));
    void persist({
      ...draft,
      versions: draft.versions.map((candidate) => candidate.id === version.id
        ? { ...candidate, sections: nextSections }
        : candidate),
    });
  };

  const completedSteps = new Set(
    groups.map((group, index) => ({
      index,
      complete: group
        .flatMap((section) => section.fields.filter((field) => field.required))
        .every((field) => fieldPresent(field.value)),
    })).filter(({ complete }) => complete).map(({ index }) => index)
  );

  const stepContent = [
    <JobDetailsStep sections={groups[0]} onFieldChange={updateField} />,
    <PeopleAssetsStep sections={groups[1]} sourceSnapshot={version.sourceSnapshot} onFieldChange={updateField} />,
    <HazardsControlsStep sections={groups[2]} sourceSnapshot={version.sourceSnapshot} onFieldChange={updateField} />,
    <EmergencyPlanningStep sections={groups[3]} sourceSnapshot={version.sourceSnapshot} onFieldChange={updateField} />,
    <ReviewSubmitStep plan={draft} sections={groups[4]} onFieldChange={updateField} />,
  ][activeStep];

  const applyRefresh = () => {
    if (!sourceDiff) return;
    const refreshed = applySourceRefresh(version, sourceDiff, refreshDecisions);
    const nextPlan: SafetyPlan = {
      ...draft,
      versions: draft.versions.map((candidate) => candidate.id === version.id ? refreshed : candidate),
    };
    setRefreshOpen(false);
    setRefreshDecisions([]);
    void persist(nextPlan);
  };

  const recoverConflict = async (choice: 'keep_remote' | 'create_revision') => {
    await resolveConflict(choice);
    hasPendingLocalEditsRef.current = false;
    // The provider has installed the canonical remote plan or new revision.
    // Resetting here lets the load effect adopt it without retaining stale input.
    setDraft(undefined);
  };

  return (
    <Box
      data-testid="safety-plan-editor-shell"
      sx={{
        p: { xs: 1.5, sm: 2.5, lg: 3 },
        maxWidth: '100%',
        overflowX: 'clip',
        bgcolor: '#f4f8f3',
        minHeight: '100%',
      }}
    >
      <Box sx={{ maxWidth: 1480, mx: 'auto' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2}>
          <Box>
            <Button component={Link} to="/compliance/safety-plans" startIcon={<ArrowBackIcon />} sx={{ px: 0 }}>
              Safety Plan register
            </Button>
            <Stack direction="row" gap={1.5} alignItems="center" sx={{ mt: 1 }}>
              <ShieldOutlinedIcon color="primary" sx={{ fontSize: 40 }} />
              <Box>
                <Typography variant="overline" color="text.secondary" fontWeight={900}>
                  Controlled field plan · Version {version.version}
                </Typography>
                <Typography variant="h3" sx={{ fontWeight: 900, color: 'primary.dark', fontSize: { xs: '1.85rem', md: '2.5rem' } }}>
                  {version.sourceSnapshot.job.name}
                </Typography>
              </Box>
            </Stack>
          </Box>
          <Stack alignItems={{ md: 'flex-end' }} justifyContent="flex-end" gap={1}>
            {sourceChanged && (
              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={() => setRefreshOpen(true)}
                sx={{ minHeight: 44 }}
              >
                Review source changes
              </Button>
            )}
            <SaveIndicator
              state={effectiveSaveState}
              lastSavedAt={lastSavedAt}
              error={error}
              onRetry={() => void retrySave()}
              onKeepRemote={() => void recoverConflict('keep_remote')}
              onCreateRevision={() => void recoverConflict('create_revision')}
            />
          </Stack>
        </Stack>

        <Card variant="outlined" sx={{ mt: 2.5, p: { xs: 1, md: 1.5 }, borderRadius: 3 }}>
          <SafetyPlanStepper
            steps={STEPS}
            activeStep={activeStep}
            completedSteps={completedSteps}
            onChange={changeStep}
          />
        </Card>

        <Box
          sx={{
            mt: 2.5,
            display: 'grid',
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) 300px' },
            gap: 2.5,
            alignItems: 'start',
          }}
        >
          <Box component="main" sx={{ minWidth: 0 }}>
            <Typography variant="h4" component="h1" fontWeight={900} color="primary.dark" sx={{ mb: 0.5 }}>
              {STEPS[activeStep].label}
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Step {activeStep + 1} of {STEPS.length}
            </Typography>
            {stepContent}
          </Box>
          <SafetyPlanReadiness sections={version.sections} stepSections={groups} />
        </Box>

        <Stack
          direction="row"
          justifyContent="space-between"
          gap={1}
          sx={{
            position: { xs: 'sticky', md: 'static' },
            bottom: 0,
            zIndex: 3,
            bgcolor: { xs: 'rgba(244, 248, 243, 0.96)', md: 'transparent' },
            py: 2,
            mt: 1,
          }}
        >
          <Button
            disabled={activeStep === 0}
            onClick={() => changeStep(activeStep - 1)}
            startIcon={<ArrowBackIcon />}
            sx={{ minHeight: 44 }}
          >
            Back
          </Button>
          {activeStep < STEPS.length - 1 && (
            <Button
              variant="contained"
              onClick={() => changeStep(activeStep + 1)}
              endIcon={<ArrowForwardIcon />}
              sx={{ minHeight: 44 }}
            >
              Next: {STEPS[activeStep + 1].label}
            </Button>
          )}
        </Stack>
      </Box>

      {sourceDiff && (
        <SourceRefreshDialog
          open={refreshOpen}
          diff={sourceDiff}
          decisions={refreshDecisions}
          onClose={() => setRefreshOpen(false)}
          onDecision={(itemId: string, action: SourceRefreshAction) => {
            setRefreshDecisions((current) => [
              ...current.filter((decision) => decision.itemId !== itemId),
              { itemId, action },
            ]);
          }}
          onApply={applyRefresh}
        />
      )}
    </Box>
  );
}

import { useEffect, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CircularProgress,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PublishIcon from '@mui/icons-material/Publish';
import { useAuth } from '../contexts/AuthContext';
import { AU_REOC_SAFETY_PLAN_STANDARD } from '../data/safetyPlanStandard';
import {
  loadCompanySafetyPlanTemplate,
  publishCompanySafetyPlanTemplate,
  saveCompanySafetyPlanTemplateDraft,
} from '../services/safetyPlanTemplateRepository';
import type { CompanySafetyPlanTemplate, SafetyPlanField, SafetyPlanSection } from '../types/safetyPlan';

export default function SafetyPlanTemplateEditor() {
  const { user } = useAuth();
  const [template, setTemplate] = useState<CompanySafetyPlanTemplate>();
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!user || user.role !== 'admin' || !user.tenantId) {
      setLoading(false);
      return;
    }
    let active = true;
    loadCompanySafetyPlanTemplate({ tenantId: user.tenantId, userId: user.id, name: user.name })
      .then((result) => { if (active) setTemplate(result); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Company template could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user]);

  if (!user || user.role !== 'admin') {
    return (
      <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
        <Alert severity="warning">
          <Typography variant="h6" component="h1" fontWeight={800}>Access restricted</Typography>
          Only company administrators can change or publish the company Safety Plan master.
        </Alert>
      </Box>
    );
  }

  if (loading) return <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress /></Box>;

  const updateSection = (sectionId: string, updates: Partial<Pick<SafetyPlanSection, 'title' | 'helpText' | 'required'>>) => {
    setTemplate((current) => current ? {
      ...current,
      sections: current.sections.map((section) => section.id === sectionId ? { ...section, ...updates } : section),
    } : current);
  };

  const updateField = (
    sectionId: string,
    fieldId: string,
    updates: Partial<Pick<SafetyPlanField, 'label' | 'helpText' | 'required'>>,
  ) => {
    setTemplate((current) => current ? {
      ...current,
      sections: current.sections.map((section) => section.id === sectionId ? {
        ...section,
        fields: section.fields.map((field) => field.id === fieldId ? { ...field, ...updates } : field),
      } : section),
    } : current);
  };

  const reorderSections = (sectionIds: string[]) => {
    setTemplate((current) => {
      if (!current) return current;
      const byId = new Map(current.sections.map((section) => [section.id, section]));
      return { ...current, sections: sectionIds.map((id) => byId.get(id)).filter(Boolean) as SafetyPlanSection[] };
    });
  };

  const adoptStandardSection = (sectionId: string) => {
    const standard = AU_REOC_SAFETY_PLAN_STANDARD.sections.find((section) => section.id === sectionId);
    if (!standard) return;
    setTemplate((current) => current ? {
      ...current,
      sectionStandardVersions: {
        ...current.sectionStandardVersions,
        [sectionId]: AU_REOC_SAFETY_PLAN_STANDARD.version,
      },
      sections: current.sections.map((section) => section.id === sectionId
        ? { ...standard, fields: standard.fields.map((field) => ({ ...field })) }
        : section),
    } : current);
  };

  const publishCompanyMaster = async () => {
    if (!template || !user.tenantId) return;
    setPublishing(true);
    setError(undefined);
    try {
      const published = await publishCompanySafetyPlanTemplate(
        { tenantId: user.tenantId, userId: user.id, name: user.name },
        template,
      );
      const nextDraft = await loadCompanySafetyPlanTemplate({
        tenantId: user.tenantId,
        userId: user.id,
        name: user.name,
      });
      setTemplate(nextDraft);
      setMessage(`Company master ${published.version} published. Earlier masters remain unchanged.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Company master could not be published.');
    } finally {
      setPublishing(false);
    }
  };

  const saveDraft = async () => {
    if (!template || !user.tenantId) return;
    setSavingDraft(true);
    setError(undefined);
    try {
      const saved = await saveCompanySafetyPlanTemplateDraft(
        { tenantId: user.tenantId, userId: user.id, name: user.name },
        template,
      );
      setTemplate(saved);
      setMessage('Company template draft saved.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Company template draft could not be saved.');
    } finally {
      setSavingDraft(false);
    }
  };

  if (!template) return <Alert severity="error">{error || 'Company template is unavailable.'}</Alert>;

  const hasStandardUpdate = template.sections.some((section) =>
    (template.sectionStandardVersions?.[section.id] ?? template.standardVersion)
      !== AU_REOC_SAFETY_PLAN_STANDARD.version
  );

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: 'auto' }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h3" sx={{ fontWeight: 850, color: 'primary.dark', fontSize: { xs: '2rem', md: '2.5rem' } }}>
            Company Safety Plan master
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Adapt the Australian platform standard to the way your company works.
          </Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} sx={{ alignSelf: { md: 'center' } }}>
          <Button
            variant="outlined"
            disabled={savingDraft || publishing}
            onClick={() => void saveDraft()}
          >
            {savingDraft ? 'Saving…' : 'Save draft'}
          </Button>
          <Button
            variant="contained"
            startIcon={<PublishIcon />}
            disabled={publishing || savingDraft}
            onClick={() => void publishCompanyMaster()}
          >
            {publishing ? 'Publishing…' : 'Publish company master'}
          </Button>
        </Stack>
      </Stack>

      <Alert severity="info" sx={{ mb: 2 }}>
        CASA/ReOC aligned, not CASA approved. Publishing creates a new immutable master; existing job plans and earlier masters do not change.
      </Alert>
      {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card variant="outlined" sx={{ p: 2, mb: 3, borderRadius: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} justifyContent="space-between">
          <Box>
            <Typography variant="overline" color="text.secondary">Company master</Typography>
            <Typography fontWeight={800}>Version {template.version}</Typography>
          </Box>
          <Box>
            <Typography variant="overline" color="text.secondary">Platform standard</Typography>
            <Typography fontWeight={800}>{AU_REOC_SAFETY_PLAN_STANDARD.version}</Typography>
          </Box>
          <Box>
            <Typography variant="overline" color="text.secondary">Comparison</Typography>
            <Typography fontWeight={800}>{hasStandardUpdate ? 'Update available' : 'Up to date'}</Typography>
          </Box>
        </Stack>
      </Card>

      <Stack spacing={1.5}>
        {template.sections.map((section, sectionIndex) => (
          <Accordion key={section.id} disableGutters sx={{ borderRadius: '12px !important', '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack direction="row" spacing={2} alignItems="center" width="100%">
                <Typography variant="overline" color="primary.main">{String(sectionIndex + 1).padStart(2, '0')}</Typography>
                <Typography fontWeight={800} flex={1}>{section.title}</Typography>
                <Typography variant="caption" color="text.secondary">{section.required ? 'Required' : 'Optional'}</Typography>
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2}>
                <TextField
                  label="Section title"
                  value={section.title || ''}
                  onChange={(event) => updateSection(section.id, { title: event.target.value })}
                />
                <TextField
                  label="Section guidance"
                  multiline
                  minRows={2}
                  value={section.helpText || ''}
                  onChange={(event) => updateSection(section.id, { helpText: event.target.value })}
                />
                <FormControlLabel
                  label="Required before Safety Plan submission"
                  control={(
                    <Switch
                      checked={section.required}
                      onChange={(_, checked) => updateSection(section.id, { required: checked })}
                    />
                  )}
                />
                {section.fields.map((field) => (
                  <Card key={field.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                    <Stack spacing={1.5}>
                      <TextField
                        size="small"
                        label="Field label"
                        value={field.label}
                        onChange={(event) => updateField(section.id, field.id, { label: event.target.value })}
                      />
                      <TextField
                        size="small"
                        label="Help text"
                        value={field.helpText}
                        onChange={(event) => updateField(section.id, field.id, { helpText: event.target.value })}
                      />
                      <FormControlLabel
                        label="Required"
                        control={(
                          <Switch
                            checked={field.required}
                            onChange={(_, checked) => updateField(section.id, field.id, { required: checked })}
                          />
                        )}
                      />
                    </Stack>
                  </Card>
                ))}
                <Stack direction="row" gap={1} flexWrap="wrap">
                  <Button variant="outlined" onClick={() => adoptStandardSection(section.id)}>
                    Restore platform section
                  </Button>
                  {sectionIndex > 0 && (
                    <Button onClick={() => {
                      const ids = template.sections.map(({ id }) => id);
                      [ids[sectionIndex - 1], ids[sectionIndex]] = [ids[sectionIndex], ids[sectionIndex - 1]];
                      reorderSections(ids);
                    }}>
                      Move up
                    </Button>
                  )}
                  {sectionIndex < template.sections.length - 1 && (
                    <Button onClick={() => {
                      const ids = template.sections.map(({ id }) => id);
                      [ids[sectionIndex + 1], ids[sectionIndex]] = [ids[sectionIndex], ids[sectionIndex + 1]];
                      reorderSections(ids);
                    }}>
                      Move down
                    </Button>
                  )}
                </Stack>
              </Stack>
            </AccordionDetails>
          </Accordion>
        ))}
      </Stack>
    </Box>
  );
}

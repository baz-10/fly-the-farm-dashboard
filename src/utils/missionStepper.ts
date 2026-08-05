export type MissionStepState = 'COMPLETE' | 'CURRENT' | 'INCOMPLETE' | 'BLOCKED' | 'OPTIONAL' | 'NEEDS_REVIEW';

export type MissionStepStatus = {
  state: MissionStepState;
  reason: string;
};

const complete = (reason: string): MissionStepStatus => ({ state: 'COMPLETE', reason });
const blocked = (reason: string): MissionStepStatus => ({ state: 'BLOCKED', reason });

export function deriveGuidedSetupStepStates(input: {
  currentStep: number;
  clientId: string | null;
  propertyId: string | null;
  fieldId: string | null;
  jobId: string | null;
  missionId?: string | null;
}): MissionStepStatus[] {
  const ids = [input.clientId, input.propertyId, input.fieldId, input.jobId, input.missionId || null];
  const labels = ['Customer', 'Property', 'Field', 'Job', 'Mission'];
  const result: MissionStepStatus[] = ids.map((id, index) => id
    ? complete(`${labels[index]} is saved authoritatively.`)
    : blocked(`${labels[index]} must be saved before later Mission steps are available.`));
  result.push(
    blocked('Create the authoritative Draft Mission before editing its map.'),
    blocked('Create the authoritative Draft Mission before assigning resources.'),
    blocked('Create the authoritative Draft Mission before recording Weather and Chemicals.'),
    blocked('Create the authoritative Draft Mission before completing the JSA.'),
    blocked('Create the authoritative Draft Mission before final review.'),
  );
  const firstMissing = result.findIndex((step) => step.state !== 'COMPLETE');
  if (firstMissing >= 0) {
    const requested = Math.min(Math.max(input.currentStep, 0), firstMissing);
    if (requested < firstMissing) result[firstMissing] = { state: 'NEEDS_REVIEW', reason: `${labels[firstMissing] || 'This step'} is the next required step.` };
    result[requested] = {
      state: 'CURRENT',
      reason: requested < input.currentStep
        ? `${labels[requested] || 'This step'} needs review before continuing.`
        : `You are currently working on ${labels[requested] || 'this Mission step'}.`,
    };
  }
  return result;
}

const categoryComplete = (categories: Record<string, unknown>, names: string[]) => names.every((name) => {
  const value = Object.entries(categories).find(([key]) => key.toLowerCase().includes(name))?.[1];
  return value === 'COMPLETE' || value === 'READY' || value === true;
});

export function deriveMissionPlannerStepStates(input: {
  hasClient: boolean;
  hasProperty: boolean;
  hasField: boolean;
  hasJob: boolean;
  hasMission: boolean;
  hasMap: boolean;
  hasResources: boolean;
  readinessCategories?: Record<string, unknown>;
  missionReady?: boolean;
  invalidatedBy?: 'FIELD' | 'AIRCRAFT' | null;
}): MissionStepStatus[] {
  const prerequisites = [input.hasClient, input.hasProperty, input.hasField, input.hasJob, input.hasMission];
  const labels = ['Customer', 'Property', 'Field', 'Job', 'Mission'];
  const result: MissionStepStatus[] = prerequisites.map((ready, index) => ready
    ? complete(`${labels[index]} is saved authoritatively.`)
    : blocked(`${labels[index]} authoritative data is unavailable.`));
  result.push(
    !input.hasMission ? blocked('Create the authoritative Draft Mission before editing its map.')
      : input.hasMap ? complete('An authoritative Mission map revision is saved.') : { state: 'INCOMPLETE', reason: 'Save the Mission map before operations.' },
    !input.hasMission ? blocked('Create the authoritative Draft Mission before assigning resources.')
      : input.hasResources ? complete('Aircraft and Equipment assignments are saved.') : { state: 'INCOMPLETE', reason: 'Review and save Aircraft and Equipment assignments.' },
  );
  const categories = input.readinessCategories || {};
  result.push(
    !input.hasMap || !input.hasResources
      ? blocked('Save the Mission map and resources before reviewing Weather and Chemicals.')
      : categoryComplete(categories, ['weather', 'chemical'])
      ? complete('Weather and Chemical evidence are complete.')
      : { state: 'NEEDS_REVIEW', reason: 'Review Weather and Chemical evidence.' },
    !categoryComplete(categories, ['weather', 'chemical'])
      ? blocked('Complete Weather and Chemical evidence before final JSA review.')
      : categoryComplete(categories, ['jsa'])
      ? complete('The authoritative JSA is approved.')
      : { state: 'NEEDS_REVIEW', reason: 'Complete and approve the Mission JSA.' },
    input.missionReady
      ? complete('Mission readiness requirements are satisfied.')
      : blocked('Resolve outstanding readiness items before review and authorisation.'),
  );

  if (input.invalidatedBy === 'FIELD') {
    result[5] = { state: 'NEEDS_REVIEW', reason: 'Map requires review after Field change.' };
    result[7] = { state: 'NEEDS_REVIEW', reason: 'Weather and Chemicals require review after Field change.' };
    result[8] = { state: 'NEEDS_REVIEW', reason: 'JSA requires review after Field change.' };
  }
  if (input.invalidatedBy === 'AIRCRAFT') {
    result[8] = { state: 'NEEDS_REVIEW', reason: 'JSA requires review after Aircraft change.' };
  }

  const firstActionable = result.findIndex((step) => step.state === 'INCOMPLETE' || step.state === 'NEEDS_REVIEW');
  if (firstActionable >= 0) result[firstActionable] = { ...result[firstActionable], state: 'CURRENT' };
  else if (!input.missionReady) {
    const reviewIndex = result.length - 1;
    result[reviewIndex] = { ...result[reviewIndex], state: 'CURRENT' };
  }
  return result;
}

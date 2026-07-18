import { WorkPackSnapshot, WorkPackTemplate } from '../types/workPack';

interface TemplateReferences {
  truckIds: string[];
  aircraftIds: string[];
  kitIds: string[];
}

function defaultId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `work-pack-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function instantiateWorkPackTemplate(
  template: WorkPackTemplate,
  jobId?: string,
  createId: () => string = defaultId,
): WorkPackSnapshot {
  const now = new Date().toISOString();
  return {
    id: createId(),
    sourceTemplateId: template.id,
    jobId,
    name: template.name,
    description: template.description,
    assetIds: template.assetIds ? [...template.assetIds] : undefined,
    truckId: template.truckId,
    aircraftAssignments: template.aircraftAssignments.map((assignment) => ({
      ...assignment,
      id: createId(),
    })),
    crewRequirements: template.crewRequirements.map((requirement) => ({
      ...requirement,
      id: createId(),
    })),
    checklist: [...template.checklist],
    notes: template.notes,
    createdAt: now,
    updatedAt: now,
  };
}

export function validateTemplateReferences(
  template: WorkPackTemplate,
  references: TemplateReferences,
): string[] {
  const errors: string[] = [];
  if (!references.truckIds.includes(template.truckId)) {
    errors.push('Truck is no longer available');
  }
  template.aircraftAssignments.forEach((assignment, index) => {
    if (!references.aircraftIds.includes(assignment.aircraftId)) {
      errors.push(`Aircraft in slot ${index + 1} is no longer available`);
    }
    if (!references.kitIds.includes(assignment.kitId)) {
      errors.push(`Equipment kit in slot ${index + 1} is no longer available`);
    }
  });
  return errors;
}

export function summariseWorkPackAssets(template: WorkPackTemplate): string {
  const aircraftCount = template.aircraftAssignments.length;
  const crewCount = template.crewRequirements.reduce((total, requirement) => total + requirement.quantity, 0);
  return `${aircraftCount} aircraft · ${crewCount} crew roles filled`;
}

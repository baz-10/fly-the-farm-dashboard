import { MissionRecord } from '../../types/mission';
import { DeploymentAsset, WorkPackTemplate } from '../../types/workPack';
import {
  applyWorkPackTemplate,
  buildMissionWorkPack,
  syncPrimaryAircraftConfiguration,
} from '../missionWorkPack';

const costs = {
  purchasePrice: 1, currentValue: 1, financePaymentMonthly: 0, registrationAnnual: 0,
  insuranceAnnual: 0, depreciationAnnual: 0, servicingAnnual: 0, tyresAnnual: 0,
  fuelCostPerLitre: 2, averageFuelLitresPer100Km: 10, costPerHour: 10, costPerDay: 50, costPerKm: 1,
};

function asset(id: string, assetType: 'truck' | 'trailer'): DeploymentAsset {
  return {
    id, assetType, registration: id.toUpperCase(), name: id, manufacturer: 'Maker', model: 'Model',
    year: 2025, vin: `${id}-vin`, ownershipType: 'owned', operationalNotes: '', status: 'available',
    costs: { ...costs }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const truckAsset = asset('truck-1', 'truck');
const trailerAsset = asset('trailer-1', 'trailer');
const template: WorkPackTemplate = {
  id: 'template-1', name: 'Spray team', description: '', status: 'active', truckId: 'truck-1',
  aircraftAssignments: [{ id: 'slot-1', aircraftId: 'aircraft-1', kitId: 'kit-1', label: 'Primary' }],
  crewRequirements: [{ id: 'crew-1', role: 'pilot', quantity: 1, notes: 'Licensed' }],
  checklist: ['Load aircraft'], notes: 'Template note',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

test('copies selected assets and assignments into a stable mission snapshot', () => {
  const sourceTemplate: WorkPackTemplate = {
    ...template,
    aircraftAssignments: template.aircraftAssignments.map((item) => ({ ...item })),
    crewRequirements: template.crewRequirements.map((item) => ({ ...item })),
    checklist: [...template.checklist],
  };
  const selectedTrailer = asset('selected-trailer', 'trailer');
  const draft = applyWorkPackTemplate(sourceTemplate, [truckAsset, selectedTrailer]);
  const snapshot = buildMissionWorkPack({
    ...draft,
    aircraftAssignments: [{ ...draft.aircraftAssignments![0], carryingAssetId: selectedTrailer.id }],
    towVehicle: { registration: 'PRIVATE-UTE', driver: 'Sam', notes: '' },
  });

  expect(snapshot?.sourceTemplateId).toBe(sourceTemplate.id);
  expect(snapshot?.assets.map((item) => item.assetType)).toEqual(['truck', 'trailer']);
  expect(snapshot?.aircraftAssignments[0].carryingAssetId).toBe(selectedTrailer.id);
  expect(snapshot?.towVehicle?.registration).toBe('PRIVATE-UTE');
  expect(snapshot?.checklist).toEqual(['Load aircraft']);
  expect(snapshot?.costingComplete).toBe(false);

  selectedTrailer.name = 'Changed later';
  sourceTemplate.aircraftAssignments[0].label = 'Changed later';
  sourceTemplate.crewRequirements[0].notes = 'Changed later';
  sourceTemplate.checklist[0] = 'Changed later';
  expect(snapshot?.assets[1].name).not.toBe('Changed later');
  expect(snapshot?.aircraftAssignments[0].label).not.toBe('Changed later');
  expect(snapshot?.crewRequirements[0].notes).not.toBe('Changed later');
  expect(snapshot?.checklist[0]).not.toBe('Changed later');
});

test('allows a trailer without a fleet truck and optional tow details', () => {
  const draft = applyWorkPackTemplate(template, [trailerAsset]);
  const snapshot = buildMissionWorkPack(draft);
  expect(snapshot?.assets.map((item) => item.assetType)).toEqual(['trailer']);
  expect(snapshot?.towVehicle).toBeUndefined();
});

test('rejects a fourth aircraft assignment', () => {
  const draft = applyWorkPackTemplate(template, [truckAsset]);
  const fourAssignments = Array.from({ length: 4 }, (_, index) => ({
    id: `slot-${index}`, aircraftId: `aircraft-${index}`, kitId: `kit-${index}`, label: `Slot ${index}`,
  }));
  expect(() => buildMissionWorkPack({ ...draft, aircraftAssignments: fourAssignments }))
    .toThrow('A mission work pack supports up to 3 aircraft.');
});

test('returns undefined for a fully empty draft', () => {
  expect(buildMissionWorkPack({})).toBeUndefined();
});

test('syncs the first work-pack assignment while retaining primary flight estimates', () => {
  const fallback: MissionRecord['aircraftConfiguration'] = {
    aircraftId: 'old-aircraft', kitId: 'old-kit', configurationId: 'config-1',
    estimatedFlightTime: 60, maxPayloadWeight: 40,
  };
  const workPack = buildMissionWorkPack(applyWorkPackTemplate(template, [truckAsset]));
  expect(syncPrimaryAircraftConfiguration(workPack, fallback)).toEqual({
    ...fallback, aircraftId: 'aircraft-1', kitId: 'kit-1',
  });
  expect(syncPrimaryAircraftConfiguration(undefined, fallback)).toBe(fallback);
});

test('preserves the legacy aircraft configuration when work-pack rows are placeholders', () => {
  const fallback: MissionRecord['aircraftConfiguration'] = {
    aircraftId: 'legacy-aircraft', kitId: 'legacy-kit', configurationId: 'config-1',
    estimatedFlightTime: 60, maxPayloadWeight: 40,
  };
  const workPack = buildMissionWorkPack({
    aircraftAssignments: [
      { id: 'placeholder', aircraftId: '', kitId: '', label: 'Aircraft 1' },
      { id: 'complete', aircraftId: 'aircraft-2', kitId: 'kit-2', label: 'Aircraft 2' },
    ],
  });

  expect(syncPrimaryAircraftConfiguration(workPack, fallback)).toBe(fallback);
});

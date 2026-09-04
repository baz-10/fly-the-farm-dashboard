import { classifyMissionAmendment } from '../amendmentPolicy';

describe('Mission amendment policy', () => {
  it.each([
    ['fieldIds', ['field-a'], ['field-a', 'field-b'], 'MATERIAL', 'FIELD_SCOPE_CHANGED'],
    ['targetAreaHectares', '10.000000', '11.000000', 'MATERIAL', 'TARGET_AREA_CHANGED'],
    ['aircraftIds', ['aircraft-a'], ['aircraft-b'], 'MATERIAL', 'AIRCRAFT_ASSIGNMENT_CHANGED'],
    ['regulatedCrewIds', ['pilot-a'], ['pilot-b'], 'MATERIAL', 'REGULATED_CREW_CHANGED'],
    ['chemicalProductIds', ['product-a'], ['product-b'], 'MATERIAL', 'CHEMICAL_PRODUCT_CHANGED'],
    ['applicationMethod', 'AERIAL', 'GROUND', 'MATERIAL', 'APPLICATION_METHOD_CHANGED'],
    ['governedRate', '2.000000', '3.000000', 'MATERIAL', 'GOVERNED_RATE_CHANGED'],
    ['jsaHazards', ['hazard-a'], ['hazard-b'], 'MATERIAL', 'JSA_HAZARDS_CHANGED'],
    ['jsaControls', ['control-a'], ['control-b'], 'MATERIAL', 'JSA_CONTROLS_CHANGED'],
    ['safetyMapFeatures', ['powerline-a'], ['landing-zone-b'], 'MATERIAL', 'SAFETY_MAP_CHANGED'],
    ['operationalPermissions', ['permission-a'], ['permission-b'], 'MATERIAL', 'OPERATIONAL_PERMISSION_CHANGED'],
    ['actualFlightHours', undefined, '2.5000', 'ADMINISTRATIVE', undefined],
    ['flightLineEvidenceId', undefined, 'file-a', 'ADMINISTRATIVE', undefined],
    ['actualWeatherEvidence', undefined, { reportId: 'weather-a' }, 'ADMINISTRATIVE', undefined],
    ['completionNotes', undefined, 'Completed as planned.', 'ADMINISTRATIVE', undefined],
  ])('%s changes classify deterministically', (field, before, after, expected, reason) => {
    const result = classifyMissionAmendment({ before: { [field]: before }, after: { [field]: after } });
    expect(result.classification).toBe(expected);
    expect(result.reasons).toEqual(reason ? [reason] : []);
  });

  it('fails every unrecognised changed key closed as material', () => {
    expect(classifyMissionAmendment({ before: {}, after: { futureSafetySetting: true } })).toEqual({
      classification: 'MATERIAL', reasons: ['UNRECOGNISED_CHANGE'], changedKeys: ['futureSafetySetting'],
    });
  });

  it('ignores unchanged values and reports stable unique reasons in key order', () => {
    expect(classifyMissionAmendment({
      before: { fieldIds: ['field-a'], applicationMethod: 'AERIAL', completionNotes: 'same' },
      after: { fieldIds: ['field-b'], applicationMethod: 'GROUND', completionNotes: 'same' },
    })).toEqual({
      classification: 'MATERIAL',
      reasons: ['APPLICATION_METHOD_CHANGED', 'FIELD_SCOPE_CHANGED'],
      changedKeys: ['applicationMethod', 'fieldIds'],
    });
  });

  it('rejects invalid or prototype-bearing inputs instead of classifying them', () => {
    expect(() => classifyMissionAmendment({ before: null as never, after: {} })).toThrow('MISSION_AMENDMENT_INPUT_INVALID');
    const after = Object.create({ inherited: true });
    after.completionNotes = 'safe';
    expect(() => classifyMissionAmendment({ before: {}, after })).toThrow('MISSION_AMENDMENT_INPUT_INVALID');
  });
});

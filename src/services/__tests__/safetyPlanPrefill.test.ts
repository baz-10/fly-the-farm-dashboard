import { describe, expect, it } from 'vitest';

import { makeSafetyPlanTemplate } from '../../test/safetyPlanFixtures';
import type { JobRecord } from '../../types/fieldManagement';
import type { MissionRecord } from '../../types/mission';
import type { SafetyPlanActor } from '../../types/safetyPlan';
import { buildJobSafetyPlan } from '../safetyPlanPrefill';

const actor: SafetyPlanActor = {
  userId: 'admin-1',
  name: 'A. Admin',
  role: 'admin',
  operationalAuthority: true,
};

const job = {
  id: 'job-1',
  clientId: 'client-1',
  propertyId: 'property-1',
  fieldId: 'field-1',
  weedTarget: 'Blue heliotrope',
  chemicals: [{ product: 'Product A', activeIngredient: 'Example', ratePerHa: '2', treatmentId: null }],
  waterRateLHa: '40',
  adjuvants: 'None',
  dateSprayed: '2026-07-30',
  weather: { tempC: null, windSpeedKmh: null, windDirection: '', humidity: null, deltaT: null },
  sprayRec: null,
  droneModel: 'DJI T100',
  applicatorName: 'Remote Pilot',
  notes: 'Enter through the western gate',
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-23T00:00:00.000Z',
} satisfies JobRecord;

function linkedMission(id: string, jobId = job.id): MissionRecord {
  return {
    id,
    jobId,
    missionName: `Mission ${id}`,
    updatedAt: `2026-07-23T0${id === 'm1' ? '1' : '2'}:00:00.000Z`,
    jsaRecord: {
      id: `jsa-${id}`,
      updatedAt: `2026-07-23T0${id === 'm1' ? '1' : '2'}:30:00.000Z`,
      hazardIdentification: id === 'm1'
        ? [{
          id: 'hazard-1',
          category: 'external',
          description: 'Public gate access',
          riskLevel: 'high',
          likelihood: 'possible',
          consequence: 'major',
          controlMeasures: ['Use a spotter'],
          residualRisk: 'low',
        }]
        : [],
      missionChecks: id === 'm2'
        ? {
          answers: [{ questionId: 'power-lines', answer: true, notes: 'Lines on eastern boundary' }],
          generalComments: '',
          riskControls: [{
            questionId: 'power-lines',
            likelihood: 3,
            consequence: 4,
            mitigation: 'Maintain marked exclusion area',
            residualLikelihood: 1,
            residualConsequence: 3,
          }],
        }
        : undefined,
    },
  } as MissionRecord;
}

describe('buildJobSafetyPlan', () => {
  it('consolidates linked mission JSA risks and preserves source identity', () => {
    const result = buildJobSafetyPlan({
      tenantId: 'tenant-1',
      job,
      missions: [linkedMission('m1'), linkedMission('m2')],
      template: makeSafetyPlanTemplate(),
      actor,
      now: '2026-07-24T00:00:00.000Z',
    });

    expect(result.versions[0].sourceSnapshot.hazards).toEqual([
      expect.objectContaining({
        sourceId: 'm1',
        sourceRecordId: 'jsa-m1',
        sourceItemId: 'hazard-1',
        sourceType: 'jsa',
        value: 'Public gate access',
      }),
      expect.objectContaining({
        sourceId: 'm2',
        sourceRecordId: 'jsa-m2',
        sourceItemId: 'power-lines',
        sourceType: 'risk_assessment',
        value: 'Maintain marked exclusion area',
      }),
    ]);
    expect(
      result.versions[0].sections
        .find(({ id }) => id === 'consolidated_jsa_hazards_controls')
        ?.fields
    ).toContainEqual(expect.objectContaining({
      id: 'risk_assessment:m2:power-lines',
      value: 'Maintain marked exclusion area',
    }));
  });

  it('matches missions strictly by jobId and snapshots job context without reading storage', () => {
    const result = buildJobSafetyPlan({
      tenantId: 'tenant-1',
      company: { id: 'company-1', name: 'Operator Pty Ltd' },
      job,
      client: { id: 'client-1', name: 'Client One', phone: '0400 000 000', email: 'client@example.test' },
      property: { id: 'property-1', name: 'Western Farm', address: '1 Farm Road' },
      field: {
        id: 'field-1',
        name: 'North Field',
        sizeHa: 42,
        boundary: {
          fileName: 'north-field.kml',
          fileType: 'kml',
          sizeBytes: 1234,
          dataUrl: 'data:application/vnd.google-earth.kml+xml;base64,secret-payload',
          boundingBox: { north: -26, south: -27, east: 153, west: 152 },
          uploadedAt: '2026-07-22T00:00:00.000Z',
        },
        boundaryCoords: [[-26.5, 152.5], [-26.6, 152.6]],
      },
      missions: [linkedMission('wrong', 'other-job'), linkedMission('m1')],
      crew: [{ id: 'pilot-1', name: 'Pilot One', role: 'PIC' }],
      assets: [{ id: 'aircraft-1', name: 'DJI T100-001', type: 'aircraft' }],
      emergencyContacts: [{ name: 'Site manager', phone: '0400 111 111' }],
      template: makeSafetyPlanTemplate(),
      actor,
      now: '2026-07-24T00:00:00.000Z',
    });

    expect(result.versions[0].sourceSnapshot).toMatchObject({
      capturedAt: '2026-07-24T00:00:00.000Z',
      company: { id: 'company-1', name: 'Operator Pty Ltd' },
      job: {
        id: 'job-1',
        clientName: 'Client One',
        propertyName: 'Western Farm',
        fieldName: 'North Field',
        location: '1 Farm Road',
        operatingDates: '2026-07-30',
        siteNotes: 'Enter through the western gate',
      },
      missions: [{ id: 'm1', name: 'Mission m1' }],
      crew: [{ id: 'pilot-1', name: 'Pilot One', role: 'PIC' }],
      assets: [{ id: 'aircraft-1', name: 'DJI T100-001', type: 'aircraft' }],
      chemicals: [expect.objectContaining({ product: 'Product A' })],
      emergencyContacts: [{ name: 'Site manager', phone: '0400 111 111' }],
      siteMap: {
        boundary: {
          fileName: 'north-field.kml',
          fileType: 'kml',
          sizeBytes: 1234,
          boundingBox: { north: -26, south: -27, east: 153, west: 152 },
          uploadedAt: '2026-07-22T00:00:00.000Z',
        },
        boundaryCoords: [[-26.5, 152.5], [-26.6, 152.6]],
      },
    });
    expect(result.versions[0].sourceSnapshot.sourceLinks).not.toContainEqual(
      expect.objectContaining({ sourceId: 'wrong' })
    );
  });

  it('is deterministic for an explicit timestamp and sorts linked missions by identity', () => {
    const input = {
      tenantId: 'tenant-1',
      job,
      missions: [linkedMission('m2'), linkedMission('m1')],
      template: makeSafetyPlanTemplate(),
      actor,
      now: '2026-07-24T00:00:00.000Z',
    };

    expect(buildJobSafetyPlan(input)).toEqual(buildJobSafetyPlan(input));
    expect(buildJobSafetyPlan(input).versions[0].sourceSnapshot.missions.map(({ id }) => id))
      .toEqual(['m1', 'm2']);
  });

  it('snapshots typed site-map boundary metadata and coordinates without file payload data', () => {
    const field = {
      id: 'field-1',
      name: 'North Field',
      sizeHa: 42,
      boundary: {
        fileName: 'north-field.kml',
        fileType: 'kml' as const,
        sizeBytes: 1234,
        dataUrl: 'data:application/vnd.google-earth.kml+xml;base64,secret-payload',
        uploadedAt: '2026-07-22T00:00:00.000Z',
      },
      boundaryCoords: [[-26.5, 152.5], [-26.6, 152.6]] as Array<[number, number]>,
    };

    const result = buildJobSafetyPlan({
      tenantId: 'tenant-1',
      job,
      field,
      missions: [],
      template: makeSafetyPlanTemplate(),
      actor,
      now: '2026-07-24T00:00:00.000Z',
    });

    expect(result.versions[0].sourceSnapshot.siteMap).toEqual({
      boundary: {
        fileName: 'north-field.kml',
        fileType: 'kml',
        sizeBytes: 1234,
        uploadedAt: '2026-07-22T00:00:00.000Z',
      },
      boundaryCoords: [[-26.5, 152.5], [-26.6, 152.6]],
    });
    expect(JSON.stringify(result)).not.toContain('secret-payload');
  });
});

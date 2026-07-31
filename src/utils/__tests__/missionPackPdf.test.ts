import { describe, expect, it } from 'vitest';

import type { MissionRecord } from '../../types/mission';
import {
  buildMissionPackPdf,
  missionPackPdfFilename,
} from '../missionPackPdf';

function extractMissionPackText(
  doc: ReturnType<typeof buildMissionPackPdf>
): string {
  return Array.from(
    (doc as unknown as { __missionPackText?: string[] }).__missionPackText ?? []
  ).join('\n');
}

describe('Mission Pack PDF', () => {
  it('creates a stable sanitised filename', () => {
    expect(missionPackPdfFilename({
      missionNumber: 'MSN-001',
      missionName: 'North / Block: Spray',
    })).toBe('Mission_Pack_MSN-001_North_Block_Spray.pdf');
  });

  it('exports an incomplete legacy mission without blocking', () => {
    const mission = {
      id: 'mission-legacy',
      missionNumber: 'MSN-LEGACY',
      missionName: 'Legacy mission',
      status: 'Planning',
      scheduledDate: '',
    } as MissionRecord;

    const text = extractMissionPackText(buildMissionPackPdf(mission, {
      generatedAt: new Date('2026-07-31T03:00:00.000Z'),
    }));

    expect(text).toContain('MISSION PACK');
    expect(text).toContain('Legacy mission');
    expect(text).toContain('MSN-LEGACY');
    expect(text).toContain('Not recorded');
  });

  it('includes operational, JSA, risk and approval records but excludes financial data', () => {
    const mission = {
      id: 'mission-1',
      missionNumber: 'MSN-2026-0042',
      missionName: 'Northern paddock spray',
      missionType: 'spray',
      priority: 'high',
      status: 'Approved',
      description: 'Apply registered product to northern paddock.',
      clientId: 'client-1',
      location: {
        name: 'Northern paddock',
        address: '10 Farm Road, Toowoomba',
        coordinates: { latitude: -27.5598, longitude: 151.9507 },
        elevation: 691,
      },
      scheduledDate: '2026-08-01T22:00:00.000Z',
      estimatedDuration: 135,
      weatherRequirements: {
        maxWindSpeed: 15,
        minVisibility: 5000,
        maxPrecipitationChance: 20,
        allowedCloudCover: 80,
      },
      aircraftConfiguration: {
        aircraftId: 'FTF-T100-001',
        kitId: 'T100-Spray-Base',
        estimatedFlightTime: 95,
        maxPayloadWeight: 100,
      },
      deploymentWorkPack: {
        assets: [{
          id: 'truck-1',
          assetType: 'truck',
          registration: 'FTF100',
          name: 'Operations Truck',
          manufacturer: 'Isuzu',
          model: 'NPS',
          year: 2025,
          vin: 'VIN-1',
          ownershipType: 'owned',
          operationalNotes: 'Carries mix station',
          status: 'available',
          costs: {},
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        }],
        aircraftAssignments: [{
          id: 'assignment-1',
          aircraftId: 'FTF-T100-001',
          kitId: 'T100-Spray-Base',
          label: 'Primary T100',
          carryingAssetId: 'truck-1',
        }],
        supportingEquipment: [{
          id: 'support-1',
          note: 'Generator and mix pump',
          carryingAssetId: 'truck-1',
        }],
        crewRequirements: [{
          id: 'crew-1',
          role: 'pilot',
          quantity: 1,
          notes: 'T100 endorsement',
        }],
        checklist: ['Load aircraft', 'Confirm spill kit'],
        notes: 'Depart depot at 05:00',
        estimatedDeploymentCost: 987654,
        costingComplete: true,
        createdAt: '2026-07-31T00:00:00.000Z',
      },
      planningState: {
        clientName: 'Sample Client',
        propertyName: 'Sample Farm',
        fieldName: 'Northern paddock',
        missionNotes: 'Contact farm manager on arrival.',
        boundaryCoords: [[-27.56, 151.95]],
        boundaryMetadata: [{
          id: 'boundary-1',
          name: 'Spray boundary',
          notes: 'Keep 20m from creek',
        }],
        mapFeatures: [{
          id: 'feature-1',
          type: 'obstacle',
          label: 'Power pole',
          notes: 'Maintain visual separation',
          geometry: { type: 'Point', coordinates: [151.95, -27.56] },
        }],
        operation: {
          applicationRateLHa: 25,
          perimeterKm: 4.2,
          bufferZones: 1,
          exclusionZones: 1,
          estimatedBatteryChanges: 4,
          flightLines: 28,
          turnAroundCount: 27,
        },
        weatherWindow: {
          startTime: '08:00',
          endTime: '11:00',
          windDirection: 'SE',
          windSpeedKmh: 8,
          windGustKmh: 12,
          temperatureC: 21,
          rainChancePercent: 10,
        },
        weatherSnapshot: {
          source: 'Open-Meteo',
          fetchedAt: '2026-07-31T03:00:00.000Z',
          forecastDate: '2026-08-02',
          plannedStart: '08:00',
          durationMinutes: 135,
          timezone: 'Australia/Brisbane',
          temperatureC: 21,
          humidityPercent: 65,
          windSpeedKmh: 8,
          windGustKmh: 12,
          windDirection: 'SE',
        },
        chemicals: [{
          product: 'Example Herbicide',
          ratePerHa: 1.5,
          unit: 'L',
          totalRequired: 45,
        }],
      },
      boundaryFiles: [{
        id: 'boundary-file-1',
        fileName: 'north-paddock.kml',
        fileType: 'kml',
        fileSize: 4096,
        analysis: {
          status: 'completed',
          geometry: {
            totalArea: 30,
            perimeter: 4200,
            complexity: 'simple',
            isValid: true,
            validationErrors: [],
          },
          riskFactors: [{
            id: 'boundary-risk-1',
            type: 'water-sources',
            description: 'Creek along western edge',
            severity: 'medium',
            mitigationRequired: true,
            bufferZoneRequired: 20,
          }],
          complianceIssues: [],
        },
      }],
      jsaRecord: {
        id: 'jsa-1',
        missionId: 'mission-1',
        jsaType: 'standard-spray',
        status: 'approved',
        jsaNumber: 'JSA-2026-0042',
        completedBy: 'Pat Pilot',
        completedDate: '2026-07-31T04:00:00.000Z',
        missionChecks: {
          answers: [
            { questionId: 'maps', answer: true, notes: 'Charts checked in OzRunways.' },
            { questionId: 'people', answer: true, notes: 'Farm staff may enter the paddock.' },
          ],
          generalComments: 'Brief all personnel before launch.',
          riskControls: [{
            questionId: 'people',
            likelihood: 3,
            consequence: 3,
            mitigation: 'Install signage and use a spotter.',
            residualLikelihood: 1,
            residualConsequence: 3,
          }],
        },
        hazardIdentification: [{
          id: 'hazard-1',
          category: 'environmental',
          description: 'Creek contamination',
          riskLevel: 'high',
          likelihood: 'possible',
          consequence: 'major',
          controlMeasures: ['Maintain mapped buffer'],
          residualRisk: 'low',
        }],
        safetyRequirements: {
          personnelRequirements: {
            minimumCrewSize: 2,
            requiredQualifications: ['RePL'],
            requiredTraining: ['Chemical handling'],
          },
          equipmentRequirements: {
            requiredSafetyEquipment: ['PPE'],
            emergencyEquipment: ['Spill kit'],
            communicationEquipment: ['UHF'],
            backupSystems: ['Secondary landing zone'],
          },
          operationalConstraints: {
            weatherLimitations: ['Wind below 15 km/h'],
            proximityRestrictions: ['30m public separation'],
            specialProcedures: ['Spotter controls access'],
          },
        },
        emergencyProcedures: {
          communicationPlan: {
            primaryContact: 'Farm manager',
            secondaryContact: 'Operations manager',
            emergencyServices: ['000'],
          },
          evacuationPlan: 'Use eastern access road.',
          equipmentFailureProcedures: ['Land at secondary LZ'],
          medicalEmergencyPlan: 'Call 000 and meet at gate.',
        },
        signOffs: {
          pilot: {
            userId: 'pilot-1',
            signature: 'Pat Pilot',
            signedAt: '2026-07-31T04:00:00.000Z',
          },
        },
        createdAt: '2026-07-31T03:00:00.000Z',
        updatedAt: '2026-07-31T04:00:00.000Z',
      },
      approvals: {
        missionId: 'mission-1',
        planningApproval: {
          approvedBy: 'Chief Remote Pilot',
          approvedAt: '2026-07-31T05:00:00.000Z',
          digitalSignature: 'CRP Signature',
          conditions: ['Weather recheck before launch'],
          comments: 'Approved for daylight operations.',
        },
        createdAt: '2026-07-31T03:00:00.000Z',
        updatedAt: '2026-07-31T05:00:00.000Z',
      },
      complianceChecks: {
        casaNotification: true,
        airspaceApproval: true,
        localPermits: false,
        environmentalClearance: true,
        insuranceCoverage: true,
      },
      auditTrail: [{
        id: 'audit-1',
        missionId: 'mission-1',
        timestamp: '2026-07-31T05:00:00.000Z',
        userId: 'crp-1',
        action: 'approved',
        changes: [],
        comments: 'Planning approved.',
      }],
      financialEstimate: {
        aircraftCost: 'PRIVATE-ESTIMATE-SENTINEL',
        totalEstimatedCost: 123456,
      },
      financialActual: {
        profitMargin: 'PRIVATE-MARGIN-SENTINEL',
        totalActualCost: 234567,
      },
      createdAt: '2026-07-31T03:00:00.000Z',
      updatedAt: '2026-07-31T05:00:00.000Z',
      createdBy: 'planner-1',
      lastModifiedBy: 'crp-1',
    } as unknown as MissionRecord;

    const text = extractMissionPackText(buildMissionPackPdf(mission, {
      generatedAt: new Date('2026-07-31T06:00:00.000Z'),
    }));

    [
      'Mission and site',
      'Aircraft and deployment work pack',
      'Planned operation',
      'Weather',
      'Boundary, map and flight plan',
      'Mission Checks / JSA',
      'Risk Assessment',
      'Compliance and authorisations',
      'Audit and execution',
      'Have you investigated the necessary maps and charts',
      'Charts checked in OzRunways.',
      'Is there a possibility of a person moving into the area',
      'Initial score: 9',
      'Install signage and use a spotter.',
      'Residual score: 3',
      'Chief Remote Pilot',
      'Operations Truck',
      'Example Herbicide',
      'Power pole',
    ].forEach((expected) => expect(text).toContain(expected));

    expect(text).not.toContain('PRIVATE-ESTIMATE-SENTINEL');
    expect(text).not.toContain('PRIVATE-MARGIN-SENTINEL');
    expect(text).not.toContain('123456');
    expect(text).not.toContain('234567');
    expect(text).not.toContain('987654');
  });
});

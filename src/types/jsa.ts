// Enhanced JSA Types for Triple Dropdown System
export type JSASystemType = 'standard' | 'comprehensive' | 'industry-specific';
export type IndustryType = 'crop-spraying' | 'surveying' | 'inspections';
export type RiskLevel = 'low' | 'medium' | 'high' | 'extreme';
export type LikelihoodLevel = 'low' | 'medium' | 'high';
export type ConsequenceLevel = 'minor' | 'moderate' | 'major' | 'catastrophic';

// Risk Matrix Calculation
export interface RiskMatrix {
  likelihood: LikelihoodLevel;
  consequence: ConsequenceLevel;
  riskLevel: RiskLevel;
  requiresCRPApproval: boolean;
}

// Base Hazard Interface
export interface JSAHazard {
  id: string;
  category: 'weather' | 'obstacles' | 'wildlife' | 'mechanical' | 'human-factors' |
           'airspace' | 'ground-personnel' | 'battery' | 'chemical' | 'privacy' |
           'infrastructure' | 'electrical' | 'thermal' | 'custom';
  title: string;
  description: string;
  likelihood: LikelihoodLevel;
  consequence: ConsequenceLevel;
  riskLevel: RiskLevel;
  mitigations: string[];
  residualRisk: RiskLevel;
  isPreDefined: boolean;
}

// Industry-Specific Hazard Categories
export interface CropSprayingHazards {
  chemicalExposure: JSAHazard;
  drift: JSAHazard;
  restrictedZones: JSAHazard;
  tankContamination: JSAHazard;
  payloadLimits: JSAHazard;
}

export interface SurveyingHazards {
  privacyConcerns: JSAHazard;
  dataSecurity: JSAHazard;
  equipmentCalibration: JSAHazard;
  weatherImpact: JSAHazard;
  restrictedAreas: JSAHazard;
}

export interface InspectionHazards {
  infrastructureHazards: JSAHazard;
  confinedSpaces: JSAHazard;
  emergencyAccess: JSAHazard;
  electricalHazards: JSAHazard;
  thermalImaging: JSAHazard;
}

// Enhanced JSA Record for new system
export interface JSASystemRecord {
  id: string;
  missionId: string;
  systemType: JSASystemType;
  industryType?: IndustryType;
  status: 'draft' | 'in-progress' | 'completed' | 'approved' | 'rejected';

  // Metadata
  jsaNumber: string;
  title: string;
  completedBy: string; // User ID
  reviewedBy?: string; // CRP User ID
  completedDate?: string;
  reviewedDate?: string;

  // Responsible Person (auto-populated from license)
  responsiblePerson: {
    name: string;
    licenseNumber: string;
    company: string;
    contactDetails: string;
  };

  // Hazard Analysis
  hazards: JSAHazard[];

  // Overall Risk Assessment
  overallRisk: {
    highestRiskLevel: RiskLevel;
    totalHazards: number;
    highRiskHazards: number;
    extremeRiskHazards: number;
    requiresCRPApproval: boolean;
    crpApprovalComments?: string;
  };

  // Digital Signatures
  signatures: {
    pilot: {
      userId: string;
      name: string;
      signature: string;
      signedAt: string;
    };
    crp?: {
      userId: string;
      name: string;
      signature: string;
      signedAt: string;
      comments?: string;
    };
  };

  // Emergency Contact Information
  emergencyContacts: {
    primary: {
      name: string;
      relationship: string;
      phone: string;
    };
    secondary?: {
      name: string;
      relationship: string;
      phone: string;
    };
    emergencyServices: string[];
  };

  createdAt: string;
  updatedAt: string;
}

// Standard JSA Template with predefined hazards
export interface StandardJSATemplate {
  id: string;
  name: string;
  description: string;
  predefinedHazards: {
    weather: JSAHazard;
    obstacles: JSAHazard;
    wildlife: JSAHazard;
    mechanical: JSAHazard;
    humanFactors: JSAHazard;
    airspace: JSAHazard;
    groundPersonnel: JSAHazard;
    battery: JSAHazard;
  };
  standardMitigations: Record<string, string[]>;
}

// Risk Matrix Logic
export const RISK_MATRIX: Record<LikelihoodLevel, Record<ConsequenceLevel, RiskLevel>> = {
  low: {
    minor: 'low',
    moderate: 'low',
    major: 'medium',
    catastrophic: 'high'
  },
  medium: {
    minor: 'low',
    moderate: 'medium',
    major: 'high',
    catastrophic: 'extreme'
  },
  high: {
    minor: 'medium',
    moderate: 'high',
    major: 'extreme',
    catastrophic: 'extreme'
  }
};

// Color mapping for risk levels
export const RISK_COLORS: Record<RiskLevel, string> = {
  low: '#4caf50',      // Green
  medium: '#ff9800',   // Orange
  high: '#f44336',     // Red
  extreme: '#9c27b0'   // Purple
};

// Helper functions
export function calculateRiskLevel(likelihood: LikelihoodLevel, consequence: ConsequenceLevel): RiskLevel {
  return RISK_MATRIX[likelihood][consequence];
}

export function requiresCRPApproval(riskLevel: RiskLevel): boolean {
  return riskLevel === 'high' || riskLevel === 'extreme';
}

export function getRiskColor(riskLevel: RiskLevel): string {
  return RISK_COLORS[riskLevel];
}

// JSA Template Factory
export class JSATemplateFactory {
  static createStandardTemplate(): StandardJSATemplate {
    return {
      id: 'standard-template',
      name: 'Standard JSA Template',
      description: 'Standard Job Safety Analysis for routine drone operations',
      predefinedHazards: {
        weather: {
          id: 'weather',
          category: 'weather',
          title: 'Adverse Weather Conditions',
          description: 'Wind, rain, low visibility, or extreme temperatures affecting safe operation',
          likelihood: 'medium',
          consequence: 'major',
          riskLevel: 'high',
          mitigations: [
            'Check weather forecast before operations',
            'Monitor wind conditions continuously',
            'Establish weather minimums for operations',
            'Have contingency plans for weather changes'
          ],
          residualRisk: 'medium',
          isPreDefined: true
        },
        obstacles: {
          id: 'obstacles',
          category: 'obstacles',
          title: 'Obstacles and Structures',
          description: 'Buildings, trees, powerlines, towers, or other physical obstructions',
          likelihood: 'medium',
          consequence: 'major',
          riskLevel: 'high',
          mitigations: [
            'Conduct thorough site survey before operations',
            'Maintain safe separation distances',
            'Use visual observers when necessary',
            'Plan flight path to avoid known obstacles'
          ],
          residualRisk: 'medium',
          isPreDefined: true
        },
        wildlife: {
          id: 'wildlife',
          category: 'wildlife',
          title: 'Wildlife Interference',
          description: 'Birds, bats, or other animals that may interfere with aircraft operation',
          likelihood: 'low',
          consequence: 'moderate',
          riskLevel: 'low',
          mitigations: [
            'Monitor for wildlife activity before flight',
            'Avoid known nesting or feeding areas',
            'Plan operations outside peak wildlife activity times',
            'Be prepared to abort if wildlife presents hazard'
          ],
          residualRisk: 'low',
          isPreDefined: true
        },
        mechanical: {
          id: 'mechanical',
          category: 'mechanical',
          title: 'Equipment Malfunction',
          description: 'Failure of aircraft systems, sensors, or payload equipment',
          likelihood: 'medium',
          consequence: 'major',
          riskLevel: 'high',
          mitigations: [
            'Conduct pre-flight inspections',
            'Maintain equipment according to schedule',
            'Have backup equipment available',
            'Test all systems before operations'
          ],
          residualRisk: 'medium',
          isPreDefined: true
        },
        humanFactors: {
          id: 'human-factors',
          category: 'human-factors',
          title: 'Human Factors',
          description: 'Pilot fatigue, stress, distraction, or inadequate training affecting performance',
          likelihood: 'medium',
          consequence: 'major',
          riskLevel: 'high',
          mitigations: [
            'Ensure adequate rest before operations',
            'Maintain currency and proficiency',
            'Use checklists and standard procedures',
            'Recognize personal limitations'
          ],
          residualRisk: 'medium',
          isPreDefined: true
        },
        airspace: {
          id: 'airspace',
          category: 'airspace',
          title: 'Airspace Conflicts',
          description: 'Controlled airspace, other aircraft, or airspace restrictions',
          likelihood: 'low',
          consequence: 'catastrophic',
          riskLevel: 'high',
          mitigations: [
            'Check NOTAMs and airspace restrictions',
            'Obtain required approvals and clearances',
            'Maintain radio contact with ATC when required',
            'Monitor for other aircraft activity'
          ],
          residualRisk: 'medium',
          isPreDefined: true
        },
        groundPersonnel: {
          id: 'ground-personnel',
          category: 'ground-personnel',
          title: 'Ground Personnel Safety',
          description: 'Risk to ground crew, bystanders, or property during operations',
          likelihood: 'medium',
          consequence: 'major',
          riskLevel: 'high',
          mitigations: [
            'Establish safety perimeter around operations',
            'Brief all personnel on safety procedures',
            'Use spotters and safety officers',
            'Ensure clear communication with ground team'
          ],
          residualRisk: 'medium',
          isPreDefined: true
        },
        battery: {
          id: 'battery',
          category: 'battery',
          title: 'Battery/Power System Failure',
          description: 'Battery depletion, power system failure, or charging hazards',
          likelihood: 'medium',
          consequence: 'major',
          riskLevel: 'high',
          mitigations: [
            'Monitor battery levels continuously',
            'Plan for adequate battery reserves',
            'Use battery level warnings and alarms',
            'Have backup batteries available'
          ],
          residualRisk: 'medium',
          isPreDefined: true
        }
      },
      standardMitigations: {
        weather: [
          'Check weather forecast before operations',
          'Monitor wind conditions continuously',
          'Establish weather minimums for operations',
          'Have contingency plans for weather changes'
        ],
        obstacles: [
          'Conduct thorough site survey before operations',
          'Maintain safe separation distances',
          'Use visual observers when necessary',
          'Plan flight path to avoid known obstacles'
        ],
        wildlife: [
          'Monitor for wildlife activity before flight',
          'Avoid known nesting or feeding areas',
          'Plan operations outside peak wildlife activity times',
          'Be prepared to abort if wildlife presents hazard'
        ],
        mechanical: [
          'Conduct pre-flight inspections',
          'Maintain equipment according to schedule',
          'Have backup equipment available',
          'Test all systems before operations'
        ],
        humanFactors: [
          'Ensure adequate rest before operations',
          'Maintain currency and proficiency',
          'Use checklists and standard procedures',
          'Recognize personal limitations'
        ],
        airspace: [
          'Check NOTAMs and airspace restrictions',
          'Obtain required approvals and clearances',
          'Maintain radio contact with ATC when required',
          'Monitor for other aircraft activity'
        ],
        groundPersonnel: [
          'Establish safety perimeter around operations',
          'Brief all personnel on safety procedures',
          'Use spotters and safety officers',
          'Ensure clear communication with ground team'
        ],
        battery: [
          'Monitor battery levels continuously',
          'Plan for adequate battery reserves',
          'Use battery level warnings and alarms',
          'Have backup batteries available'
        ]
      }
    };
  }

  static createIndustryTemplate(industryType: IndustryType): JSAHazard[] {
    switch (industryType) {
      case 'crop-spraying':
        return [
          {
            id: 'chemical-exposure',
            category: 'chemical',
            title: 'Chemical Exposure Risk',
            description: 'Risk of exposure to agricultural chemicals during mixing, loading, or application',
            likelihood: 'medium',
            consequence: 'major',
            riskLevel: 'high',
            mitigations: [
              'Wear appropriate PPE during chemical handling',
              'Follow chemical label instructions exactly',
              'Use proper mixing and loading procedures',
              'Ensure adequate ventilation in mixing areas',
              'Have emergency wash stations available'
            ],
            residualRisk: 'medium',
            isPreDefined: true
          },
          {
            id: 'drift',
            category: 'chemical',
            title: 'Chemical Drift',
            description: 'Risk of chemical drift beyond target area affecting non-target areas, people, or environment',
            likelihood: 'high',
            consequence: 'major',
            riskLevel: 'extreme',
            mitigations: [
              'Monitor wind conditions continuously',
              'Use appropriate nozzles and droplet size',
              'Maintain proper flight altitude and speed',
              'Establish buffer zones around sensitive areas',
              'Consider weather inversions and atmospheric conditions'
            ],
            residualRisk: 'medium',
            isPreDefined: true
          },
          {
            id: 'restricted-zones',
            category: 'chemical',
            title: 'Restricted Application Zones',
            description: 'Risk of chemical application in prohibited areas (water sources, organic farms, bee sites)',
            likelihood: 'medium',
            consequence: 'catastrophic',
            riskLevel: 'extreme',
            mitigations: [
              'Identify all sensitive areas before operation',
              'Use GPS boundary systems',
              'Coordinate with neighboring properties',
              'Follow all label restrictions and setbacks',
              'Document all restricted areas clearly'
            ],
            residualRisk: 'medium',
            isPreDefined: true
          },
          {
            id: 'tank-contamination',
            category: 'chemical',
            title: 'Tank Contamination',
            description: 'Risk of cross-contamination between different chemicals or tank cleaning issues',
            likelihood: 'medium',
            consequence: 'major',
            riskLevel: 'high',
            mitigations: [
              'Follow proper tank cleaning procedures',
              'Use dedicated tanks for incompatible chemicals',
              'Rinse tanks between different chemical types',
              'Document cleaning procedures',
              'Test tanks for contamination when switching products'
            ],
            residualRisk: 'low',
            isPreDefined: true
          },
          {
            id: 'payload-limits',
            category: 'mechanical',
            title: 'Payload Weight Limits',
            description: 'Risk of exceeding aircraft payload limits affecting flight performance and safety',
            likelihood: 'medium',
            consequence: 'major',
            riskLevel: 'high',
            mitigations: [
              'Calculate payload weights before loading',
              'Monitor aircraft performance during flight',
              'Consider chemical density and temperature effects',
              'Plan for fuel consumption changes with payload',
              'Have procedures for emergency payload jettison'
            ],
            residualRisk: 'low',
            isPreDefined: true
          }
        ];

      case 'surveying':
        return [
          {
            id: 'privacy-concerns',
            category: 'privacy',
            title: 'Privacy and Data Protection',
            description: 'Risk of privacy violations or unauthorized data collection during survey operations',
            likelihood: 'medium',
            consequence: 'major',
            riskLevel: 'high',
            mitigations: [
              'Obtain required permissions for survey areas',
              'Inform affected parties of survey activities',
              'Follow privacy laws and regulations',
              'Secure data collection and storage systems',
              'Limit data collection to authorized purposes only'
            ],
            residualRisk: 'low',
            isPreDefined: true
          },
          {
            id: 'data-security',
            category: 'privacy',
            title: 'Data Security Breach',
            description: 'Risk of unauthorized access to collected survey data or system compromise',
            likelihood: 'low',
            consequence: 'major',
            riskLevel: 'medium',
            mitigations: [
              'Use encrypted data storage and transmission',
              'Implement secure authentication systems',
              'Regular security audits and updates',
              'Backup data to secure systems',
              'Train personnel in data security protocols'
            ],
            residualRisk: 'low',
            isPreDefined: true
          },
          {
            id: 'equipment-calibration',
            category: 'mechanical',
            title: 'Survey Equipment Calibration',
            description: 'Risk of inaccurate survey results due to equipment calibration issues',
            likelihood: 'medium',
            consequence: 'moderate',
            riskLevel: 'medium',
            mitigations: [
              'Calibrate equipment according to manufacturer schedule',
              'Verify calibration before each survey',
              'Use reference points and ground control',
              'Document calibration procedures and results',
              'Have backup equipment available'
            ],
            residualRisk: 'low',
            isPreDefined: true
          },
          {
            id: 'weather-impact',
            category: 'weather',
            title: 'Weather Impact on Survey Quality',
            description: 'Risk of poor survey quality due to lighting, cloud cover, or atmospheric conditions',
            likelihood: 'high',
            consequence: 'moderate',
            riskLevel: 'medium',
            mitigations: [
              'Monitor weather conditions for optimal survey times',
              'Plan surveys during appropriate lighting conditions',
              'Consider seasonal and daily variations',
              'Have contingency plans for weather delays',
              'Adjust survey parameters for conditions'
            ],
            residualRisk: 'low',
            isPreDefined: true
          },
          {
            id: 'restricted-areas',
            category: 'airspace',
            title: 'Survey Over Restricted Areas',
            description: 'Risk of conducting surveys over prohibited or sensitive areas without authorization',
            likelihood: 'low',
            consequence: 'catastrophic',
            riskLevel: 'high',
            mitigations: [
              'Research all area restrictions before survey',
              'Obtain required permissions and clearances',
              'Use GPS boundaries to prevent overflight',
              'Coordinate with relevant authorities',
              'Document all approvals and restrictions'
            ],
            residualRisk: 'low',
            isPreDefined: true
          }
        ];

      case 'inspections':
        return [
          {
            id: 'infrastructure-hazards',
            category: 'infrastructure',
            title: 'Infrastructure Hazards',
            description: 'Risk from inspecting damaged or unstable infrastructure (bridges, towers, buildings)',
            likelihood: 'medium',
            consequence: 'major',
            riskLevel: 'high',
            mitigations: [
              'Assess structural integrity before close approach',
              'Maintain safe separation distances',
              'Use telephoto lenses when possible',
              'Coordinate with structural engineers',
              'Have emergency procedures for structural collapse'
            ],
            residualRisk: 'medium',
            isPreDefined: true
          },
          {
            id: 'confined-spaces',
            category: 'infrastructure',
            title: 'Confined Space Operations',
            description: 'Risk when conducting inspections in or around confined spaces or enclosed areas',
            likelihood: 'low',
            consequence: 'major',
            riskLevel: 'medium',
            mitigations: [
              'Assess confined space entry requirements',
              'Monitor for hazardous gases or conditions',
              'Ensure adequate communication systems',
              'Have rescue procedures in place',
              'Use gas detectors when appropriate'
            ],
            residualRisk: 'low',
            isPreDefined: true
          },
          {
            id: 'emergency-access',
            category: 'infrastructure',
            title: 'Emergency Access Limitations',
            description: 'Risk of limited emergency access during inspections of remote or difficult to reach areas',
            likelihood: 'medium',
            consequence: 'major',
            riskLevel: 'high',
            mitigations: [
              'Plan emergency evacuation routes',
              'Ensure reliable communication systems',
              'Coordinate with emergency services',
              'Have first aid equipment and trained personnel',
              'Consider weather and access conditions'
            ],
            residualRisk: 'medium',
            isPreDefined: true
          },
          {
            id: 'electrical-hazards',
            category: 'electrical',
            title: 'Electrical System Hazards',
            description: 'Risk of electrical shock or equipment damage when inspecting electrical infrastructure',
            likelihood: 'medium',
            consequence: 'catastrophic',
            riskLevel: 'extreme',
            mitigations: [
              'Maintain minimum safe distances from electrical equipment',
              'Coordinate with electrical utility companies',
              'Use non-conductive aircraft when possible',
              'Monitor for electrical field effects',
              'Have electrical emergency procedures'
            ],
            residualRisk: 'medium',
            isPreDefined: true
          },
          {
            id: 'thermal-imaging',
            category: 'mechanical',
            title: 'Thermal Imaging Equipment Issues',
            description: 'Risk of equipment malfunction or misinterpretation of thermal data during inspections',
            likelihood: 'medium',
            consequence: 'moderate',
            riskLevel: 'medium',
            mitigations: [
              'Calibrate thermal equipment before use',
              'Understand thermal equipment limitations',
              'Cross-reference thermal data with visual inspection',
              'Train personnel in thermal imaging interpretation',
              'Document equipment settings and conditions'
            ],
            residualRisk: 'low',
            isPreDefined: true
          }
        ];

      default:
        return [];
    }
  }
}
import type {
  ApplicableServiceTemplateAggregate,
  AssetTechnicalCatalogue,
  OrganisationTechnicalPreferences,
} from '../../../services/technicalCatalogueApi';

export const TECHNICAL_FIXTURE_AS_OF = '2026-08-20T02:00:00.000Z';

const evidence = (title: string, reference: string, page: string) => ({ title, reference, page });
const grouping = (systemId: string, systemCode: string, systemName: string, componentPositionId: string | null = null, componentPositionCode: string | null = null, componentPositionName: string | null = null) => ({
  systemId, systemCode, systemName, componentPositionId, componentPositionCode, componentPositionName,
});

export const ftf11Catalogue: AssetTechnicalCatalogue = {
  systems: [
    { id: 'system-engine', code: 'ENGINE', name: 'Engine' },
    { id: 'system-transmission', code: 'TRANSMISSION', name: 'Transmission' },
    { id: 'system-front-differential', code: 'FRONT_DIFFERENTIAL', name: 'Front differential' },
    { id: 'system-rear-differential', code: 'REAR_DIFFERENTIAL', name: 'Rear differential' },
  ],
  positions: [],
  parts: [
    {
      ...grouping('system-engine', 'ENGINE', 'Engine'),
      requirementId: 'requirement-oil-filter',
      applicationCode: 'OIL_FILTER',
      quantity: 1,
      unitCode: 'EA',
      part: { id: 'part-oil-filter', manufacturer: 'Isuzu', manufacturer_part_number: '8-98037577-0' },
      partVersion: {
        id: 'part-version-oil-filter', technical_part_id: 'part-oil-filter', manufacturer: 'Isuzu',
        manufacturer_part_number: '8-98037577-0', technical_description: 'Engine oil filter',
        part_category: 'FILTER', authority_type: 'MANUFACTURER',
        evidence: evidence('Isuzu FSS550 workshop manual', 'LUB-01', '4-18'),
      },
    },
    {
      ...grouping('system-engine', 'ENGINE', 'Engine'),
      requirementId: 'requirement-primary-fuel-filter',
      applicationCode: 'PRIMARY_FUEL_FILTER',
      quantity: 1,
      unitCode: 'EA',
      part: { id: 'part-primary-fuel-filter', manufacturer: 'Isuzu', manufacturer_part_number: '8-98159412-0' },
      partVersion: {
        id: 'part-version-primary-fuel-filter', technical_part_id: 'part-primary-fuel-filter', manufacturer: 'Isuzu',
        manufacturer_part_number: '8-98159412-0', technical_description: 'Primary fuel filter',
        part_category: 'FILTER', authority_type: 'MANUFACTURER',
        evidence: evidence('Isuzu FSS550 parts catalogue', 'FUEL-10', '2-07'),
      },
    },
    {
      ...grouping('system-engine', 'ENGINE', 'Engine'),
      requirementId: 'requirement-secondary-fuel-filter',
      applicationCode: 'SECONDARY_FUEL_FILTER',
      quantity: 1,
      unitCode: 'EA',
      part: { id: 'part-secondary-fuel-filter', manufacturer: 'Isuzu', manufacturer_part_number: '8-98036654-0' },
      partVersion: {
        id: 'part-version-secondary-fuel-filter', technical_part_id: 'part-secondary-fuel-filter', manufacturer: 'Isuzu',
        manufacturer_part_number: '8-98036654-0', technical_description: 'Secondary fuel filter',
        part_category: 'FILTER', authority_type: 'MANUFACTURER',
        evidence: evidence('Isuzu FSS550 parts catalogue', 'FUEL-11', '2-08'),
      },
    },
  ],
  fluids: [
    {
      ...grouping('system-engine', 'ENGINE', 'Engine'),
      requirementId: 'requirement-engine-oil', servicePoint: 'ENGINE_OIL',
      capacitySemantics: 'SERVICE_FILL', quantity: 12.8, unitCode: 'L', approximate: false, tolerance: null,
      specification: { id: 'fluid-engine-oil', specification_code: 'SAE_15W40_CK4', display_name: 'Heavy-duty engine oil' },
      specificationVersion: {
        id: 'fluid-version-engine-oil', technical_fluid_specification_id: 'fluid-engine-oil',
        fluid_type: 'ENGINE_OIL', viscosity_or_grade: 'SAE 15W-40', technical_standards: ['API CK-4'],
        authority_type: 'MANUFACTURER', evidence: evidence('Isuzu FSS550 workshop manual', 'LUB-01', '4-16'),
      },
    },
    {
      ...grouping('system-rear-differential', 'REAR_DIFFERENTIAL', 'Rear differential'),
      requirementId: 'requirement-rear-diff-oil', servicePoint: 'REAR_DIFFERENTIAL',
      capacitySemantics: 'SERVICE_FILL', quantity: 2.8, unitCode: 'L', approximate: false, tolerance: null,
      specification: { id: 'fluid-rear-diff', specification_code: 'SAE_80W90_GL5', display_name: 'Hypoid gear oil' },
      specificationVersion: {
        id: 'fluid-version-rear-diff', technical_fluid_specification_id: 'fluid-rear-diff',
        fluid_type: 'GEAR_OIL', viscosity_or_grade: 'SAE 80W-90', technical_standards: ['API GL-5'],
        authority_type: 'MANUFACTURER', evidence: evidence('Isuzu FSS550 workshop manual', 'AXLE-02', '7-03'),
      },
    },
  ],
  serviceTemplates: [
    { templateId: 'template-ftf11-10k', templateVersionId: 'template-version-ftf11-10k-v3', name: 'FSS550 — 10,000 km service', ownerScope: 'PLATFORM', authorityType: 'MANUFACTURER' },
    { templateId: 'template-ftf11-check', templateVersionId: 'template-version-ftf11-check-v1', name: 'Fly The Farm vehicle arrival check', ownerScope: 'ORGANISATION', authorityType: 'ORGANISATION_STANDARD' },
  ],
  attachedAssets: [
    { registryId: 'registry-gen-003', source: 'fleet-asset', sourceRecordId: 'source-gen-003', identity: 'GEN-003' },
  ],
};

export const ftf11Preferences: OrganisationTechnicalPreferences = {
  parts: [{
    id: 'preference-oil-filter', technical_part_id: 'part-oil-filter', preferred_part_version_id: null,
    preferred_supplier: 'Fleet Parts Toowoomba', supplier_sku: 'FPT-OIL-577', internal_sku: 'FTF-FLT-001',
    package_quantity: 1, organisation_notes: 'Hold two at Base', row_version: 1,
  }],
  fluids: [{
    id: 'preference-engine-oil', technical_fluid_specification_id: 'fluid-engine-oil',
    satisfied_fluid_specification_version_id: 'fluid-version-engine-oil', preferred_product: 'Delo 400 SLK',
    preferred_brand: 'Caltex', preferred_supplier: 'Local Lubricants', supplier_sku: 'DELO-20L',
    package_quantity: 20, package_unit_code: 'L', organisation_notes: '20 L drum', row_version: 1,
  }],
};

export const gen003Catalogue: AssetTechnicalCatalogue = {
  systems: [
    { id: 'system-generator-engine', code: 'ENGINE', name: 'Engine' },
    { id: 'system-generator-fuel', code: 'FUEL_SYSTEM', name: 'Fuel system' },
  ],
  positions: [],
  parts: [{
    ...grouping('system-generator-engine', 'ENGINE', 'Engine'),
    requirementId: 'requirement-generator-filter', applicationCode: 'OIL_FILTER', quantity: 1, unitCode: 'EA',
    part: { id: 'part-generator-filter', manufacturer: 'Honda', manufacturer_part_number: '15400-RTA-003' },
    partVersion: { id: 'part-version-generator-filter', technical_part_id: 'part-generator-filter', manufacturer: 'Honda', manufacturer_part_number: '15400-RTA-003', technical_description: 'Engine oil filter', part_category: 'FILTER', authority_type: 'VERIFIED_TECHNICAL_SOURCE', evidence: evidence('Honda generator service data', 'GEN-OIL-03', '18') },
  }],
  fluids: [{
    ...grouping('system-generator-engine', 'ENGINE', 'Engine'),
    requirementId: 'requirement-generator-oil', servicePoint: 'ENGINE_OIL', capacitySemantics: 'REFILL_AFTER_FILTER_REPLACEMENT', quantity: 1.1, unitCode: 'L', approximate: false, tolerance: null,
    specification: { id: 'fluid-generator-oil', specification_code: 'SAE_10W30_API_SJ', display_name: 'Four-stroke engine oil' },
    specificationVersion: { id: 'fluid-version-generator-oil', technical_fluid_specification_id: 'fluid-generator-oil', fluid_type: 'ENGINE_OIL', viscosity_or_grade: 'SAE 10W-30', technical_standards: ['API SJ or later'], authority_type: 'VERIFIED_TECHNICAL_SOURCE', evidence: evidence('Honda generator service data', 'GEN-OIL-03', '17') },
  }],
  serviceTemplates: [],
  attachedAssets: [],
};

export const t100Catalogue: AssetTechnicalCatalogue = {
  systems: [{ id: 'system-propulsion', code: 'PROPULSION', name: 'Propulsion' }],
  positions: [
    { id: 'position-motor-1', code: 'MOTOR_1', name: 'Motor 1' },
    { id: 'position-motor-2', code: 'MOTOR_2', name: 'Motor 2' },
  ],
  parts: [
    ['BLADE', 'CW blade', 'WB37-001'],
    ['BLADE_BOLT', 'Blade bolt', 'WB37-014'],
    ['SHIM', 'Propeller shim', 'WB37-022'],
  ].map(([applicationCode, description, partNumber], index) => ({
    ...grouping('system-propulsion', 'PROPULSION', 'Propulsion', 'position-motor-1', 'MOTOR_1', 'Motor 1'),
    applicabilityId: `t100-applicability-${index + 1}`,
    applicationCode, quantity: applicationCode === 'BLADE_BOLT' ? 2 : 1, unitCode: 'EA',
    part: { id: `t100-part-${index + 1}`, manufacturer: 'DJI', manufacturer_part_number: partNumber },
    partVersion: { id: `t100-part-version-${index + 1}`, technical_part_id: `t100-part-${index + 1}`, manufacturer: 'DJI', manufacturer_part_number: partNumber, technical_description: description, part_category: applicationCode, authority_type: 'MANUFACTURER', evidence: evidence('DJI Agras T100 parts catalogue', `PROP-${index + 1}`, '6-12') },
  })),
  fluids: [],
  serviceTemplates: [{ templateId: 'template-t100-50h', templateVersionId: 'template-version-t100-50h-v1', name: 'DJI T100 — 50 h propulsion inspection', ownerScope: 'PLATFORM', authorityType: 'MANUFACTURER' }],
  attachedAssets: [],
};

export const ftf11ServiceTemplate: ApplicableServiceTemplateAggregate = {
  template: { id: 'template-ftf11-10k', code: 'FSS550_10000_KM', name: 'FSS550 — 10,000 km service', ownerScope: 'PLATFORM', sourceTemplateId: null, rowVersion: 1 },
  version: {
    id: 'template-version-ftf11-10k-v3', serviceTemplateId: 'template-ftf11-10k', versionNumber: 3,
    description: 'Manufacturer 10,000 km service recipe.', authorityType: 'MANUFACTURER', lifecycleState: 'EFFECTIVE',
    evidence: evidence('Isuzu FSS550 maintenance schedule', 'SVC-10K', '3-02'), conditionSchemaVersion: 1,
    effectiveFrom: '2026-01-01T00:00:00.000Z', effectiveTo: null, approvedByInternalUserId: null,
    approvedByPlatformUserId: 'platform-curator', approvedAt: '2026-01-02T00:00:00.000Z', supersedesVersionId: 'template-version-ftf11-10k-v2', rowVersion: 2,
  },
  applicability: [{
    id: 'kit-applicability-ftf11', manufacturerScope: 'Isuzu', modelScope: 'FSS550',
    systemCode: 'ENGINE', componentPositionCode: null, notes: 'Applies to the FSS550 engine system.',
    evidence: evidence('Isuzu FSS550 maintenance schedule', 'SVC-10K-SCOPE', '3-01'),
    effectiveFrom: '2026-01-01T00:00:00.000Z', effectiveTo: null, rowVersion: 1,
  }],
  actions: [
    { id: 'action-change-oil', sequenceNumber: 1, actionType: 'SERVICE', disposition: 'REQUIRED', description: 'Change engine oil', rowVersion: 1 },
    {
      id: 'action-inspect-air-filter', sequenceNumber: 2, actionType: 'INSPECT', disposition: 'CONDITIONAL', description: 'Inspect air filter',
      condition: { summary: 'Replace only when the restriction indicator is red.' }, conditionSchemaVersion: 1,
      expectedEvidence: evidence('Air filter inspection record', 'AIR-FILTER-CHECK', '1'), rowVersion: 1,
    },
  ],
  partLines: [{
    id: 'kit-part-oil-filter', technicalPartVersionId: 'part-version-oil-filter', quantity: 1, unitCode: 'EA', disposition: 'REQUIRED',
    condition: { summary: 'Use the current approved equivalent only.' }, conditionSchemaVersion: 1,
    partVersion: ftf11Catalogue.parts[0].partVersion, part: ftf11Catalogue.parts[0].part, rowVersion: 1,
  }],
  fluidLines: [{
    id: 'kit-fluid-engine-oil', fluidSpecificationVersionId: 'fluid-version-engine-oil', quantity: 12.8, unitCode: 'L', disposition: 'REQUIRED',
    notes: 'Service-fill quantity.', specificationVersion: ftf11Catalogue.fluids[0].specificationVersion,
    specification: ftf11Catalogue.fluids[0].specification, rowVersion: 1,
  }],
  inspections: [{
    id: 'inspection-belts', description: 'Inspect drive belts', disposition: 'REQUIRED',
    expectedEvidence: { photo: true }, rowVersion: 1,
  }],
  replacements: [],
  requirementLinks: [{
    id: 'kit-requirement-link-ftf11', maintenanceRequirementVersionId: 'maintenance-requirement-fss550-10k-v2',
    requirementSchemaVersion: 1, disposition: 'REQUIRED',
    condition: { summary: 'Reference only; scheduling remains authoritative elsewhere.' }, conditionSchemaVersion: 1, rowVersion: 1,
  }],
};

export const foreignTenantPreferences: OrganisationTechnicalPreferences = {
  parts: [{ id: 'foreign-part', technical_part_id: 'part-oil-filter', preferred_part_version_id: null, preferred_supplier: 'Other Tenant Secret Supplier', row_version: 1 }],
  fluids: [{ id: 'foreign-fluid', technical_fluid_specification_id: 'fluid-engine-oil', satisfied_fluid_specification_version_id: 'fluid-version-engine-oil', preferred_product: 'Other Tenant Secret Oil', row_version: 1 }],
};

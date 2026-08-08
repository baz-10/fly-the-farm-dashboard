import {
  assertValidRegistry,
  getMaturityEntry,
  ProductMaturityConfigurationError,
  PRODUCT_MATURITY_REGISTRY,
} from '../registry';
import { ProductMaturityEntry } from '../types';

const cloneRegistry = (): ProductMaturityEntry[] =>
  JSON.parse(JSON.stringify(PRODUCT_MATURITY_REGISTRY)) as ProductMaturityEntry[];

describe('product maturity registry', () => {
  test('accepts the approved baseline registry', () => {
    expect(() => assertValidRegistry(PRODUCT_MATURITY_REGISTRY)).not.toThrow();
  });

  test('uses the approved non-commercial maturity baseline', () => {
    expect(new Set(PRODUCT_MATURITY_REGISTRY.map(entry => entry.maturity))).toEqual(
      new Set(['OPERATIONALLY_READY', 'BETA', 'COMING_SOON'])
    );
    expect(PRODUCT_MATURITY_REGISTRY.some(entry => entry.maturity === 'COMMERCIALLY_READY')).toBe(false);
    expect(PRODUCT_MATURITY_REGISTRY.map(entry => [entry.moduleCode, entry.workflowCode, entry.maturity])).toEqual([
      ['authentication', null, 'OPERATIONALLY_READY'], ['platform-identity', null, 'OPERATIONALLY_READY'],
      ['clients', null, 'OPERATIONALLY_READY'], ['properties', null, 'OPERATIONALLY_READY'],
      ['fields', null, 'OPERATIONALLY_READY'], ['jobs', null, 'OPERATIONALLY_READY'],
      ['mission-register', null, 'OPERATIONALLY_READY'], ['mission-register', 'setup-drafts', 'OPERATIONALLY_READY'],
      ['mission-workspace', null, 'OPERATIONALLY_READY'], ['mission-workspace', 'reports', 'OPERATIONALLY_READY'],
      ['mission-mapping', null, 'OPERATIONALLY_READY'], ['mission-weather', null, 'OPERATIONALLY_READY'],
      ['mission-chemical-planning', null, 'OPERATIONALLY_READY'], ['mission-jsa', null, 'OPERATIONALLY_READY'],
      ['mission-closeout', null, 'OPERATIONALLY_READY'], ['mission-outcomes', null, 'OPERATIONALLY_READY'],
      ['mission-records', null, 'OPERATIONALLY_READY'], ['aircraft', null, 'OPERATIONALLY_READY'],
      ['equipment-kits', null, 'OPERATIONALLY_READY'], ['personnel', null, 'OPERATIONALLY_READY'],
      ['personnel', 'casa-credentials', 'BETA'], ['casa-compliance', null, 'OPERATIONALLY_READY'],
      ['organisation-branding', null, 'OPERATIONALLY_READY'], ['organisation-assisted-support', null, 'OPERATIONALLY_READY'],
      ['chemical-review-permissions', null, 'OPERATIONALLY_READY'], ['organisation-onboarding', null, 'BETA'],
      ['home', null, 'BETA'], ['customer-portal', null, 'BETA'], ['spray-recommendation-import', null, 'COMING_SOON'],
      ['fleet-work-packs', null, 'BETA'], ['weather-centre', null, 'BETA'], ['chemical-database', null, 'BETA'],
      ['spray-calculator', null, 'BETA'], ['operating-authority', null, 'BETA'],
      ['operating-authority', 'authority-records', 'BETA'], ['operations-manual', null, 'BETA'],
      ['controlled-checklists', null, 'BETA'], ['controlled-checklists', 'execution', 'BETA'],
      ['controlled-checklists', 'administration', 'BETA'], ['vegetation-pmav', null, 'BETA'],
      ['flight-records', null, 'COMING_SOON'], ['application-records', null, 'COMING_SOON'],
      ['transport-storage', null, 'COMING_SOON'], ['licences-credentials', null, 'COMING_SOON'],
      ['environmental-records', null, 'COMING_SOON'], ['safety-ppe', null, 'COMING_SOON'],
      ['documentation-audit', null, 'COMING_SOON'], ['quotes', null, 'COMING_SOON'],
      ['quotes', 'pdf-export', 'COMING_SOON'], ['financials', null, 'COMING_SOON'],
      ['financials', 'margin-analysis', 'COMING_SOON'], ['financials', 'invoice-export', 'COMING_SOON'],
      ['operational-intelligence', null, 'COMING_SOON'], ['organisation-administration', null, 'OPERATIONALLY_READY'],
      ['organisation-administration', 'network-source-manager', 'COMING_SOON'],
      ['chemical-intelligence', null, 'COMING_SOON'],
      ['chemical-intelligence', 'source-extraction', 'COMING_SOON'],
      ['chemical-intelligence', 'document-sourcing', 'COMING_SOON'],
    ]);
    expect(getMaturityEntry('quotes').promotionBlockers).toEqual(expect.arrayContaining([
      'Quotes, pricing configuration and quote equipment models remain browser-local authoritative records.',
    ]));
  });

  test('retains complete governance evidence for every registry entry', () => {
    expect(PRODUCT_MATURITY_REGISTRY.filter(entry => entry.maturity !== 'COMMERCIALLY_READY')
      .every(entry => entry.promotionBlockers.length > 0 || entry.maturity === 'OPERATIONALLY_READY')).toBe(true);
    expect(PRODUCT_MATURITY_REGISTRY.every(entry => !entry.customerName.includes('Legacy'))).toBe(true);

    const keys = PRODUCT_MATURITY_REGISTRY.map(entry => `${entry.moduleCode}/${entry.workflowCode ?? ''}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(PRODUCT_MATURITY_REGISTRY.every(entry => /^\d{4}-\d{2}-\d{2}$/.test(entry.reviewDate)
      && !Number.isNaN(Date.parse(`${entry.reviewDate}T00:00:00Z`)))).toBe(true);
    expect(PRODUCT_MATURITY_REGISTRY.every(entry => entry.owner.trim().length > 0
      && ['P0', 'P1', 'P2', 'P3'].includes(entry.priority)
      && entry.evidence.length > 0
      && entry.requiredAutomatedTests.length > 0
      && entry.requiredManualAcceptance.length > 0
      && entry.requiredOperationalEvidence.length > 0
      && entry.targetPromotionMilestone.trim().length > 0
      && entry.changelogReference.trim().length > 0)).toBe(true);
  });

  test('rejects invalid safety and governance metadata', () => {
    const invalidMaturity = cloneRegistry();
    invalidMaturity[0].maturity = 'UNREVIEWED' as ProductMaturityEntry['maturity'];

    const duplicateKey = cloneRegistry();
    duplicateKey.push({ ...duplicateKey[0] });

    const invalidDate = cloneRegistry();
    invalidDate[0].reviewDate = '2026-02-30';

    const missingEvidence = cloneRegistry();
    missingEvidence[0].requiredAutomatedTests = [];

    const noBlocker = cloneRegistry();
    const betaEntry = noBlocker.find(entry => entry.maturity === 'BETA')!;
    betaEntry.promotionBlockers = [];

    const customerFacingLegacy = cloneRegistry();
    customerFacingLegacy[0].customerName = 'Legacy Customers';

    const commerciallyReadyWithoutFounderApproval = cloneRegistry();
    commerciallyReadyWithoutFounderApproval[0].maturity = 'COMMERCIALLY_READY';
    commerciallyReadyWithoutFounderApproval[0].promotionBlockers = ['Commercial release evidence is pending Founder approval.'];

    expect(() => assertValidRegistry(invalidMaturity)).toThrow(ProductMaturityConfigurationError);
    expect(() => assertValidRegistry(duplicateKey)).toThrow(ProductMaturityConfigurationError);
    expect(() => assertValidRegistry(invalidDate)).toThrow(ProductMaturityConfigurationError);
    expect(() => assertValidRegistry(missingEvidence)).toThrow(ProductMaturityConfigurationError);
    expect(() => assertValidRegistry(noBlocker)).toThrow(ProductMaturityConfigurationError);
    expect(() => assertValidRegistry(customerFacingLegacy)).toThrow(ProductMaturityConfigurationError);
    expect(() => assertValidRegistry(commerciallyReadyWithoutFounderApproval)).toThrow(ProductMaturityConfigurationError);
  });

  test('allows Commercially Ready with no blockers only when Founder approval evidence is explicit', () => {
    const commerciallyReady = cloneRegistry();
    commerciallyReady[0].maturity = 'COMMERCIALLY_READY';
    commerciallyReady[0].promotionBlockers = [];
    commerciallyReady[0] = {
      ...commerciallyReady[0],
      founderApproval: {
        status: 'APPROVED',
        approverRole: 'Founder',
        decision: 'Approved for commercial release.',
        reference: 'docs/commercial-release-decision.md',
      },
    } as ProductMaturityEntry;

    expect(() => assertValidRegistry(commerciallyReady)).not.toThrow();

    delete (commerciallyReady[0] as ProductMaturityEntry & { founderApproval?: unknown }).founderApproval;
    expect(() => assertValidRegistry(commerciallyReady)).toThrow(ProductMaturityConfigurationError);
  });

  test('rejects incomplete or unapproved structured Founder decisions', () => {
    const commerciallyReady = cloneRegistry();
    commerciallyReady[0] = {
      ...commerciallyReady[0],
      maturity: 'COMMERCIALLY_READY',
      promotionBlockers: [],
      founderApproval: {
        status: 'PENDING',
        approverRole: 'Founder',
        decision: 'Pending commercial release decision.',
        reference: 'docs/commercial-release-decision.md',
      },
    } as ProductMaturityEntry;

    expect(() => assertValidRegistry(commerciallyReady)).toThrow(ProductMaturityConfigurationError);
  });

  test('keeps evidence tied to the relevant implementation and acceptance sources', () => {
    expect(getMaturityEntry('properties').evidence).toEqual(expect.arrayContaining([
      'src/services/operationalApi.ts', 'src/__tests__/trustedOperationalApi.test.js',
    ]));
    expect(getMaturityEntry('jobs').evidence).toContain('src/pages/OperationalWorkflow.test.tsx');
    expect(getMaturityEntry('mission-records').evidence).toContain('src/__tests__/reportArtefactOperationalApi.test.js');
    expect(getMaturityEntry('spray-recommendation-import').evidence).toEqual(expect.arrayContaining([
      'src/pages/SprayRecImport.tsx', 'src/services/sprayRecParser.ts', 'src/App.test.tsx',
    ]));
    expect(getMaturityEntry('spray-calculator').evidence).toContain('src/pages/Calculator.tsx');
  });

  test('selects a workflow override before falling back to module metadata', () => {
    expect(getMaturityEntry('quotes', 'pdf-export').maturity).toBe('COMING_SOON');
    expect(getMaturityEntry('quotes', 'unlisted-workflow')).toMatchObject({
      moduleCode: 'quotes',
      workflowCode: null,
      maturity: 'COMING_SOON',
    });
  });

  test('keeps safe Administration available while constraining its exact browser-local workflows', () => {
    expect(getMaturityEntry('organisation-administration').maturity).toBe('OPERATIONALLY_READY');
    expect(getMaturityEntry('organisation-administration', 'network-source-manager')).toMatchObject({
      workflowCode: 'network-source-manager', maturity: 'COMING_SOON',
    });
    expect(getMaturityEntry('chemical-intelligence', 'source-extraction')).toMatchObject({
      workflowCode: 'source-extraction', maturity: 'COMING_SOON',
    });
    expect(getMaturityEntry('chemical-intelligence', 'document-sourcing')).toMatchObject({
      workflowCode: 'document-sourcing', maturity: 'COMING_SOON',
    });
  });

  test('fails closed when a module has no registry metadata', () => {
    expect(() => getMaturityEntry('not-a-module')).toThrow(ProductMaturityConfigurationError);
  });
});

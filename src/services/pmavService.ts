import {
  VegetationCategory,
  VegetationDataset,
  VegetationFeature,
  VegetationFeatureCollection,
  VegetationLookupResult,
  VegetationSummary,
} from '../types/pmav';

export const VEGETATION_CATEGORY_DETAILS: Record<VegetationCategory, {
  label: string;
  color: string;
  description: string;
  tone: 'error' | 'success' | 'warning' | 'info' | 'default';
}> = {
  A: {
    label: 'Category A',
    color: '#d32f2f',
    description: 'Offsets, compliance notices, and vegetation declarations.',
    tone: 'error',
  },
  B: {
    label: 'Category B',
    color: '#2e7d32',
    description: 'Remnant vegetation mapped for protection or assessment.',
    tone: 'warning',
  },
  C: {
    label: 'Category C',
    color: '#edb700',
    description: 'High-value regrowth vegetation requiring assessment.',
    tone: 'warning',
  },
  R: {
    label: 'Category R',
    color: '#1976d2',
    description: 'Reef-regrowth watercourse vegetation in GBR catchments.',
    tone: 'info',
  },
  X: {
    label: 'Category X',
    color: '#8d9690',
    description: 'Mapped exempt clearing area, subject to official verification.',
    tone: 'success',
  },
  Unknown: {
    label: 'Unknown',
    color: '#616161',
    description: 'Category was not supplied by the source service.',
    tone: 'default',
  },
};

export function sanitizeLotPlan(input: string): string {
  return input.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

export function getFeatureCategory(feature: VegetationFeature): VegetationCategory {
  const raw = feature.properties.pmav_cat
    || feature.properties.rvm_cat
    || feature.properties.vm_cat
    || feature.properties.category
    || '';
  const category = String(raw).trim().toUpperCase();

  if (category === 'A' || category === 'B' || category === 'C' || category === 'R' || category === 'X') {
    return category;
  }

  return 'Unknown';
}

export function getFeatureLotPlan(feature: VegetationFeature, fallback = 'Unknown'): string {
  const lotPlan = feature.properties.lotplan;
  return typeof lotPlan === 'string' && lotPlan.trim() ? lotPlan.trim().toUpperCase() : fallback;
}

export function hasVegetationReviewCategories(categories: Record<VegetationCategory, number>): boolean {
  return categories.A > 0 || categories.B > 0 || categories.C > 0 || categories.R > 0;
}

export function getVegetationCategorySummary(categories: Record<VegetationCategory, number>): string {
  return (Object.entries(categories) as Array<[VegetationCategory, number]>)
    .filter(([, count]) => count > 0)
    .map(([category, count]) => `${category}: ${count}`)
    .join(', ') || 'No mapped categories';
}

async function queryVegetation(dataset: VegetationDataset, lotPlan: string): Promise<VegetationFeatureCollection> {
  const cleanLotPlan = sanitizeLotPlan(lotPlan);
  const response = await fetch(`/api/pmav?dataset=${dataset}&lotplan=${encodeURIComponent(cleanLotPlan)}`);

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Vegetation lookup failed (${response.status})`);
  }

  return response.json();
}

function createEmptyCategoryCounts(): Record<VegetationCategory, number> {
  return {
    A: 0,
    B: 0,
    C: 0,
    R: 0,
    X: 0,
    Unknown: 0,
  };
}

export function summarizeVegetation(
  data: VegetationFeatureCollection,
  dataset: VegetationDataset,
  searchTerm: string
): VegetationSummary {
  const categories = createEmptyCategoryCounts();
  const lotPlans = new Set<string>();
  let pmavNumber = '';
  let pmavStatus = '';

  data.features.forEach((feature) => {
    const category = getFeatureCategory(feature);
    categories[category] += 1;
    lotPlans.add(getFeatureLotPlan(feature, sanitizeLotPlan(searchTerm)));

    if (!pmavNumber && typeof feature.properties.pmav_no === 'string') {
      pmavNumber = feature.properties.pmav_no;
    }

    if (!pmavStatus && typeof feature.properties.pmav_stat === 'string') {
      pmavStatus = feature.properties.pmav_stat;
    }
  });

  const hasProtectedCategories = hasVegetationReviewCategories(categories);
  const hasCategoryXOnly = categories.X > 0 && !hasProtectedCategories;
  const sourceLabel = dataset === 'pmav' ? 'Certified PMAV mapping' : 'Default RVM mapping';

  return {
    dataset,
    lotPlan: Array.from(lotPlans)[0] || sanitizeLotPlan(searchTerm),
    searchTerm,
    featureCount: data.features.length,
    propertyCount: lotPlans.size || (data.features.length ? 1 : 0),
    categories,
    pmavNumber: pmavNumber || undefined,
    pmavStatus: pmavStatus || undefined,
    checkedAt: new Date().toISOString(),
    sourceLabel,
    headline: dataset === 'pmav'
      ? 'PMAV found for this property'
      : 'No PMAV found. Showing regulated vegetation mapping',
    interpretation: hasProtectedCategories
      ? 'Mapped vegetation categories are present. Treat this as an environmental review trigger before mission authorization or clearing-related work.'
      : hasCategoryXOnly
        ? 'Only Category X features were returned for this lookup. Keep the official-source check attached before relying on it operationally.'
        : 'No mapped category features were returned for this lookup. Verify against official Queensland sources before making clearing or compliance decisions.',
  };
}

export async function lookupVegetationByLotPlan(lotPlan: string): Promise<VegetationLookupResult> {
  const cleanLotPlan = sanitizeLotPlan(lotPlan);
  if (cleanLotPlan.length < 4) {
    throw new Error('Enter a valid lot/plan such as 2RP884818.');
  }

  const pmavData = await queryVegetation('pmav', cleanLotPlan);
  if (pmavData.features?.length > 0) {
    return {
      data: pmavData,
      summary: summarizeVegetation(pmavData, 'pmav', cleanLotPlan),
    };
  }

  const rvmData = await queryVegetation('rvm', cleanLotPlan);
  return {
    data: rvmData,
    summary: summarizeVegetation(rvmData, 'rvm', cleanLotPlan),
  };
}

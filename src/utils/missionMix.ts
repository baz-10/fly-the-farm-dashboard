import { MissionPlanningChemical } from '../types/mission';

export interface MissionMixVolumes {
  totalTankMixLitres: number;
  liquidChemicalLitres: number;
  waterRequiredLitres: number;
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

export function calculateMissionMixVolumes(
  areaHa: number,
  applicationRateLHa: number,
  chemicals: MissionPlanningChemical[],
): MissionMixVolumes {
  const totalTankMixLitres = Math.max(0, areaHa) * Math.max(0, applicationRateLHa);
  const liquidChemicalLitres = chemicals.reduce((total, chemical) => {
    const required = Math.max(0, chemical.ratePerHa) * Math.max(0, areaHa);
    if (chemical.unit === 'L') return total + required;
    if (chemical.unit === 'ml') return total + required / 1000;
    return total;
  }, 0);

  return {
    totalTankMixLitres: roundOne(totalTankMixLitres),
    liquidChemicalLitres: roundOne(liquidChemicalLitres),
    waterRequiredLitres: roundOne(Math.max(0, totalTankMixLitres - liquidChemicalLitres)),
  };
}

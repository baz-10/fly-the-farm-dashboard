export type ControlledMissionScope = {
  missionId: string;
  expectedRevision: number;
  fieldIds: string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

export const isExactControlledScopeBody = (
  value: unknown,
  expected: ControlledMissionScope,
): boolean => {
  if (!isRecord(value) || Object.keys(value).sort().join(',') !== 'expectedRevision,fieldIds,missionId') return false;
  if (value.missionId !== expected.missionId || value.expectedRevision !== expected.expectedRevision) return false;
  if (!Array.isArray(value.fieldIds) || value.fieldIds.length !== expected.fieldIds.length) return false;
  return value.fieldIds.every((fieldId, index) => fieldId === expected.fieldIds[index]);
};

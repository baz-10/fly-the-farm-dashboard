import type { SafetyPlanFieldValue, SafetyPlanSection } from '../../types/safetyPlan';
import StepSectionList from './StepSectionList';

export default function JobDetailsStep(props: {
  sections: SafetyPlanSection[];
  onFieldChange(fieldId: string, value: SafetyPlanFieldValue): void;
}) {
  return <StepSectionList {...props} />;
}

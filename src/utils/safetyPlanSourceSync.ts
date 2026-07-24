import type {
  SafetyPlanActor,
  SafetyPlanSourceItem,
  SafetyPlanSourceSnapshot,
  SafetyPlanVersion,
} from '../types/safetyPlan';

export interface SafetyPlanChangedSource {
  current: SafetyPlanSourceItem;
  latest: SafetyPlanSourceItem;
}

export interface SafetyPlanSourceDiff {
  currentSnapshot: SafetyPlanSourceSnapshot;
  latestSnapshot: SafetyPlanSourceSnapshot;
  added: SafetyPlanSourceItem[];
  changed: SafetyPlanChangedSource[];
  removed: SafetyPlanSourceItem[];
  unchanged: SafetyPlanSourceItem[];
}

export type SourceRefreshAction =
  | 'accept_source_value'
  | 'keep_company_value'
  | 'remove';

export interface SourceRefreshDecision {
  itemId: string;
  action: SourceRefreshAction;
}

export interface SourceRefreshMetadata {
  actor: SafetyPlanActor;
  now: string;
}

function sourceIdentity(item: SafetyPlanSourceItem): string {
  return [
    item.sourceType,
    item.sourceId,
    item.sourceItemId,
  ].join('\u0000');
}

function sortItems(items: SafetyPlanSourceItem[]): SafetyPlanSourceItem[] {
  return items.slice().sort((left, right) => left.id.localeCompare(right.id));
}

export function diffSafetyPlanSources(
  current: SafetyPlanSourceSnapshot,
  latest: SafetyPlanSourceSnapshot
): SafetyPlanSourceDiff {
  const currentByIdentity = new Map(
    (current.hazards ?? []).map((item) => [sourceIdentity(item), item])
  );
  const latestByIdentity = new Map(
    (latest.hazards ?? []).map((item) => [sourceIdentity(item), item])
  );
  const added: SafetyPlanSourceItem[] = [];
  const changed: SafetyPlanChangedSource[] = [];
  const removed: SafetyPlanSourceItem[] = [];
  const unchanged: SafetyPlanSourceItem[] = [];

  for (const [identity, latestItem] of latestByIdentity) {
    const currentItem = currentByIdentity.get(identity);
    if (!currentItem) {
      added.push(latestItem);
    } else if (
      currentItem.sourceUpdatedAt !== latestItem.sourceUpdatedAt
      || currentItem.value !== latestItem.value
    ) {
      changed.push({ current: currentItem, latest: latestItem });
    } else {
      unchanged.push(currentItem);
    }
  }
  for (const [identity, currentItem] of currentByIdentity) {
    if (!latestByIdentity.has(identity)) removed.push(currentItem);
  }

  return {
    currentSnapshot: current,
    latestSnapshot: latest,
    added: sortItems(added),
    changed: changed.sort((left, right) => left.current.id.localeCompare(right.current.id)),
    removed: sortItems(removed),
    unchanged: sortItems(unchanged),
  };
}

function decisionsByItem(
  diff: SafetyPlanSourceDiff,
  decisions: SourceRefreshDecision[]
): Map<string, SourceRefreshAction> {
  const required = [
    ...diff.changed.map(({ current }) => current.id),
    ...diff.removed.map(({ id }) => id),
  ];
  const decisionMap = new Map<string, SourceRefreshAction>();
  for (const decision of decisions) {
    if (decisionMap.has(decision.itemId)) {
      throw new Error(`Duplicate source refresh decision for ${decision.itemId}`);
    }
    decisionMap.set(decision.itemId, decision.action);
  }
  for (const itemId of required) {
    if (!decisionMap.has(itemId)) {
      throw new Error(`An explicit decision is required for source item ${itemId}`);
    }
  }
  return decisionMap;
}

function refreshedItems(
  diff: SafetyPlanSourceDiff,
  decisions: Map<string, SourceRefreshAction>
): SafetyPlanSourceItem[] {
  const result = [
    ...diff.unchanged.map((item) => ({ ...item })),
    ...diff.added.map((item) => ({ ...item })),
  ];
  for (const { current, latest } of diff.changed) {
    const action = decisions.get(current.id);
    if (action === 'remove') continue;
    result.push({
      ...latest,
      companyValue: action === 'keep_company_value'
        ? current.companyValue
        : latest.companyValue,
    });
  }
  for (const current of diff.removed) {
    const action = decisions.get(current.id);
    if (action === 'keep_company_value') result.push({ ...current });
  }
  return sortItems(result);
}

function refreshSourceFields(
  version: SafetyPlanVersion,
  items: SafetyPlanSourceItem[]
): SafetyPlanVersion['sections'] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return version.sections.map((section) => ({
    ...section,
    fields: [
      ...section.fields
      .filter((field) => !field.id.includes(':') || byId.has(field.id))
      .map((field) => {
        const item = byId.get(field.id);
        return item ? { ...field, value: item.companyValue } : { ...field };
      }),
      ...(section.id === 'consolidated_jsa_hazards_controls'
        ? items
          .filter((item) => !section.fields.some((field) => field.id === item.id))
          .map((item) => ({
            id: item.id,
            label: item.label,
            helpText: `Imported from ${item.sourceType.replace('_', ' ')} ${item.sourceRecordId ?? item.sourceId}.`,
            type: 'textarea' as const,
            required: false,
            companyEditable: true,
            value: item.companyValue,
          }))
        : []),
    ],
  }));
}

export function applySourceRefresh(
  version: SafetyPlanVersion,
  diff: SafetyPlanSourceDiff,
  decisions: SourceRefreshDecision[],
  metadata: SourceRefreshMetadata
): SafetyPlanVersion {
  if (version.status === 'approved' || version.status === 'superseded') {
    throw new Error('Approved and superseded Safety Plan versions are immutable');
  }
  const decisionMap = decisionsByItem(diff, decisions);
  const hazards = refreshedItems(diff, decisionMap);
  const latestSnapshot: SafetyPlanSourceSnapshot = {
    ...diff.latestSnapshot,
    hazards,
  };

  return {
    ...version,
    sections: refreshSourceFields(version, hazards),
    sourceSnapshot: latestSnapshot,
    updatedAt: metadata.now,
    revision: version.revision + 1,
    sourceRefreshAudit: {
      action: 'source_refreshed',
      actor: { ...metadata.actor },
      occurredAt: metadata.now,
      before: {
        capturedAt: diff.currentSnapshot.capturedAt,
        sourceItemCount: diff.currentSnapshot.hazards?.length ?? 0,
      },
      after: {
        capturedAt: diff.latestSnapshot.capturedAt,
        sourceItemCount: hazards.length,
        decisions: decisions.map((decision) => ({ ...decision })),
      },
    },
  };
}

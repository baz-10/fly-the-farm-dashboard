import { safetyPlanFieldValue } from '../services/safetyPlanPrefill';
import type {
  SafetyPlanSourceItem,
  SafetyPlanSourceSnapshot,
  SafetyPlanVersion,
} from '../types/safetyPlan';

export interface SafetyPlanChangedSource {
  current: SafetyPlanSourceItem;
  latest: SafetyPlanSourceItem;
}

const CONTEXT_CATEGORIES = [
  'company',
  'job',
  'missions',
  'client',
  'property',
  'field',
  'crew',
  'assets',
  'chemicals',
  'emergencyContacts',
  'siteMap',
] as const;

export type SafetyPlanContextCategory = typeof CONTEXT_CATEGORIES[number];

export interface SafetyPlanContextChange {
  itemId: `context:${SafetyPlanContextCategory}`;
  category: SafetyPlanContextCategory;
  current?: unknown;
  latest?: unknown;
}

export interface SafetyPlanSourceDiff {
  currentSnapshot: SafetyPlanSourceSnapshot;
  latestSnapshot: SafetyPlanSourceSnapshot;
  added: SafetyPlanSourceItem[];
  changed: SafetyPlanChangedSource[];
  removed: SafetyPlanSourceItem[];
  unchanged: SafetyPlanSourceItem[];
  contextAdded: SafetyPlanContextChange[];
  contextChanged: SafetyPlanContextChange[];
  contextRemoved: SafetyPlanContextChange[];
  contextUnchanged: SafetyPlanContextChange[];
}

export type SourceRefreshAction =
  | 'accept_source_value'
  | 'keep_company_value'
  | 'remove';

export interface SourceRefreshDecision {
  itemId: string;
  action: SourceRefreshAction;
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

function stableSerialise(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialise).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(
      (key) => `${JSON.stringify(key)}:${stableSerialise(record[key])}`
    ).join(',')}}`;
  }
  return JSON.stringify(value);
}

function contextDiff(
  current: SafetyPlanSourceSnapshot,
  latest: SafetyPlanSourceSnapshot
): Pick<
  SafetyPlanSourceDiff,
  'contextAdded' | 'contextChanged' | 'contextRemoved' | 'contextUnchanged'
> {
  const result = {
    contextAdded: [] as SafetyPlanContextChange[],
    contextChanged: [] as SafetyPlanContextChange[],
    contextRemoved: [] as SafetyPlanContextChange[],
    contextUnchanged: [] as SafetyPlanContextChange[],
  };
  for (const category of CONTEXT_CATEGORIES) {
    const currentValue = current[category];
    const latestValue = latest[category];
    if (currentValue === undefined && latestValue === undefined) continue;
    const change: SafetyPlanContextChange = {
      itemId: `context:${category}`,
      category,
      current: currentValue,
      latest: latestValue,
    };
    if (currentValue === undefined) result.contextAdded.push(change);
    else if (latestValue === undefined) result.contextRemoved.push(change);
    else if (stableSerialise(currentValue) === stableSerialise(latestValue)) {
      result.contextUnchanged.push(change);
    } else {
      result.contextChanged.push(change);
    }
  }
  for (const changes of Object.values(result)) {
    changes.sort((left, right) => left.itemId.localeCompare(right.itemId));
  }
  return result;
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
    ...contextDiff(current, latest),
  };
}

function decisionsByItem(
  diff: SafetyPlanSourceDiff,
  decisions: SourceRefreshDecision[]
): Map<string, SourceRefreshAction> {
  const required = [
    ...diff.changed.map(({ current }) => current.id),
    ...diff.removed.map(({ id }) => id),
    ...diff.contextChanged.map(({ itemId }) => itemId),
    ...diff.contextRemoved.map(({ itemId }) => itemId),
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

function currentSectionControl(
  version: SafetyPlanVersion,
  item: SafetyPlanSourceItem
): string {
  const field = version.sections
    .flatMap((section) => section.fields)
    .find(({ id }) => id === item.id);
  return typeof field?.value === 'string' ? field.value : item.companyValue;
}

function refreshedItems(
  version: SafetyPlanVersion,
  diff: SafetyPlanSourceDiff,
  decisions: Map<string, SourceRefreshAction>
): SafetyPlanSourceItem[] {
  const result = [
    ...diff.unchanged.map((item) => ({
      ...item,
      companyValue: currentSectionControl(version, item),
    })),
    ...diff.added.map((item) => ({ ...item })),
  ];
  for (const { current, latest } of diff.changed) {
    const action = decisions.get(current.id);
    if (action === 'remove') continue;
    result.push({
      ...latest,
      companyValue: action === 'keep_company_value'
        ? currentSectionControl(version, current)
        : latest.companyValue,
    });
  }
  for (const current of diff.removed) {
    const action = decisions.get(current.id);
    if (action === 'keep_company_value') {
      result.push({
        ...current,
        companyValue: currentSectionControl(version, current),
      });
    }
  }
  return sortItems(result);
}

function resolvedContext(
  diff: SafetyPlanSourceDiff,
  decisions: Map<string, SourceRefreshAction>
): SafetyPlanSourceSnapshot {
  const resolved: SafetyPlanSourceSnapshot = {
    capturedAt: diff.latestSnapshot.capturedAt,
    job: diff.currentSnapshot.job,
    missions: diff.currentSnapshot.missions,
    sourceLinks: diff.currentSnapshot.sourceLinks,
  };
  const changedByCategory = new Map(
    [...diff.contextChanged, ...diff.contextRemoved].map((change) => [change.category, change])
  );
  const addedByCategory = new Map(
    diff.contextAdded.map((change) => [change.category, change])
  );

  for (const category of CONTEXT_CATEGORIES) {
    const changed = changedByCategory.get(category);
    const added = addedByCategory.get(category);
    let value: unknown;
    if (added) {
      value = added.latest;
    } else if (changed) {
      const action = decisions.get(changed.itemId);
      value = action === 'keep_company_value' ? changed.current : changed.latest;
      if (action === 'remove') value = undefined;
    } else {
      value = diff.currentSnapshot[category];
    }
    if (value !== undefined) {
      (resolved as unknown as Record<string, unknown>)[category] = value;
    } else {
      delete (resolved as unknown as Record<string, unknown>)[category];
    }
  }
  if (!resolved.job || !Array.isArray(resolved.missions) || !Array.isArray(resolved.sourceLinks)) {
    throw new Error('Job, missions and source links cannot be removed from a Safety Plan snapshot');
  }
  return resolved;
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

const FIELDS_BY_CONTEXT: Partial<Record<SafetyPlanContextCategory, string[]>> = {
  job: ['plan_reference', 'plan_scope', 'job_details', 'operating_dates', 'site_access_controls'],
  client: ['client_property_location'],
  property: ['client_property_location'],
  field: ['client_property_location'],
  crew: ['assigned_crew'],
  assets: ['operational_assets'],
  chemicals: ['chemicals_payloads'],
  emergencyContacts: ['emergency_response'],
};

function sourceLinksForResolvedSnapshot(
  resolved: SafetyPlanSourceSnapshot,
  hazards: SafetyPlanSourceItem[],
  diff: SafetyPlanSourceDiff,
  decisions: Map<string, SourceRefreshAction>
): SafetyPlanSourceSnapshot['sourceLinks'] {
  const missionChange = [...diff.contextAdded, ...diff.contextChanged, ...diff.contextRemoved]
    .find(({ category }) => category === 'missions');
  const useLatestMissionLinks = missionChange
    ? decisions.get(missionChange.itemId) !== 'keep_company_value'
    : false;
  const missionIds = new Set(resolved.missions.map(({ id }) => id));
  const missionLinks = (
    useLatestMissionLinks
      ? diff.latestSnapshot.sourceLinks
      : diff.currentSnapshot.sourceLinks
  ).filter((link) => link.sourceType === 'mission' && missionIds.has(link.sourceId));
  const hazardLinks = hazards.map((hazard) => ({
    sourceType: hazard.sourceType,
    sourceId: hazard.sourceId,
    sourceItemId: hazard.sourceItemId,
    sourceUpdatedAt: hazard.sourceUpdatedAt,
  }));
  return [...missionLinks, ...hazardLinks].sort((left, right) => (
    `${left.sourceType}:${left.sourceId}:${left.sourceItemId ?? ''}`
      .localeCompare(`${right.sourceType}:${right.sourceId}:${right.sourceItemId ?? ''}`)
  ));
}

function refreshAcceptedContextFields(
  sections: SafetyPlanVersion['sections'],
  snapshot: SafetyPlanSourceSnapshot,
  diff: SafetyPlanSourceDiff,
  decisions: Map<string, SourceRefreshAction>
): SafetyPlanVersion['sections'] {
  const accepted = new Set<SafetyPlanContextCategory>(
    diff.contextAdded.map(({ category }) => category)
  );
  for (const change of [...diff.contextChanged, ...diff.contextRemoved]) {
    if (decisions.get(change.itemId) !== 'keep_company_value') accepted.add(change.category);
  }
  const fieldIds = new Set(
    [...accepted].flatMap((category) => FIELDS_BY_CONTEXT[category] ?? [])
  );
  return sections.map((section) => ({
    ...section,
    fields: section.fields.map((field) => fieldIds.has(field.id)
      ? { ...field, value: safetyPlanFieldValue(field.id, snapshot) }
      : field),
  }));
}

export function applySourceRefresh(
  version: SafetyPlanVersion,
  diff: SafetyPlanSourceDiff,
  decisions: SourceRefreshDecision[]
): SafetyPlanVersion {
  if (version.status === 'approved' || version.status === 'superseded') {
    throw new Error('Approved and superseded Safety Plan versions are immutable');
  }
  const decisionMap = decisionsByItem(diff, decisions);
  const hazards = refreshedItems(version, diff, decisionMap);
  const sourceSnapshot: SafetyPlanSourceSnapshot = {
    ...resolvedContext(diff, decisionMap),
    hazards,
  };
  sourceSnapshot.sourceLinks = sourceLinksForResolvedSnapshot(
    sourceSnapshot,
    hazards,
    diff,
    decisionMap
  );
  const sourceSections = refreshSourceFields(version, hazards);

  return {
    ...version,
    sections: refreshAcceptedContextFields(
      sourceSections,
      sourceSnapshot,
      diff,
      decisionMap
    ),
    sourceSnapshot,
    revision: version.revision + 1,
    sourceRefreshAudit: {
      action: 'source_refreshed',
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

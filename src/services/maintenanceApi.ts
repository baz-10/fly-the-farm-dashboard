import { normalizeMaintenanceDueResult as normalizeMaintenanceDueProjection } from '../domain/maintenance/dueState';
import type { MaintenanceDueResult, MaintenanceDueState } from '../types/fleetMaintenance';
import { boundedPublicDiagnostics } from './publicDiagnostics';

export type MaintenanceAssetSource = 'aircraft' | 'equipment-kit' | 'fleet-asset';
export type MeterSource = 'MANUAL' | 'MISSION' | 'IMPORT';

export interface AssetAttachmentPeriod { id:string; parentAssetId:string; childAssetId:string; positionLabel:string; attachedAt:string; detachedAt?:string; rowVersion:number; }
export interface AssetMeterReading { id:string; meterDefinitionId:string; recordedAt:string; value:number; source:string; sourceSystem:string; sourceRecordId:string; supersedesReadingId?:string; }

export type FleetDueStateCounts = Record<MaintenanceDueState, number>;
export interface FleetMaintenanceDueRow {
  registryId: string;
  source: MaintenanceAssetSource;
  sourceRecordId: string;
  identity: string;
  operatingLocationId: string;
  highestState: MaintenanceDueState;
  requirementCount: number;
  attachedAssetCount: number;
  stateCounts: FleetDueStateCounts;
}
export interface FleetMaintenanceDuePage { number:number; pageSize:number; hasMore:boolean; scannedCount:number; returnedCount:number; }
export interface FleetMaintenanceDueSummary {
  asOf: string;
  filters: { baseId: string | null; assetType: MaintenanceAssetSource | null; state: MaintenanceDueState | null };
  counts: FleetDueStateCounts;
  page: FleetMaintenanceDuePage;
  rows: FleetMaintenanceDueRow[];
}
export interface FleetMaintenanceDueFilters { baseId?: string; assetType?: MaintenanceAssetSource; state?: MaintenanceDueState; page?:number; pageSize?:number; }

export class MaintenanceApiError extends Error {
  constructor(readonly status:number,readonly code:string,message:string,readonly correlationId?:string){
    super(message);
    this.name='MaintenanceApiError';
  }
}

async function parseResponse(response: Response): Promise<unknown> {
  const envelope: any = await response.json().catch(() => ({}));
  const correlationId = response.headers.get('X-Correlation-ID') || envelope?.error?.correlationId || undefined;
  if (!response.ok) {
    const diagnostics = boundedPublicDiagnostics({
      code: envelope?.error?.code,
      message: envelope?.error?.message,
      correlationId,
    }, {
      code: 'MAINTENANCE_API_ERROR',
      message: 'Maintenance request failed.',
    });
    throw new MaintenanceApiError(response.status, diagnostics.code, diagnostics.message, diagnostics.correlationId);
  }
  if (!envelope || envelope.data === null || typeof envelope.data !== 'object' || Array.isArray(envelope.data)) {
    throw new MaintenanceApiError(0, 'MALFORMED_RESPONSE', 'The maintenance API returned an invalid response.');
  }
  return envelope.data;
}

function get(action: string, query: Record<string, string>) {
  const parameters = new URLSearchParams({ action, ...query });
  return fetch(`/api/v1/asset-maintenance?${parameters.toString()}`, {
    method: 'GET',
    credentials: 'same-origin',
  }).then(parseResponse);
}

async function call(action:string, body:Record<string,unknown>) {
  const response=await fetch(`/api/v1/asset-maintenance?action=${encodeURIComponent(action)}`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  return parseResponse(response) as Promise<Record<string, unknown>>;
}

function malformed(): never {
  throw new MaintenanceApiError(0, 'MALFORMED_RESPONSE', 'The maintenance API returned an invalid response.');
}

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return malformed();
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).some((key) => !keys.includes(key))) malformed();
}

function nonEmptyString(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') return malformed();
  return value;
}

function nonnegativeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return malformed();
  return value;
}

function booleanValue(value: unknown): boolean {
  if (typeof value !== 'boolean') return malformed();
  return value;
}

const DUE_STATES: MaintenanceDueState[] = ['CURRENT', 'DUE_SOON', 'DUE', 'OVERDUE', 'INSUFFICIENT_DATA'];
const ASSET_SOURCES: MaintenanceAssetSource[] = ['aircraft', 'equipment-kit', 'fleet-asset'];
const STATE_RANK: Record<MaintenanceDueState, number> = { OVERDUE:0, DUE:1, DUE_SOON:2, INSUFFICIENT_DATA:3, CURRENT:4 };

function enumValue<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) return malformed();
  return value as T;
}

function counts(value: unknown): FleetDueStateCounts {
  const source = object(value);
  exactKeys(source, DUE_STATES);
  return {
    CURRENT: nonnegativeInteger(source.CURRENT),
    DUE_SOON: nonnegativeInteger(source.DUE_SOON),
    DUE: nonnegativeInteger(source.DUE),
    OVERDUE: nonnegativeInteger(source.OVERDUE),
    INSUFFICIENT_DATA: nonnegativeInteger(source.INSUFFICIENT_DATA),
  };
}

function normalizeDue(value: unknown, requestedAssetId: string, requestedAsOf: string): MaintenanceDueResult {
  try {
    const normalized = normalizeMaintenanceDueProjection(value);
    if (normalized.assetId !== requestedAssetId || Date.parse(normalized.asOf) !== Date.parse(requestedAsOf)) return malformed();
    return normalized;
  } catch (error) {
    if (error instanceof MaintenanceApiError) throw error;
    return malformed();
  }
}

function normalizeFleetSummary(value: unknown, requestedAsOf: string, requestedFilters: FleetMaintenanceDueFilters, requestedPage: number, requestedPageSize: number): FleetMaintenanceDueSummary {
  const source = object(value);
  exactKeys(source, ['asOf', 'filters', 'counts', 'page', 'rows']);
  const asOf = nonEmptyString(source.asOf);
  if (Date.parse(asOf) !== Date.parse(requestedAsOf) || !Array.isArray(source.rows)) return malformed();
  const rawFilters = object(source.filters);
  exactKeys(rawFilters, ['baseId', 'assetType', 'state']);
  const filters = {
    baseId: rawFilters.baseId === null ? null : nonEmptyString(rawFilters.baseId),
    assetType: rawFilters.assetType === null ? null : enumValue(rawFilters.assetType, ASSET_SOURCES),
    state: rawFilters.state === null ? null : enumValue(rawFilters.state, DUE_STATES),
  };
  if (filters.baseId !== (requestedFilters.baseId || null)
    || filters.assetType !== (requestedFilters.assetType || null)
    || filters.state !== (requestedFilters.state || null)) return malformed();
  const rows = source.rows.map((value): FleetMaintenanceDueRow => {
    const row = object(value);
    exactKeys(row, ['registryId', 'source', 'sourceRecordId', 'identity', 'operatingLocationId', 'highestState', 'requirementCount', 'attachedAssetCount', 'stateCounts']);
    const registryId = nonEmptyString(row.registryId);
    const requirementCount = nonnegativeInteger(row.requirementCount);
    const attachedAssetCount = nonnegativeInteger(row.attachedAssetCount);
    const stateCounts = counts(row.stateCounts);
    const highestState = enumValue(row.highestState, DUE_STATES);
    const countedRequirements = DUE_STATES.reduce((sum, state) => sum + stateCounts[state], 0);
    const projectedHighest = [...DUE_STATES].filter((state) => stateCounts[state] > 0)
      .sort((left, right) => STATE_RANK[left] - STATE_RANK[right])[0] || 'CURRENT';
    if (requirementCount !== countedRequirements || highestState !== projectedHighest) return malformed();
    return {
      registryId,
      source: enumValue(row.source, ASSET_SOURCES),
      sourceRecordId: nonEmptyString(row.sourceRecordId),
      identity: nonEmptyString(row.identity),
      operatingLocationId: nonEmptyString(row.operatingLocationId),
      highestState,
      requirementCount,
      attachedAssetCount,
      stateCounts,
    };
  });
  const summaryCounts = counts(source.counts);
  if (filters.state === null) {
    const projectedSummaryCounts: FleetDueStateCounts = { CURRENT:0, DUE_SOON:0, DUE:0, OVERDUE:0, INSUFFICIENT_DATA:0 };
    rows.forEach((row) => { projectedSummaryCounts[row.highestState] += 1; });
    if (DUE_STATES.some((state) => summaryCounts[state] !== projectedSummaryCounts[state])) return malformed();
  } else if (rows.some((row) => row.highestState !== filters.state) || summaryCounts[filters.state] < rows.length) return malformed();
  const rawPage = object(source.page);
  exactKeys(rawPage, ['number', 'pageSize', 'hasMore', 'scannedCount', 'returnedCount']);
  const page = {
    number: nonnegativeInteger(rawPage.number),
    pageSize: nonnegativeInteger(rawPage.pageSize),
    hasMore: booleanValue(rawPage.hasMore),
    scannedCount: nonnegativeInteger(rawPage.scannedCount),
    returnedCount: nonnegativeInteger(rawPage.returnedCount),
  };
  const totalCount = DUE_STATES.reduce((sum, state) => sum + summaryCounts[state], 0);
  if (page.number !== requestedPage || page.pageSize !== requestedPageSize
    || page.number < 1 || page.pageSize < 1 || page.pageSize > 25 || page.scannedCount > page.pageSize
    || page.returnedCount !== rows.length || rows.length > page.scannedCount || totalCount > page.scannedCount) return malformed();
  return { asOf, filters, counts: summaryCounts, page, rows };
}

export const maintenanceApi={
  attach:(input:{parentAssetId:string;childAssetId:string;positionLabel:string;attachedAt:string;meterSnapshot?:Record<string,number>})=>call('attach',input),
  detach:(id:string,expectedVersion:number,detachedAt:string,meterSnapshot?:Record<string,number>)=>call('detach',{id,expectedVersion,detachedAt,meterSnapshot}),
  recordReading:(input:{meterDefinitionId:string;recordedAt:string;value:number;source:MeterSource;sourceSystem:string;sourceRecordId:string;evidence?:Record<string,unknown>})=>call('record-reading',input),
  correctReading:(input:{meterDefinitionId:string;supersedesReadingId:string;recordedAt:string;value:number;sourceSystem:string;sourceRecordId:string;correctionReason:string;evidence?:Record<string,unknown>})=>call('correct-reading',input),
  async readDueState(assetId: string, asOf: string): Promise<MaintenanceDueResult> {
    const value = await get('due-state', { assetId, asOf });
    return normalizeDue(value, assetId, asOf);
  },
  async readFleetDueSummary(asOf: string, filters: FleetMaintenanceDueFilters = {}): Promise<FleetMaintenanceDueSummary> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 25;
    const query: Record<string, string> = { asOf, page:String(page), pageSize:String(pageSize) };
    if (filters.baseId) query.baseId = filters.baseId;
    if (filters.assetType) query.assetType = filters.assetType;
    if (filters.state) query.state = filters.state;
    const value = await get('fleet-due-summary', query);
    return normalizeFleetSummary(value, asOf, filters, page, pageSize);
  },
};

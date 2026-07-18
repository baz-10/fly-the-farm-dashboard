import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { PERSISTENCE_KEYS, readSharedValue, writeSharedValue } from '../services/persistence';
import {
  DeploymentAsset,
  DeploymentAssetInput,
  TruckProfile,
  TruckProfileInput,
  WorkPackSnapshot,
  WorkPackTemplate,
  WorkPackTemplateInput,
} from '../types/workPack';
import { instantiateWorkPackTemplate } from '../utils/workPackTemplates';

interface WorkPackStore {
  assets: DeploymentAsset[];
  trucks: TruckProfile[];
  templates: WorkPackTemplate[];
  snapshots: WorkPackSnapshot[];
}

interface WorkPackContextValue extends WorkPackStore {
  isLoading: boolean;
  createAsset: (input: DeploymentAssetInput) => Promise<string>;
  updateAsset: (id: string, updates: Partial<DeploymentAssetInput>) => Promise<void>;
  archiveAsset: (id: string) => Promise<void>;
  createTruck: (input: TruckProfileInput) => Promise<string>;
  updateTruck: (id: string, updates: Partial<TruckProfileInput>) => Promise<void>;
  archiveTruck: (id: string) => Promise<void>;
  createTemplate: (input: WorkPackTemplateInput) => Promise<string>;
  updateTemplate: (id: string, updates: Partial<WorkPackTemplateInput>) => Promise<void>;
  archiveTemplate: (id: string) => Promise<void>;
  duplicateTemplate: (id: string) => Promise<string>;
  instantiateTemplate: (id: string, jobId?: string) => WorkPackSnapshot | undefined;
}

type PersistedWorkPackStore = Partial<WorkPackStore>;

const EMPTY_STORE: WorkPackStore = { assets: [], trucks: [], templates: [], snapshots: [] };
const WorkPackContext = createContext<WorkPackContextValue | undefined>(undefined);

export function normaliseDeploymentAssets(store: PersistedWorkPackStore): DeploymentAsset[] {
  if (Array.isArray(store.assets)) return store.assets;
  return Array.isArray(store.trucks)
    ? store.trucks.map((truck) => ({ ...truck, assetType: 'truck' }))
    : [];
}

function deriveTrucks(assets: DeploymentAsset[]): TruckProfile[] {
  return assets
    .filter((asset) => asset.assetType === 'truck')
    .map(({ assetType: _assetType, ...truck }) => truck);
}

function withAssets(store: WorkPackStore, assets: DeploymentAsset[]): WorkPackStore {
  return { ...store, assets, trucks: deriveTrucks(assets) };
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function WorkPackProvider({ children }: { children: React.ReactNode }) {
  const [store, setStore] = useState<WorkPackStore>(EMPTY_STORE);
  const [isLoading, setIsLoading] = useState(true);
  const loaded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    readSharedValue<PersistedWorkPackStore>(PERSISTENCE_KEYS.workPacks, EMPTY_STORE)
      .then((saved) => {
        if (!cancelled) {
          const assets = normaliseDeploymentAssets(saved);
          setStore({
            assets,
            trucks: deriveTrucks(assets),
            templates: Array.isArray(saved.templates) ? saved.templates : [],
            snapshots: Array.isArray(saved.snapshots) ? saved.snapshots : [],
          });
          loaded.current = true;
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    const timeout = window.setTimeout(() => {
      writeSharedValue(PERSISTENCE_KEYS.workPacks, store).catch(() => undefined);
    }, 50);
    return () => window.clearTimeout(timeout);
  }, [store]);

  const createAsset = useCallback(async (input: DeploymentAssetInput) => {
    const now = new Date().toISOString();
    const id = createId(input.assetType);
    setStore((current) => withAssets(current, [
      ...current.assets,
      { ...input, id, createdAt: now, updatedAt: now },
    ]));
    return id;
  }, []);

  const updateAsset = useCallback(async (id: string, updates: Partial<DeploymentAssetInput>) => {
    setStore((current) => withAssets(current, current.assets.map((asset) => asset.id === id
      ? { ...asset, ...updates, updatedAt: new Date().toISOString() }
      : asset)));
  }, []);

  const archiveAsset = useCallback((id: string) => updateAsset(id, { status: 'retired' }), [updateAsset]);

  const createTruck = useCallback(async (input: TruckProfileInput) => {
    return createAsset({ ...input, assetType: 'truck' });
  }, [createAsset]);

  const updateTruck = useCallback(async (id: string, updates: Partial<TruckProfileInput>) => {
    setStore((current) => withAssets(current, current.assets.map((asset) => (
      asset.id === id && asset.assetType === 'truck'
        ? { ...asset, ...updates, updatedAt: new Date().toISOString() }
        : asset
    ))));
  }, []);

  const archiveTruck = useCallback((id: string) => updateTruck(id, { status: 'retired' }), [updateTruck]);

  const createTemplate = useCallback(async (input: WorkPackTemplateInput) => {
    const now = new Date().toISOString();
    const id = createId('template');
    setStore((current) => ({
      ...current,
      templates: [...current.templates, { ...input, id, createdAt: now, updatedAt: now }],
    }));
    return id;
  }, []);

  const updateTemplate = useCallback(async (id: string, updates: Partial<WorkPackTemplateInput>) => {
    setStore((current) => ({
      ...current,
      templates: current.templates.map((template) => template.id === id
        ? { ...template, ...updates, updatedAt: new Date().toISOString() }
        : template),
    }));
  }, []);

  const archiveTemplate = useCallback((id: string) => updateTemplate(id, { status: 'archived' }), [updateTemplate]);

  const duplicateTemplate = useCallback(async (id: string) => {
    const source = store.templates.find((template) => template.id === id);
    if (!source) return '';
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = source;
    return createTemplate({
      ...input,
      name: `${source.name} Copy`,
      aircraftAssignments: source.aircraftAssignments.map((item) => ({ ...item, id: createId('slot') })),
      crewRequirements: source.crewRequirements.map((item) => ({ ...item, id: createId('crew') })),
      checklist: [...source.checklist],
    });
  }, [createTemplate, store.templates]);

  const instantiateTemplate = useCallback((id: string, jobId?: string) => {
    const template = store.templates.find((item) => item.id === id);
    if (!template) return undefined;
    const snapshot = instantiateWorkPackTemplate(template, jobId);
    setStore((current) => ({ ...current, snapshots: [...current.snapshots, snapshot] }));
    return snapshot;
  }, [store.templates]);

  const value = useMemo<WorkPackContextValue>(() => ({
    ...store,
    isLoading,
    createAsset,
    updateAsset,
    archiveAsset,
    createTruck,
    updateTruck,
    archiveTruck,
    createTemplate,
    updateTemplate,
    archiveTemplate,
    duplicateTemplate,
    instantiateTemplate,
  }), [store, isLoading, createAsset, updateAsset, archiveAsset, createTruck, updateTruck, archiveTruck, createTemplate, updateTemplate, archiveTemplate, duplicateTemplate, instantiateTemplate]);

  return (
    <WorkPackContext.Provider value={value}>
      {isLoading ? null : children}
    </WorkPackContext.Provider>
  );
}

export function useWorkPacks(): WorkPackContextValue {
  const context = useContext(WorkPackContext);
  if (!context) throw new Error('useWorkPacks must be used within WorkPackProvider');
  return context;
}

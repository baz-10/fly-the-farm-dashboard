import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { PERSISTENCE_KEYS, readSharedValue, writeSharedValue } from '../services/persistence';
import {
  TruckProfile,
  TruckProfileInput,
  WorkPackSnapshot,
  WorkPackTemplate,
  WorkPackTemplateInput,
} from '../types/workPack';
import { instantiateWorkPackTemplate } from '../utils/workPackTemplates';

interface WorkPackStore {
  trucks: TruckProfile[];
  templates: WorkPackTemplate[];
  snapshots: WorkPackSnapshot[];
}

interface WorkPackContextValue extends WorkPackStore {
  isLoading: boolean;
  createTruck: (input: TruckProfileInput) => Promise<string>;
  updateTruck: (id: string, updates: Partial<TruckProfileInput>) => Promise<void>;
  archiveTruck: (id: string) => Promise<void>;
  createTemplate: (input: WorkPackTemplateInput) => Promise<string>;
  updateTemplate: (id: string, updates: Partial<WorkPackTemplateInput>) => Promise<void>;
  archiveTemplate: (id: string) => Promise<void>;
  duplicateTemplate: (id: string) => Promise<string>;
  instantiateTemplate: (id: string, jobId?: string) => WorkPackSnapshot | undefined;
}

const EMPTY_STORE: WorkPackStore = { trucks: [], templates: [], snapshots: [] };
const WorkPackContext = createContext<WorkPackContextValue | undefined>(undefined);

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
    readSharedValue<WorkPackStore>(PERSISTENCE_KEYS.workPacks, EMPTY_STORE)
      .then((saved) => {
        if (!cancelled) {
          setStore({
            trucks: Array.isArray(saved.trucks) ? saved.trucks : [],
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

  const createTruck = useCallback(async (input: TruckProfileInput) => {
    const now = new Date().toISOString();
    const id = createId('truck');
    setStore((current) => ({
      ...current,
      trucks: [...current.trucks, { ...input, id, createdAt: now, updatedAt: now }],
    }));
    return id;
  }, []);

  const updateTruck = useCallback(async (id: string, updates: Partial<TruckProfileInput>) => {
    setStore((current) => ({
      ...current,
      trucks: current.trucks.map((truck) => truck.id === id
        ? { ...truck, ...updates, updatedAt: new Date().toISOString() }
        : truck),
    }));
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
    createTruck,
    updateTruck,
    archiveTruck,
    createTemplate,
    updateTemplate,
    archiveTemplate,
    duplicateTemplate,
    instantiateTemplate,
  }), [store, isLoading, createTruck, updateTruck, archiveTruck, createTemplate, updateTemplate, archiveTemplate, duplicateTemplate, instantiateTemplate]);

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

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createOperationalApi, listAll } from '../services/operationalApi';
import { FleetAsset, FleetAssetCreateInput } from '../types/fleetAsset';
import { useAuth } from './AuthContext';

interface FleetAssetContextValue {
  assets: FleetAsset[];
  loading: boolean;
  error?: string;
  reload: () => Promise<void>;
  createAsset: (input: FleetAssetCreateInput) => Promise<FleetAsset>;
  updateAsset: (asset: FleetAsset, input: FleetAssetCreateInput) => Promise<FleetAsset>;
  archiveAsset: (asset: FleetAsset) => Promise<void>;
}

const FleetAssetContext = createContext<FleetAssetContextValue | undefined>(undefined);

export function FleetAssetProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const api = useMemo(() => createOperationalApi(), []);
  const [assets, setAssets] = useState<FleetAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const reload = useCallback(async () => {
    if (!user?.id) { setAssets([]); setLoading(false); return; }
    setLoading(true); setError(undefined);
    try { setAssets(await listAll((page, pageSize) => api.fleetAssets.list(page, pageSize))); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Fleet assets could not be loaded.'); }
    finally { setLoading(false); }
  }, [api, user?.id]);

  useEffect(() => { setAssets([]); void reload(); }, [reload]);

  const createAsset = useCallback(async (input: FleetAssetCreateInput) => {
    const created = await api.fleetAssets.create(input);
    setAssets((current) => [...current, created]);
    return created;
  }, [api]);

  const updateAsset = useCallback(async (asset: FleetAsset, input: FleetAssetCreateInput) => {
    const updated = await api.fleetAssets.update(asset.id, input, asset.rowVersion);
    setAssets((current) => current.map((item) => item.id === updated.id ? updated : item));
    return updated;
  }, [api]);

  const archiveAsset = useCallback(async (asset: FleetAsset) => {
    await api.fleetAssets.archive(asset.id, asset.rowVersion);
    setAssets((current) => current.filter((item) => item.id !== asset.id));
  }, [api]);

  const value = useMemo(() => ({ assets, loading, error, reload, createAsset, updateAsset, archiveAsset }),
    [archiveAsset, assets, createAsset, error, loading, reload, updateAsset]);
  return <FleetAssetContext.Provider value={value}>{children}</FleetAssetContext.Provider>;
}

export function useFleetAssets(): FleetAssetContextValue {
  const context = useContext(FleetAssetContext);
  if (!context) throw new Error('useFleetAssets must be used within FleetAssetProvider');
  return context;
}

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_SUPABASE_CONFIG } from './mockData';
import { Device, LocationPoint, SecurityPhoto, DeviceCommand } from '../types';

let cachedClient: SupabaseClient | null = null;
let currentConfig = { ...DEFAULT_SUPABASE_CONFIG };

export function getStoredConfig() {
  try {
    const saved = localStorage.getItem('hearme_supabase_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.url && parsed.anonKey) {
        currentConfig = parsed;
      }
    }
  } catch {
    // fallback
  }
  return currentConfig;
}

export function saveStoredConfig(url: string, anonKey: string) {
  currentConfig = { url, anonKey };
  try {
    localStorage.setItem('hearme_supabase_config', JSON.stringify(currentConfig));
  } catch {
    // ignore
  }
  cachedClient = null;
}

export function getSupabase(): SupabaseClient {
  if (!cachedClient) {
    const cfg = getStoredConfig();
    cachedClient = createClient(cfg.url, cfg.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  }
  return cachedClient;
}

// Helper RPC caller for phone and panel
export async function callRpc<T = unknown>(functionName: string, params: Record<string, unknown> = {}): Promise<{ data: T | null; error: Error | null }> {
  try {
    const supabase = getSupabase();
    const res = await supabase.rpc(functionName, params);
    if (res.error) {
      return { data: null, error: new Error(res.error.message) };
    }
    return { data: res.data as T, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur réseau Supabase';
    return { data: null, error: new Error(message) };
  }
}

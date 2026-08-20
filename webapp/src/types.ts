export type NetworkType = 'wifi' | '5g' | '4g' | '3g' | 'offline';

export interface Device {
  id: string;
  name: string;
  battery_level: number;
  battery_charging?: boolean;
  network_type: NetworkType;
  is_locked: boolean;
  is_alarm_active: boolean;
  last_seen_at: string;
  secret_key?: string;
  model?: string;
  os_version?: string;
  telegram_linked?: boolean;
  anti_theft_enabled?: boolean;
}

export interface LocationPoint {
  id: string;
  device_id: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  battery_level?: number;
  speed?: number;
  altitude?: number;
  recorded_at: string;
}

export interface SecurityPhoto {
  id: string;
  device_id: string;
  url: string;
  event_type: 'failed_pin' | 'remote_cmd' | 'motion' | 'power_button' | 'manual';
  captured_at: string;
  latitude?: number;
  longitude?: number;
  camera: 'front' | 'back';
  storage_path?: string;
}

export type CommandType = 'lock' | 'alarm' | 'stopalarm' | 'locate' | 'photo' | 'audio' | 'message' | 'regenerate_key';

export interface DeviceCommand {
  id: string;
  device_id: string;
  command: CommandType;
  params?: Record<string, unknown>;
  status: 'pending' | 'sent' | 'executed' | 'failed';
  created_at: string;
  executed_at?: string;
}

export interface GeofenceZone {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number; // in meters
  enabled: boolean;
  type: 'home' | 'work' | 'custom';
  color?: string;
  created_at: string;
}

export type AuthMode = 'secret' | 'auth' | 'demo';

export interface AuthSession {
  mode: AuthMode;
  userEmail?: string;
  secretKey?: string;
  deviceId?: string;
  token?: string;
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

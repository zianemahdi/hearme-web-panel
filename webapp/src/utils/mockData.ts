import { Device, LocationPoint, SecurityPhoto } from '../types';

export const INITIAL_DEMO_DEVICE: Device = {
  id: 'dev_hearme_9981a',
  name: 'Samsung Galaxy S24 Ultra',
  battery_level: 78,
  battery_charging: false,
  network_type: '5g',
  is_locked: true,
  is_alarm_active: false,
  last_seen_at: new Date().toISOString(),
  secret_key: 'Hm9x-8812-Kq7v',
  model: 'SM-S928B',
  os_version: 'Android 14 (One UI 6.1)',
  telegram_linked: true,
  anti_theft_enabled: true
};

// Base coordinates around Algiers (Didouche Mourad / Grande Poste)
export const INITIAL_DEMO_LOCATIONS: LocationPoint[] = [
  {
    id: 'loc-1',
    device_id: 'dev_hearme_9981a',
    latitude: 36.7725,
    longitude: 3.0588,
    accuracy: 8,
    battery_level: 85,
    speed: 0,
    recorded_at: new Date(Date.now() - 1000 * 60 * 45).toISOString()
  },
  {
    id: 'loc-2',
    device_id: 'dev_hearme_9981a',
    latitude: 36.7738,
    longitude: 3.0572,
    accuracy: 12,
    battery_level: 83,
    speed: 4.2,
    recorded_at: new Date(Date.now() - 1000 * 60 * 30).toISOString()
  },
  {
    id: 'loc-3',
    device_id: 'dev_hearme_9981a',
    latitude: 36.7756,
    longitude: 3.0551,
    accuracy: 6,
    battery_level: 81,
    speed: 1.5,
    recorded_at: new Date(Date.now() - 1000 * 60 * 15).toISOString()
  },
  {
    id: 'loc-4',
    device_id: 'dev_hearme_9981a',
    latitude: 36.7769,
    longitude: 3.0538,
    accuracy: 5,
    battery_level: 79,
    speed: 0,
    recorded_at: new Date(Date.now() - 1000 * 60 * 2).toISOString()
  }
];

export const INITIAL_DEMO_PHOTOS: SecurityPhoto[] = [
  {
    id: 'photo-1',
    device_id: 'dev_hearme_9981a',
    url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80',
    event_type: 'failed_pin',
    captured_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    latitude: 36.7769,
    longitude: 3.0538,
    camera: 'front'
  },
  {
    id: 'photo-2',
    device_id: 'dev_hearme_9981a',
    url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&auto=format&fit=crop&q=80',
    event_type: 'remote_cmd',
    captured_at: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
    latitude: 36.7738,
    longitude: 3.0572,
    camera: 'front'
  },
  {
    id: 'photo-3',
    device_id: 'dev_hearme_9981a',
    url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&auto=format&fit=crop&q=80',
    event_type: 'motion',
    captured_at: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
    latitude: 36.7725,
    longitude: 3.0588,
    camera: 'front'
  }
];

export const DEFAULT_SUPABASE_CONFIG = {
  url: 'https://muggtgcwmawcpmzjrvxo.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11Z2d0Z2N3bWF3Y3BtempydnhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNzc2MTgsImV4cCI6MjEwMTk1MzYxOH0.kDjrNHNLLE5c9mMRFG_fOZpzIzD6JfYjbDkZsWhGVEA'
};

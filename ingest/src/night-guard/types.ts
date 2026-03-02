export type NightGuardRule = {
  id: string;
  user_id: string;
  device_id: string;
  enabled: boolean;
  timezone: string;
  start_time_local: string;
  end_time_local: string;
  radius_m: number;
  armed_center_lat: number | null;
  armed_center_lon: number | null;
  armed_at: string | null;
  last_alert_at: string | null;
  cooldown_minutes: number;
  updated_at: string;
};

export type NightGuardState = {
  last_outside_at: string | null;
  consecutive_outside_count: number;
  last_distance_m: number | null;
  updated_at: string;
};

/**
 * Emergency / Stolen Mode for PT60-L trackers.
 * Normal profile = restore target. Emergency profile = 30s updates, sleep off.
 */

const PWD = '0000';

export type NormalProfile = {
  gprs_interval_command_102: string;
  sleep_command_124: string;
  heartbeat_command_122: string;
};

export type EmergencyProfile = {
  gprs_interval_command_102: string;
  sleep_command_124: string;
  heartbeat_command_122: string;
};

/** Default normal config: moving 120s, stopped 600s, sleep after 180s, heartbeat 12h. */
export const DEFAULT_NORMAL_PROFILE: NormalProfile = {
  gprs_interval_command_102: '102,120,,600',
  sleep_command_124: '124,1,180',
  heartbeat_command_122: '122,720',
};

/** Emergency config: moving 30s, stopped 60s, sleep off, heartbeat 60 min. */
export const DEFAULT_EMERGENCY_PROFILE: EmergencyProfile = {
  gprs_interval_command_102: '102,30,,60',
  sleep_command_124: '124,0',
  heartbeat_command_122: '122,60',
};

function withPassword(cmd: string): string {
  return `${PWD},${cmd}`;
}

/** Command texts to send in order for Emergency ON (raw command body after password). */
export function getEmergencyCommandTexts(profile: EmergencyProfile = DEFAULT_EMERGENCY_PROFILE): string[] {
  return [
    withPassword(profile.gprs_interval_command_102),
    withPassword(profile.sleep_command_124),
    withPassword(profile.heartbeat_command_122),
  ];
}

/** Command texts to send in order for Emergency OFF (restore normal). */
export function getNormalCommandTexts(profile: NormalProfile): string[] {
  return [
    withPassword(profile.gprs_interval_command_102),
    withPassword(profile.sleep_command_124),
    withPassword(profile.heartbeat_command_122),
  ];
}

export const EMERGENCY_COMMAND_NAMES = {
  gprs_interval: 'Emergency: Set interval (102)',
  sleep: 'Emergency: Sleep (124)',
  heartbeat: 'Emergency: Heartbeat (122)',
} as const;

export const NORMAL_COMMAND_NAMES = {
  gprs_interval: 'Restore: Set interval (102)',
  sleep: 'Restore: Sleep (124)',
  heartbeat: 'Restore: Heartbeat (122)',
} as const;

export function getEmergencyJobPayloads(profile: EmergencyProfile = DEFAULT_EMERGENCY_PROFILE): { command_name: string; command_text: string }[] {
  const texts = getEmergencyCommandTexts(profile);
  return [
    { command_name: EMERGENCY_COMMAND_NAMES.gprs_interval, command_text: texts[0]! },
    { command_name: EMERGENCY_COMMAND_NAMES.sleep, command_text: texts[1]! },
    { command_name: EMERGENCY_COMMAND_NAMES.heartbeat, command_text: texts[2]! },
  ];
}

export function getNormalJobPayloads(profile: NormalProfile): { command_name: string; command_text: string }[] {
  const texts = getNormalCommandTexts(profile);
  return [
    { command_name: NORMAL_COMMAND_NAMES.gprs_interval, command_text: texts[0]! },
    { command_name: NORMAL_COMMAND_NAMES.sleep, command_text: texts[1]! },
    { command_name: NORMAL_COMMAND_NAMES.heartbeat, command_text: texts[2]! },
  ];
}

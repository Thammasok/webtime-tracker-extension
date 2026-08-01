export type ISODate = string; // 'YYYY-MM-DD' in the user's local timezone
export type Domain = string; // eTLD+1, e.g. 'facebook.com'

export interface DailyUsage {
  [domain: Domain]: number; // seconds spent, that day
}

export interface UsageStore {
  version: 1;
  days: { [date: ISODate]: DailyUsage };
}

export type BlockMode = 'always' | 'redirect' | 'schedule';

export interface ScheduleWindow {
  days: number[]; // 0 (Sunday) - 6 (Saturday)
  start: string; // 'HH:mm' local
  end: string; // 'HH:mm' local
}

export interface BlockRule {
  id: string; // uuid
  domain: Domain; // eTLD+1 (blocks bare + www.) or an exact subdomain host (blocks only that host)
  mode: BlockMode;
  enabled: boolean;
  redirectUrl?: string; // mode 'redirect'; if absent, falls back to /blocked.html
  // mode 'schedule': block when EITHER condition is currently true
  windows?: ScheduleWindow[];
  dailyLimitSeconds?: number; // block once today's tracked time for this domain exceeds it
}

export interface Settings {
  version: 1;
  retentionDays: number; // auto-prune days older than this (0 = keep forever)
  idleThresholdSeconds: number;
  // Additive to the dev-plan's literal Settings shape — needed by the Privacy tab (design 5a).
  pauseInIncognito: boolean;
  excludedDomains: Domain[];
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  retentionDays: 90,
  idleThresholdSeconds: 60,
  pauseInIncognito: true,
  excludedDomains: [],
};

export interface ExportedData {
  exportedAt: number; // epoch ms
  usage: UsageStore;
  rules: BlockRule[];
  settings: Settings;
}

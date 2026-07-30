import { useCallback, useEffect, useState } from 'react';
import { getRules, getSettings, getUsage } from '@/utils/storage';
import type { BlockRule, Settings, UsageStore } from '@/utils/types';

export interface ExtensionData {
  usage: UsageStore;
  rules: BlockRule[];
  settings: Settings;
}

/**
 * Reads usage/rules/settings directly from `storage.local` (never by messaging the background
 * worker, which may be asleep — and messaging it wouldn't work anyway if it's what's stalled)
 * and stays live via `storage.onChanged`, so popup/dashboard reflect writes from any context
 * without a manual refresh.
 */
export function useExtensionData(): ExtensionData | null {
  const [data, setData] = useState<ExtensionData | null>(null);

  const reload = useCallback(async () => {
    const [usage, rules, settings] = await Promise.all([getUsage(), getRules(), getSettings()]);
    setData({ usage, rules, settings });
  }, []);

  useEffect(() => {
    reload();

    const onChanged = (_changes: unknown, areaName: string) => {
      if (areaName === 'local') reload();
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, [reload]);

  return data;
}

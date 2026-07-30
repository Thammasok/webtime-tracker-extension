import { useEffect, useState } from 'react';
import { isWithinWindow, windowEndDate } from '@/utils/blocker';
import { todayISODate } from '@/utils/date';
import { formatDuration } from '@/utils/format';
import { getRules, getUsage } from '@/utils/storage';
import type { BlockRule } from '@/utils/types';
import { Button } from '@/components/ui/button';

function domainFromQuery(): string {
  return new URLSearchParams(window.location.search).get('d') ?? '';
}

interface BlockInfo {
  rule: BlockRule;
  usageSecondsToday: number;
  reason: string;
  unlockLabel: string | null;
}

async function loadBlockInfo(domain: string): Promise<BlockInfo | null> {
  const [rules, usage] = await Promise.all([getRules(), getUsage()]);
  const rule = rules.find((r) => r.domain === domain);
  if (!rule) return null;

  const usageSecondsToday = usage.days[todayISODate()]?.[domain] ?? 0;
  const now = new Date();

  if (rule.mode === 'always' || rule.mode === 'redirect') {
    return { rule, usageSecondsToday, reason: "You've chosen to always block this site.", unlockLabel: null };
  }

  const activeWindow = (rule.windows ?? []).find((w) => isWithinWindow(w, now));
  if (activeWindow) {
    const unlockLabel = formatDuration((windowEndDate(activeWindow, now).getTime() - now.getTime()) / 1000);
    return {
      rule,
      usageSecondsToday,
      reason: "You're inside a scheduled focus window for this site.",
      unlockLabel,
    };
  }

  return {
    rule,
    usageSecondsToday,
    reason: `You hit your ${formatDuration(rule.dailyLimitSeconds ?? 0)} daily limit here.`,
    unlockLabel: 'tomorrow',
  };
}

function App() {
  const domain = domainFromQuery();
  const [info, setInfo] = useState<BlockInfo | null | undefined>(undefined);

  useEffect(() => {
    if (!domain) return;
    loadBlockInfo(domain).then(setInfo);
  }, [domain]);

  const openOptions = () => {
    browser.tabs.create({ url: browser.runtime.getURL('/options.html#rules') });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(120%_90%_at_50%_-10%,#efeefc,#f7f8fa_55%)] p-10">
      <div className="relative flex w-full max-w-[560px] flex-col items-center rounded-2xl px-10 py-12 text-center">
        <div className="absolute top-0 left-0 flex items-center gap-2 opacity-70">
          <span className="grid size-6 place-items-center rounded-[7px] bg-brand text-[13px] font-bold text-white">
            W
          </span>
          <span className="font-display text-sm font-bold">Webtime</span>
        </div>

        <div className="grid size-[76px] place-items-center rounded-[22px] bg-card text-[34px] shadow-[0_10px_30px_-12px_rgba(91,91,214,0.5)]">
          🌤️
        </div>

        <h1 className="mt-6 font-display text-[28px] font-bold tracking-tight text-ink">
          Taking a break from <span className="text-brand">{domain || 'this site'}</span>
        </h1>

        <p className="mt-3 max-w-[440px] text-[15px] leading-relaxed text-muted">
          {info?.reason ?? 'This site is blocked right now.'} That's a good stopping point.
        </p>

        {info && (
          <div className="mt-5 flex flex-wrap justify-center gap-3 text-[13px] text-muted">
            {info.rule.mode === 'schedule' && info.rule.dailyLimitSeconds != null && (
              <span className="rounded-full border border-border bg-card px-4 py-1.5 font-semibold">
                ⏱ Used {formatDuration(info.usageSecondsToday)} of {formatDuration(info.rule.dailyLimitSeconds)}{' '}
                today
              </span>
            )}
            {info.unlockLabel && (
              <span className="rounded-full border border-border bg-card px-4 py-1.5 font-semibold">
                🔓{' '}
                {info.unlockLabel === 'tomorrow'
                  ? 'Unblocks tomorrow'
                  : `Unblocks in ${info.unlockLabel}`}
              </span>
            )}
          </div>
        )}

        <div className="mt-7 flex gap-2.5">
          <Button size="lg" onClick={() => window.history.back()}>
            Back to work →
          </Button>
          <Button size="lg" variant="outline" onClick={openOptions}>
            Adjust this limit
          </Button>
        </div>

        <span className="mt-6 text-xs text-faint">You set this rule yourself · it's here to help you focus</span>
      </div>
    </div>
  );
}

export default App;

import { SiteIcon } from '@/components/site-icon';
import { Switch } from '@/components/ui/switch';
import type { ExtensionData } from '@/hooks/use-extension-data';
import { lastNDates, todayISODate } from '@/utils/date';
import { formatDuration } from '@/utils/format';
import { toggleAlwaysBlock } from '@/utils/rule-actions';
import { dailyTotals, topDomains, totalSeconds } from '@/utils/usage-summary';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function TodayTab({ data }: { data: ExtensionData }) {
  const { usage, rules } = data;
  const today = todayISODate();
  const todayUsage = usage.days[today] ?? {};
  const total = totalSeconds(todayUsage);
  const sites = topDomains(todayUsage, 8);

  const last7 = lastNDates(7);
  const totals = dailyTotals(usage, last7);
  const previousDaysAvg =
    totals.slice(0, -1).length > 0
      ? totals.slice(0, -1).reduce((a, b) => a + b, 0) / totals.slice(0, -1).length
      : 0;
  const deltaSeconds = total - previousDaysAvg;
  const maxTotal = Math.max(...totals, 1);

  const isBlocked = (domain: string) => rules.some((r) => r.domain === domain && r.enabled);
  const maxSiteSeconds = Math.max(...sites.map(([, s]) => s), 1);

  return (
    <>
      <div className="border-b border-border bg-card px-[22px] pt-[22px] pb-[18px]">
        <div className="flex items-center justify-between">
          <span className="font-display text-[15px] font-semibold">Today</span>
          {previousDaysAvg > 0 && (
            <span className="rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-bold text-brand-hover">
              {deltaSeconds <= 0 ? '↓' : '↑'} {formatDuration(Math.abs(deltaSeconds))} vs avg
            </span>
          )}
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-display text-[44px] leading-none font-bold tracking-tight tabular-nums">
            {formatDuration(total)}
          </span>
        </div>

        <div className="mt-4 flex h-[34px] items-end gap-[3px]">
          {totals.map((seconds, i) => (
            <div
              key={last7[i]}
              className={`flex-1 rounded-[3px] ${i === totals.length - 1 ? 'bg-brand' : 'bg-divider'}`}
              style={{ height: `${Math.max(6, (seconds / maxTotal) * 100)}%` }}
            />
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] text-faint">
          {last7.map((date) => (
            <span key={date}>{DAY_LABELS[new Date(date).getDay()]}</span>
          ))}
        </div>
      </div>

      <div className="px-3 pt-2.5 pb-1.5">
        {sites.length === 0 && (
          <p className="px-2.5 py-6 text-center text-[13px] text-faint">
            Nothing tracked yet today — browse a bit and check back.
          </p>
        )}
        {sites.map(([domain, seconds]) => {
          const blocked = isBlocked(domain);
          return (
            <div
              key={domain}
              className={`flex items-center gap-3 rounded-xl px-2.5 py-2.5 ${blocked ? 'bg-brand-soft' : ''}`}
            >
              <SiteIcon domain={domain} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`truncate text-[13.5px] font-semibold ${blocked ? 'text-brand-hover' : ''}`}>
                    {domain}
                    {blocked && (
                      <span className="ml-1.5 rounded-[5px] bg-brand px-1.5 py-0.5 align-middle text-[10px] font-bold text-white">
                        Blocked
                      </span>
                    )}
                  </span>
                  <span
                    className={`shrink-0 text-[13px] font-semibold tabular-nums ${blocked ? 'text-faint' : 'text-muted'}`}
                  >
                    {formatDuration(seconds)}
                  </span>
                </div>
                <div className="mt-1.5 h-[5px] overflow-hidden rounded-[3px] bg-divider">
                  <div
                    className="h-full rounded-[3px] bg-brand"
                    style={{ width: `${(seconds / maxSiteSeconds) * 100}%`, opacity: blocked ? 0.5 : 1 }}
                  />
                </div>
              </div>
              <Switch
                checked={blocked}
                onCheckedChange={() => toggleAlwaysBlock(domain, rules)}
                aria-label={`Block ${domain}`}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}

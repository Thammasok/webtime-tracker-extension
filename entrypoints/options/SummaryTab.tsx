import { useMemo, useState } from 'react';
import { SiteIcon } from '@/components/site-icon';
import { StatCard } from '@/components/stat-card';
import { Switch } from '@/components/ui/switch';
import type { ExtensionData } from '@/hooks/use-extension-data';
import { CATEGORY_COLORS } from '@/utils/category';
import { lastNDates } from '@/utils/date';
import { formatDuration } from '@/utils/format';
import { isBlockedNow, usageForRuleDomain } from '@/utils/blocker';
import { toggleAlwaysBlock } from '@/utils/rule-actions';
import {
  CATEGORY_ORDER,
  aggregateRange,
  categoryTotals,
  categoryTotalsByDay,
  dailyTotals,
  topDomains,
  totalSeconds,
} from '@/utils/usage-summary';

const RANGES = [
  { key: '1', label: 'Today', days: 1 },
  { key: '7', label: '7 days', days: 7 },
  { key: '30', label: '30 days', days: 30 },
] as const;

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TOP_SITES_SHOWN = 8;

export function SummaryTab({ data }: { data: ExtensionData }) {
  const [rangeDays, setRangeDays] = useState<7 | 1 | 30>(7);
  const { usage, rules } = data;

  const dates = useMemo(() => lastNDates(rangeDays), [rangeDays]);
  const previousDates = useMemo(() => lastNDates(rangeDays * 2).slice(0, rangeDays), [rangeDays]);

  const rangeUsage = useMemo(() => aggregateRange(usage, dates), [usage, dates]);
  const total = totalSeconds(rangeUsage);
  const previousTotal = totalSeconds(aggregateRange(usage, previousDates));
  const delta = total - previousTotal;

  const totals = dailyTotals(usage, dates);
  const activeDays = totals.filter((t) => t > 0).length;
  const dailyAverage = activeDays > 0 ? total / activeDays : 0;

  const sites = topDomains(rangeUsage);
  const mostVisited = sites[0];

  const enabledRules = rules.filter((r) => r.enabled);
  const blockedRightNow = enabledRules.filter((r) => {
    const todaySeconds = usageForRuleDomain(usage.days[dates[dates.length - 1]] ?? {}, r.domain);
    return isBlockedNow(r, todaySeconds, new Date());
  });

  const categoryStack = useMemo(() => categoryTotalsByDay(usage, dates), [usage, dates]);
  const categoryTotal = categoryTotals(rangeUsage);
  const categoryGrandTotal = Math.max(1, CATEGORY_ORDER.reduce((sum, c) => sum + categoryTotal[c], 0));
  const maxDayTotal = Math.max(...totals, 1);

  const conicStops = (() => {
    let cursor = 0;
    return CATEGORY_ORDER.map((c) => {
      const pct = (categoryTotal[c] / categoryGrandTotal) * 100;
      const stop = `${CATEGORY_COLORS[c]} ${cursor}% ${cursor + pct}%`;
      cursor += pct;
      return stop;
    }).join(', ');
  })();

  const maxSiteSeconds = Math.max(...sites.map(([, s]) => s), 1);
  const shownSites = sites.slice(0, TOP_SITES_SHOWN);

  // A 30-bar chart needs a much tighter gap/width than 7 (or 1) bars, or it overflows the card —
  // narrow the gap, drop the per-bar max-width cap, and thin out the day labels so they don't
  // collide with each other.
  const isDenseChart = dates.length > 7;
  const labelEvery = Math.max(1, Math.ceil(dates.length / 6));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <div className="flex gap-1 rounded-[10px] bg-divider p-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRangeDays(r.days)}
              className={`rounded-[7px] px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                rangeDays === r.days ? 'bg-brand-soft text-ink' : 'text-muted'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatCard
          label={rangeDays === 1 ? 'Today' : `Last ${rangeDays} days`}
          value={formatDuration(total)}
          sub={
            previousTotal > 0
              ? `${delta <= 0 ? '↓' : '↑'} ${formatDuration(Math.abs(delta))} vs prior period`
              : undefined
          }
        />
        <StatCard
          label="Daily average"
          value={formatDuration(dailyAverage)}
          sub={`across ${sites.length} site${sites.length === 1 ? '' : 's'}`}
        />
        <StatCard
          label="Most visited"
          value={mostVisited ? mostVisited[0] : '—'}
          sub={mostVisited ? `${formatDuration(mostVisited[1])} in this range` : undefined}
        />
        <StatCard
          accent
          label="Blocks active"
          value={`${enabledRules.length} site${enabledRules.length === 1 ? '' : 's'}`}
          sub={`${blockedRightNow.length} blocking right now`}
        />
      </div>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.7fr_1fr]">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-display text-[15px] font-semibold">Daily activity</span>
            <div className="flex flex-wrap gap-3.5 text-[11.5px] font-medium text-muted">
              {CATEGORY_ORDER.map((c) => (
                <span key={c} className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-[3px]" style={{ background: CATEGORY_COLORS[c] }} />
                  {c}
                </span>
              ))}
            </div>
          </div>
          <div className={`mt-4 flex h-[190px] items-end ${isDenseChart ? 'gap-[2px]' : 'gap-4'}`}>
            {dates.map((date, i) => {
              const dayTotal = totals[i];
              const heightPct = Math.max(dayTotal > 0 ? 4 : 0, (dayTotal / maxDayTotal) * 100);
              const showLabel = !isDenseChart || i % labelEvery === 0 || i === dates.length - 1;
              return (
                <div key={date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <div
                    className={`flex w-full flex-1 flex-col-reverse overflow-hidden rounded-md ${
                      isDenseChart ? '' : 'max-w-[38px]'
                    }`}
                  >
                    <div style={{ height: `${heightPct}%` }} className="flex w-full flex-col-reverse">
                      {CATEGORY_ORDER.map((c) => {
                        const share = dayTotal > 0 ? categoryStack[i][c] / dayTotal : 0;
                        return (
                          <div key={c} style={{ height: `${share * 100}%`, background: CATEGORY_COLORS[c] }} />
                        );
                      })}
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-faint">
                    {showLabel ? (isDenseChart ? new Date(date).getDate() : DAY_LABELS[new Date(date).getDay()]) : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <span className="font-display text-[15px] font-semibold">Categories</span>
          <div className="mt-3.5 flex items-center gap-4">
            <div
              className="grid size-[104px] shrink-0 place-items-center rounded-full"
              style={{ background: categoryGrandTotal > 1 ? `conic-gradient(${conicStops})` : 'var(--color-divider)' }}
            >
              <div className="grid size-16 place-items-center rounded-full bg-card text-center">
                <div>
                  <div className="font-display text-[17px] font-bold leading-none">{sites.length}</div>
                  <div className="text-[9px] font-semibold text-faint">sites</div>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 text-[12.5px]">
              {CATEGORY_ORDER.map((c) => (
                <span key={c} className="flex items-center gap-1.5 font-semibold">
                  <span className="size-2.5 rounded-[3px]" style={{ background: CATEGORY_COLORS[c] }} />
                  {c}{' '}
                  <span className="font-medium text-faint">
                    {Math.round((categoryTotal[c] / categoryGrandTotal) * 100)}%
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-3">
          <span className="font-display text-[15px] font-semibold">Per-site totals</span>
          <span className="text-[12.5px] text-faint">
            Sorted by time · {rangeDays === 1 ? 'today' : `last ${rangeDays} days`}
          </span>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            <div className="grid grid-cols-[1fr_120px_160px_90px] gap-3 border-b border-divider px-5 py-2 text-[11px] font-semibold tracking-wide text-faint uppercase">
              <span>Site</span>
              <span className="text-right">Time</span>
              <span>Share</span>
              <span className="text-right">Block</span>
            </div>
            {shownSites.length === 0 && (
              <p className="px-5 py-8 text-center text-[13px] text-faint">Nothing tracked in this range yet.</p>
            )}
            {shownSites.map(([domain, seconds]) => {
              const blocked = enabledRules.some((r) => r.domain === domain);
              const share = Math.round((seconds / Math.max(1, total)) * 100);
              return (
                <div
                  key={domain}
                  className="grid grid-cols-[1fr_120px_160px_90px] items-center gap-3 border-b border-divider px-5 py-3 last:border-b-0"
                >
                  <span className="flex items-center gap-2.5 text-[13.5px] font-semibold">
                    <SiteIcon domain={domain} size={26} />
                    <span className="truncate">{domain}</span>
                    {blocked && (
                      <span className="shrink-0 rounded-[5px] bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">
                        Blocked
                      </span>
                    )}
                  </span>
                  <span className="text-right font-semibold tabular-nums">{formatDuration(seconds)}</span>
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-divider">
                      <span
                        className="block h-full rounded-[3px] bg-brand"
                        style={{ width: `${(seconds / maxSiteSeconds) * 100}%` }}
                      />
                    </span>
                    <span className="w-8 text-[11.5px] font-semibold text-faint">{share}%</span>
                  </span>
                  <span className="flex justify-end">
                    <Switch
                      checked={blocked}
                      onCheckedChange={() => toggleAlwaysBlock(domain, rules)}
                      aria-label={`Block ${domain}`}
                    />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        {sites.length > TOP_SITES_SHOWN && (
          <p className="px-5 py-2.5 text-[11.5px] text-faint">
            Showing top {TOP_SITES_SHOWN} of {sites.length} sites.
          </p>
        )}
      </div>
    </div>
  );
}

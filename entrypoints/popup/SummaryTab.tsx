import { useMemo, useState } from 'react';
import { SiteIcon } from '@/components/site-icon';
import type { ExtensionData } from '@/hooks/use-extension-data';
import { CATEGORY_COLORS } from '@/utils/category';
import { lastNDates } from '@/utils/date';
import { formatDuration } from '@/utils/format';
import { CATEGORY_ORDER, aggregateRange, categoryTotals, topDomains, totalSeconds } from '@/utils/usage-summary';

const RANGES = [
  { label: 'Today', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
] as const;

const TOP_SITES_SHOWN = 5;

export function SummaryTab({ data }: { data: ExtensionData }) {
  const [rangeDays, setRangeDays] = useState<1 | 7 | 30>(7);
  const { usage } = data;

  const dates = useMemo(() => lastNDates(rangeDays), [rangeDays]);
  const previousDates = useMemo(() => lastNDates(rangeDays * 2).slice(0, rangeDays), [rangeDays]);

  const rangeUsage = useMemo(() => aggregateRange(usage, dates), [usage, dates]);
  const total = totalSeconds(rangeUsage);
  const previousTotal = totalSeconds(aggregateRange(usage, previousDates));
  const delta = total - previousTotal;

  const sites = topDomains(rangeUsage);
  const categoryTotal = categoryTotals(rangeUsage);
  const categoryGrandTotal = Math.max(1, CATEGORY_ORDER.reduce((sum, c) => sum + categoryTotal[c], 0));
  const maxSiteSeconds = Math.max(...sites.map(([, s]) => s), 1);

  return (
    <div className="flex flex-col gap-4 px-[18px] py-[18px]">
      <div className="flex gap-1 rounded-[10px] bg-divider p-1">
        {RANGES.map((r) => (
          <button
            key={r.label}
            type="button"
            onClick={() => setRangeDays(r.days)}
            className={`flex-1 rounded-[7px] py-1.5 text-[11.5px] font-semibold transition-colors ${
              rangeDays === r.days ? 'bg-brand-soft text-ink' : 'text-muted'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[30px] leading-none font-bold tracking-tight tabular-nums">
            {formatDuration(total)}
          </span>
          {previousTotal > 0 && (
            <span className="text-[11.5px] font-semibold text-faint">
              {delta <= 0 ? '↓' : '↑'} {formatDuration(Math.abs(delta))} vs prior period
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[12px] text-faint">
          across {sites.length} site{sites.length === 1 ? '' : 's'}
        </div>
      </div>

      <div>
        <div className="flex h-2 overflow-hidden rounded-full bg-divider">
          {CATEGORY_ORDER.map((c) => (
            <div
              key={c}
              style={{ width: `${(categoryTotal[c] / categoryGrandTotal) * 100}%`, background: CATEGORY_COLORS[c] }}
            />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] font-semibold text-muted">
          {CATEGORY_ORDER.map((c) => (
            <span key={c} className="flex items-center gap-1.5">
              <span className="size-2 rounded-[2px]" style={{ background: CATEGORY_COLORS[c] }} />
              {c} <span className="text-faint">{Math.round((categoryTotal[c] / categoryGrandTotal) * 100)}%</span>
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <span className="text-xs font-semibold text-faint uppercase">Top sites</span>
        {sites.length === 0 && <p className="text-[13px] text-faint">Nothing tracked in this range yet.</p>}
        {sites.slice(0, TOP_SITES_SHOWN).map(([domain, seconds]) => (
          <div key={domain} className="flex items-center gap-2.5">
            <SiteIcon domain={domain} size={24} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[13px] font-semibold">{domain}</span>
                <span className="shrink-0 text-[12.5px] font-semibold text-muted tabular-nums">
                  {formatDuration(seconds)}
                </span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-divider">
                <div className="h-full rounded-full bg-brand" style={{ width: `${(seconds / maxSiteSeconds) * 100}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

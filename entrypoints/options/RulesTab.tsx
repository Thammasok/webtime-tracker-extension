import { useState } from 'react';
import { Trash2, SquarePen } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SiteIcon } from '@/components/site-icon';
import { Switch } from '@/components/ui/switch';
import { RuleDialog } from '@/components/rule-dialog';
import type { ExtensionData } from '@/hooks/use-extension-data';
import { isWithinWindow, usageForRuleDomain, windowEndDate } from '@/utils/blocker';
import { todayISODate } from '@/utils/date';
import { formatDuration } from '@/utils/format';
import { removeRule, saveRule } from '@/utils/rule-actions';
import type { BlockRule } from '@/utils/types';

function StatusCell({ rule, usageSecondsToday }: { rule: BlockRule; usageSecondsToday: number }) {
  if (!rule.enabled) return <span className="text-[12.5px] font-semibold text-faint">Paused</span>;

  if (rule.mode === 'always') return <span className="text-[12.5px] font-semibold text-faint">Always on</span>;
  if (rule.mode === 'redirect')
    return <span className="truncate text-[12.5px] font-semibold text-faint">→ {rule.redirectUrl}</span>;

  const now = new Date();
  const activeWindow = (rule.windows ?? []).find((w) => isWithinWindow(w, now));
  if (activeWindow) {
    const remaining = formatDuration((windowEndDate(activeWindow, now).getTime() - now.getTime()) / 1000);
    return <span className="text-[12.5px] font-semibold text-success">Unlocks in {remaining}</span>;
  }

  if (rule.dailyLimitSeconds != null) {
    const pct = Math.min(100, (usageSecondsToday / rule.dailyLimitSeconds) * 100);
    const overLimit = usageSecondsToday >= rule.dailyLimitSeconds;
    return (
      <div className="flex flex-col gap-1">
        <span className="h-1.5 overflow-hidden rounded-[3px] bg-divider">
          <span
            className={`block h-full rounded-[3px] ${overLimit ? 'bg-danger' : 'bg-warning-text'}`}
            style={{ width: `${pct}%` }}
          />
        </span>
        <span className="text-[11.5px] font-semibold text-muted">
          {formatDuration(usageSecondsToday)} of {formatDuration(rule.dailyLimitSeconds)}
        </span>
      </div>
    );
  }

  return <span className="text-[12.5px] font-semibold text-faint">No window scheduled</span>;
}

function modeBadge(rule: BlockRule) {
  if (rule.mode === 'always') return <Badge variant="danger">⛔ Always blocked</Badge>;
  if (rule.mode === 'redirect') return <Badge variant="brand">↪ Redirects elsewhere</Badge>;
  const hasWindow = (rule.windows ?? []).length > 0;
  const hasLimit = rule.dailyLimitSeconds != null;
  if (hasWindow && hasLimit) return <Badge variant="warning">🗓 Schedule + limit</Badge>;
  if (hasWindow) return <Badge variant="warning">🗓 Scheduled window</Badge>;
  return <Badge variant="warning">⏱ Daily limit · {formatDuration(rule.dailyLimitSeconds ?? 0)}</Badge>;
}

export function RulesTab({ data }: { data: ExtensionData }) {
  const { rules, usage } = data;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<BlockRule | undefined>(undefined);

  const todayUsage = usage.days[todayISODate()] ?? {};
  const activeCount = rules.filter((r) => r.enabled).length;
  const pausedCount = rules.length - activeCount;

  const openCreate = () => {
    setEditingRule(undefined);
    setDialogOpen(true);
  };
  const openEdit = (rule: BlockRule) => {
    setEditingRule(rule);
    setDialogOpen(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-display text-[22px] font-bold tracking-tight">Blocking rules</div>
          <div className="mt-0.5 text-[13px] text-muted">
            <b className="text-ink">{activeCount}</b> active · <b className="text-ink">{pausedCount}</b> paused
          </div>
        </div>
        <Button onClick={openCreate}>＋ Add a rule</Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-3">
          <span className="font-display text-[15px] font-semibold">Site rules</span>
          <span className="text-[12.5px] text-faint">
            {rules.length} rule{rules.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-[1fr_200px_190px_60px_70px] gap-3 border-b border-divider px-5 py-2 text-[11px] font-semibold tracking-wide text-faint uppercase">
              <span>Site</span>
              <span>Rule</span>
              <span>Today</span>
              <span className="text-right">On</span>
              <span className="text-right">Edit</span>
            </div>

            {rules.length === 0 && (
              <p className="px-5 py-8 text-center text-[13px] text-faint">
                No rules yet — add one to start blocking a site.
              </p>
            )}

            {rules.map((rule) => (
              <div
                key={rule.id}
                className={`grid grid-cols-[1fr_200px_190px_60px_70px] items-center gap-3 border-b border-divider px-5 py-3.5 last:border-b-0 ${
                  rule.enabled ? '' : 'opacity-60'
                }`}
              >
                <span className="flex items-center gap-2.5 text-[13.5px] font-semibold">
                  <SiteIcon domain={rule.domain} size={28} />
                  <span className="truncate">{rule.domain}</span>
                </span>
                <span>{modeBadge(rule)}</span>
                <StatusCell rule={rule} usageSecondsToday={usageForRuleDomain(todayUsage, rule.domain)} />
                <span className="flex justify-end">
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={(checked) => saveRule({ ...rule, enabled: checked })}
                    aria-label={`Toggle ${rule.domain}`}
                  />
                </span>
                <span className="flex justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(rule)}
                    className="grid size-7 place-items-center rounded-md text-faint hover:bg-divider hover:text-ink"
                    aria-label={`Edit ${rule.domain}`}
                  >
                    <SquarePen className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Delete the rule for ${rule.domain}?`)) removeRule(rule.id);
                    }}
                    className="grid size-7 place-items-center rounded-md text-faint hover:bg-danger-soft hover:text-danger"
                    aria-label={`Delete ${rule.domain}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={openCreate}
        className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-[#cfd4dd] bg-card px-5 py-4"
      >
        <span className="grid size-9 place-items-center rounded-[10px] bg-divider text-lg font-bold text-brand">
          ＋
        </span>
        <div>
          <div className="text-[13.5px] font-bold">Block another site</div>
          <div className="mt-0.5 text-[12.5px] text-muted">
            Type a domain, then pick always-block, a redirect, or a schedule / daily limit.
          </div>
        </div>
      </button>

      <RuleDialog open={dialogOpen} onOpenChange={setDialogOpen} initialRule={editingRule} />
    </div>
  );
}

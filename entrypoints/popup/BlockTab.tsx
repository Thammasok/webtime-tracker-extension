import { useState } from 'react';
import { SquarePen, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RuleDialog } from '@/components/rule-dialog';
import { SiteIcon } from '@/components/site-icon';
import { Switch } from '@/components/ui/switch';
import type { ExtensionData } from '@/hooks/use-extension-data';
import { isWithinWindow, windowEndDate } from '@/utils/blocker';
import { todayISODate } from '@/utils/date';
import { formatDuration } from '@/utils/format';
import { removeRule, saveRule } from '@/utils/rule-actions';
import type { BlockRule } from '@/utils/types';

function modeBadge(rule: BlockRule) {
  if (rule.mode === 'always') return <Badge variant="danger">⛔ Always</Badge>;
  if (rule.mode === 'redirect') return <Badge variant="brand">↪ Redirect</Badge>;
  const hasWindow = (rule.windows ?? []).length > 0;
  const hasLimit = rule.dailyLimitSeconds != null;
  if (hasWindow && hasLimit) return <Badge variant="warning">🗓 Schedule + limit</Badge>;
  if (hasWindow) return <Badge variant="warning">🗓 Scheduled</Badge>;
  return <Badge variant="warning">⏱ {formatDuration(rule.dailyLimitSeconds ?? 0)}/day</Badge>;
}

function statusLine(rule: BlockRule, usageSecondsToday: number): string | null {
  if (!rule.enabled) return 'Paused';
  if (rule.mode !== 'schedule') return null;

  const now = new Date();
  const activeWindow = (rule.windows ?? []).find((w) => isWithinWindow(w, now));
  if (activeWindow) {
    const remaining = formatDuration((windowEndDate(activeWindow, now).getTime() - now.getTime()) / 1000);
    return `Unlocks in ${remaining}`;
  }
  if (rule.dailyLimitSeconds != null) {
    return `${formatDuration(usageSecondsToday)} of ${formatDuration(rule.dailyLimitSeconds)} today`;
  }
  return null;
}

export function BlockTab({ data }: { data: ExtensionData }) {
  const { rules, usage } = data;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<BlockRule | undefined>(undefined);
  const todayUsage = usage.days[todayISODate()] ?? {};

  const openCreate = () => {
    setEditingRule(undefined);
    setDialogOpen(true);
  };
  const openEdit = (rule: BlockRule) => {
    setEditingRule(rule);
    setDialogOpen(true);
  };

  const activeCount = rules.filter((r) => r.enabled).length;

  return (
    <div className="flex flex-col gap-3 px-[18px] py-[18px]">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-muted">
          <b className="text-ink">{activeCount}</b> active · <b className="text-ink">{rules.length - activeCount}</b>{' '}
          paused
        </span>
        <Button size="sm" onClick={openCreate}>
          ＋ Add
        </Button>
      </div>

      {rules.length === 0 && (
        <p className="py-6 text-center text-[13px] text-faint">No rules yet — add one to start blocking a site.</p>
      )}

      <div className="flex flex-col gap-2">
        {rules.map((rule) => {
          const status = statusLine(rule, todayUsage[rule.domain] ?? 0);
          return (
            <div
              key={rule.id}
              className={`flex flex-col gap-2 rounded-xl border border-border px-3 py-2.5 ${rule.enabled ? '' : 'opacity-60'}`}
            >
              <div className="flex items-center gap-2.5">
                <SiteIcon domain={rule.domain} size={26} />
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{rule.domain}</span>
                <Switch
                  checked={rule.enabled}
                  onCheckedChange={(checked) => saveRule({ ...rule, enabled: checked })}
                  aria-label={`Toggle ${rule.domain}`}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {modeBadge(rule)}
                  {status && <span className="text-[11.5px] font-semibold text-faint">{status}</span>}
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(rule)}
                    className="grid size-6 place-items-center rounded-md text-faint hover:bg-divider hover:text-ink"
                    aria-label={`Edit ${rule.domain}`}
                  >
                    <SquarePen className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Delete the rule for ${rule.domain}?`)) removeRule(rule.id);
                    }}
                    className="grid size-6 place-items-center rounded-md text-faint hover:bg-danger-soft hover:text-danger"
                    aria-label={`Delete ${rule.domain}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <RuleDialog open={dialogOpen} onOpenChange={setDialogOpen} initialRule={editingRule} />
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { normalizeDomainInput } from '@/utils/domain';
import { saveRule } from '@/utils/rule-actions';
import type { BlockMode, BlockRule } from '@/utils/types';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MODES: { value: BlockMode; label: string }[] = [
  { value: 'always', label: 'Always block' },
  { value: 'redirect', label: 'Redirect' },
  { value: 'schedule', label: 'Schedule / limit' },
];

export function RuleDialog({
  open,
  onOpenChange,
  initialRule,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRule?: BlockRule;
}) {
  const [domainInput, setDomainInput] = useState('');
  const [mode, setMode] = useState<BlockMode>('always');
  const [redirectUrl, setRedirectUrl] = useState('');
  const [days, setDays] = useState<Set<number>>(new Set());
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');
  const [useWindow, setUseWindow] = useState(true);
  const [dailyLimitMinutes, setDailyLimitMinutes] = useState('');
  const [useLimit, setUseLimit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDomainInput(initialRule?.domain ?? '');
    setMode(initialRule?.mode ?? 'always');
    setRedirectUrl(initialRule?.redirectUrl ?? '');

    const win = initialRule?.windows?.[0];
    setUseWindow(!!win);
    setDays(new Set(win?.days ?? [1, 2, 3, 4, 5]));
    setStart(win?.start ?? '09:00');
    setEnd(win?.end ?? '17:00');

    setUseLimit(initialRule?.dailyLimitSeconds != null);
    setDailyLimitMinutes(
      initialRule?.dailyLimitSeconds != null ? String(Math.round(initialRule.dailyLimitSeconds / 60)) : '',
    );
  }, [open, initialRule]);

  const toggleDay = (day: number) => {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const handleSave = async () => {
    const domain = normalizeDomainInput(domainInput);
    if (!domain) {
      setError('Enter a valid domain, e.g. reddit.com');
      return;
    }

    if (mode === 'redirect') {
      try {
        new URL(redirectUrl);
      } catch {
        setError('Enter a valid redirect URL, including https://');
        return;
      }
    }

    let windows: BlockRule['windows'];
    let dailyLimitSeconds: number | undefined;
    if (mode === 'schedule') {
      if (useWindow) {
        if (days.size === 0) {
          setError('Pick at least one day for the schedule window.');
          return;
        }
        windows = [{ days: Array.from(days).sort(), start, end }];
      }
      if (useLimit) {
        const minutes = Number(dailyLimitMinutes);
        if (!minutes || minutes <= 0) {
          setError('Enter a daily limit greater than 0 minutes.');
          return;
        }
        dailyLimitSeconds = minutes * 60;
      }
      if (!useWindow && !useLimit) {
        setError('Turn on a schedule window, a daily limit, or both.');
        return;
      }
    }

    await saveRule({
      id: initialRule?.id,
      domain,
      mode,
      enabled: initialRule?.enabled ?? true,
      redirectUrl: mode === 'redirect' ? redirectUrl : undefined,
      windows,
      dailyLimitSeconds,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initialRule ? 'Edit rule' : 'Block a site'}</DialogTitle>
          <DialogDescription>Choose a domain, then how it should be blocked.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted">Domain</label>
            <Input
              placeholder="reddit.com"
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              disabled={!!initialRule}
            />
          </div>

          <div className="flex gap-1 rounded-[10px] bg-divider p-1">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value)}
                className={`flex-1 rounded-[7px] px-2 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  mode === m.value ? 'bg-brand text-white' : 'text-muted'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {mode === 'redirect' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted">Redirect to</label>
              <Input
                placeholder="https://example.com"
                value={redirectUrl}
                onChange={(e) => setRedirectUrl(e.target.value)}
              />
            </div>
          )}

          {mode === 'schedule' && (
            <div className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
                <label className="flex items-center gap-2 text-[13px] font-semibold">
                  <input type="checkbox" checked={useWindow} onChange={(e) => setUseWindow(e.target.checked)} />
                  Block during a time window
                </label>
                {useWindow && (
                  <>
                    <div className="flex gap-1.5">
                      {DAY_LABELS.map((label, day) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(day)}
                          className={`size-7 rounded-full text-[11px] font-bold transition-colors ${
                            days.has(day) ? 'bg-brand text-white' : 'bg-divider text-muted'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
                      <span className="text-xs text-faint">to</span>
                      <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
                    </div>
                  </>
                )}
              </div>

              <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
                <label className="flex items-center gap-2 text-[13px] font-semibold">
                  <input type="checkbox" checked={useLimit} onChange={(e) => setUseLimit(e.target.checked)} />
                  Block after a daily time limit
                </label>
                {useLimit && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      placeholder="45"
                      value={dailyLimitMinutes}
                      onChange={(e) => setDailyLimitMinutes(e.target.value)}
                      className="w-24"
                    />
                    <span className="text-xs text-faint">minutes per day</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {error && <p className="text-[12.5px] font-medium text-danger">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

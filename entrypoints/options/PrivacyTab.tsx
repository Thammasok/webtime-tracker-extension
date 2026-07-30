import { useRef, useState } from 'react';
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
import { Switch } from '@/components/ui/switch';
import type { ExtensionData } from '@/hooks/use-extension-data';
import { normalizeDomainInput } from '@/utils/domain';
import { clearAllData, exportData, importData, updateSettings } from '@/utils/storage';
import { sendMessage } from '@/utils/messaging';
import type { ExportedData } from '@/utils/types';

const RETENTION_OPTIONS = [
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: '1 year', value: 365 },
  { label: 'Forever', value: 0 },
];

function downloadJson(data: ExportedData) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `webtime-tracker-export-${new Date(data.exportedAt).toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function PrivacyTab({ data }: { data: ExtensionData }) {
  const { settings } = data;
  const [addingExcluded, setAddingExcluded] = useState(false);
  const [excludedInput, setExcludedInput] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addExcluded = () => {
    const domain = normalizeDomainInput(excludedInput);
    if (domain && !settings.excludedDomains.includes(domain)) {
      updateSettings({ excludedDomains: [...settings.excludedDomains, domain] });
    }
    setExcludedInput('');
    setAddingExcluded(false);
  };

  const removeExcluded = (domain: string) => {
    updateSettings({ excludedDomains: settings.excludedDomains.filter((d) => d !== domain) });
  };

  const handleExport = async () => {
    downloadJson(await exportData());
  };

  const handleImportFile = async (file: File) => {
    setImportError(null);
    try {
      const parsed = JSON.parse(await file.text());
      await importData(parsed);
      await sendMessage({ type: 'SYNC_RULES' });
    } catch {
      setImportError('That file could not be imported — it may not be a Webtime Tracker export.');
    }
  };

  const handleClearAll = async () => {
    await clearAllData();
    await sendMessage({ type: 'SYNC_RULES' });
    setConfirmClearOpen(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="font-display text-[22px] font-bold tracking-tight">Privacy</div>
        <div className="mt-0.5 text-[13px] text-muted">
          Everything Webtime records lives in this browser. You're in control of all of it.
        </div>
      </div>

      <div className="flex items-center gap-4 rounded-2xl border border-brand-soft-strong bg-gradient-to-r from-brand-soft to-brand-soft/60 px-5 py-4">
        <span className="grid size-11 flex-none place-items-center rounded-[13px] bg-brand text-xl text-white shadow-[0_8px_18px_-8px_rgba(91,91,214,0.6)]">
          🔒
        </span>
        <div className="flex-1">
          <div className="text-[15px] font-bold">No account. No servers. No sync.</div>
          <div className="mt-0.5 text-[13px] leading-relaxed text-muted">
            Your browsing history is processed on-device and never leaves this computer. We
            literally can't see it.
          </div>
        </div>
        <span className="flex-none rounded-full bg-success-soft px-3 py-1.5 text-xs font-bold text-success">
          ✓ 100% local
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3.5">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="text-xs font-semibold tracking-wide text-faint uppercase">Stored on this device</div>
          <div className="mt-3 flex flex-col gap-2.5 text-[13.5px] font-medium">
            <span className="flex items-center gap-2.5">
              <span className="grid size-5 place-items-center rounded-md bg-brand-soft text-[11px] text-brand-hover">✓</span>
              Domains you visit &amp; time spent
            </span>
            <span className="flex items-center gap-2.5">
              <span className="grid size-5 place-items-center rounded-md bg-brand-soft text-[11px] text-brand-hover">✓</span>
              Your blocking rules &amp; limits
            </span>
            <span className="flex items-center gap-2.5">
              <span className="grid size-5 place-items-center rounded-md bg-brand-soft text-[11px] text-brand-hover">✓</span>
              Daily totals
            </span>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="text-xs font-semibold tracking-wide text-faint uppercase">Never collected</div>
          <div className="mt-3 flex flex-col gap-2.5 text-[13.5px] font-medium text-muted">
            <span className="flex items-center gap-2.5">
              <span className="grid size-5 place-items-center rounded-md bg-divider text-[11px] text-faint">✕</span>
              Full URLs or page content
            </span>
            <span className="flex items-center gap-2.5">
              <span className="grid size-5 place-items-center rounded-md bg-divider text-[11px] text-faint">✕</span>
              Keystrokes, forms or passwords
            </span>
            <span className="flex items-center gap-2.5">
              <span className="grid size-5 place-items-center rounded-md bg-divider text-[11px] text-faint">✕</span>
              Anything sent off your device
            </span>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="px-5 pt-4 pb-3 font-display text-[15px] font-semibold">Data controls</div>

        <div className="flex items-center justify-between gap-4 border-t border-divider px-5 py-3.5">
          <div>
            <div className="text-[13.5px] font-semibold">Keep history for</div>
            <div className="mt-0.5 text-xs text-muted">Older data is deleted automatically.</div>
          </div>
          <div className="flex flex-none gap-1 rounded-[9px] bg-divider p-1">
            {RETENTION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => updateSettings({ retentionDays: opt.value })}
                className={`rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  settings.retentionDays === opt.value ? 'bg-brand text-white' : 'text-muted'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-divider px-5 py-3.5">
          <div>
            <div className="text-[13.5px] font-semibold">Pause tracking in Incognito</div>
            <div className="mt-0.5 text-xs text-muted">Private windows are never recorded.</div>
          </div>
          <Switch
            checked={settings.pauseInIncognito}
            onCheckedChange={(checked) => updateSettings({ pauseInIncognito: checked })}
          />
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-divider px-5 py-3.5">
          <div>
            <div className="text-[13.5px] font-semibold">Excluded sites</div>
            <div className="mt-0.5 text-xs text-muted">These are never tracked, even in normal windows.</div>
          </div>
          <div className="flex flex-none flex-wrap items-center justify-end gap-2">
            {settings.excludedDomains.map((domain) => (
              <span
                key={domain}
                className="flex items-center gap-1.5 rounded-lg bg-divider px-2.5 py-1.5 text-xs font-semibold text-muted"
              >
                {domain}
                <button type="button" onClick={() => removeExcluded(domain)} className="text-faint hover:text-danger">
                  ✕
                </button>
              </span>
            ))}
            {addingExcluded ? (
              <span className="flex items-center gap-1.5">
                <Input
                  autoFocus
                  className="h-9 w-40"
                  placeholder="bank.com"
                  value={excludedInput}
                  onChange={(e) => setExcludedInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addExcluded()}
                />
                <Button size="sm" onClick={addExcluded}>
                  Add
                </Button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setAddingExcluded(true)}
                className="rounded-lg bg-brand-soft px-3 py-1.5 text-[12.5px] font-bold text-brand-hover"
              >
                ＋ Add
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3.5">
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
          <div>
            <div className="text-[13.5px] font-bold">Your data, portable</div>
            <div className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
              Take a full copy with you, or restore from a backup file.
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleExport}>
              ⬇ Export JSON
            </Button>
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
              ⬆ Import
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImportFile(file);
                e.target.value = '';
              }}
            />
          </div>
          {importError && <p className="text-xs font-medium text-danger">{importError}</p>}
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-danger-border bg-card p-5">
          <div>
            <div className="text-[13.5px] font-bold text-danger">Erase everything</div>
            <div className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
              Permanently delete all history, rules and settings from this device. This can't be
              undone.
            </div>
          </div>
          <Button size="sm" variant="danger" className="self-start" onClick={() => setConfirmClearOpen(true)}>
            🗑 Clear all data
          </Button>
        </div>
      </div>

      <Dialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear all data?</DialogTitle>
            <DialogDescription>
              This permanently deletes all tracked history, blocking rules, and settings from this
              device. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClearOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleClearAll}>
              Clear everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

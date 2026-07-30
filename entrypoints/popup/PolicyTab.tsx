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
import { sendMessage } from '@/utils/messaging';
import { clearAllData, exportData, importData, updateSettings } from '@/utils/storage';
import type { ExportedData } from '@/utils/types';

const RETENTION_OPTIONS = [
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
  { label: '1y', value: 365 },
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

export function PolicyTab({ data }: { data: ExtensionData }) {
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
    <div className="flex flex-col gap-4 px-[18px] py-[18px]">
      <div className="flex items-center gap-2.5 rounded-xl bg-brand-soft px-3 py-2.5">
        <span className="text-base">🔒</span>
        <span className="text-[12.5px] font-semibold text-brand-hover">
          No account. No servers. No sync — everything stays on this device.
        </span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold">Keep history for</div>
          <div className="text-[11.5px] text-faint">Older data is auto-deleted.</div>
        </div>
        <div className="flex flex-none gap-1 rounded-[9px] bg-divider p-1">
          {RETENTION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => updateSettings({ retentionDays: opt.value })}
              className={`rounded-md px-2 py-1 text-[11.5px] font-semibold transition-colors ${
                settings.retentionDays === opt.value ? 'bg-brand text-white' : 'text-muted'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold">Pause tracking in Incognito</div>
          <div className="text-[11.5px] text-faint">Private windows are never recorded.</div>
        </div>
        <Switch
          checked={settings.pauseInIncognito}
          onCheckedChange={(checked) => updateSettings({ pauseInIncognito: checked })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-[13px] font-semibold">Excluded sites</div>
        <div className="flex flex-wrap items-center gap-1.5">
          {settings.excludedDomains.map((domain) => (
            <span
              key={domain}
              className="flex items-center gap-1.5 rounded-lg bg-divider px-2 py-1 text-[11.5px] font-semibold text-muted"
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
                className="h-8 w-32 text-[12px]"
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
              className="rounded-lg bg-brand-soft px-2.5 py-1 text-[11.5px] font-bold text-brand-hover"
            >
              ＋ Add
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          className="flex-1"
          onClick={async () => downloadJson(await exportData())}
        >
          ⬇ Export
        </Button>
        <Button size="sm" variant="outline" className="flex-1" onClick={() => fileInputRef.current?.click()}>
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
      {importError && <p className="text-[11.5px] font-medium text-danger">{importError}</p>}

      <Button size="sm" variant="danger" onClick={() => setConfirmClearOpen(true)}>
        🗑 Clear all data
      </Button>

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

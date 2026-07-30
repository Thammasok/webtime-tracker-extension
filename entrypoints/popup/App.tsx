import { useState } from 'react';
import { useExtensionData } from '@/hooks/use-extension-data';
import { TodayTab } from './TodayTab';
import { SummaryTab } from './SummaryTab';
import { BlockTab } from './BlockTab';
import { PolicyTab } from './PolicyTab';

const MENU_ITEMS = [
  { key: 'today', label: 'Today' },
  { key: 'summary', label: 'Summary' },
  { key: 'block', label: 'Block' },
  { key: 'policy', label: 'Policy' },
] as const;

type TabKey = (typeof MENU_ITEMS)[number]['key'];

function openFullDashboard() {
  browser.tabs.create({ url: browser.runtime.getURL('/options.html') });
}

function App() {
  const data = useExtensionData();
  const [tab, setTab] = useState<TabKey>('today');

  return (
    <div className="flex max-h-[600px] min-h-[480px] w-[372px] flex-col overflow-hidden bg-surface font-sans text-ink">
      <div className="flex items-center gap-1 border-b border-border bg-card px-3 py-2">
        {MENU_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`flex-1 rounded-md px-2 py-1.5 text-[12px] font-semibold transition-colors ${
              tab === item.key ? 'bg-brand text-white' : 'text-muted hover:bg-divider hover:text-ink'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {!data ? (
          <p className="p-6 text-center text-sm text-muted">Loading…</p>
        ) : (
          <>
            {tab === 'today' && <TodayTab data={data} />}
            {tab === 'summary' && <SummaryTab data={data} />}
            {tab === 'block' && <BlockTab data={data} />}
            {tab === 'policy' && <PolicyTab data={data} />}
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border bg-card px-5 py-3">
        <span className="text-[12.5px] text-faint">🔒 Private · on-device</span>
        <button type="button" onClick={openFullDashboard} className="text-[12.5px] font-bold text-brand">
          Open full dashboard ↗
        </button>
      </div>
    </div>
  );
}

export default App;

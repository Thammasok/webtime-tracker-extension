import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useExtensionData } from '@/hooks/use-extension-data';
import { OverviewTab } from './OverviewTab';
import { RulesTab } from './RulesTab';
import { PrivacyTab } from './PrivacyTab';

function initialTab(): string {
  const hash = window.location.hash.replace('#', '');
  return ['overview', 'rules', 'privacy'].includes(hash) ? hash : 'overview';
}

function App() {
  const data = useExtensionData();
  const [tab, setTab] = useState(initialTab);

  return (
    <Tabs value={tab} onValueChange={setTab} className="min-h-screen bg-surface font-sans text-ink">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center border-b border-border bg-card px-6 py-4">
        <div className="flex items-center gap-2.5 justify-self-start">
          <span className="grid size-7 place-items-center rounded-lg bg-brand font-display text-sm font-bold text-white">
            W
          </span>
          <span className="font-display text-base font-bold tracking-tight">Webtime</span>
        </div>
        <TabsList className="justify-self-center">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="rules">Blocking rules</TabsTrigger>
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
        </TabsList>
        <div />
      </header>

      <main className="mx-auto max-w-[1000px] px-6 py-6">
        {!data ? (
          <p className="py-16 text-center text-sm text-muted">Loading…</p>
        ) : (
          <>
            <TabsContent value="overview">
              <OverviewTab data={data} />
            </TabsContent>
            <TabsContent value="rules">
              <RulesTab data={data} />
            </TabsContent>
            <TabsContent value="privacy">
              <PrivacyTab data={data} />
            </TabsContent>
          </>
        )}
      </main>
    </Tabs>
  );
}

export default App;

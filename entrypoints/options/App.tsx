import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useExtensionData } from '@/hooks/use-extension-data';
import { SummaryTab } from './SummaryTab';
import { RulesTab } from './RulesTab';
import { PrivacyTab } from './PrivacyTab';

function initialTab(): string {
  const hash = window.location.hash.replace('#', '');
  return ['summary', 'rules', 'privacy'].includes(hash) ? hash : 'summary';
}

function App() {
  const data = useExtensionData();
  const [tab, setTab] = useState(initialTab);

  return (
    <Tabs value={tab} onValueChange={setTab} className="min-h-screen bg-surface font-sans text-ink">
      <header className="flex flex-col items-center gap-3 border-b border-border bg-card px-4 py-3 sm:px-6 sm:py-4 md:grid md:grid-cols-[1fr_auto_1fr]">
        <div className="flex items-center gap-2.5 self-start md:justify-self-start">
          <span className="grid size-7 place-items-center rounded-lg bg-brand font-display text-sm font-bold text-white">
            W
          </span>
          <span className="font-display text-base font-bold tracking-tight">Webtime</span>
        </div>
        <TabsList className="w-full max-w-full overflow-x-auto md:w-auto md:justify-self-center">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="rules">Blocking rules</TabsTrigger>
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
        </TabsList>
        <div className="hidden md:block" />
      </header>

      <main className="mx-auto max-w-[1000px] px-4 py-4 sm:px-6 sm:py-6">
        {!data ? (
          <p className="py-16 text-center text-sm text-muted">Loading…</p>
        ) : (
          <>
            <TabsContent value="summary">
              <SummaryTab data={data} />
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

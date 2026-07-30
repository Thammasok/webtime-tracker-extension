import { sendMessage } from '@/utils/messaging';
import { deleteRule, upsertRule } from '@/utils/storage';
import type { BlockRule, Domain } from '@/utils/types';

/** Quick one-tap toggle used by the popup's per-row switch: flips an existing rule's enabled
 * state, or creates a plain "always block" rule if the domain has none yet. */
export async function toggleAlwaysBlock(domain: Domain, rules: BlockRule[]): Promise<void> {
  const existing = rules.find((r) => r.domain === domain);
  if (existing) {
    await upsertRule({ ...existing, enabled: !existing.enabled });
  } else {
    await upsertRule({ domain, mode: 'always', enabled: true });
  }
  await sendMessage({ type: 'SYNC_RULES' });
}

export async function saveRule(rule: Omit<BlockRule, 'id'> & { id?: string }): Promise<BlockRule> {
  const saved = await upsertRule(rule);
  await sendMessage({ type: 'SYNC_RULES' });
  return saved;
}

export async function removeRule(id: string): Promise<void> {
  await deleteRule(id);
  await sendMessage({ type: 'SYNC_RULES' });
}

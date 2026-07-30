/**
 * Typed discriminated-union messages between contexts (popup/options -> background). Keeps
 * `message.type` from being stringly-typed at call sites.
 */
export type Message = { type: 'SYNC_RULES' };

export function sendMessage(message: Message): Promise<void> {
  return browser.runtime.sendMessage(message);
}

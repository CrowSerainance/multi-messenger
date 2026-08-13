/**
 * A short, redacted trace of where the session WebView was allowed
 * to go.
 *
 * Meta moves these routes around — messenger.com can bounce a signed
 * in session to the Facebook site — so when a session lands somewhere
 * unexpected this trace is the evidence for what happened. Only host
 * and path are kept: query strings on Meta URLs carry tokens.
 */

export type MessengerRoutingDecision =
  | 'messenger'
  | 'auth-flow'
  | 'recovered-to-inbox'
  | 'left-on-facebook'
  | 'opened-externally';

export interface MessengerRoutingEntry {
  at: number;
  decision: MessengerRoutingDecision;
  host: string;
  path: string;
}

const MAX_ENTRIES = 20;

const entries: MessengerRoutingEntry[] = [];

export function recordMessengerRouting(
  decision: MessengerRoutingDecision,
  url: string,
): void {
  const host =
    /^https?:\/\/([^/:?#]+)/i.exec(url)?.[1] ??
    'unknown';

  const path =
    url
      .replace(/^https?:\/\/[^/?#]*/i, '')
      .split(/[?#]/)[0] || '/';

  entries.push({
    at: Date.now(),
    decision,
    host: host.toLowerCase(),
    path,
  });

  if (entries.length > MAX_ENTRIES) {
    entries.splice(
      0,
      entries.length - MAX_ENTRIES,
    );
  }

  if (__DEV__) {
    console.log(
      'MESSENGER_ROUTING',
      decision,
      host,
      path,
    );
  }
}

export function getMessengerRouting():
ReadonlyArray<MessengerRoutingEntry> {
  return entries.map((entry) => ({ ...entry }));
}

export function clearMessengerRouting(): void {
  entries.length = 0;
}

/**
 * Runtime-only warm-session metadata (ML-3).
 *
 * Serializable values only. WebView instances, refs, and native
 * handles are owned by the container and the native layer; they are
 * never placed in a store and never persisted.
 */

export interface LiveSessionEntry {
  accountId: string;
  /** Native profile this warm WebView is bound to. */
  profileId: string;
  /**
   * Bumped when this account needs a *fresh* WebView (after a
   * reauthentication, say) rather than the warm one. The
   * container includes it in the mount key.
   */
  generation: number;
  requestedAt: number;
  /** LRU key: last time the account was the visible one. */
  lastActiveAt: number;
  /** True once its WebView reported a first completed load. */
  ready: boolean;
  /**
   * A call, upload, or login transaction is in flight. Such an
   * account is never evicted, even when it is the LRU tail.
   */
  busy: boolean;
}

export type LiveSessionState =
  | 'live'
  | 'loading'
  | 'hibernated'
  | 'expired';

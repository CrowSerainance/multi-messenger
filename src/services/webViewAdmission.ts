/**
 * Serialized WebView creation (ML-3).
 *
 * Profile binding is process-global: the app sets
 * `RNCWebViewProfileRegistry.pendingProfileName` and the patched
 * react-native-webview factory consumes it inside
 * `createRNCWebViewInstance`. With more than one WebView mounting
 * concurrently — a warm session being admitted while the login
 * WebView mounts, say — two writers would race for that single slot
 * and a WebView could bind to the wrong account's profile.
 *
 * Every code path that causes a WebView to be created therefore takes
 * this lock first, and releases it only once that WebView's native
 * instance exists.
 */

type Release = () => void;

interface Waiter {
  owner: string;
  resolve(release: Release): void;
}

/**
 * A stuck holder must not deadlock account switching forever. The
 * lock auto-releases after this long; the late release is ignored
 * because the token no longer matches.
 */
const HOLD_TIMEOUT_MS = 20_000;

let currentToken: symbol | null = null;
let currentOwner: string | null = null;
let holdTimer: ReturnType<typeof setTimeout> | null = null;

const waiters: Waiter[] = [];

function clearHoldTimer(): void {
  if (holdTimer !== null) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
}

function handOff(): void {
  clearHoldTimer();

  const next = waiters.shift();

  if (!next) {
    currentToken = null;
    currentOwner = null;
    return;
  }

  next.resolve(grant(next.owner));
}

function grant(owner: string): Release {
  const token = Symbol(owner);

  currentToken = token;
  currentOwner = owner;

  holdTimer = setTimeout(() => {
    if (currentToken === token) {
      if (__DEV__) {
        console.log(
          'WEBVIEW_ADMISSION timeout',
          owner,
        );
      }

      handOff();
    }
  }, HOLD_TIMEOUT_MS);

  return () => {
    if (currentToken !== token) {
      // Already timed out and handed to someone else.
      return;
    }

    handOff();
  };
}

/**
 * Waits until no other WebView creation is in flight, then returns
 * the release function. Call the release only after the native
 * WebView instance exists (its ref callback fired) or after the
 * attempt was abandoned.
 */
export function acquireWebViewCreation(
  owner: string,
): Promise<Release> {
  if (currentToken === null) {
    return Promise.resolve(grant(owner));
  }

  return new Promise<Release>((resolve) => {
    waiters.push({ owner, resolve });
  });
}

/**
 * Diagnostics only: who holds the slot and how many are queued.
 * Contains no session data.
 */
export function describeWebViewAdmission(): {
  holder: string | null;
  queued: number;
} {
  return {
    holder: currentOwner,
    queued: waiters.length,
  };
}

let loginRelease: Release | null = null;

/**
 * The login WebView is mounted by LoginScreen, several async steps
 * after the store prepared its profile. The lock is taken in
 * `prepareLogin` and parked here until that screen reports its
 * WebView was created (or unmounts).
 */
export async function acquireLoginWebViewSlot(): Promise<void> {
  releaseLoginWebViewSlot();

  loginRelease = await acquireWebViewCreation('login');
}

export function releaseLoginWebViewSlot(): void {
  const release = loginRelease;

  loginRelease = null;
  release?.();
}

/**
 * Web-storage isolation between accounts.
 *
 * Cookies are swapped natively, but Local
 * Storage, Session Storage, IndexedDB, Cache
 * Storage, and service workers live in one
 * shared WebView profile. To prevent
 * cross-account leakage, every page load runs a
 * guard script (injected before page content)
 * that compares an owner marker stored inside
 * localStorage itself with the account that owns
 * the mounted WebView. On mismatch the guard
 * synchronously wipes localStorage and
 * sessionStorage, re-stamps the marker, then
 * asynchronously deletes IndexedDB databases,
 * Cache Storage entries, and service worker
 * registrations, and finally notifies the app so
 * it can reload the page once into a clean
 * profile.
 *
 * Because the marker lives in the storage being
 * guarded, it survives app restarts and dies
 * with any external storage wipe — no separate
 * bookkeeping can drift out of sync.
 *
 * Known limits (documented in the handoff
 * ledger): the wipe runs per-origin on pages the
 * WebView actually visits, `indexedDB.databases()`
 * enumeration requires a modern Android System
 * WebView, and an `onblocked` IndexedDB deletion
 * completes only after the reload closes open
 * connections.
 */

const MARKER_KEY = '__msw_storage_owner';

export const STORAGE_WIPED_MESSAGE =
  'msw-storage-wiped';

export const LOGIN_STORAGE_OWNER = 'LOGIN';

export function buildStorageGuardScript(
  ownerTag: string,
): string {
  const owner = JSON.stringify(ownerTag);

  return `(function () {
  var MARKER = '${MARKER_KEY}';
  var owner = ${owner};
  var previous = null;

  try {
    previous = window.localStorage.getItem(MARKER);
    if (previous === owner) {
      return;
    }
  } catch (err) {
    return;
  }

  // No marker means this origin's storage was already cleared
  // natively before the WebView mounted (fresh login or a
  // completed account switch). Claim it without wiping: a wipe
  // here would run inside a page that may be mid-authentication
  // and would destroy the state that page just created.
  if (previous === null) {
    try { window.localStorage.setItem(MARKER, owner); } catch (err) {}
    return;
  }

  // A different owner's data really is present. Wipe it.
  try { window.localStorage.clear(); } catch (err) {}
  try { window.sessionStorage.clear(); } catch (err) {}
  try { window.localStorage.setItem(MARKER, owner); } catch (err) {}

  var tasks = [];

  try {
    if (window.indexedDB && window.indexedDB.databases) {
      tasks.push(
        window.indexedDB.databases().then(function (dbs) {
          return Promise.all(
            (dbs || []).map(function (db) {
              return new Promise(function (resolve) {
                if (!db || !db.name) { resolve(); return; }
                var request = window.indexedDB.deleteDatabase(db.name);
                request.onsuccess = resolve;
                request.onerror = resolve;
                request.onblocked = resolve;
              });
            })
          );
        })
      );
    }
  } catch (err) {}

  try {
    if (window.caches && window.caches.keys) {
      tasks.push(
        window.caches.keys().then(function (keys) {
          return Promise.all(
            keys.map(function (key) {
              return window.caches.delete(key);
            })
          );
        })
      );
    }
  } catch (err) {}

  try {
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      tasks.push(
        navigator.serviceWorker.getRegistrations().then(function (regs) {
          return Promise.all(
            regs.map(function (reg) {
              return reg.unregister();
            })
          );
        })
      );
    }
  } catch (err) {}

  function report() {
    try {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage('${STORAGE_WIPED_MESSAGE}');
      }
    } catch (err) {}
  }

  if (Promise.allSettled) {
    Promise.allSettled(tasks).then(report, report);
  } else {
    Promise.all(tasks).then(report, report);
  }
})();
true;`;
}

export function buildStorageClaimScript(
  ownerTag: string,
): string {
  const owner = JSON.stringify(ownerTag);

  return `(function () {
  try {
    window.localStorage.setItem('${MARKER_KEY}', ${owner});
  } catch (err) {}
})();
true;`;
}

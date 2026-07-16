import type {
  CookieSnapshot,
} from '../types/session';

import {
  secureDeleteJson,
  secureReadJson,
  secureWriteJson,
} from './secureJson';

function sessionKey(accountId: string): string {
  return `messenger.session.v1.${accountId}`;
}

export async function saveSessionSnapshot(
  snapshot: CookieSnapshot,
): Promise<void> {
  await secureWriteJson(
    sessionKey(snapshot.accountId),
    snapshot,
  );
}

export async function loadSessionSnapshot(
  accountId: string,
): Promise<CookieSnapshot | null> {
  return secureReadJson<CookieSnapshot>(
    sessionKey(accountId),
  );
}

export async function deleteSessionSnapshot(
  accountId: string,
): Promise<void> {
  await secureDeleteJson(sessionKey(accountId));
}

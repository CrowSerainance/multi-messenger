import type { Cookie } from '@react-native-cookies/cookies';

export type AccountStatus =
  | 'unknown'
  | 'ready'
  | 'expired';

export interface Account {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  status: AccountStatus;
  lastRefreshAt?: number;
  /**
   * Stable isolated WebView profile name (ML-1).
   * Generated once when the account first runs in
   * isolated mode; never derived from user data.
   * Absent for accounts that only ever ran legacy.
   */
  profileId?: string;
  /**
   * Set after cookies were written with inferred
   * Domain attributes (fixes the host-only copy
   * from the first ML-1 migration).
   */
  profileCookiesV2?: boolean;
}

export interface StoredCookie extends Cookie {
  origin: string;
}

export interface CookieSnapshot {
  schemaVersion: 1;
  accountId: string;
  capturedAt: number;
  cookies: StoredCookie[];
}

export interface AccountIndex {
  accounts: Account[];
  activeAccountId: string | null;
  defaultAccountId?: string | null;
}

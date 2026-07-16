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
}

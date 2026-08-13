import { Platform } from 'react-native';

export const MESSENGER_HOME_URL =
  'https://www.messenger.com/';

// messenger.com/login serves mobile clients a marketing /
// "Get it on Google Play" page with no credential form, so
// authenticate against Facebook's mobile login instead. It
// sets the c_user/xs cookies on .facebook.com that the session
// layer already extracts, and messenger.com shares that
// session.
export const MESSENGER_LOGIN_URL =
  'https://m.facebook.com/login.php';

/**
 * Where to send the session when `messenger.com` bounces it to the
 * Facebook site. Meta serves the same inbox here, so this is a
 * recovery target rather than a second product surface.
 */
export const MESSENGER_FALLBACK_URL =
  'https://www.facebook.com/messages/';

export const COOKIE_ORIGINS = [
  'https://www.facebook.com/',
  'https://m.facebook.com/',
  'https://facebook.com/',
  'https://www.messenger.com/',
  'https://messenger.com/',
] as const;

const ANDROID_MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/126.0.0.0 Mobile Safari/537.36';

const IOS_MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) ' +
  'Version/17.5 Mobile/15E148 Safari/604.1';

export const MOBILE_USER_AGENT =
  Platform.OS === 'ios'
    ? IOS_MOBILE_UA
    : ANDROID_MOBILE_UA;

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/140.0.0.0 Safari/537.36';

// The two WebViews need different identities.
//
// Login: a desktop UA contradicts the Client Hints Chromium
// still sends from an Android WebView (Sec-CH-UA-Platform:
// "Android", mobile=?1). Facebook's login endpoint cross-checks
// them and answers "Your Request Couldn't be Processed", so the
// login identity must match the real platform.
export const LOGIN_USER_AGENT = MOBILE_USER_AGENT;

// Messenger: with a mobile UA, Meta serves the marketing page
// and deep-links to the native app (intent://…fb-messenger)
// instead of the web client. A desktop UA is required for the
// actual Messenger web app to render.
export const MESSENGER_USER_AGENT = DESKTOP_UA;

export function isLoginUrl(url: string): boolean {
  const normalized = url.toLowerCase();

  return (
    normalized.includes('/login') ||
    normalized.includes('login.php')
  );
}

function pathOfUrl(url: string): string {
  const withoutOrigin = url.replace(
    /^https?:\/\/[^/?#]*/i,
    '',
  );

  return withoutOrigin
    .split(/[?#]/)[0]
    .toLowerCase();
}

function hostMatches(
  url: string,
  domain: string,
): boolean {
  const host = hostOfUrl(url);

  if (!host) {
    return false;
  }

  return (
    host === domain ||
    host.endsWith(`.${domain}`)
  );
}

export function isMessengerHost(
  url: string,
): boolean {
  return hostMatches(url, 'messenger.com');
}

export function isFacebookHost(
  url: string,
): boolean {
  return (
    hostMatches(url, 'facebook.com') ||
    hostMatches(url, 'fb.com')
  );
}

/**
 * A page that actually shows conversations: anything on
 * messenger.com, or Facebook's own inbox routes.
 */
export function isMessengerUiUrl(
  url: string,
): boolean {
  if (isMessengerHost(url)) {
    return true;
  }

  if (!isFacebookHost(url)) {
    return false;
  }

  const path = pathOfUrl(url);

  return (
    path.startsWith('/messages') ||
    path.startsWith('/t/') ||
    path.startsWith('/e2ee/t/')
  );
}

const AUTH_FLOW_PATTERNS = [
  'login',
  'checkpoint',
  'two_factor',
  'two_step',
  'recover',
  'confirm',
  'consent',
  'privacy',
  'policies',
  'oauth',
  'dialog',
  'help',
  'device',
  'security',
  'challenge',
] as const;

/**
 * Sign-in, 2FA, checkpoint, and consent flows must stay in the
 * session's own WebView: they run in the account's profile and
 * Meta can raise them at any time, not only at login.
 */
export function isAuthFlowUrl(
  url: string,
): boolean {
  const path = pathOfUrl(url);

  return AUTH_FLOW_PATTERNS.some((pattern) =>
    path.includes(pattern),
  );
}

export function isCallUrl(url: string): boolean {
  return /\/(call|groupcall|rooms?)([/?#]|$)/i.test(
    url,
  );
}

const IN_APP_HOSTS = [
  'facebook.com',
  'messenger.com',
  'fb.com',
  'fbcdn.net',
  'fbsbx.com',
  'facebook.net',
  'meta.com',
  'meta.ai',
  'instagram.com',
] as const;

function hostOfUrl(url: string): string | null {
  const match = /^https?:\/\/([^/:?#]+)/i.exec(url);
  return match ? match[1].toLowerCase() : null;
}

export function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function isInAppUrl(url: string): boolean {
  const host = hostOfUrl(url);

  if (!host) {
    return false;
  }

  return IN_APP_HOSTS.some(
    (domain) =>
      host === domain ||
      host.endsWith(`.${domain}`),
  );
}

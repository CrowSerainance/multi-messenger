import { Platform } from 'react-native';

export const MESSENGER_HOME_URL =
  'https://www.messenger.com/';

export const MESSENGER_LOGIN_URL =
  'https://www.messenger.com/login/';

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

export function isLoginUrl(url: string): boolean {
  const normalized = url.toLowerCase();

  return (
    normalized.includes('/login') ||
    normalized.includes('login.php')
  );
}

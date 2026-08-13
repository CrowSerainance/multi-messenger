/// <reference types="jest" />

import {
  isAuthFlowUrl,
  isFacebookHost,
  isMessengerHost,
  isMessengerUiUrl,
} from '../messenger';

/**
 * These predicates decide whether the session stays on Messenger,
 * follows a Meta auth flow, or is handed to a browser. Getting them
 * wrong either strands the user on the Facebook feed or breaks
 * sign-in and checkpoints.
 */

describe('isMessengerUiUrl', () => {
  it.each([
    'https://www.messenger.com/',
    'https://messenger.com/t/1234',
    'https://www.messenger.com/anything',
    'https://www.facebook.com/messages/',
    'https://www.facebook.com/messages/t/99',
    'https://www.facebook.com/t/99',
  ])('treats %s as a conversation surface', (url) => {
    expect(isMessengerUiUrl(url)).toBe(true);
  });

  it.each([
    'https://www.facebook.com/',
    'https://www.facebook.com/home.php',
    'https://m.facebook.com/',
    'https://www.facebook.com/marketplace/',
    'https://example.com/messages/',
  ])('does not treat %s as Messenger', (url) => {
    expect(isMessengerUiUrl(url)).toBe(false);
  });
});

describe('isAuthFlowUrl', () => {
  it.each([
    'https://m.facebook.com/login.php',
    'https://www.facebook.com/checkpoint/1501092823525282/',
    'https://www.facebook.com/two_step_verification/authentication/',
    'https://www.facebook.com/recover/initiate/',
    'https://www.facebook.com/privacy/consent/',
  ])('keeps %s inside the session', (url) => {
    expect(isAuthFlowUrl(url)).toBe(true);
  });

  it.each([
    'https://www.facebook.com/',
    'https://www.facebook.com/messages/',
    'https://www.facebook.com/watch/',
  ])('does not claim %s is an auth flow', (url) => {
    expect(isAuthFlowUrl(url)).toBe(false);
  });

  it('ignores the query string, where tokens live', () => {
    expect(
      isAuthFlowUrl(
        'https://www.facebook.com/?next=/login',
      ),
    ).toBe(false);
  });
});

describe('host matching', () => {
  it.each([
    'https://www.facebook.com/',
    'https://m.facebook.com/',
    'https://facebook.com/',
    'https://fb.com/x',
  ])('recognises %s as Facebook', (url) => {
    expect(isFacebookHost(url)).toBe(true);
  });

  it.each([
    'https://www.messenger.com/',
    'https://messenger.com/',
  ])('recognises %s as Messenger', (url) => {
    expect(isMessengerHost(url)).toBe(true);
    expect(isFacebookHost(url)).toBe(false);
  });

  it('does not fall for lookalike hosts', () => {
    expect(
      isFacebookHost(
        'https://facebook.com.example.net/',
      ),
    ).toBe(false);

    expect(
      isMessengerHost(
        'https://messenger.com.example.net/',
      ),
    ).toBe(false);

    expect(
      isMessengerUiUrl(
        'https://notfacebook.com/messages/',
      ),
    ).toBe(false);
  });
});

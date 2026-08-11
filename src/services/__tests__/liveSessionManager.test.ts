/// <reference types="jest" />

import {
  MAX_LIVE_SESSIONS,
} from '../../constants/features';

import {
  isAccountLive,
  liveProfileIdOf,
  useLiveSessionStore,
} from '../liveSessionManager';

/**
 * The warm set decides which account keeps a mounted WebView, so
 * these rules are the difference between "switching is instant" and
 * "the account you were reading was thrown away".
 */

function reset(): void {
  useLiveSessionStore.setState({
    entries: [],
  });
}

function store() {
  return useLiveSessionStore.getState();
}

function idsInSet(): string[] {
  return store().entries.map(
    (entry) => entry.accountId,
  );
}

beforeEach(reset);

describe('requestLive', () => {
  it('adds a new entry that is not ready yet', () => {
    store().requestLive('a', 'profile-a');

    expect(store().entries).toHaveLength(1);
    expect(store().entries[0]).toMatchObject({
      accountId: 'a',
      profileId: 'profile-a',
      generation: 0,
      ready: false,
      busy: false,
    });
  });

  it('keeps readiness when the same profile is requested again', () => {
    store().requestLive('a', 'profile-a');
    store().markReady('a');
    store().requestLive('a', 'profile-a');

    expect(store().entries).toHaveLength(1);
    expect(store().entries[0].ready).toBe(true);
    expect(
      store().entries[0].generation,
    ).toBe(0);
  });

  it('recycles the WebView when the profile changes', () => {
    store().requestLive('a', 'profile-a');
    store().markReady('a');
    store().requestLive('a', 'profile-b');

    expect(store().entries[0]).toMatchObject({
      profileId: 'profile-b',
      generation: 1,
      ready: false,
    });
  });

  it('recycles on request when asked explicitly', () => {
    store().requestLive('a', 'profile-a');
    store().markReady('a');
    store().requestLive('a', 'profile-a', {
      recycle: true,
    });

    expect(store().entries[0]).toMatchObject({
      generation: 1,
      ready: false,
    });
  });
});

describe('eviction', () => {
  it('drops the least recently active account past the limit', () => {
    // Requested oldest first; each request marks that account
    // most-recently used.
    for (
      let index = 0;
      index < MAX_LIVE_SESSIONS;
      index += 1
    ) {
      store().requestLive(
        `account-${index}`,
        `profile-${index}`,
      );
    }

    expect(idsInSet()).toHaveLength(
      MAX_LIVE_SESSIONS,
    );

    store().requestLive(
      'newcomer',
      'profile-new',
    );

    expect(idsInSet()).toHaveLength(
      MAX_LIVE_SESSIONS,
    );
    expect(idsInSet()).toContain('newcomer');
    expect(idsInSet()).not.toContain(
      'account-0',
    );
  });

  it('never evicts the account being requested', () => {
    for (
      let index = 0;
      index < MAX_LIVE_SESSIONS + 2;
      index += 1
    ) {
      const accountId = `account-${index}`;

      store().requestLive(
        accountId,
        `profile-${index}`,
      );

      expect(idsInSet()).toContain(accountId);
    }
  });

  it('never evicts a busy account', () => {
    store().requestLive('busy', 'profile-busy');
    store().setBusy('busy', true);

    for (
      let index = 0;
      index < MAX_LIVE_SESSIONS;
      index += 1
    ) {
      store().requestLive(
        `filler-${index}`,
        `profile-${index}`,
      );
    }

    // 'busy' is the least recently used entry, so only the busy
    // flag can be keeping it in the set.
    expect(idsInSet()).toContain('busy');
  });

  it('stays over the limit rather than dropping a protected session', () => {
    for (
      let index = 0;
      index < MAX_LIVE_SESSIONS;
      index += 1
    ) {
      const accountId = `account-${index}`;

      store().requestLive(
        accountId,
        `profile-${index}`,
      );
      store().setBusy(accountId, true);
    }

    store().requestLive(
      'newcomer',
      'profile-new',
    );

    expect(idsInSet()).toHaveLength(
      MAX_LIVE_SESSIONS + 1,
    );
  });
});

describe('idempotent updates', () => {
  // The container re-renders on every entries change and hands its
  // children fresh callbacks, which report state back. A new array
  // for a no-op update would loop forever.
  it('markReady returns the same array when nothing changed', () => {
    store().requestLive('a', 'profile-a');
    store().markReady('a');

    const before = store().entries;
    store().markReady('a');

    expect(store().entries).toBe(before);
  });

  it('setBusy returns the same array when nothing changed', () => {
    store().requestLive('a', 'profile-a');

    const before = store().entries;
    store().setBusy('a', false);

    expect(store().entries).toBe(before);
  });

  it('ignores updates for unknown accounts', () => {
    const before = store().entries;

    store().markReady('missing');
    store().setBusy('missing', true);

    expect(store().entries).toBe(before);
  });
});

describe('release', () => {
  it('removes one account and leaves the rest', () => {
    store().requestLive('a', 'profile-a');
    store().requestLive('b', 'profile-b');

    store().release('a');

    expect(idsInSet()).toEqual(['b']);
  });

  it('releaseAll empties the warm set', () => {
    store().requestLive('a', 'profile-a');
    store().requestLive('b', 'profile-b');

    store().releaseAll();

    expect(store().entries).toEqual([]);
  });
});

describe('readers', () => {
  it('reports live only once the WebView is ready', () => {
    store().requestLive('a', 'profile-a');
    expect(isAccountLive('a')).toBe(false);

    store().markReady('a');
    expect(isAccountLive('a')).toBe(true);
  });

  it('exposes the bound profile id', () => {
    store().requestLive('a', 'profile-a');

    expect(liveProfileIdOf('a')).toBe(
      'profile-a',
    );
    expect(
      liveProfileIdOf('missing'),
    ).toBeUndefined();
  });
});

/// <reference types="jest" />

type AdmissionModule =
  typeof import('../webViewAdmission');

/**
 * WebView profile binding is a single process-global slot, so this
 * mutex is the only thing stopping a warm session from being created
 * against another account's profile. Its state is module-level, so
 * every test loads a fresh copy.
 */
function loadModule(): AdmissionModule {
  let loaded: AdmissionModule | null = null;

  jest.isolateModules(() => {
    loaded = require('../webViewAdmission');
  });

  if (!loaded) {
    throw new Error(
      'webViewAdmission failed to load.',
    );
  }

  return loaded;
}

describe('acquireWebViewCreation', () => {
  it('grants immediately when the slot is free', async () => {
    const admission = loadModule();

    const release =
      await admission.acquireWebViewCreation(
        'first',
      );

    expect(
      admission.describeWebViewAdmission(),
    ).toEqual({
      holder: 'first',
      queued: 0,
    });

    release();

    expect(
      admission.describeWebViewAdmission()
        .holder,
    ).toBeNull();
  });

  it('makes the second caller wait for the first release', async () => {
    const admission = loadModule();

    const first =
      await admission.acquireWebViewCreation(
        'first',
      );

    let secondGranted = false;

    const secondPending = admission
      .acquireWebViewCreation('second')
      .then((release) => {
        secondGranted = true;
        return release;
      });

    // Let any microtasks run: the second caller must still be
    // waiting, because only one WebView may be created at a time.
    await Promise.resolve();

    expect(secondGranted).toBe(false);
    expect(
      admission.describeWebViewAdmission(),
    ).toEqual({
      holder: 'first',
      queued: 1,
    });

    first();

    const secondRelease = await secondPending;

    expect(secondGranted).toBe(true);
    expect(
      admission.describeWebViewAdmission()
        .holder,
    ).toBe('second');

    secondRelease();
  });

  it('hands the slot on in FIFO order', async () => {
    const admission = loadModule();

    const order: string[] = [];

    const first =
      await admission.acquireWebViewCreation(
        'first',
      );

    const second = admission
      .acquireWebViewCreation('second')
      .then((release) => {
        order.push('second');
        return release;
      });

    const third = admission
      .acquireWebViewCreation('third')
      .then((release) => {
        order.push('third');
        return release;
      });

    first();
    (await second)();
    (await third)();

    expect(order).toEqual([
      'second',
      'third',
    ]);
  });

  it('ignores a second release from the same holder', async () => {
    const admission = loadModule();

    const first =
      await admission.acquireWebViewCreation(
        'first',
      );

    const secondPending =
      admission.acquireWebViewCreation(
        'second',
      );

    first();
    first();

    const secondRelease = await secondPending;

    // A double release must not have handed the slot on twice.
    expect(
      admission.describeWebViewAdmission(),
    ).toEqual({
      holder: 'second',
      queued: 0,
    });

    secondRelease();
  });
});

describe('hold timeout', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('releases a stuck holder and ignores its late release', async () => {
    const admission = loadModule();

    const stuck =
      await admission.acquireWebViewCreation(
        'stuck',
      );

    const nextPending =
      admission.acquireWebViewCreation('next');

    jest.advanceTimersByTime(20_000);

    const nextRelease = await nextPending;

    expect(
      admission.describeWebViewAdmission()
        .holder,
    ).toBe('next');

    // The timed-out holder's release must not evict its successor.
    stuck();

    expect(
      admission.describeWebViewAdmission()
        .holder,
    ).toBe('next');

    nextRelease();

    expect(
      admission.describeWebViewAdmission()
        .holder,
    ).toBeNull();
  });
});

describe('login slot', () => {
  it('parks the slot until the login WebView reports in', async () => {
    const admission = loadModule();

    await admission.acquireLoginWebViewSlot();

    expect(
      admission.describeWebViewAdmission()
        .holder,
    ).toBe('login');

    admission.releaseLoginWebViewSlot();

    expect(
      admission.describeWebViewAdmission()
        .holder,
    ).toBeNull();
  });

  it('is safe to release when nothing is parked', () => {
    const admission = loadModule();

    expect(() =>
      admission.releaseLoginWebViewSlot(),
    ).not.toThrow();
  });

  it('replaces an already parked slot instead of leaking it', async () => {
    const admission = loadModule();

    await admission.acquireLoginWebViewSlot();
    await admission.acquireLoginWebViewSlot();

    expect(
      admission.describeWebViewAdmission(),
    ).toEqual({
      holder: 'login',
      queued: 0,
    });

    admission.releaseLoginWebViewSlot();

    expect(
      admission.describeWebViewAdmission()
        .holder,
    ).toBeNull();
  });
});

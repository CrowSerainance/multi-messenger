import {
  NativeOperationTimeoutError,
  type NativeOperationName,
} from './sessionErrors';

import {
  recordSessionDiagnostic,
} from './sessionDiagnostics';

export const COOKIE_OPERATION_TIMEOUT_MS = 8_000;
export const STORAGE_OPERATION_TIMEOUT_MS = 10_000;

const pendingCookieMutations =
  new Set<Promise<unknown>>();

function isCookieMutation(
  operation: NativeOperationName,
): boolean {
  return (
    operation === 'cookie-write' ||
    operation === 'cookie-clear' ||
    operation === 'cookie-flush'
  );
}

export async function waitForPendingCookieMutations():
Promise<void> {
  while (pendingCookieMutations.size > 0) {
    await Promise.allSettled([
      ...pendingCookieMutations,
    ]);
  }
}

export async function withNativeOperationTimeout<T>(
  operation: NativeOperationName,
  timeoutMs: number,
  execute: () => Promise<T>,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const execution = Promise.resolve().then(execute);

  if (isCookieMutation(operation)) {
    pendingCookieMutations.add(execution);

    void execution.then(
      () => {
        pendingCookieMutations.delete(execution);
      },
      () => {
        pendingCookieMutations.delete(execution);
      },
    );
  }

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      recordSessionDiagnostic({
        event: 'native-operation-timeout',
        operation,
        errorCode: 'NATIVE_OPERATION_TIMEOUT',
      });

      reject(
        new NativeOperationTimeoutError(
          operation,
          timeoutMs,
        ),
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      execution,
      timeout,
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

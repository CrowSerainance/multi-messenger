export type SessionErrorCode =
  | 'SESSION_EXPIRED'
  | 'SESSION_STATE_INVALID'
  | 'NATIVE_OPERATION_TIMEOUT'
  | 'COOKIE_READ_FAILED'
  | 'COOKIE_WRITE_FAILED'
  | 'COOKIE_CLEAR_FAILED'
  | 'SECURE_STORAGE_FAILED'
  | 'SECURE_STORAGE_CORRUPT';

interface SessionErrorOptions {
  cause?: unknown;
  retryable?: boolean;
}

export class SessionError extends Error {
  readonly code: SessionErrorCode;
  readonly retryable: boolean;
  readonly originalCause?: unknown;

  constructor(
    code: SessionErrorCode,
    message: string,
    options: SessionErrorOptions = {},
  ) {
    super(message);
    this.name = 'SessionError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.originalCause = options.cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class SessionExpiredError extends SessionError {
  constructor(message = 'Saved session is no longer usable.') {
    super('SESSION_EXPIRED', message);
    this.name = 'SessionExpiredError';
  }
}

export class SessionStateError extends SessionError {
  constructor(message: string) {
    super('SESSION_STATE_INVALID', message);
    this.name = 'SessionStateError';
  }
}

export class NativeOperationTimeoutError extends SessionError {
  readonly operation: NativeOperationName;
  readonly timeoutMs: number;

  constructor(
    operation: NativeOperationName,
    timeoutMs: number,
  ) {
    super(
      'NATIVE_OPERATION_TIMEOUT',
      `Native ${operation} operation timed out.`,
      { retryable: true },
    );
    this.name = 'NativeOperationTimeoutError';
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

export type NativeOperationName =
  | 'cookie-read'
  | 'cookie-write'
  | 'cookie-clear'
  | 'cookie-flush'
  | 'secure-read'
  | 'secure-write'
  | 'secure-delete';

export class CookieReadError extends SessionError {
  constructor(cause?: unknown) {
    super(
      'COOKIE_READ_FAILED',
      'Unable to read the native cookie store.',
      { cause, retryable: true },
    );
    this.name = 'CookieReadError';
  }
}

export class CookieWriteError extends SessionError {
  constructor(cause?: unknown) {
    super(
      'COOKIE_WRITE_FAILED',
      'Unable to update the native cookie store.',
      { cause, retryable: true },
    );
    this.name = 'CookieWriteError';
  }
}

export class CookieClearError extends SessionError {
  constructor(cause?: unknown) {
    super(
      'COOKIE_CLEAR_FAILED',
      'Unable to clear the native cookie store.',
      { cause, retryable: true },
    );
    this.name = 'CookieClearError';
  }
}

export class SecureStorageError extends SessionError {
  constructor(cause?: unknown) {
    super(
      'SECURE_STORAGE_FAILED',
      'Secure session storage operation failed.',
      { cause, retryable: true },
    );
    this.name = 'SecureStorageError';
  }
}

export class SecureStorageCorruptError extends SessionError {
  constructor(cause?: unknown) {
    super(
      'SECURE_STORAGE_CORRUPT',
      'Stored session data is incomplete or invalid.',
      { cause },
    );
    this.name = 'SecureStorageCorruptError';
  }
}

export function isNativeOperationTimeout(
  error: unknown,
): boolean {
  let current = error;

  for (let depth = 0; depth < 5; depth += 1) {
    if (current instanceof NativeOperationTimeoutError) {
      return true;
    }

    if (!(current instanceof SessionError)) {
      return false;
    }

    current = current.originalCause;
  }

  return false;
}

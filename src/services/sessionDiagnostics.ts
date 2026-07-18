import type {
  NativeOperationName,
  SessionErrorCode,
} from './sessionErrors';

export type SessionDiagnosticEvent =
  | 'native-operation-timeout'
  | 'native-operation-failed'
  | 'cookie-read-retry';

export interface SessionDiagnosticEntry {
  sequence: number;
  timestamp: number;
  event: SessionDiagnosticEvent;
  operation: NativeOperationName;
  attempt?: 1 | 2;
  errorCode?: SessionErrorCode;
}

const MAX_ENTRIES = 100;
const entries: SessionDiagnosticEntry[] = [];
let nextSequence = 1;

export function recordSessionDiagnostic(
  entry: Omit<
    SessionDiagnosticEntry,
    'sequence' | 'timestamp'
  >,
): void {
  const safeEntry: SessionDiagnosticEntry = {
    sequence: nextSequence,
    timestamp: Date.now(),
    event: entry.event,
    operation: entry.operation,
    attempt: entry.attempt,
    errorCode: entry.errorCode,
  };

  nextSequence += 1;

  entries.push(safeEntry);

  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }

  if (__DEV__) {
    console.debug('[session-diagnostic]', safeEntry);
  }
}

export function getSessionDiagnostics():
ReadonlyArray<SessionDiagnosticEntry> {
  return entries.map((entry) => ({ ...entry }));
}

export function clearSessionDiagnostics(): void {
  entries.length = 0;
}

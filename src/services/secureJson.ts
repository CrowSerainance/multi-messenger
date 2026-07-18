import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import {
  STORAGE_OPERATION_TIMEOUT_MS,
  withNativeOperationTimeout,
} from './nativeOperation';

import {
  SecureStorageCorruptError,
  SecureStorageError,
  type NativeOperationName,
} from './sessionErrors';

import {
  recordSessionDiagnostic,
} from './sessionDiagnostics';

const CHUNK_SIZE = 1500;

interface ChunkManifest {
  version: 1;
  generation: string;
  chunkCount: number;
}

const SECURE_OPTIONS = {
  keychainAccessible:
    SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

async function runSecureStoreOperation<T>(
  operation: Extract<
    NativeOperationName,
    'secure-read' | 'secure-write' | 'secure-delete'
  >,
  execute: () => Promise<T>,
): Promise<T> {
  try {
    return await withNativeOperationTimeout(
      operation,
      STORAGE_OPERATION_TIMEOUT_MS,
      execute,
    );
  } catch (error) {
    const wrapped = new SecureStorageError(error);

    recordSessionDiagnostic({
      event: 'native-operation-failed',
      operation,
      errorCode: wrapped.code,
    });

    throw wrapped;
  }
}

function parseManifest(raw: string): ChunkManifest {
  try {
    const manifest = JSON.parse(raw) as Partial<ChunkManifest>;

    if (
      manifest.version !== 1 ||
      typeof manifest.generation !== 'string' ||
      manifest.generation.length === 0 ||
      !Number.isSafeInteger(manifest.chunkCount) ||
      (manifest.chunkCount ?? 0) < 1
    ) {
      throw new Error('Invalid manifest shape.');
    }

    return manifest as ChunkManifest;
  } catch (error) {
    throw new SecureStorageCorruptError(error);
  }
}

function manifestKey(baseKey: string): string {
  return `${baseKey}.manifest`;
}

function chunkKey(
  baseKey: string,
  generation: string,
  index: number,
): string {
  return `${baseKey}.${generation}.${index}`;
}

async function readManifest(
  baseKey: string,
): Promise<ChunkManifest | null> {
  const raw = await runSecureStoreOperation(
    'secure-read',
    () => SecureStore.getItemAsync(
      manifestKey(baseKey),
      SECURE_OPTIONS,
    ),
  );

  if (!raw) {
    return null;
  }

  return parseManifest(raw);
}

export async function secureWriteJson<T>(
  baseKey: string,
  value: T,
): Promise<void> {
  const serialized = JSON.stringify(value);
  const oldManifest = await readManifest(baseKey);
  const generation = Crypto.randomUUID().replaceAll('-', '');
  const chunks: string[] = [];

  for (
    let offset = 0;
    offset < serialized.length;
    offset += CHUNK_SIZE
  ) {
    chunks.push(
      serialized.slice(offset, offset + CHUNK_SIZE),
    );
  }

  if (chunks.length === 0) {
    chunks.push('');
  }

  await Promise.all(
    chunks.map((chunk, index) =>
      runSecureStoreOperation(
        'secure-write',
        () => SecureStore.setItemAsync(
          chunkKey(baseKey, generation, index),
          chunk,
          SECURE_OPTIONS,
        ),
      ),
    ),
  );

  const newManifest: ChunkManifest = {
    version: 1,
    generation,
    chunkCount: chunks.length,
  };

  await runSecureStoreOperation(
    'secure-write',
    () => SecureStore.setItemAsync(
      manifestKey(baseKey),
      JSON.stringify(newManifest),
      SECURE_OPTIONS,
    ),
  );

  if (
    oldManifest &&
    oldManifest.generation !== generation
  ) {
    await Promise.all(
      Array.from(
        { length: oldManifest.chunkCount },
        (_, index) =>
          runSecureStoreOperation(
            'secure-delete',
            () => SecureStore.deleteItemAsync(
              chunkKey(
                baseKey,
                oldManifest.generation,
                index,
              ),
              SECURE_OPTIONS,
            ),
          ),
      ),
    );
  }
}

export async function secureReadJson<T>(
  baseKey: string,
): Promise<T | null> {
  const manifest = await readManifest(baseKey);

  if (!manifest) {
    return null;
  }

  const chunks = await Promise.all(
    Array.from(
      { length: manifest.chunkCount },
      (_, index) =>
        runSecureStoreOperation(
          'secure-read',
          () => SecureStore.getItemAsync(
            chunkKey(
              baseKey,
              manifest.generation,
              index,
            ),
            SECURE_OPTIONS,
          ),
        ),
    ),
  );

  if (chunks.some((chunk) => chunk === null)) {
    throw new SecureStorageCorruptError();
  }

  const serialized = chunks.join('');

  try {
    return JSON.parse(serialized) as T;
  } catch (error) {
    throw new SecureStorageCorruptError(error);
  }
}

export async function secureDeleteJson(
  baseKey: string,
): Promise<void> {
  const manifest = await readManifest(baseKey);

  if (manifest) {
    await Promise.all(
      Array.from(
        { length: manifest.chunkCount },
        (_, index) =>
          runSecureStoreOperation(
            'secure-delete',
            () => SecureStore.deleteItemAsync(
              chunkKey(
                baseKey,
                manifest.generation,
                index,
              ),
              SECURE_OPTIONS,
            ),
          ),
      ),
    );
  }

  await runSecureStoreOperation(
    'secure-delete',
    () => SecureStore.deleteItemAsync(
      manifestKey(baseKey),
      SECURE_OPTIONS,
    ),
  );
}

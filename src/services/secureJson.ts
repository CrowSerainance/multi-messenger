import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

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
  const raw = await SecureStore.getItemAsync(
    manifestKey(baseKey),
    SECURE_OPTIONS,
  );

  if (!raw) {
    return null;
  }

  return JSON.parse(raw) as ChunkManifest;
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
      SecureStore.setItemAsync(
        chunkKey(baseKey, generation, index),
        chunk,
        SECURE_OPTIONS,
      ),
    ),
  );

  const newManifest: ChunkManifest = {
    version: 1,
    generation,
    chunkCount: chunks.length,
  };

  await SecureStore.setItemAsync(
    manifestKey(baseKey),
    JSON.stringify(newManifest),
    SECURE_OPTIONS,
  );

  if (
    oldManifest &&
    oldManifest.generation !== generation
  ) {
    await Promise.all(
      Array.from(
        { length: oldManifest.chunkCount },
        (_, index) =>
          SecureStore.deleteItemAsync(
            chunkKey(
              baseKey,
              oldManifest.generation,
              index,
            ),
            SECURE_OPTIONS,
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
        SecureStore.getItemAsync(
          chunkKey(
            baseKey,
            manifest.generation,
            index,
          ),
          SECURE_OPTIONS,
        ),
    ),
  );

  if (chunks.some((chunk) => chunk === null)) {
    throw new Error(
      `SecureStore value is incomplete: ${baseKey}`,
    );
  }

  const serialized = chunks.join('');
  return JSON.parse(serialized) as T;
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
          SecureStore.deleteItemAsync(
            chunkKey(
              baseKey,
              manifest.generation,
              index,
            ),
            SECURE_OPTIONS,
          ),
      ),
    );
  }

  await SecureStore.deleteItemAsync(
    manifestKey(baseKey),
    SECURE_OPTIONS,
  );
}

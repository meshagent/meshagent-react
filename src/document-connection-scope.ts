import { useEffect, useRef, useState } from 'react';
import { MeshDocument, MeshSchema, RoomClient } from '@meshagent/meshagent';

export interface UseDocumentConnectionProps {
  room: RoomClient;
  path: string;
  schema?: MeshSchema;
  initialJson?: Record<string, unknown>;
  onConnected?: (document: MeshDocument) => void;
  onError?: (error: unknown) => void;
}

export interface UseDocumentConnectionResult {
  document: MeshDocument | null;
  error: unknown;
  loading: boolean;
  schemaFileExists: boolean;
}

function getRetryDelayMs(retryCount: number): number {
  return Math.min(60_000, 500 * 2 ** retryCount);
}

async function closeDocument(room: RoomClient, path: string): Promise<void> {
  try {
    await room.sync.close(path);
  } catch {
  }
}

/**
 * Connects to a Mesh document inside an existing RoomClient and keeps it in sync.
 */
export function useDocumentConnection({
  room,
  path,
  schema,
  initialJson,
  onConnected,
  onError,
}: UseDocumentConnectionProps): UseDocumentConnectionResult {
  const [schemaFileExists, setSchemaFileExists] = useState<boolean>(schema != null);
  const [document, setDocument] = useState<MeshDocument | null>(null);
  const [error, setError] = useState<unknown>(null);

  const onConnectedRef = useRef(onConnected);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onConnectedRef.current = onConnected;
  }, [onConnected]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    let cancelled = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let opened = false;
    let nextRetryCount = 0;

    const clearRetryTimeout = () => {
      if (retryTimeout != null) {
        clearTimeout(retryTimeout);
        retryTimeout = null;
      }
    };

    const waitForRetry = (delayMs: number): Promise<void> => new Promise((resolve) => {
      retryTimeout = setTimeout(() => {
        retryTimeout = null;
        resolve();
      }, delayMs);
    });

    setDocument(null);
    setError(null);
    setSchemaFileExists(schema != null);

    void (async () => {
      while (!cancelled) {
        try {
          if (schema == null) {
            const pathExtension = path.split('.').pop()?.toLowerCase();
            const schemaFile = `.schemas/${pathExtension}.json`;
            const nextSchemaExists = await room.storage.exists(schemaFile);

            if (cancelled) {
              return;
            }

            setSchemaFileExists(nextSchemaExists);

            if (!nextSchemaExists) {
              return;
            }
          }

          const nextDocument = await room.sync.open(path, { initialJson, schema });

          if (cancelled) {
            await closeDocument(room, path);
            return;
          }

          opened = true;
          nextRetryCount = 0;
          setDocument(nextDocument);
          setError(null);
          onConnectedRef.current?.(nextDocument);
          return;
        } catch (nextError) {
          if (cancelled) {
            return;
          }

          setDocument(null);
          setError(nextError);
          onErrorRef.current?.(nextError);

          await waitForRetry(getRetryDelayMs(nextRetryCount));
          nextRetryCount += 1;
        }
      }
    })();

    return () => {
      cancelled = true;
      clearRetryTimeout();

      if (opened) {
        void closeDocument(room, path);
      }
    };
  }, [initialJson, path, room, schema]);

  return {
    document,
    error,
    loading: document == null && error == null,
    schemaFileExists,
  };
}

type OnChangedHandler = (document: MeshDocument) => void;

export function useDocumentChanged({
  document,
  onChanged,
}: {
  document: MeshDocument | null;
  onChanged: OnChangedHandler;
}): void {
  const onChangedRef = useRef(onChanged);

  useEffect(() => {
    onChangedRef.current = onChanged;
  }, [onChanged]);

  useEffect(() => {
    if (document == null) {
      return;
    }

    const subscription = document.listen(() => onChangedRef.current(document));
    onChangedRef.current(document);

    return () => subscription.unsubscribe();
  }, [document]);
}

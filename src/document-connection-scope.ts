import { useEffect, useRef, useState } from 'react';
import { MeshDocument, RoomClient } from '@meshagent/meshagent';

export interface UseDocumentConnectionProps {
    room: RoomClient;
    path: string;
}

export interface UseDocumentConnectionResult {
  document: MeshDocument | null;

  error: unknown;

  loading: boolean;
}

/**
 * Connects to a Mesh document inside an existing RoomClient and keeps it in sync.
 *
 * The function retries with an exponential back‑off (capped at 60 s) until the
 * document becomes available or the component unmounts.
 *
 * @param room  An already‑connected RoomClient.
 * @param path  Path to the document inside the room.
 */
export function useDocumentConnection({ room, path }: UseDocumentConnectionProps): UseDocumentConnectionResult {
  const [document, setDocument] = useState<MeshDocument | null>(null);
  const [error, setError] = useState<unknown>(null);

  /** How many retries have been attempted so far. */
  const retryCountRef = useRef(0);
  /** Holds the current pending timeout ID so we can cancel it. */
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false; // defence against late async calls

    const openDocument = async () => {
      try {
        const doc = await room.sync.open(path);
        if (cancelled) return;

        setDocument(doc);
        setError(null);
      } catch (err) {
        if (cancelled) return;

        console.debug('Retrying to open document:', path, err);
        setError(err);

        // Exponential back‑off: 500 ms, 1 s, 2 s, … up to 60 s.
        const delay = Math.min(60_000, 500 * 2 ** retryCountRef.current);
        retryCountRef.current += 1;

        timeoutRef.current = setTimeout(openDocument, delay);
      }
    };

    // 🔃 1st attempt
    openDocument();

    return () => {
      // Component unmount or `room`/`path` change → clean up
      cancelled = true;

      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      room.sync.close(path);
      setDocument(null);
      retryCountRef.current = 0;
    };
  }, [room, path]);

  return {
    document,
    error,
    loading: document === null && error == null,
  };
}


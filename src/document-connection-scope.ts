import { useEffect, useRef, useState } from 'react';
import { MeshDocument, RoomClient, RemoteParticipant } from '@meshagent/meshagent';

export interface UseDocumentConnectionProps {
    room: RoomClient;
    path: string;
    onConnected?: (document: MeshDocument) => void;
    onError?: (error: unknown) => void;
}

export interface UseDocumentConnectionResult {
    document: MeshDocument | null;
    error: unknown;
    loading: boolean;
    schemaFileExists: boolean;
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
export function useDocumentConnection({ room, path, onConnected, onError }: UseDocumentConnectionProps): UseDocumentConnectionResult {
    const [schemaFileExists, setSchemaFileExists] = useState<boolean | null>(null);
    const [document, setDocument] = useState<MeshDocument | null>(null);
    const [error, setError] = useState<unknown>(null);

    const openedRef = useRef(false);
    const retryCountRef = useRef(0);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const pathExtension = path.split('.').pop()?.toLowerCase();
    const schemaFile = `.schemas/${pathExtension}.json`;

    useEffect(() => {
        let cancelled = false;

        const openDocument = async () => {
            try {
                const schemaExists = await room.storage.exists(schemaFile);
                if (schemaExists) {
                    setSchemaFileExists(true);
                } else {
                    setSchemaFileExists(false);
                    return;
                }

                const doc = await room.sync.open(path);

                if (cancelled) return;
                openedRef.current = true;

                // sleep for 100 ms to ensure the document is ready
                await new Promise(resolve => setTimeout(resolve, 100));

                setDocument(doc);
                setError(null);

                if (onConnected) {
                    onConnected(doc);
                }
            } catch (err) {
                console.error('Failed to open document:', err);

                if (cancelled) return;

                setError(err);
                if (onError) {
                    onError(err);
                }

                // Exponential back‑off: 500 ms, 1 s, 2 s, … up to 60 s.
                const delay = Math.min(60_000, 500 * 2 ** retryCountRef.current);
                retryCountRef.current += 1;

                timeoutRef.current = setTimeout(openDocument, delay);
            }
        };

        openDocument();

        return () => {
            cancelled = true;

            if (timeoutRef.current !== null) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }

            if (openedRef.current) {
                room.sync.close(path);
            }

            setDocument(null);
            retryCountRef.current = 0;
            openedRef.current = false;
        };
    }, [path]);

    return {
        document,
        error,
        loading: document === null && error == null,
        schemaFileExists: schemaFileExists !== null ? schemaFileExists : true,
    };
}

type onChangedHandler = (document: MeshDocument) => void;

export function useDocumentChanged({document, onChanged}: {
    document: MeshDocument | null;
    onChanged: onChangedHandler;
}): void {
    useEffect(() => {
        if (document) {
            const s = document.listen(() => onChanged(document));

            onChanged(document);

            return () => s.unsubscribe();
        }
    }, [document]);
}

export function useRoomParticipants(room: RoomClient | null): Iterable<RemoteParticipant> {
    const [participants, setParticipants] = useState<Iterable<RemoteParticipant>>(() => []);

    useEffect(() => {
        if (!room || !room.messaging) {
            return;
        }

        const updateParticipants = () => setParticipants(room.messaging.remoteParticipants);

        room.messaging.on('participant_added', updateParticipants);
        room.messaging.on('participant_removed', updateParticipants);
        room.messaging.on('messaging_enabled', updateParticipants);

        updateParticipants();

        return () => {
            room.messaging.off('participant_added', updateParticipants);
            room.messaging.off('participant_removed', updateParticipants);
            room.messaging.on('messaging_enabled', updateParticipants);
        };
    }, [room]);

    return participants;
}

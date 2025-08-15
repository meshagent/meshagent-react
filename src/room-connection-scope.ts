import { useEffect, useState, useRef } from 'react';
import { subscribe } from './subscribe-async-gen';
import { RoomEvent, RoomMessageEvent } from '@meshagent/meshagent';

import {
    ParticipantToken,
    Protocol,
    RoomClient,
    WebSocketProtocolChannel,
} from '@meshagent/meshagent';

export interface RoomConnectionInfo {
  url: string;     // You can switch to `URL` if preferred
  jwt: string;
}

/* -------------------------------------------------
 * Authorization helpers
 * ------------------------------------------------- */
export const developmentAuthorization = ({
  url,
  projectId,
  apiKeyId,
  participantName,
  roomName,
  secret,
}: {
  url: string;
  projectId: string;
  apiKeyId: string;
  participantName: string;
  roomName: string;
  secret: string;
}): (() => Promise<RoomConnectionInfo>) => async () => {
    const token: ParticipantToken = new ParticipantToken({
      name: participantName,
      projectId,
      apiKeyId,
    });

    token.addRoomGrant(roomName);
    token.addRoleGrant('user');

    const jwt = await token.toJwt({ token: secret });

    return {url, jwt};
  };

export const staticAuthorization = ({
  url,
  jwt,
}: {
  url: string;
  jwt: string;
}): (() => Promise<RoomConnectionInfo>) => async () => ({ url, jwt });

export interface UseRoomConnectionOptions {
  /** Async function that returns `{ url, jwt }` for the room. */
  authorization: () => Promise<{ url: string; jwt: string }>;

  /** Enable the optional messaging layer (default = `true`). */
  enableMessaging?: boolean;
}

/**
 * Shape of the object returned by the hook.
 */
export interface UseRoomConnectionResult {
  client: RoomClient | null;

  state: 'authorizing' | 'connecting' | 'ready' | 'done';

  ready: boolean;
  done: boolean;
  error: unknown;

  dispose: () => void;
}

export function useRoomConnection(props: UseRoomConnectionOptions): UseRoomConnectionResult {
  const {
    authorization,
    enableMessaging = true,
  } = props;

  const [client, setClient] = useState<RoomClient | null>(null);
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<'authorizing' | 'connecting' | 'ready' | 'done'>('authorizing');
  const [error, setError] = useState<unknown>(null);

  // Keep the latest client in a ref so we can call `dispose` in cleanup.
  const clientRef = useRef<RoomClient | null>(null);

  clientRef.current = client;

  // Instance method exposed to consumers (rarely needed).
  const dispose = () => {
    clientRef.current?.dispose();

    setState('done');
  };

  useEffect(() => {
    let cancelled = false;

    const connect = async () => {
      try {
        // 1️⃣  Get connection credentials
        const { url, jwt } = await authorization();

        if (cancelled) return;

        const room = new RoomClient({
          protocol: new Protocol({
            channel: new WebSocketProtocolChannel({ url, jwt }),
          }),
        });

        setClient(room);
        setState('connecting');
        
        await room.start({
          onDone: () => {
            if (cancelled) return;
            setState('done');
          },
          onError: (e: Error) => {
            if (cancelled) return;
            setError(e);
            setState('done');
          },
        });

        if (enableMessaging) {
          await room.messaging.enable();
        }

        if (cancelled) return;
        setState('ready');
        setReady(true);

      } catch (e) {
        if (cancelled) return;
        setError(e);
        setState('done');
      }
    };

    connect();

    return () => {
      // React unmount or deps change → cancel & dispose
      cancelled = true;
      dispose();
    };
    // eslint‑disable‑next‑line react-hooks/exhaustive-deps
  }, []); // run once, just like componentDidMount

  return {
    client,
    state,
    ready,
    done: state === 'done',
    error,
    dispose,
  };
}

export interface UseRoomIndicatorsResult {
    typing: boolean;
    thinking: boolean;
}

export interface UseRoomIndicatorsProps {
    room: RoomClient | null;
    path: string;
}

export function useRoomIndicators({room, path}: UseRoomIndicatorsProps): UseRoomIndicatorsResult {
    const typingMap = useRef<Record<string, NodeJS.Timeout>>({});
    const thinkingMap = useRef<Record<string, NodeJS.Timeout>>({});

    const [typing, setTyping] = useState(false);
    const [thinking, setThinking] = useState(false);

    useEffect(() => {
        if (!room) return;

        const s = subscribe(room.listen(), {
            next: (event: RoomEvent) => {
                if (event instanceof RoomMessageEvent) {
                    const { message } = event;

                    // Ignore messages from ourselves
                    if (message.fromParticipantId === room.localParticipant?.id) {
                        return;
                    }

                    // Ignore messages not for this path
                    if (message.message.path !== path) {
                        return;
                    }

                    if (message.type === "typing") {
                        // Clear any existing timer for this participant
                        clearTimeout(typingMap.current[message.fromParticipantId]);

                        // Set a new timer to remove typing after 1 second
                        typingMap.current[message.fromParticipantId] = setTimeout(() => {
                            delete typingMap.current[message.fromParticipantId];

                            setTyping(Object.keys(typingMap.current).length > 0);
                        }, 1000);

                        // Update typing state
                        setTyping(Object.keys(typingMap.current).length > 0);

                    } else if (message.type === "thinking") {
                        clearTimeout(thinkingMap.current[message.fromParticipantId]);

                        if (message.message.thinking) {
                            thinkingMap.current[message.fromParticipantId] = setTimeout(() => {
                                delete thinkingMap.current[message.fromParticipantId];

                                setThinking(Object.keys(thinkingMap.current).length > 0);
                            }, 5000);
                        } else {
                            delete thinkingMap.current[message.fromParticipantId];
                        }

                        setThinking(Object.keys(thinkingMap.current).length > 0);
                    }
                }
            },
        });

        return () => s.unsubscribe();
    }, [room, path]);

    return { typing, thinking };
}

import { useEffect, useRef, useState } from 'react';

import {
  type OAuthTokenRequest,
  ParticipantToken,
  RoomClient,
  RoomEvent,
  RoomMessageEvent,
  RoomServerException,
  type SecretRequest,
  WebSocketClientProtocol,
} from '@meshagent/meshagent';

import type { RoomConnectionInfo } from '@meshagent/meshagent';

import { subscribe } from './subscribe-async-gen';

const retryBaseDelayMs = 500;
const retryMaxDelayMs = 30000;

function getRetryDelayMs(retryCount: number): number {
  return Math.min(retryMaxDelayMs, retryBaseDelayMs * 2 ** retryCount);
}

function isRetryableConnectionError(error: unknown): error is RoomServerException {
  return error instanceof RoomServerException && error.retryable;
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
  const token = new ParticipantToken({
    name: participantName,
    projectId,
    apiKeyId,
  });

  token.addRoomGrant(roomName);
  token.addRoleGrant('user');

  const jwt = await token.toJwt({ token: secret });

  return {
    jwt,
    projectId,
    roomName,
    roomUrl: url,
  };
};

export const staticAuthorization = ({
  projectId,
  roomName,
  url,
  jwt,
}: {
  projectId: string;
  roomName: string;
  url: string;
  jwt: string;
}): (() => Promise<RoomConnectionInfo>) => async () => ({
  jwt,
  projectId,
  roomName,
  roomUrl: url,
});

export interface UseRoomConnectionOptions {
  reconnectKey?: string;
  authorization: () => Promise<RoomConnectionInfo>;
  enableMessaging?: boolean;
  onReady?: (room: RoomClient) => void;
  oauthTokenRequestHandler?: (room: RoomClient, request: OAuthTokenRequest) => Promise<void> | void;
  secretRequestHandler?: (room: RoomClient, request: SecretRequest) => Promise<void> | void;
  roomClientFactory?: (connectionInfo: RoomConnectionInfo) => RoomClient;
}

export interface UseRoomConnectionResult {
  client: RoomClient | null;
  state: 'authorizing' | 'connecting' | 'retrying' | 'ready' | 'done';
  ready: boolean;
  done: boolean;
  error: unknown;
  dispose: () => void;
}

export function useRoomConnection({
  reconnectKey,
  authorization,
  enableMessaging = true,
  onReady,
  oauthTokenRequestHandler,
  secretRequestHandler,
  roomClientFactory,
}: UseRoomConnectionOptions): UseRoomConnectionResult {
  const [client, setClient] = useState<RoomClient | null>(null);
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<UseRoomConnectionResult['state']>('authorizing');
  const [error, setError] = useState<unknown>(null);

  const clientRef = useRef<RoomClient | null>(null);
  const cancelConnectionRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    const clearRetryTimeout = () => {
      if (retryTimeout != null) {
        clearTimeout(retryTimeout);
        retryTimeout = null;
      }
    };

    const disposeClient = (room: RoomClient | null) => {
      if (room == null) {
        return;
      }

      if (clientRef.current === room) {
        clientRef.current = null;
      }

      room.dispose();
    };

    const waitForRetry = (delayMs: number): Promise<void> => new Promise((resolve) => {
      retryTimeout = setTimeout(() => {
        retryTimeout = null;
        resolve();
      }, delayMs);
    });

    setClient(null);
    setReady(false);

    const cancelConnection = ({ updateState }: { updateState: boolean }) => {
      if (cancelled) {
        return;
      }

      cancelled = true;
      clearRetryTimeout();
      const currentClient = clientRef.current;
      clientRef.current = null;
      disposeClient(currentClient);

      if (updateState) {
        setClient(null);
        setReady(false);
      }
    };

    cancelConnectionRef.current = () => cancelConnection({ updateState: true });

    void (async () => {
      let retryCount = 0;

      while (!cancelled) {
        let connectionInfo: RoomConnectionInfo;

        try {
          setState('authorizing');
          setError(null);
          connectionInfo = await authorization();
        } catch (nextError) {
          if (cancelled) {
            return;
          }

          setError(nextError);
          setState('done');
          setReady(false);
          return;
        }

        if (cancelled) {
          return;
        }

        let nextClient: RoomClient;

        if (roomClientFactory != null) {
          nextClient = roomClientFactory(connectionInfo);
        } else {
          nextClient = new RoomClient({
            protocolFactory: WebSocketClientProtocol.createFactory({
              url: connectionInfo.roomUrl,
              token: connectionInfo.jwt,
            }),
            oauthTokenRequestHandler: oauthTokenRequestHandler == null
              ? undefined
              : (request) => oauthTokenRequestHandler(nextClient, request),
            secretRequestHandler: secretRequestHandler == null
              ? undefined
              : (request) => secretRequestHandler(nextClient, request),
          });
        }

        clientRef.current = nextClient;
        setClient(nextClient);
        setReady(false);
        setState('connecting');

        try {
          await nextClient.start({
            onDone: () => {
              if (cancelled || clientRef.current !== nextClient) {
                return;
              }

              setReady(false);
              setState('done');
            },
            onError: (nextError: unknown) => {
              if (cancelled || clientRef.current !== nextClient) {
                return;
              }

              setError(nextError);
              setReady(false);
              setState('done');
            },
          });

          if (enableMessaging) {
            nextClient.messaging.enable();
          }

          if (cancelled || clientRef.current !== nextClient) {
            disposeClient(nextClient);
            return;
          }

          retryCount = 0;
          setError(null);
          setReady(true);
          setState('ready');
          onReady?.(nextClient);

          return;
        } catch (nextError) {
          disposeClient(nextClient);

          if (cancelled) {
            return;
          }

          setClient((currentClient) => currentClient === nextClient ? null : currentClient);
          setReady(false);
          setError(nextError);

          if (!isRetryableConnectionError(nextError)) {
            setState('done');
            return;
          }

          setState('retrying');
          await waitForRetry(getRetryDelayMs(retryCount));
          retryCount += 1;
        }
      }
    })();

    return () => {
      cancelConnection({ updateState: false });
      cancelConnectionRef.current = () => {};
    };
  }, [reconnectKey, enableMessaging, roomClientFactory]);

  const dispose = () => {
    cancelConnectionRef.current();
    setState('done');
  };

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

export function useRoomIndicators({ room, path }: UseRoomIndicatorsProps): UseRoomIndicatorsResult {
  const typingMap = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const thinkingMap = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const [typing, setTyping] = useState(false);
  const [thinking, setThinking] = useState(false);

  useEffect(() => {
    if (!room) {
      return;
    }

    setTyping(false);
    setThinking(false);

    const subscription = subscribe(room.listen(), {
      next: (event: RoomEvent) => {
        if (!(event instanceof RoomMessageEvent)) {
          return;
        }

        const { message } = event;

        if (message.fromParticipantId === room.localParticipant?.id) {
          return;
        }

        if (message.message.path !== path) {
          return;
        }

        if (message.type === 'typing') {
          clearTimeout(typingMap.current[message.fromParticipantId]);

          typingMap.current[message.fromParticipantId] = setTimeout(() => {
            delete typingMap.current[message.fromParticipantId];
            setTyping(Object.keys(typingMap.current).length > 0);
          }, 1000);

          setTyping(Object.keys(typingMap.current).length > 0);
          return;
        }

        if (message.type !== 'thinking') {
          return;
        }

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
      },
    });

    return () => {
      subscription.unsubscribe();

      for (const timeout of Object.values(typingMap.current)) {
        clearTimeout(timeout);
      }
      for (const timeout of Object.values(thinkingMap.current)) {
        clearTimeout(timeout);
      }

      typingMap.current = {};
      thinkingMap.current = {};
    };
  }, [path, room]);

  return { typing, thinking };
}

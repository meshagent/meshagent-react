import { useEffect, useState } from 'react';
import { JsonResponse, RoomClient } from '@meshagent/meshagent';
import * as livekit from 'livekit-client';

export interface LivekitConnectionInfo {
  url: string;
  token: string;
}

export async function getConnectionInfo(
  room: RoomClient,
  breakoutRoom: string,
): Promise<LivekitConnectionInfo> {
    const response = await room.sendRequest("livekit.connect", { 
        breakout_room: breakoutRoom
    }) as JsonResponse;

    return response.json as LivekitConnectionInfo;
}

export interface UseLivekitConnectionProps {
  room: RoomClient;
  breakoutRoom: string;
  onConnected?: (connection: livekit.Room) => void;
  onError?: (error: unknown) => void;
}

export interface UseLivekitConnectionResult {
  connection: livekit.Room | null;
  error: unknown;
  loading: boolean;
}

export function useLivekitConnection({room, breakoutRoom, onConnected, onError}: UseLivekitConnectionProps): UseLivekitConnectionResult {
  const [connection, setConnection] = useState<livekit.Room | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;

    const connectToLivekit = async () => {
      try {
        const { url, token } = await getConnectionInfo(room, breakoutRoom);

        const lkRoom = await livekit.connect(url, token);

        if (cancelled) return;

        setConnection(lkRoom);
        setError(null);
      } catch (err) {
        if (cancelled) return;

        setError(err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    connectToLivekit();

    return () => {
      cancelled = true;
      if (connection) {
        connection.disconnect();
      }
    };
  }, [room, breakoutRoom]);

  return { connection, error, loading };
} 


export function useLivekitRoomParticipants(connection: livekit.Room | null): livekit.Participant[] {
  const [participants, setParticipants] = useState<livekit.Participant[]>([]);

  useEffect(() => {
    if (!connection) return;

    const updateParticipants = () => {
      setParticipants(Array.from(connection.remoteParticipants.values()));
    };

    connection.on('participantConnected', updateParticipants);
    connection.on('participantDisconnected', updateParticipants);

    // Initial load
    updateParticipants();

    return () => {
      connection.off('participantConnected', updateParticipants);
      connection.off('participantDisconnected', updateParticipants);
    };
  }, [connection]);

  return participants;
}



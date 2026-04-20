import { useEffect, useState } from 'react';

import { RoomClient, RemoteParticipant } from '@meshagent/meshagent';

function sameParticipantIds(
  currentParticipants: readonly RemoteParticipant[],
  nextParticipants: readonly RemoteParticipant[],
): boolean {
  if (currentParticipants.length !== nextParticipants.length) {
    return false;
  }

  const currentParticipantIds = new Set(currentParticipants.map((participant) => participant.id));

  for (const participant of nextParticipants) {
    if (!currentParticipantIds.has(participant.id)) {
      return false;
    }
  }

  return true;
}

export function useRoomParticipants(room: RoomClient | null): RemoteParticipant[] {
  const [participants, setParticipants] = useState<RemoteParticipant[]>([]);

  useEffect(() => {
    if (room == null) {
      setParticipants([]);
      return;
    }

    const updateParticipants = () => {
      const nextParticipants = room.messaging.remoteParticipants;

      setParticipants((currentParticipants) => {
        if (sameParticipantIds(currentParticipants, nextParticipants)) {
          return currentParticipants;
        }

        return [...nextParticipants];
      });
    };

    room.messaging.on('participant_added', updateParticipants);
    room.messaging.on('participant_removed', updateParticipants);
    room.messaging.on('messaging_enabled', updateParticipants);
    room.on('disconnected', updateParticipants);

    updateParticipants();

    return () => {
      room.messaging.off('participant_added', updateParticipants);
      room.messaging.off('participant_removed', updateParticipants);
      room.messaging.off('messaging_enabled', updateParticipants);
      room.off('disconnected', updateParticipants);
    };
  }, [room]);

  return participants;
}

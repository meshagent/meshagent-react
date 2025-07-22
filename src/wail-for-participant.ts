import { useState, useEffect } from 'react';
import { Participant } from '@meshagent/meshagent';
import { UseRoomConnectionResult } from './room-connection-scope';

export function useWaitForAgentParticipant(connection: UseRoomConnectionResult | null): Participant | null {
    const [participant, setParticipant] = useState<Participant | null>(null);

    useEffect(() => {
        if (connection == null || !connection.ready) {
            return;
        }

        function onChange() {
            const participants = Array.from(connection!.client!.messaging.remoteParticipants);
            const agentParticipant = participants.find(p => p.role === 'agent');

            if (agentParticipant) {
                setParticipant(agentParticipant);
            }
        }

        connection.client!.messaging.on('change', onChange);

        onChange();

        return () => connection.client!.messaging.off('change', onChange);
    }, [connection]);

    return participant;
}

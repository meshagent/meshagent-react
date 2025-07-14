import React from 'react';
import { getEnvVar, participantToken, websocketRoomUrl } from '@meshagent/meshagent';
import { useRoomConnection } from '@meshagent/meshagent-react';
import { LoadingOverlay } from "@/components/ui/spinner";
import { Chat } from './Chat';

import './App.css';

const participantName = 'John Smith';
const roomName = 'my-room';
const path = '.threads/meshagent.chatbot-josef.kohout@timu.com.thread';

async function onAuthorization() {
    const baseUrl = getEnvVar('MESHAGENT_API_URL') || 'https://api.meshagent.life';
    const secret = getEnvVar('MESHAGENT_SECRET');

    const token = participantToken({
        participantName,
        roomName,
    });

    const jwt = await token.toJwt({ token: secret });
    const url = websocketRoomUrl({ roomName, baseUrl });

    return { url, jwt };
}

export default function App(): React.ReactElement {
    const connection = useRoomConnection({
        authorization: onAuthorization,
        enableMessaging: true
    });

    return (
        <main className="h-[100vh]">
            <LoadingOverlay isLoading={!connection.ready}>
                {connection.ready && (<Chat room={connection.client!} path={path} />)}
            </LoadingOverlay>
        </main>
    );
}


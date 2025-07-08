import React, { useCallback } from 'react';
import { getEnvVar, participantToken, websocketRoomUrl, RoomClient, Element, RuntimeDocument } from '@meshagent/meshagent';
import { useRoomConnection, useDocumentConnection } from '@meshagent/meshagent-react';
import { LoadingOverlay } from "@/components/ui/spinner";
import { Chat } from './Chat';
import { v4 as uuidv4 } from "uuid";

import './App.css'

const participantName = 'John Smith';
const roomName = 'my-room';
const documentPath = '.threads/meshagent.chatbot-josef.kohout@timu.com.thread';

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

function LoadDocument({roomClient} : {roomClient: RoomClient}): React.ReactElement {
    const documentResult = useDocumentConnection(roomClient, documentPath);
    const onSend = useCallback((msg: string) => {
        const text = msg.trim();

        if (msg.length === 0) {
            return;
        }

        const document = documentResult.document as RuntimeDocument | null;
        const elements = document?.root.getChildren() as Element[] || [];
        const threadElement = elements.find(c => c.tagName === 'messages') as Element | undefined;
        const memberElement = elements.find(c => c.tagName === 'members') as Element | undefined;
        const members = memberElement?.getChildren() as Element[] || [];

        if (!threadElement) {
            console.error("Thread element not found in the document.");
            return;
        }
 
        threadElement.createChildElement("message", {
            id: uuidv4(),
            text,
            created_at: new Date().toISOString(),
            author_name: roomClient.localParticipant!.getAttribute("name"),
            author_ref: null,
        });

        for (const member of members) {
            roomClient.messaging.sendMessage({
                to: member.getAttribute("name"),
                type: "chat",
                message: {
                  path: documentPath,
                  text,
                  attachments: [],
                }
            });
        }
    }, [roomClient, documentResult]);

    if (documentResult.loading) {
        return (
          <LoadingOverlay isLoading={true} className="flex flex-col items-center justify-center h-screen">
              <h1>Loading document...</h1>
          </LoadingOverlay>
        );
    }

    const document = documentResult.document as RuntimeDocument | null;
    const elements = document?.root.getChildren() as Element[] || [];
    const threadElement = elements.find(c => c.tagName === 'messages') as Element | undefined;
    const threadElements = threadElement?.getChildren() as Element[] || [];
    const messages = threadElements.filter(c => c.tagName === 'message') || [];

    return (
        <Chat
            messages={messages}
            onSend={onSend}
            localParticipantName={roomClient.localParticipant!.getAttribute("name")} />
    );
}

export default function App(): React.ReactElement {
    const connection = useRoomConnection({
        authorization: onAuthorization,
        enableMessaging: true
    });

    return (
        <main className="h-[100vh]">
            <LoadingOverlay isLoading={!connection.ready}>
                {connection.ready && (<LoadDocument roomClient={connection.client!} />)}
            </LoadingOverlay>
        </main>
    );
}


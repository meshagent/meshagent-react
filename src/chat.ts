import { useCallback, useState, useEffect } from "react";
import { RoomClient, Element, Participant, MeshDocument } from "@meshagent/meshagent";

import {
    useDocumentConnection,
    useDocumentChanged,
} from "./document-connection-scope";

export interface ChatMessageArgs {
    id: string;
    text: string;
    attachments?: string[];
}

export class ChatMessage {
    public id: string;
    public text: string;
    public attachments: string[];

    constructor({id, text, attachments}: ChatMessageArgs) {
        this.id = id;
        this.text = text;
        this.attachments = attachments ?? [];
    }
}

export interface UseMessageChatProps {
    room: RoomClient;
    path: string;
    participants?: Participant[];
    participantNames?: string[];
    includeLocalParticipant?: boolean;
    initialMessage?: ChatMessage;
}

export interface UseMessageChatResult {
    messages: Element[];
    sendMessage: (message: ChatMessage) => void;
}

function ensureParticipants(
    document: MeshDocument,
    localParticipant: Participant,
    includeLocalParticipant: boolean,
    participants: Participant[],
    participantNames: string[]
): void {
    const retParticipants: Participant[] = [
      ...(participants ?? []),
      ...(includeLocalParticipant ? [localParticipant] : []),
    ];

    const existing = new Set<string>();

    for (const child of document.root.getChildren()
      .filter((c): c is Element => (c as Element).tagName !== undefined)) {

      if (child.tagName === "members") {
        for (const member of child.getChildren()
          .filter((c): c is Element => (c as Element).tagName !== undefined)) {

          const name = member.getAttribute("name");
          if (name) existing.add(name);
        }

        for (const part of retParticipants) {
            const name = part.getAttribute("name");

            if (name && !existing.has(name)) {
              child.createChildElement("member", { name });
              existing.add(name);
            }
        }

        if (participantNames != null) {
          for (const name of participantNames) {
            if (!existing.has(name)) {
              child.createChildElement("member", { name });
              existing.add(name);
            }
          }
        }
      }
    }
}

function mapMessages(doc: MeshDocument): Element[] {
    const children = doc.root.getChildren() as Element[] || [];
    const thread = children.find((c) => c.tagName === "messages");
    const threadChildren = (thread?.getChildren() as Element[]) || [];

    return threadChildren.filter((el) => el.tagName === "message");
}

export function useChat({
    room,
    path,
    participants,
    participantNames,
    initialMessage,
    includeLocalParticipant}: UseMessageChatProps): UseMessageChatResult {

    const { document } = useDocumentConnection({room, path});
    const [messages, setMessages] = useState<Element[]>(() => document ? mapMessages(document) : []);

    useDocumentChanged({
        document,
        onChanged: (doc) => {
            console.log("jkkk onChanged:", doc);
            setMessages(mapMessages(doc));
        }
    });

    const sendMessage = useCallback(
        (message: ChatMessage) => {
            const children = document?.root.getChildren() as Element[] || [];
            const thread = children.find((c) => c.tagName === "messages");
            const memberNode = children.find((c) => c.tagName === "members");
            const members = (memberNode?.getChildren() as Element[]) || [];

            if (!thread) {
                return;
            }

            thread.createChildElement("message", {
                id: message.id,
                text: message.text,
                created_at: new Date().toISOString(),
                author_name: room.localParticipant!.getAttribute("name"),
                author_ref: null,
            });

            for (const m of members) {
                room.messaging.sendMessage({
                    to: m.getAttribute("name"),
                    type: "chat",
                    message: {
                        path,
                        text: message.text,
                        attachments: message.attachments,
                    },
                });
            }
        },
        [document]);

        useEffect(() => {
            if (document) {
                ensureParticipants(
                    document,
                    room.localParticipant!,
                    includeLocalParticipant ?? true,
                    participants ?? [],
                    participantNames ?? []
                );

                if (initialMessage) {
                    sendMessage(initialMessage);
                }
            }
        }, [document]);

        return {messages, sendMessage};
    }

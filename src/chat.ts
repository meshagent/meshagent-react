import { useCallback, useState, useEffect } from "react";
import { RoomClient, Element, Participant, MeshDocument } from "@meshagent/meshagent";

import { FileUpload, MeshagentFileUpload } from "./file-upload";

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
    selectAttachments: (files: File[]) => void;
    attachments: FileUpload[];
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

function* getParticipantNames(document: MeshDocument): IterableIterator<string> {
    const children = document.root.getChildren() as Element[] || [];
    const memberNode = children.find((c) => c.tagName === "members");
    const members = (memberNode?.getChildren() as Element[]) || [];

    for (const member of members) {
        const name = member.getAttribute("name");
        if (name) {
            yield name;
        }
    }
}

function* getOnlineParticipants(room: RoomClient, document: MeshDocument): IterableIterator<Participant> {
    for (const participantName of getParticipantNames(document)) {
        if (participantName === room.localParticipant?.getAttribute("name")) {
            yield room.localParticipant!;
        }

        for (const remoteParticipant of room.messaging.remoteParticipants) {
            if (remoteParticipant.getAttribute("name") === participantName) {
                yield remoteParticipant;
            }
        }
    }
}

const chunkSize = 64 * 1024; // 64 KB

export function fileToAsyncIterable(file: File): AsyncIterable<Uint8Array> {
  const hasNativeStream = typeof file.stream === 'function';

  async function* nativeStream() {
    const reader = file.stream().getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }

  async function* sliceStream() {
    let offset = 0;
    while (offset < file.size) {
      const blob = file.slice(offset, offset + chunkSize);
      const buffer = await blob.arrayBuffer();
      yield new Uint8Array(buffer);
      offset += chunkSize;
    }
  }

  return (hasNativeStream ? nativeStream : sliceStream)();
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
    const [attachments, setAttachments] = useState<FileUpload[]>([]);

    useDocumentChanged({
        document,
        onChanged: (doc) => {
            setMessages(mapMessages(doc));
        },
    });

    const selectAttachments = useCallback((files: File[]) => {
        const attachmentsToUpload = files.map((file) => new MeshagentFileUpload(
            room, `uploaded-files/${file.name}`, fileToAsyncIterable(file), file.size));

        setAttachments(attachmentsToUpload);
    }, [room, document]);


    const sendMessage = useCallback(
        (message: ChatMessage) => {
            const children = document?.root.getChildren() as Element[] || [];
            const thread = children.find((c) => c.tagName === "messages");

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

            for (const participant of getOnlineParticipants(room, document!)) {
                room.messaging.sendMessage({
                    to: participant,
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

    return {
        messages,
        sendMessage,
        selectAttachments,
        attachments,
    };
}

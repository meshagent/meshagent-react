import { useCallback, useState, useMemo } from "react";
import { RoomClient, Element, Participant, MeshDocument } from "@meshagent/meshagent";

import { FileUpload, MeshagentFileUpload } from "./file-upload";
import { useRoomParticipants } from "./document-connection-scope";

import { useDocumentConnection, useDocumentChanged } from "./document-connection-scope";

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
    setAttachments: (attachments: FileUpload[]) => void;
    schemaFileExists: boolean;
    onlineParticipants: Participant[];
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

function* getOnlineParticipants(roomParticipants: Iterable<Participant>, participantNames: Iterable<string>): Iterable<Participant> {
    for (const participantName of participantNames) {
        for (const remoteParticipant of roomParticipants) {
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

    const { document, schemaFileExists } = useDocumentConnection({
        room,
        path,
        onConnected: (doc) => {
            ensureParticipants(
                doc,
                room.localParticipant!,
                includeLocalParticipant ?? true,
                participants ?? [],
                participantNames ?? []
            );

            if (initialMessage) {
                sendMessage(initialMessage);
            }
        },
        onError: (error) => {
            console.error("Failed to connect to document:", error);
        }
    });

    const [messages, setMessages] = useState<Element[]>(() => document ? mapMessages(document) : []);
    const [attachments, setAttachments] = useState<FileUpload[]>([]);
    const [documentMembers, setDocumentMembers] = useState<Iterable<string>>(() => document ? getParticipantNames(document) : []);

    useDocumentChanged({
        document,
        onChanged: (doc) => {
            setMessages(mapMessages(doc));

            setDocumentMembers(getParticipantNames(doc));
        },
    });

    const selectAttachments = useCallback((files: File[]) => {
        const attachmentsToUpload = files.map((file) => new MeshagentFileUpload(
            room, `uploaded-files/${file.name}`, fileToAsyncIterable(file), file.size));

        setAttachments(attachmentsToUpload);
    }, [room]);

    const roomParticipants = useRoomParticipants(room);

    const onlineParticipants = useMemo<Participant[]>(
        () => Array.from(getOnlineParticipants(roomParticipants, documentMembers)),
        [roomParticipants, documentMembers]);

    const sendMessage = useCallback((message: ChatMessage) => {
        const children = document?.root.getChildren() as Element[] || [];
        const thread = children.find((c) => c.tagName === "messages");

        if (!thread) {
            return;
        }

        const m = thread.createChildElement("message", {
            id: message.id,
            text: message.text,
            created_at: new Date().toISOString(),
            author_name: room.localParticipant!.getAttribute("name"),
            author_ref: null,
        });

        for (const path of message.attachments) {
            m.createChildElement("file", { path });
        }

        for (const participant of onlineParticipants) {
            room.messaging.sendMessage({
                to: participant,
                type: "chat",
                message: {
                    path,
                    text: message.text,
                    attachments: message.attachments.map(path => ({ path })),
                },
            });
        }
    },
    [document, attachments, onlineParticipants, room]);

    return {
        messages,
        sendMessage,
        selectAttachments,
        attachments,
        setAttachments,
        schemaFileExists,
        onlineParticipants,
    };
}

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChatThread } from "./ChatThread.tsx";
import { ChatInput } from "./ChatInput.tsx";
import { Element } from "@meshagent/meshagent";

export interface ChatProps {
  localParticipantName: string;
  messages: Element[];
  onSend: (msg: string) => void;
}

export function Chat({
    localParticipantName,
    messages,
    onSend}: ChatProps) {
  return (
    <Card className="flex flex-col h-full max-h-[40rem]">
      <CardHeader className="border-b">
        <CardTitle>Chat</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col flex-1 gap-2 p-0">
        <ChatThread messages={messages} localParticipantName={localParticipantName} />
        <ChatInput onSubmit={onSend} />
      </CardContent>
    </Card>
  );
}

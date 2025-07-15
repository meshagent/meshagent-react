import * as React from "react";
import { Button } from "@/components/ui/button";
import { Plus } from 'lucide-react';
import { Textarea } from "@/components/ui/textarea";
import { ChatMessage } from "@meshagent/meshagent-react";
import { v4 as uuidV4 } from "uuid";

interface ChatInputProps {
  onSubmit: (message: ChatMessage) => void;
}

export function ChatInput({ onSubmit }: ChatInputProps) {
  const [value, setValue] = React.useState("");

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed) return;

    onSubmit(new ChatMessage({
        id: uuidV4(),
        text: trimmed,
    }));

    setValue("");
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t p-3 flex gap-3">
      <Button variant="ghost" size="icon" aria-label="Attach file">
        <Plus className="w-10 h-10" />
      </Button>

      <Textarea
        placeholder="Type a message and press Ctrl+Enter…"
        className="flex-1 resize-none h-20"
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        onKeyDown={onKeyDown} />

      <Button onClick={handleSend} disabled={!value.trim()}>Send</Button>
    </div>
  );
}

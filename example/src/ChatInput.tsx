import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ChatInputProps {
  /** Fires with trimmed string when user clicks "Send" or presses Ctrl+Enter. */
  onSubmit: (text: string) => void;
}

export function ChatInput({ onSubmit }: ChatInputProps) {
  const [value, setValue] = React.useState("");

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
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
      <Textarea
        placeholder="Type a message and press Ctrl+Enter…"
        className="flex-1 resize-none h-20"
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        onKeyDown={onKeyDown}
      />
      <Button
        onClick={handleSend}
        disabled={!value.trim()}
        className="self-end"
      >
        Send
      </Button>
    </div>
  );
}

"use client";

import { useRef, useState, type FC } from "react";

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled: boolean;
}

export const ChatInput: FC<ChatInputProps> = ({ onSend, disabled }) => {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleInput = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  };

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isSendDisabled = !text.trim() || disabled;

  return (
    <div className="relative w-full max-w-3xl mx-auto">
      <div className="flex items-end gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm focus-within:border-gray-300 focus-within:shadow-md transition-all duration-200">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            handleInput();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Reply..."
          rows={1}
          disabled={disabled}
          className="flex-1 resize-none outline-none text-sm text-gray-900 placeholder-gray-400 disabled:opacity-50 max-h-[200px] leading-relaxed"
        />
        <button
          onClick={handleSubmit}
          disabled={isSendDisabled}
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md bg-gray-200 text-gray-400 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-300 transition-colors"
          aria-label="Send message"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-4 h-4"
          >
            <path d="M3.478 2.405a.75.75 0 0 0-.926.94l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.405Z" />
          </svg>
        </button>
      </div>
      <p className="text-center text-xs text-gray-400 mt-2">
        hbario can make mistakes. Consider checking important information.
      </p>
    </div>
  );
};

export default ChatInput;

"use client";

import type { FC } from "react";

interface TypingIndicatorProps {
  className?: string;
}

export const TypingIndicator: FC<TypingIndicatorProps> = ({ className }) => {
  return (
    <div className={`flex justify-start ${className ?? ""}`}>
      <div className="bg-gray-100 text-gray-900 rounded-lg px-4 py-3">
        <div className="flex items-center gap-1">
          <span
            className="w-2 h-2 bg-gray-400 rounded-full"
            style={{
              animation: "typingBounce 1.4s infinite ease-in-out both",
              animationDelay: "0s",
            }}
          />
          <span
            className="w-2 h-2 bg-gray-400 rounded-full"
            style={{
              animation: "typingBounce 1.4s infinite ease-in-out both",
              animationDelay: "0.2s",
            }}
          />
          <span
            className="w-2 h-2 bg-gray-400 rounded-full"
            style={{
              animation: "typingBounce 1.4s infinite ease-in-out both",
              animationDelay: "0.4s",
            }}
          />
        </div>
        <style>{`
          @keyframes typingBounce {
            0%, 60%, 100% {
              transform: translateY(0);
            }
            30% {
              transform: translateY(-6px);
            }
          }
        `}</style>
      </div>
    </div>
  );
};

export default TypingIndicator;

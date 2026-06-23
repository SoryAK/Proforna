"use client";

import { Sparkles } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

/**
 * Empty-state placeholder rendered when the chat thread has no messages.
 * Suggestion chips set the textarea value so the user can refine before
 * sending (cheaper than auto-sending — avoids surprise streams).
 */
const SUGGESTIONS = [
  "How should I prepare for my next interview?",
  "What skills should I learn next?",
  "Review my job search strategy",
  "Help me negotiate a raise",
] as const;

export interface AIChatEmptyStateProps {
  setInput: Dispatch<SetStateAction<string>>;
}

export function AIChatEmptyState({ setInput }: AIChatEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center space-y-3 py-8">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-600/10 to-purple-600/10">
        <Sparkles className="h-8 w-8 text-orange-600 dark:text-orange-400" />
      </div>
      <div>
        <p className="text-sm font-semibold">Hey! I&apos;m your career AI.</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">
          I know your profile, skills, applications, and goals. Ask me anything about your career.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-1.5 mt-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => { setInput(suggestion); }}
            className="rounded-full border px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

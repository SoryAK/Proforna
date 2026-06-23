"use client";

import type { Dispatch, SetStateAction } from "react";
import type { SlashCommand } from "@/lib/ai-chat-constants";

/**
 * Slash-command popover (ADR-0046 Phase B). Renders the filtered command
 * list and routes mouse interactions back to the slash hook. Keyboard
 * navigation lives in the parent's `handleKeyDown` via `handleSlashKey`.
 *
 * Anchored above the textarea (absolute, bottom-full) so the menu doesn't
 * push the input around as it opens/closes.
 */
export interface AIChatSlashMenuProps {
  open: boolean;
  filteredSlashCommands: SlashCommand[];
  slashIndex: number;
  setSlashIndex: Dispatch<SetStateAction<number>>;
  executeSlashCommand: (cmd: SlashCommand) => void;
}

export function AIChatSlashMenu({
  open,
  filteredSlashCommands,
  slashIndex,
  setSlashIndex,
  executeSlashCommand,
}: AIChatSlashMenuProps) {
  if (!open) return null;
  return (
    <div
      className="absolute bottom-full left-3 right-3 mb-2 z-10 rounded-md border bg-popover shadow-lg overflow-hidden"
      role="listbox"
      aria-label="Slash commands"
    >
      <div className="border-b bg-muted/40 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Slash commands
      </div>
      {filteredSlashCommands.map((cmd, i) => (
        <button
          key={cmd.id}
          type="button"
          onClick={() => executeSlashCommand(cmd)}
          onMouseEnter={() => setSlashIndex(i)}
          className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
            i === slashIndex ? "bg-orange-500/15" : "hover:bg-muted"
          }`}
          role="option"
          aria-selected={i === slashIndex}
        >
          <code className="text-xs font-mono text-orange-600 dark:text-orange-400 shrink-0">
            {cmd.label}
          </code>
          <span className="text-xs text-muted-foreground truncate">
            {cmd.description}
          </span>
        </button>
      ))}
    </div>
  );
}

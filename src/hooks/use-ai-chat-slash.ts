"use client";

import { useCallback, useEffect, useState } from "react";
import type { Dispatch, KeyboardEvent, SetStateAction } from "react";
import {
  SLASH_COMMANDS,
  type SlashCommand,
} from "@/lib/ai-chat-constants";

/**
 * Slash-command surface for the AI chat panel (ADR-0046 Phase B).
 *
 * The menu opens when the input starts with `/` and contains no whitespace
 * (VS Code convention — prevents mid-message URLs from accidentally opening
 * the menu). Filter is a prefix match against `cmd.id`.
 *
 * The hook owns the navigation index and exposes `handleSlashKey` for the
 * component to chain into its keyboard handler — the function returns
 * `true` when it consumed the event (so the caller knows not to fall
 * through to the plain Enter-to-send branch).
 */
export interface UseAiChatSlashParams {
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  sendMessage: (overrideText?: string) => Promise<void>;
  /** Caller-supplied chat reset (the slash `/clear` command short-circuits). */
  onClear: () => void;
}

export interface UseAiChatSlashReturn {
  slashIndex: number;
  setSlashIndex: Dispatch<SetStateAction<number>>;
  slashOpen: boolean;
  filteredSlashCommands: SlashCommand[];
  executeSlashCommand: (cmd: SlashCommand) => void;
  /**
   * Composable key handler. Returns `true` if the event was consumed and the
   * caller should NOT fall through to its plain Enter-to-send branch.
   */
  handleSlashKey: (e: KeyboardEvent) => boolean;
}

export function useAiChatSlash(params: UseAiChatSlashParams): UseAiChatSlashReturn {
  const { input, setInput, sendMessage, onClear } = params;

  // Keyboard-selected slash command. Reset to 0 whenever the filtered list
  // shrinks below the current index (see clamp effect below).
  const [slashIndex, setSlashIndex] = useState(0);

  const isSlashActive = input.startsWith("/") && !/\s/.test(input);
  const slashQuery = isSlashActive ? input.slice(1).toLowerCase() : "";
  const filteredSlashCommands = isSlashActive
    ? SLASH_COMMANDS.filter((c) => c.id.toLowerCase().startsWith(slashQuery))
    : [];
  const slashOpen = filteredSlashCommands.length > 0;

  // Keep the highlighted index in range as the filter narrows.
  useEffect(() => {
    if (slashIndex >= filteredSlashCommands.length) setSlashIndex(0);
  }, [filteredSlashCommands.length, slashIndex]);

  const executeSlashCommand = useCallback(
    (cmd: SlashCommand) => {
      // Client-side slash commands short-circuit the send — they don't
      // produce a user turn (e.g. `/clear` resets the thread in-place).
      if (cmd.id === "clear") {
        setInput("");
        setSlashIndex(0);
        onClear();
        return;
      }
      // Pass the prompt directly into sendMessage so we don't race React's
      // batched state — `input` won't have flushed yet when we send.
      setInput(cmd.prompt);
      setSlashIndex(0);
      void sendMessage(cmd.prompt);
    },
    [sendMessage, onClear, setInput],
  );

  const handleSlashKey = useCallback(
    (e: KeyboardEvent): boolean => {
      if (!slashOpen) return false;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIndex((i) => Math.min(i + 1, filteredSlashCommands.length - 1));
        return true;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIndex((i) => Math.max(i - 1, 0));
        return true;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        const cmd = filteredSlashCommands[slashIndex];
        if (cmd) executeSlashCommand(cmd);
        return true;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setInput("");
        setSlashIndex(0);
        return true;
      }
      return false;
    },
    [slashOpen, filteredSlashCommands, slashIndex, executeSlashCommand, setInput],
  );

  return {
    slashIndex,
    setSlashIndex,
    slashOpen,
    filteredSlashCommands,
    executeSlashCommand,
    handleSlashKey,
  };
}

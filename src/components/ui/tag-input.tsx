"use client";

import * as React from "react";
import { X, Tag as TagIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TagInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  maxTags?: number;
  maxTagLength?: number;
  lowercase?: boolean;
  /** Optional list of tags to suggest as the user types. */
  suggestions?: string[];
  className?: string;
  disabled?: boolean;
  id?: string;
  /** Show a small leading tag icon inside the field. Default true. */
  showIcon?: boolean;
}

/**
 * YouTube-style tag input.
 *
 * - Press **Enter**, **Tab**, or **,** to commit the current text as a pill.
 * - Press **Backspace** on an empty input to remove the last pill.
 * - Click the `×` on any pill to remove it.
 * - Pasting a comma- or newline-separated list adds them all at once.
 */
export function TagInput({
  value,
  onChange,
  placeholder = "Add a tag and press Enter",
  maxTags = 20,
  maxTagLength = 32,
  lowercase = true,
  suggestions,
  className,
  disabled,
  id,
  showIcon = true,
}: TagInputProps) {
  const [draft, setDraft] = React.useState("");
  const [focused, setFocused] = React.useState(false);
  const [activeIdx, setActiveIdx] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const normalize = React.useCallback(
    (raw: string) => {
      let v = raw.trim();
      if (!v) return "";
      if (lowercase) v = v.toLowerCase();
      if (v.length > maxTagLength) v = v.slice(0, maxTagLength);
      return v;
    },
    [lowercase, maxTagLength]
  );

  const commit = React.useCallback(
    (raw: string) => {
      // Allow batched commits (paste of "a, b, c")
      const parts = raw
        .split(/[,\n\r\t]+/g)
        .map(normalize)
        .filter(Boolean);
      if (parts.length === 0) return;
      const seen = new Set(value);
      const next = [...value];
      for (const p of parts) {
        if (seen.has(p)) continue;
        if (next.length >= maxTags) break;
        next.push(p);
        seen.add(p);
      }
      if (next.length !== value.length) onChange(next);
      setDraft("");
    },
    [value, onChange, normalize, maxTags]
  );

  const removeAt = (idx: number) => {
    const next = value.slice();
    next.splice(idx, 1);
    onChange(next);
  };

  const lowerDraft = draft.trim().toLowerCase();
  const dropdownSuggestions = React.useMemo(() => {
    if (!suggestions || !lowerDraft) return [];
    const set = new Set(value.map((v) => v.toLowerCase()));
    return suggestions
      .filter((s) => s.toLowerCase().includes(lowerDraft) && !set.has(s.toLowerCase()))
      .slice(0, 6);
  }, [suggestions, lowerDraft, value]);

  // Reset highlighted suggestion when the list changes
  React.useEffect(() => {
    setActiveIdx(0);
  }, [lowerDraft, dropdownSuggestions.length]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;
    const hasSuggestions = dropdownSuggestions.length > 0;
    if (hasSuggestions && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setActiveIdx((i) => {
        const n = dropdownSuggestions.length;
        return e.key === "ArrowDown" ? (i + 1) % n : (i - 1 + n) % n;
      });
      return;
    }
    if (e.key === "Enter" || e.key === "Tab" || e.key === ",") {
      if (hasSuggestions && draft.trim() && e.key !== ",") {
        e.preventDefault();
        commit(dropdownSuggestions[activeIdx] ?? draft);
        return;
      }
      if (draft.trim()) {
        e.preventDefault();
        commit(draft);
      }
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      e.preventDefault();
      removeAt(value.length - 1);
    } else if (e.key === "Escape" && hasSuggestions) {
      e.preventDefault();
      setDraft("");
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    if (/[,\n\r\t]/.test(text)) {
      e.preventDefault();
      commit(text);
    }
  }

  function onBlur() {
    setFocused(false);
    if (draft.trim()) commit(draft);
  }

  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          "flex flex-wrap items-center gap-1 min-h-9 rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-xs transition-colors",
          focused && "ring-2 ring-ring/40 border-ring",
          disabled && "opacity-60 cursor-not-allowed"
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {showIcon && value.length === 0 && !draft && (
          <TagIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-0.5" />
        )}
        {value.map((tag, idx) => (
          <span
            key={`${tag}-${idx}`}
            className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30 px-2 py-0.5 text-xs font-medium"
          >
            <TagIcon className="h-2.5 w-2.5" />
            {tag}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeAt(idx);
                }}
                className="rounded-full hover:bg-cyan-500/30 p-0.5 -mr-0.5"
                aria-label={`Remove tag ${tag}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </span>
        ))}
        <input
          id={id}
          ref={inputRef}
          type="text"
          value={draft}
          disabled={disabled || value.length >= maxTags}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onFocus={() => setFocused(true)}
          onBlur={onBlur}
          placeholder={value.length === 0 ? placeholder : value.length >= maxTags ? `Max ${maxTags} tags` : ""}
          className="flex-1 min-w-[8ch] bg-transparent outline-none border-0 text-sm placeholder:text-muted-foreground py-0.5"
        />
      </div>

      {focused && dropdownSuggestions.length > 0 && (
        <div className="absolute z-30 left-0 right-0 mt-1 rounded-md border bg-popover text-popover-foreground shadow-md overflow-hidden">
          {dropdownSuggestions.map((s, i) => (
            <button
              key={s}
              type="button"
              onMouseEnter={() => setActiveIdx(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(s);
              }}
              className={cn(
                "w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-1.5",
                i === activeIdx ? "bg-accent text-accent-foreground" : "hover:bg-accent"
              )}
            >
              <TagIcon className="h-3 w-3 text-muted-foreground" />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

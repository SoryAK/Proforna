"use client";

/**
 * ADR-0046 Phase C.3 — textarea with @-mention pill overlay.
 *
 * Pattern: textarea + transparent mirror overlay.
 *   - The shadcn `Textarea` sits on top with normal text + caret visible.
 *   - A mirror `<div>` underneath renders the same text with `text-transparent`
 *     so it contributes no visible text, but inserts a `<span>` background
 *     pill behind every active mention anchor.
 *   - Typography (font, size, padding, leading, wrap) is mirrored 1:1 so
 *     each mention character lines up exactly with its underlying letter.
 *
 * Picker keyboard nav (Arrow/Enter/Tab/Escape) is intercepted here while the
 * picker is open. All other keystrokes bubble to the parent's `onKeyDown`,
 * so the existing slash-command + Enter-to-send wiring in `ai-chat.tsx`
 * keeps working.
 *
 * `mentions` is fully controlled by the parent. Every input change runs
 * `pruneOrphanedMentions` so the array stays a strict subset of anchors
 * still present in the textarea — backspacing into a mention drops it.
 */
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ChangeEvent,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  Ref,
} from "react";

import {
  AIChatMentionPicker,
  type MentionCandidate,
} from "@/components/ai-chat-mention-picker";
import { Textarea } from "@/components/ui/textarea";
import {
  detectMentionTrigger,
  insertMention,
  pruneOrphanedMentions,
  type MentionRef,
  type MentionType,
} from "@/lib/ai-chat-mentions";

interface AIChatTextareaWithMentionsProps {
  value: string;
  onChange: (value: string) => void;
  mentions: MentionRef[];
  onMentionsChange: (mentions: MentionRef[]) => void;
  onKeyDown?: (e: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

// Typography classes shared between the textarea and the mirror overlay.
// MUST stay identical so character positions line up exactly. If shadcn's
// Textarea internals change, update both halves together.
const SHARED_TYPOGRAPHY =
  "px-2.5 py-2 text-base md:text-sm leading-normal font-sans whitespace-pre-wrap break-words";

function renderMirrorContent(
  text: string,
  mentions: MentionRef[],
): ReactNode[] {
  if (mentions.length === 0) return [text];

  // Find each anchor's earliest occurrence and walk through the string,
  // intercalating plain segments with pill spans. We only highlight the
  // first occurrence per anchor — duplicates are pruned upstream so this
  // matches what the user actually meant.
  const segments: { start: number; end: number; mention: MentionRef }[] = [];
  for (const m of mentions) {
    const start = text.indexOf(m.anchor);
    if (start === -1) continue;
    // Skip if this range overlaps a previously-claimed one.
    if (segments.some((s) => start < s.end && start + m.anchor.length > s.start)) {
      continue;
    }
    segments.push({ start, end: start + m.anchor.length, mention: m });
  }
  segments.sort((a, b) => a.start - b.start);

  const result: ReactNode[] = [];
  let cursor = 0;
  for (const seg of segments) {
    if (seg.start > cursor) result.push(text.slice(cursor, seg.start));
    result.push(
      <span
        key={`pill-${seg.mention.type}-${seg.mention.id}-${seg.start}`}
        className="rounded bg-orange-500/15 text-orange-700/0 dark:text-orange-300/0"
        // `text-orange-*/0` keeps the pill text fully transparent so the
        // textarea's real text remains the only visible glyph layer.
      >
        {text.slice(seg.start, seg.end)}
      </span>,
    );
    cursor = seg.end;
  }
  if (cursor < text.length) result.push(text.slice(cursor));
  return result;
}

function AIChatTextareaWithMentionsInner(
  {
    value,
    onChange,
    mentions,
    onMentionsChange,
    onKeyDown,
    placeholder,
    disabled,
    className,
  }: AIChatTextareaWithMentionsProps,
  ref: Ref<HTMLTextAreaElement>,
) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const setRefs = useCallback(
    (node: HTMLTextAreaElement | null) => {
      localRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as { current: HTMLTextAreaElement | null }).current = node;
    },
    [ref],
  );

  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const [pickerType, setPickerType] = useState<MentionType>("job");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerStart, setPickerStart] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [results, setResults] = useState<MentionCandidate[]>([]);
  const [loading, setLoading] = useState(false);

  // Sync mirror scroll to the textarea so pills stay aligned even when
  // the input grows past one line.
  const handleScroll = useCallback(() => {
    if (mirrorRef.current && localRef.current) {
      mirrorRef.current.scrollTop = localRef.current.scrollTop;
      mirrorRef.current.scrollLeft = localRef.current.scrollLeft;
    }
  }, []);

  // Re-evaluate the trigger whenever the value or caret moves.
  const evaluateTrigger = useCallback(() => {
    const el = localRef.current;
    if (!el) return;
    const cursor = el.selectionStart ?? value.length;
    const trigger = detectMentionTrigger(value, cursor);
    if (trigger) {
      setPickerOpen(true);
      setPickerStart(trigger.start);
      setPickerQuery(trigger.query);
    } else {
      setPickerOpen(false);
    }
  }, [value]);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    onChange(next);
    const pruned = pruneOrphanedMentions(next, mentions);
    if (pruned.length !== mentions.length) onMentionsChange(pruned);
  };

  // After value or caret changes, re-detect trigger.
  useEffect(() => {
    evaluateTrigger();
  }, [evaluateTrigger]);

  // Debounced fetch against the Phase C.1 backend whenever the picker is
  // open and the query / type changes. 180ms keeps keystrokes feeling
  // immediate without spamming the server.
  useEffect(() => {
    if (!pickerOpen) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      fetch("/api/ai/mention-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: pickerType, q: pickerQuery, limit: 8 }),
      })
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => {
          if (cancelled) return;
          setResults(Array.isArray(data) ? (data as MentionCandidate[]) : []);
          setSelectedIndex(0);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pickerOpen, pickerType, pickerQuery]);

  // Keep selectedIndex in range if the results array shrinks.
  useEffect(() => {
    if (selectedIndex >= results.length) setSelectedIndex(0);
  }, [results.length, selectedIndex]);

  const selectCandidate = useCallback(
    (candidate: MentionCandidate) => {
      const el = localRef.current;
      const caret = el?.selectionStart ?? value.length;
      const { text, mention, cursor } = insertMention(value, caret, pickerStart, {
        type: candidate.type,
        id: candidate.id,
        label: candidate.label,
      });
      onChange(text);
      onMentionsChange([...mentions, mention]);
      setPickerOpen(false);
      setPickerQuery("");
      // Restore focus + place caret after the inserted anchor.
      requestAnimationFrame(() => {
        if (!el) return;
        el.focus();
        el.setSelectionRange(cursor, cursor);
      });
    },
    [mentions, onChange, onMentionsChange, pickerStart, value],
  );

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (pickerOpen && results.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        const candidate = results[selectedIndex];
        if (candidate) selectCandidate(candidate);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setPickerOpen(false);
        return;
      }
    }
    onKeyDown?.(e);
  };

  const mirrorContent = useMemo(
    () => renderMirrorContent(value, mentions),
    [value, mentions],
  );

  return (
    <div className={`relative flex-1 ${className ?? ""}`}>
      {/* Mirror overlay — same typography as the textarea, transparent text,
          pill backgrounds. `aria-hidden` because screen readers should see
          only the real textarea content. */}
      <div
        ref={mirrorRef}
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 overflow-hidden text-transparent ${SHARED_TYPOGRAPHY}`}
      >
        {mirrorContent}
        {/* Trailing newline guard — keeps the mirror's last line height
            matching the textarea when the user's text ends with a newline. */}
        {value.endsWith("\n") ? "\u200b" : null}
      </div>

      <Textarea
        ref={setRefs}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
        onKeyUp={evaluateTrigger}
        onClick={evaluateTrigger}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        // `relative` so the textarea stacks above the mirror; bg-transparent
        // lets the mirror's pill backgrounds show through.
        className="relative bg-transparent min-h-[36px] max-h-[120px] resize-none text-sm"
      />

      {pickerOpen && (
        <AIChatMentionPicker
          type={pickerType}
          onTypeChange={(t) => {
            setPickerType(t);
            setSelectedIndex(0);
          }}
          results={results}
          selectedIndex={selectedIndex}
          onHoverIndex={setSelectedIndex}
          onSelect={selectCandidate}
          loading={loading}
        />
      )}
    </div>
  );
}

export const AIChatTextareaWithMentions = forwardRef<
  HTMLTextAreaElement,
  AIChatTextareaWithMentionsProps
>(AIChatTextareaWithMentionsInner);
AIChatTextareaWithMentions.displayName = "AIChatTextareaWithMentions";

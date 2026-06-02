"use client";

/**
 * MentionSuggestionPopup — floating popup for the @mention suggestion.
 *
 * Rendered by ReactRenderer inside the Tiptap suggestion `render()` callback.
 * The element is appended to document.body and positioned via `fixed` CSS
 * derived from `props.clientRect()`.
 *
 * Two display modes:
 *   • Type-picker: query has no prefix → shows 4 entity-type rows.
 *   • Search results: query has `@a:|@s:|@c:|@p:` prefix → shows entity rows.
 *
 * Exposes `onKeyDown` imperatively for the suggestion plugin's key handler.
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import {
  ENTITY_TYPE_CONFIG,
  type MentionEntityType,
  type MentionSuggestionItem,
} from "@/lib/worklog/tiptap/mention-node";

export interface MentionSuggestionPopupHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface PopupProps {
  items: MentionSuggestionItem[];
  command: (item: MentionSuggestionItem) => void;
  clientRect?: (() => DOMRect | null) | null;
}

const TYPE_PREFIX_HINTS: Array<{ prefix: string; entityType: MentionEntityType; hint: string }> = [
  { prefix: "a", entityType: "asset", hint: "@a: Asset" },
  { prefix: "s", entityType: "skill", hint: "@s: Skill" },
  { prefix: "c", entityType: "company", hint: "@c: Company" },
  { prefix: "p", entityType: "contact", hint: "@p: Person" },
];

export const MentionSuggestionPopup = forwardRef<
  MentionSuggestionPopupHandle,
  PopupProps
>(function MentionSuggestionPopup({ items, command, clientRect }, ref) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset selection when items change.
  useEffect(() => {
    setSelectedIdx(0);
  }, [items]);

  // Scroll the selected item into view.
  useEffect(() => {
    const el = listRef.current?.children[selectedIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  useImperativeHandle(ref, () => ({
    onKeyDown(event: KeyboardEvent): boolean {
      if (event.key === "ArrowDown") {
        setSelectedIdx((i) => Math.min(i + 1, items.length - 1));
        return true;
      }
      if (event.key === "ArrowUp") {
        setSelectedIdx((i) => Math.max(i - 1, 0));
        return true;
      }
      if (event.key === "Enter") {
        const item = items[selectedIdx];
        if (item) {
          command(item);
          return true;
        }
        return false;
      }
      return false;
    },
  }));

  // Derive position from the trigger character's bounding rect.
  const rect = clientRect?.();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const r = clientRect?.();
    if (r) {
      const viewportH = window.innerHeight;
      const estimatedH = Math.min(items.length * 40 + 8, 260);
      const top =
        r.bottom + estimatedH > viewportH ? r.top - estimatedH - 4 : r.bottom + 4;
      setPos({ top, left: r.left });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rect?.top, rect?.left, rect?.bottom, items.length]);

  if (!pos || items.length === 0) return null;

  const isTypePicker = items[0]?.kind === "type-picker";

  return (
    <div
      style={{ top: pos.top, left: pos.left }}
      className="fixed z-[9999] min-w-[220px] max-w-xs overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
    >
      {isTypePicker && (
        <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide border-b border-border">
          Mention type
        </div>
      )}
      <div ref={listRef} className="max-h-60 overflow-y-auto py-1">
        {items.map((item, i) => {
          if (item.kind === "type-picker") {
            const config = ENTITY_TYPE_CONFIG[item.entityType];
            const hint = TYPE_PREFIX_HINTS.find((h) => h.prefix === item.prefix);
            return (
              <button
                key={item.prefix}
                type="button"
                onClick={() => command(item)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors",
                  i === selectedIdx
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground hover:bg-accent/50",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold",
                    config.color,
                  )}
                >
                  {config.badge}
                </span>
                <span className="flex-1 font-medium">{config.typeLabel}</span>
                <span className="text-xs text-muted-foreground font-mono">
                  {hint?.hint}
                </span>
              </button>
            );
          }

          // Entity search result
          const config = ENTITY_TYPE_CONFIG[item.entityType];
          return (
            <button
              key={item.entityId}
              type="button"
              onClick={() => command(item)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors",
                i === selectedIdx
                  ? "bg-accent text-accent-foreground"
                  : "text-foreground hover:bg-accent/50",
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold",
                  config.color,
                )}
              >
                {config.badge}
              </span>
              <span className="flex-1 truncate font-medium">{item.label}</span>
              {item.meta && (
                <span className="shrink-0 text-xs text-muted-foreground truncate max-w-[80px]">
                  {item.meta}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {!isTypePicker && items.length === 0 && (
        <div className="px-3 py-2 text-sm text-muted-foreground">No results</div>
      )}
    </div>
  );
});

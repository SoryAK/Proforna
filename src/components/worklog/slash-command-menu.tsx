/**
 * SlashCommandMenu — floating menu rendered when the user types `/` in
 * the worklog editor. Position is derived from the Suggestion plugin's
 * `clientRect` callback. The React root is mounted directly into a body-
 * level container so the menu floats above the editor without inheriting
 * any parent stacking context.
 */

"use client";

import { useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, forwardRef } from "react";
import type {
  SuggestionProps,
  SuggestionKeyDownProps,
  SuggestionOptions,
} from "@tiptap/suggestion";
import { createRoot, type Root } from "react-dom/client";
import { cn } from "@/lib/utils";
import { SLASH_COMMANDS, type SlashCommandItem } from "@/lib/worklog/tiptap/slash-commands";

interface MenuProps {
  items: SlashCommandItem[];
  onSelect: (item: SlashCommandItem) => void;
  rect: DOMRect | null;
}

export interface SlashMenuHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

/** Gap between the caret rect and the menu edge in either placement. */
const CARET_GAP = 6;
/** Min margin from viewport edge before we consider the menu "overflowing". */
const VIEWPORT_MARGIN = 12;

const SlashCommandMenu = forwardRef<SlashMenuHandle, MenuProps>(function SlashCommandMenu(
  { items, onSelect, rect },
  ref,
) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

  // --- Hover/keyboard arbitration (option B from UI/UX review) -------------
  // `onMouseEnter` fires whenever the cursor happens to be over the menu,
  // including when the menu re-renders under a stationary cursor — this
  // fights with arrow-key navigation. We only let hover update the
  // selection AFTER the user has actually moved the mouse this session.
  const mouseActiveRef = useRef(false);
  const lastMouseRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    // Each new suggestion session (items identity change on first render
    // of a fresh menu) starts in "keyboard-only" mode.
    mouseActiveRef.current = false;
    lastMouseRef.current = null;
  }, [items]);

  // --- Viewport-aware placement (flip above when bottom overflows) ---------
  const [placement, setPlacement] = useState<"below" | "above">("below");
  const [menuHeight, setMenuHeight] = useState<number>(0);
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || !rect) return;
    const h = el.offsetHeight;
    setMenuHeight(h);
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - VIEWPORT_MARGIN;
    if (spaceBelow < h && spaceAbove > spaceBelow) {
      setPlacement("above");
    } else {
      setPlacement("below");
    }
  }, [rect, items]);

  // Reset selection when the filter set changes so the highlight always
  // points at a valid row.
  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  // Scroll the active row into view inside the menu.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLButtonElement>(
      `[data-slash-index="${selectedIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown({ event }) {
        if (items.length === 0) {
          // Let Esc close even when nothing is filtered in.
          return event.key === "Escape";
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === "ArrowUp") {
          setSelectedIndex((i) => (i - 1 + items.length) % items.length);
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          const item = items[selectedIndex];
          if (item) onSelect(item);
          return true;
        }
        if (event.key === "Escape") {
          return true;
        }
        return false;
      },
    }),
    [items, selectedIndex, onSelect],
  );

  if (!rect) return null;

  const top =
    placement === "above"
      ? Math.round(rect.top + window.scrollY - menuHeight - CARET_GAP)
      : Math.round(rect.bottom + window.scrollY + CARET_GAP);

  const style: React.CSSProperties = {
    position: "absolute",
    top,
    left: Math.round(rect.left + window.scrollX),
    zIndex: 60,
  };

  const activeOptionId = items[selectedIndex] ? `${listboxId}-opt-${items[selectedIndex].id}` : undefined;

  return (
    <div
      ref={listRef}
      style={style}
      id={listboxId}
      role="listbox"
      aria-activedescendant={activeOptionId}
      onMouseMove={(e) => {
        const prev = lastMouseRef.current;
        const curr = { x: e.clientX, y: e.clientY };
        if (prev && (prev.x !== curr.x || prev.y !== curr.y)) {
          mouseActiveRef.current = true;
        }
        lastMouseRef.current = curr;
      }}
      className={cn(
        "w-72 max-h-72 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md",
        "text-sm flex flex-col",
      )}
    >
      <div className="flex-1 overflow-y-auto p-1">
        {items.length === 0 ? (
          <div className="px-2 py-3 text-xs text-muted-foreground">
            <div className="font-medium text-foreground">No matching commands</div>
            <div className="mt-1">
              Try{" "}
              {SLASH_COMMANDS.slice(0, 3).map((c, i) => (
                <span key={c.id}>
                  {i > 0 ? ", " : ""}
                  <code className="rounded bg-muted px-1 py-0.5 text-[10px]">/{c.id}</code>
                </span>
              ))}
            </div>
          </div>
        ) : (
          items.map((item, idx) => {
            const Icon = item.icon;
            const active = idx === selectedIndex;
            return (
              <button
                key={item.id}
                id={`${listboxId}-opt-${item.id}`}
                type="button"
                data-slash-index={idx}
                role="option"
                aria-selected={active}
                onMouseDown={(e) => {
                  // Prevent the editor losing focus before we run the command.
                  e.preventDefault();
                  onSelect(item);
                }}
                onMouseEnter={() => {
                  if (mouseActiveRef.current) setSelectedIndex(idx);
                }}
                className={cn(
                  "flex w-full items-start gap-2 rounded px-2 py-1.5 text-left",
                  active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                )}
              >
                <Icon className="mt-0.5 size-4 shrink-0 opacity-70" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium leading-tight">{item.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{item.description}</div>
                </div>
              </button>
            );
          })
        )}
      </div>
      <div
        className="flex items-center gap-3 border-t bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground"
        aria-hidden
      >
        <span><kbd className="rounded border bg-background px-1">↑↓</kbd> Navigate</span>
        <span><kbd className="rounded border bg-background px-1">↵</kbd> Select</span>
        <span><kbd className="rounded border bg-background px-1">Esc</kbd> Close</span>
      </div>
    </div>
  );
});

export { SlashCommandMenu };

/**
 * Build the `render` factory expected by `@tiptap/suggestion`. The factory
 * is called once per active suggestion session and must return the lifecycle
 * handlers. We mount our React menu into a detached div, then unmount it on
 * exit. This keeps the editor decoupled from React render trees and lets
 * the menu live at the document root.
 */
export function createSlashCommandRender(): SuggestionOptions<SlashCommandItem>["render"] {
  return () => {
    let container: HTMLDivElement | null = null;
    let root: Root | null = null;
    const handleRef: { current: SlashMenuHandle | null } = { current: null };

    function mount(props: SuggestionProps<SlashCommandItem>) {
      container = document.createElement("div");
      // Container is just an anchor for the React root; portal places the
      // visible DOM in document.body.
      document.body.appendChild(container);
      root = createRoot(container);
      renderMenu(props);
    }

    function renderMenu(props: SuggestionProps<SlashCommandItem>) {
      if (!root) return;
      const rect = props.clientRect ? props.clientRect() : null;
      root.render(
        <SlashCommandMenu
          ref={(h) => {
            handleRef.current = h;
          }}
          items={props.items}
          rect={rect}
          onSelect={(item) => {
            props.command(item);
          }}
        />,
      );
    }

    function unmount() {
      root?.unmount();
      root = null;
      container?.remove();
      container = null;
      handleRef.current = null;
    }

    return {
      onStart(props) {
        mount(props);
      },
      onUpdate(props) {
        renderMenu(props);
      },
      onKeyDown(props) {
        return handleRef.current?.onKeyDown(props) ?? false;
      },
      onExit() {
        unmount();
      },
    };
  };
}

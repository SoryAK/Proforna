/**
 * SlashCommandMenu — floating menu rendered when the user types `/` in
 * the worklog editor. Position is derived from the Suggestion plugin's
 * `clientRect` callback. The React root is mounted directly into a body-
 * level container so the menu floats above the editor without inheriting
 * any parent stacking context.
 */

"use client";

import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import type {
  SuggestionProps,
  SuggestionKeyDownProps,
  SuggestionOptions,
} from "@tiptap/suggestion";
import { createRoot, type Root } from "react-dom/client";
import { cn } from "@/lib/utils";
import type { SlashCommandItem } from "@/lib/worklog/tiptap/slash-commands";

interface MenuProps {
  items: SlashCommandItem[];
  onSelect: (item: SlashCommandItem) => void;
  rect: DOMRect | null;
}

export interface SlashMenuHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

const SlashCommandMenu = forwardRef<SlashMenuHandle, MenuProps>(function SlashCommandMenu(
  { items, onSelect, rect },
  ref,
) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

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
        if (event.key === "Enter") {
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

  // Position just under the caret line. Add 6px gap.
  const style: React.CSSProperties = {
    position: "absolute",
    top: Math.round(rect.bottom + window.scrollY + 6),
    left: Math.round(rect.left + window.scrollX),
    zIndex: 60,
  };

  return (
    <div
      ref={listRef}
      style={style}
      className={cn(
        "w-72 max-h-72 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
        "text-sm",
      )}
      role="listbox"
    >
      {items.length === 0 ? (
        <div className="px-2 py-2 text-xs text-muted-foreground">No matching commands</div>
      ) : (
        items.map((item, idx) => {
          const Icon = item.icon;
          const active = idx === selectedIndex;
          return (
            <button
              key={item.id}
              type="button"
              data-slash-index={idx}
              role="option"
              aria-selected={active}
              onMouseDown={(e) => {
                // Prevent the editor losing focus before we run the command.
                e.preventDefault();
                onSelect(item);
              }}
              onMouseEnter={() => setSelectedIndex(idx)}
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

"use client";

/**
 * ADR-0046 Phase C.3 — presentational @-mention picker.
 *
 * Owns no business logic: parent passes results + selected index, picker
 * renders. Scope chips at the top let the user switch between the four
 * Phase C entity types (job / skill / worklog / contact). Keyboard nav
 * is parent-driven; clicks here just dispatch onSelect / onTypeChange.
 *
 * Visual parity with the slash-command picker already shipped in Phase B
 * (border + bg-popover + rounded-md, orange-500/15 highlight band).
 */
import { Briefcase, Wrench, FileText, User as UserIcon } from "lucide-react";

import type { MentionType } from "@/lib/ai-chat-mentions";

export interface MentionCandidate {
  id: string;
  type: MentionType;
  label: string;
  secondary: string;
  score: number;
}

interface ScopeOption {
  id: MentionType;
  label: string;
  icon: typeof Briefcase;
}

const SCOPE_OPTIONS: ScopeOption[] = [
  { id: "job", label: "Jobs", icon: Briefcase },
  { id: "skill", label: "Skills", icon: Wrench },
  { id: "worklog", label: "Notes", icon: FileText },
  { id: "contact", label: "People", icon: UserIcon },
];

interface AIChatMentionPickerProps {
  type: MentionType;
  onTypeChange: (type: MentionType) => void;
  results: MentionCandidate[];
  selectedIndex: number;
  onHoverIndex: (index: number) => void;
  onSelect: (candidate: MentionCandidate) => void;
  loading: boolean;
}

export function AIChatMentionPicker({
  type,
  onTypeChange,
  results,
  selectedIndex,
  onHoverIndex,
  onSelect,
  loading,
}: AIChatMentionPickerProps) {
  return (
    <div
      className="absolute bottom-full left-3 right-3 mb-2 z-10 rounded-md border bg-popover shadow-lg overflow-hidden"
      role="listbox"
      aria-label="Mention picker"
    >
      {/* Scope chip row — switches the search type without closing the picker. */}
      <div className="flex items-center gap-1 border-b bg-muted/40 px-2 py-1.5">
        {SCOPE_OPTIONS.map((scope) => {
          const Icon = scope.icon;
          const active = scope.id === type;
          return (
            <button
              key={scope.id}
              type="button"
              onClick={() => onTypeChange(scope.id)}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                active
                  ? "bg-orange-500/20 text-orange-700 dark:text-orange-300"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              aria-pressed={active}
            >
              <Icon className="h-2.5 w-2.5" />
              <span>{scope.label}</span>
            </button>
          );
        })}
      </div>

      {/* Result list. */}
      {loading ? (
        <div className="px-3 py-3 text-xs text-muted-foreground">Searching…</div>
      ) : results.length === 0 ? (
        <div className="px-3 py-3 text-xs text-muted-foreground">
          No matches. Try a different query or scope.
        </div>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          {results.map((candidate, i) => (
            <button
              key={`${candidate.type}:${candidate.id}`}
              type="button"
              // Prevent the textarea from losing focus before the click
              // handler fires — textareas lose focus on mousedown, which
              // would tear down the picker before the click is processed.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(candidate)}
              onMouseEnter={() => onHoverIndex(i)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                i === selectedIndex ? "bg-orange-500/15" : "hover:bg-muted"
              }`}
              role="option"
              aria-selected={i === selectedIndex}
            >
              <span className="truncate text-xs font-medium">
                {candidate.label}
              </span>
              {candidate.secondary && (
                <span className="truncate text-[10px] text-muted-foreground">
                  {candidate.secondary}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

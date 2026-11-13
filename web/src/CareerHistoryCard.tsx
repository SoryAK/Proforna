import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { ScrollableArea } from "@astryxdesign/core/ScrollableArea";
import { Heading } from "@astryxdesign/core/Text";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import {
  flagIdenticalRoles,
  formatHistoryGist,
  formatHistoryPeriod,
  formatHistoryPlace,
  type CareerHistorySectionKey,
} from "@core/career-history";
import type { WorkMapRole } from "@core/work-map";
import { ArrowLeft, Plus, SquareCheck } from "lucide-react";
import {
  addKindLabel,
  CareerHistoryAddMenu,
  createCareerHistoryRole,
} from "./CareerHistoryAddMenu";
import "./career-history-card.css";

export function CareerHistoryCard({
  revision = 0,
  focusRoleId,
  onBack,
  onImport,
  onAsk,
  onAdded,
  onRemoved,
  onSelectionChange,
  release,
  attach,
  selectedRoleIds,
  onAttachApplied,
}: {
  revision?: number;
  focusRoleId?: string | null;
  onBack: () => void;
  onImport: () => void;
  onAsk: () => void;
  onAdded?: () => void;
  onRemoved?: (ids: string[]) => void;
  onSelectionChange?: (roles: WorkMapRole[]) => void;
  release?: { id: string; nonce: number } | null;
  attach?: { id: string; nonce: number } | null;
  selectedRoleIds?: readonly string[];
  onAttachApplied?: (nonce: number) => void;
}) {
  const [roles, setRoles] = useState<WorkMapRole[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [sortOpen, setSortOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selecting, setSelecting] = useState((selectedRoleIds?.length ?? 0) > 0);
  const [checked, setChecked] = useState<Set<string>>(() => new Set(selectedRoleIds ?? []));
  const [removeAsk, setRemoveAsk] = useState<{ ids: string[]; detail: string } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(focusRoleId ?? null);
  const [note, setNote] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [creatingKind, setCreatingKind] = useState<CareerHistorySectionKey | null>(null);
  const sortRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLDivElement>(null);
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  const onAttachAppliedRef = useRef(onAttachApplied);
  onAttachAppliedRef.current = onAttachApplied;

  async function load() {
    const response = await fetch("/api/work-map");
    if (!response.ok) {
      setError("Career history could not be loaded.");
      return;
    }
    const body = (await response.json()) as { roles?: WorkMapRole[] };
    setRoles(body.roles ?? []);
    setError("");
  }

  useEffect(() => {
    void load().finally(() => setReady(true));
  }, [revision]);

  useEffect(() => {
    if (focusRoleId) setFocusId(focusRoleId);
  }, [focusRoleId]);

  useEffect(() => {
    if (!release) return;
    setChecked((current) => {
      if (!current.has(release.id)) return current;
      const next = new Set(current);
      next.delete(release.id);
      return next;
    });
  }, [release]);

  useEffect(() => {
    if (!attach) return;
    setSelecting(true);
    setChecked((current) => {
      if (current.has(attach.id)) return current;
      const next = new Set(current);
      next.add(attach.id);
      return next;
    });
    onAttachAppliedRef.current?.(attach.nonce);
  }, [attach]);

  useEffect(() => {
    if (!ready) return;
    onSelectionChangeRef.current?.(roles.filter((role) => checked.has(role.id)));
  }, [checked, roles, ready]);

  useEffect(() => {
    if (!sortOpen) return;
    function onPointer(event: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(event.target as Node)) setSortOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSortOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [sortOpen]);

  useEffect(() => {
    if (!moreOpen) return;
    function onPointer(event: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) setMoreOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMoreOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  useEffect(() => {
    if (!addOpen) return;
    function onPointer(event: MouseEvent) {
      if (addRef.current && !addRef.current.contains(event.target as Node)) setAddOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setAddOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [addOpen]);

  async function addRole(kind: CareerHistorySectionKey) {
    setCreatingKind(kind);
    setNote("");
    const id = await createCareerHistoryRole(kind);
    setCreatingKind(null);
    if (!id) {
      setNote("Could not add that role.");
      return;
    }
    setNote(`${addKindLabel(kind)} added.`);
    await load();
    onAdded?.();
  }

  const ordered = useMemo(
    () =>
      [...roles].sort((a, b) =>
        sort === "newest" ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate),
      ),
    [roles, sort],
  );
  const needle = query.trim().toLowerCase();
  const shown = ordered.filter((role) => {
    if (!needle) return true;
    return `${role.organization} ${role.title} ${formatHistoryPlace(role)}`.toLowerCase().includes(needle);
  });
  const shownIds = shown.map((role) => role.id);
  const identicalExtraIds = useMemo(
    () =>
      [...flagIdenticalRoles(roles).entries()]
        .filter(([, flag]) => flag.count > 1 && !flag.keeper)
        .map(([id]) => id),
    [roles],
  );
  const focus = roles.find((role) => role.id === focusId) ?? null;

  function stopSelecting() {
    setSelecting(false);
    setChecked(new Set());
    setRemoveAsk(null);
  }

  function toggleChecked(id: string) {
    setRemoveAsk(null);
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectShown(ids: string[]) {
    setRemoveAsk(null);
    setChecked((current) => {
      const next = new Set(current);
      const allOn = ids.length > 0 && ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allOn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  async function removeChecked(ids: string[]) {
    setRemoving(true);
    const failed: string[] = [];
    for (const id of ids) {
      const response = await fetch(`/api/work-map/roles/${id}`, { method: "DELETE" });
      if (!response.ok) failed.push(id);
    }
    setRemoving(false);
    setRemoveAsk(null);
    setChecked((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (!failed.includes(id)) next.delete(id);
      }
      return next;
    });
    const removed = ids.filter((id) => !failed.includes(id));
    if (focusId && removed.includes(focusId)) setFocusId(null);
    if (removed.length > 0) onRemoved?.(removed);
    setNote(
      failed.length === 0
        ? ids.length === 1
          ? "Role removed."
          : `${ids.length} roles removed.`
        : failed.length === ids.length
          ? "Could not remove those roles."
          : `Removed ${ids.length - failed.length}. ${failed.length} could not be removed.`,
    );
    await load();
  }

  return (
    <div className="pch">
      {focus ? (
        <ScrollableArea className="pch-view is-role" label="Role">
          <div className="pch-bar">
            <Button label="History" variant="secondary" size="sm" className="pch-history-back" onClick={() => setFocusId(null)} />
          </div>
          <article className="pch-role">
            <h2>{focus.organization || focus.title || "Untitled"}</h2>
            {focus.organization && focus.title ? <p>{focus.title}</p> : null}
            <p>
              {[
                formatHistoryPlace(focus),
                formatHistoryPeriod(focus.startDate, focus.endDate, focus.isCurrent),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {focus.details.summary.trim() ? <p>{focus.details.summary.trim()}</p> : null}
          </article>
        </ScrollableArea>
      ) : (
        <div className="pch-view">
          <Toolbar
            className="pch-toolbar"
            label="Career history"
            size="sm"
            dividers={["bottom"]}
            startContent={
              <>
                <button className="pch-back" type="button" aria-label="Back" onClick={onBack}>
                  <Icon icon={ArrowLeft} size="sm" />
                </button>
                <Heading level={4}>Career history</Heading>
              </>
            }
            endContent={
              <>
                <div className="pch-more" ref={moreRef}>
                  <button
                    className="pch-tool"
                    type="button"
                    aria-label="More"
                    aria-haspopup="menu"
                    aria-expanded={moreOpen}
                    onClick={() => {
                      setSortOpen(false);
                      setMoreOpen((open) => !open);
                    }}
                  >
                    <svg className="pch-more-mark" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="6" cy="12" r="1.6" />
                      <circle cx="12" cy="12" r="1.6" />
                      <circle cx="18" cy="12" r="1.6" />
                    </svg>
                  </button>
                  {moreOpen ? (
                    <div className="pch-more-menu" role="menu" aria-label="More">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMoreOpen(false);
                          onImport();
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M12 3.5v10" />
                          <path d="m8 9.5 4 4 4-4" />
                          <path d="M5 16.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5" />
                        </svg>
                        Import
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="pch-sort" ref={sortRef}>
                  <button
                    className="pch-tool"
                    type="button"
                    aria-label="Sort"
                    aria-haspopup="menu"
                    aria-expanded={sortOpen}
                    onClick={() => {
                      setMoreOpen(false);
                      setSortOpen((open) => !open);
                    }}
                  >
                    <Icon className="pch-mark" icon="funnel" size="sm" />
                  </button>
                  {sortOpen ? (
                    <div className="pch-sort-menu" role="menu" aria-label="Sort">
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={sort === "newest"}
                        onClick={() => {
                          setSort("newest");
                          setSortOpen(false);
                        }}
                      >
                        Newest
                      </button>
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={sort === "oldest"}
                        onClick={() => {
                          setSort("oldest");
                          setSortOpen(false);
                        }}
                      >
                        Oldest
                      </button>
                    </div>
                  ) : null}
                </div>
                <button
                  className="pch-tool"
                  type="button"
                  aria-label="Search career history"
                  aria-pressed={findOpen}
                  onClick={() => {
                    setSortOpen(false);
                    setFindOpen((open) => {
                      if (open) setQuery("");
                      return !open;
                    });
                  }}
                >
                  <Icon className="pch-mark" icon="search" size="sm" />
                </button>
                <button
                  className="pch-tool"
                  type="button"
                  aria-label={selecting ? "Done selecting" : "Select"}
                  aria-pressed={selecting}
                  onClick={() => {
                    setSortOpen(false);
                    if (selecting) stopSelecting();
                    else setSelecting(true);
                  }}
                >
                  <Icon icon={SquareCheck} size="sm" />
                </button>
                <div className="history-tool-group">
                  <div className="history-menu" ref={addRef}>
                    <Button
                      label="New"
                      icon={<Icon icon={Plus} />}
                      isIconOnly
                      aria-keyshortcuts="Control+N"
                      aria-haspopup="menu"
                      aria-expanded={addOpen}
                      isDisabled={creatingKind !== null}
                      onClick={() => {
                        setSortOpen(false);
                        setMoreOpen(false);
                        setAddOpen((open) => !open);
                      }}
                    />
                    {addOpen ? (
                      <CareerHistoryAddMenu
                        onChoose={(kind) => {
                          setAddOpen(false);
                          void addRole(kind);
                        }}
                      />
                    ) : null}
                  </div>
                </div>
              </>
            }
          />
          {selecting ? (
            <Toolbar
              className="pch-bulk"
              label="Career history actions"
              size="sm"
              variant="muted"
              dividers={["bottom"]}
              startContent={
                removeAsk ? (
                  <>
                    <span className="pch-note">{removeAsk.detail}</span>
                    <Button
                      label="Remove"
                      variant="destructive"
                      size="sm"
                      isLoading={removing}
                      onClick={() => void removeChecked(removeAsk.ids)}
                    />
                    <Button
                      label="Keep"
                      variant="ghost"
                      size="sm"
                      isDisabled={removing}
                      onClick={() => setRemoveAsk(null)}
                    />
                  </>
                ) : (
                  <>
                    <Badge label={checked.size === 0 ? "Select roles" : `${checked.size} selected`} />
                    <Button
                      label={shownIds.length > 0 && shownIds.every((id) => checked.has(id)) ? "Clear shown" : "Select shown"}
                      variant="ghost"
                      size="sm"
                      isDisabled={shownIds.length === 0}
                      onClick={() => selectShown(shownIds)}
                    />
                    {identicalExtraIds.length > 0 ? (
                      <Button
                        label="Select identical"
                        variant="ghost"
                        size="sm"
                        onClick={() => selectShown(identicalExtraIds)}
                      />
                    ) : null}
                    <Button label="Ask" variant="ghost" size="sm" isDisabled={checked.size === 0} onClick={onAsk} />
                    <Button
                      label="Remove"
                      variant="destructive"
                      size="sm"
                      isDisabled={checked.size === 0}
                      onClick={() => {
                        if (checked.size === 0) return;
                        setRemoveAsk({
                          ids: [...checked],
                          detail:
                            checked.size === 1
                              ? "Remove this role? Its sites and photos on this machine go with it."
                              : `Remove ${checked.size} roles? Their sites and photos on this machine go with them.`,
                        });
                      }}
                    />
                  </>
                )
              }
            />
          ) : null}
          {findOpen ? (
            <div className="pch-find">
              <input
                type="search"
                value={query}
                placeholder="Search"
                aria-label="Search career history"
                autoFocus
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setQuery("");
                    setFindOpen(false);
                  }
                }}
              />
            </div>
          ) : null}
          {note ? <p className="pch-status">{note}</p> : null}
          {error ? <p className="pch-status">{error}</p> : null}
          <ScrollableArea className="pch-groups pch-frame" label="Roles">
            {groups(shown).map((group) => (
              <section key={group.label}>
                <h3>
                  {group.label} ({group.roles.length})
                </h3>
                <ul>
                  {group.roles.map((role) => (
                    <li key={role.id}>
                      {selecting ? (
                        <div className="pch-entry">
                          <label className="pch-check">
                            <input
                              type="checkbox"
                              checked={checked.has(role.id)}
                              aria-label={`Select ${role.organization || role.title || "Untitled"}`}
                              onChange={() => toggleChecked(role.id)}
                            />
                          </label>
                          <RoleButton role={role} onOpen={() => setFocusId(role.id)} />
                        </div>
                      ) : (
                        <RoleButton role={role} onOpen={() => setFocusId(role.id)} />
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {ready && shown.length === 0 ? <p className="pch-empty">No roles match.</p> : null}
          </ScrollableArea>
        </div>
      )}
    </div>
  );
}

function RoleButton({ role, onOpen }: { role: WorkMapRole; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen}>
      <span>
        <strong>
          {role.organization || role.title || "Untitled"}
          {role.isCurrent ? <mark>Current</mark> : null}
        </strong>
        {role.organization && role.title ? <b>{role.title}</b> : null}
        {formatHistoryGist(role) ? <small>{formatHistoryGist(role)}</small> : null}
      </span>
    </button>
  );
}

function groups(roles: WorkMapRole[]) {
  return [
    { label: "Jobs", roles: roles.filter((role) => role.kind === "job") },
    { label: "Internships", roles: roles.filter((role) => role.kind === "internship") },
    { label: "Education", roles: roles.filter((role) => role.kind === "school") },
  ].filter((group) => group.roles.length > 0);
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Share2 } from "lucide-react";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import {
  ACCESS_MESSAGE_MAX,
  ACCESS_SECTION_LABEL,
  describeActivity,
  isOpenActivity,
  type AccessActivity,
  type AccessLength,
  type AccessState,
} from "@core/access";
import type { WorkMapPublishSection } from "@core/work-map";
import { Quote, growRows, matches, nearLimit, shortDate } from "./list-parts";
import "./access.css";

/** Fired after something changes who has access, so the Relay menu refreshes. */
export const ACCESS_CHANGED = "docier:access-changed";
/** Ask Home to open Access, e.g. from an approved request. */
export const OPEN_ACCESS = "docier:open-access";

export function openAccess(focusId?: string, share?: boolean) {
  window.dispatchEvent(new CustomEvent(OPEN_ACCESS, { detail: { id: focusId, share } }));
}

export type AccessPerson = {
  id: string;
  slug: string;
  name: string;
  email: string;
  named: boolean;
  source: "asked" | "shared";
  sections: WorkMapPublishSection[];
  wholePage: boolean;
  pageSections: WorkMapPublishSection[];
  expiresAt: string;
  untilRevoked: boolean;
  state: AccessState;
  link: string | null;
  openCount: number;
  lastOpenedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  activity: AccessActivity[];
};

type AccessPage = {
  slug: string;
  sections: WorkMapPublishSection[];
  visibility: string;
  published: boolean;
};

type Listed = { page: AccessPage | null; people: AccessPerson[]; stale: boolean; relayConfigured: boolean };

const ERRORS: Record<string, string> = {
  "name-required": "Add their name.",
  "email-invalid": "Add a valid email address.",
  "sections-required": "Choose at least one part of the page.",
  "sections-invalid": "One of those parts isn't on your page any more. Choose again.",
  "length-invalid": "Choose how long the link lasts.",
  "message-too-long": "That message is too long.",
  "page-not-published": "Publish your page first, then share it.",
  "access-ended": "Their access has ended. Use Give access again.",
  "link-unavailable": "This link was made before Docier kept links, so it can't be shown again. Revoke it and give access again.",
  "relay-unavailable": "The Relay couldn't be reached, so nothing changed. Try again.",
  "not-connected": "Connect Gmail in Settings to draft emails.",
  "already-shared": "That email already has a link.",
};

async function loadAccess(): Promise<Listed> {
  const response = await fetch("/api/access");
  if (!response.ok) throw new Error("access");
  return (await response.json()) as Listed;
}

const isActive = (person: AccessPerson) => person.state === "active" || person.state === "ending";

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function until(person: Pick<AccessPerson, "untilRevoked" | "expiresAt">): string {
  return person.untilRevoked ? "until you revoke it" : `until ${shortDate(person.expiresAt)}`;
}

/** What a link opens, listing only what this person has: "Whole page" or "Profile, Career history and Map". */
function scope(person: AccessPerson): string {
  if (person.wholePage || person.sections.length === person.pageSections.length) return "Whole page";
  const names = person.sections.map((section) => ACCESS_SECTION_LABEL[section]);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : (names[0] ?? "Nothing");
}

/** The short form for a folded card: "Whole page" or "3 of 8 sections". */
function summary(person: AccessPerson): string {
  if (person.wholePage || person.sections.length === person.pageSections.length) return "Whole page";
  return `${person.sections.length} of ${person.pageSections.length} sections`;
}

function opens(person: AccessPerson): string {
  if (person.openCount === 0) return "Not opened yet";
  const last = person.lastOpenedAt ? ` · last ${shortDate(person.lastOpenedAt)}` : "";
  return person.openCount === 1 ? `Opened once${last}` : `Opened ${person.openCount} times${last}`;
}

function stateBadge(person: AccessPerson) {
  switch (person.state) {
    case "active":
      return <Badge label="Active" variant="success" />;
    case "ending":
      return <Badge label={`Ends ${shortDate(person.expiresAt)}`} variant="warning" />;
    case "expired":
      return <Badge label={`Expired ${shortDate(person.expiresAt)}`} variant="neutral" />;
    case "revoked":
      return <Badge label={`Revoked ${person.revokedAt ? shortDate(person.revokedAt) : ""}`.trim()} variant="error" />;
  }
}

/** Keeps the Access list fresh for the Relay menu. */
export function useAccess(active: boolean) {
  const [listed, setListed] = useState<Listed | null>(null);
  const refresh = useCallback(async () => {
    try {
      setListed(await loadAccess());
    } catch {
      /* the menu shows nothing rather than an error */
    }
  }, []);
  useEffect(() => {
    if (!active) return;
    void refresh();
    window.addEventListener(ACCESS_CHANGED, refresh);
    return () => window.removeEventListener(ACCESS_CHANGED, refresh);
  }, [active, refresh]);
  return listed;
}

/** "People with access" in the Relay menu: a short preview with the way in. */
export function AccessMenuSection({ onManage }: { onManage: () => void }) {
  const listed = useAccess(true);
  if (!listed?.page?.published) return null;
  const active = listed.people.filter(isActive);
  return (
    <div className="access-menu">
      <p className="home-sync-setting">People with access{active.length ? ` · ${active.length}` : ""}</p>
      {active.length === 0 ? (
        <p className="home-sync-address-gap">Nobody has a link yet.</p>
      ) : (
        <ul className="access-menu-list">
          {active.slice(0, 3).map((person) => (
            <li key={person.id}>
              <span className="access-menu-who">
                <span>{person.name}</span>
                <span className="access-menu-scope">
                  {summary(person)} · {until(person)}
                </span>
              </span>
              {person.state === "ending" ? <Badge label="Ends soon" variant="warning" /> : null}
            </li>
          ))}
        </ul>
      )}
      <div className="access-menu-actions">
        <button type="button" onClick={onManage}>
          Manage access
        </button>
      </div>
    </div>
  );
}

export const LENGTH_OPTIONS: Array<{ value: string; days: AccessLength; label: string }> = [
  { value: "7", days: 7, label: "7 days" },
  { value: "30", days: 30, label: "30 days" },
  { value: "90", days: 90, label: "90 days" },
  { value: "none", days: null, label: "Until I revoke it" },
];

export type AccessChoiceValue = { sections: WorkMapPublishSection[]; length: string; message: string };

export function defaultChoice(page: readonly WorkMapPublishSection[]): AccessChoiceValue {
  return { sections: [...page], length: "30", message: "" };
}

/** The request body for a choice: every section the page has means the whole page. */
export function choiceBody(choice: AccessChoiceValue, page: readonly WorkMapPublishSection[]) {
  const option = LENGTH_OPTIONS.find((item) => item.value === choice.length) ?? LENGTH_OPTIONS[1]!;
  return {
    sections: choice.sections.length === page.length ? null : page.filter((section) => choice.sections.includes(section)),
    days: option.days,
    message: choice.message,
  };
}

/** What someone can see and for how long, plus an optional message. Used to share, change, and approve. */
export function AccessChoice({
  page,
  value,
  onChange,
  who,
  messageLabel,
}: {
  page: readonly WorkMapPublishSection[];
  value: AccessChoiceValue;
  onChange: (next: AccessChoiceValue) => void;
  who: string;
  messageLabel?: string;
}) {
  return (
    <VStack gap={3}>
      <div>
        <Text type="label">What {who} can see</Text>
        <div className="access-checks">
          {page.map((section) => (
            <CheckboxInput
              key={section}
              label={ACCESS_SECTION_LABEL[section]}
              value={value.sections.includes(section)}
              onChange={(checked) =>
                onChange({
                  ...value,
                  sections: checked
                    ? [...value.sections, section]
                    : value.sections.filter((item) => item !== section),
                })
              }
            />
          ))}
        </div>
      </div>
      <SegmentedControl
        label="For"
        size="sm"
        value={value.length}
        onChange={(length) => onChange({ ...value, length })}
      >
        {LENGTH_OPTIONS.map((option) => (
          <SegmentedControlItem key={option.value} value={option.value} label={option.label} />
        ))}
      </SegmentedControl>
      <TextArea
        label={messageLabel ?? `Message to ${who} (optional)`}
        value={value.message}
        onChange={(message) => onChange({ ...value, message: message.slice(0, ACCESS_MESSAGE_MAX) })}
        rows={growRows(value.message, 2, 8)}
        maxLength={nearLimit(value.message, ACCESS_MESSAGE_MAX)}
      />
    </VStack>
  );
}

const ACTIVITY_FILTERS: Array<{ id: string; label: string; match: (entry: AccessActivity) => boolean }> = [
  { id: "all", label: "All", match: () => true },
  { id: "yours", label: "Answers & changes", match: (entry) => !isOpenActivity(entry) },
  { id: "opens", label: "Opens", match: isOpenActivity },
];

/** Everything that happened on someone's access, newest first, four at a time. */
export function ActivityList({ activity, name }: { activity: AccessActivity[]; name: string }) {
  const [filter, setFilter] = useState("all");
  const [all, setAll] = useState(false);
  const shown = activity.filter(ACTIVITY_FILTERS.find((item) => item.id === filter)!.match);
  const visible = all ? shown : shown.slice(0, 4);
  const hidden = shown.length - 4;
  const hasOpens = activity.some(isOpenActivity);
  return (
    <div className="access-activity">
      <div className="access-activity-head">
        <Text type="label">
          Activity <span className="access-faint">· newest first</span>
        </Text>
        {hasOpens ? (
          <SegmentedControl label="Show" size="sm" value={filter} onChange={setFilter}>
            {ACTIVITY_FILTERS.map((item) => (
              <SegmentedControlItem
                key={item.id}
                value={item.id}
                label={`${item.label} · ${activity.filter(item.match).length}`}
              />
            ))}
          </SegmentedControl>
        ) : null}
      </div>
      <ol className="access-timeline">
        {visible.map((entry) => (
          <li key={entry.id} className={`is-${entry.kind}`}>
            <span className="access-when">
              {new Date(entry.occurredAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
            <span className="access-what">{describeActivity(entry, firstName(name))}</span>
            {entry.message ? <Quote text={entry.message} /> : null}
          </li>
        ))}
      </ol>
      {hidden > 0 ? (
        <button type="button" className="req-more" onClick={() => setAll((value) => !value)}>
          {all ? "Show less" : `Show earlier (${hidden})`}
        </button>
      ) : null}
    </div>
  );
}

type Editing =
  | { mode: "change"; person: AccessPerson }
  | { mode: "restore"; person: AccessPerson }
  | null;

const ACTIVE_FILTERS: Array<{ id: string; label: string; match: (person: AccessPerson) => boolean }> = [
  { id: "all", label: "All", match: () => true },
  { id: "ending", label: "Ends soon", match: (person) => person.state === "ending" },
  { id: "unopened", label: "Not opened", match: (person) => person.openCount === 0 },
];
const ENDED_FILTERS: Array<{ id: string; label: string; match: (person: AccessPerson) => boolean }> = [
  { id: "all", label: "All", match: () => true },
  { id: "revoked", label: "Revoked", match: (person) => person.state === "revoked" },
  { id: "expired", label: "Expired", match: (person) => person.state === "expired" },
];

/** Everyone with a link to the page: what they see, for how long, and what happened. */
export function AccessDialog({
  isOpen,
  focusId,
  startSharing,
  onClose,
}: {
  isOpen: boolean;
  focusId: string | null;
  startSharing: boolean;
  onClose: () => void;
}) {
  const [listed, setListed] = useState<Listed | null>(null);
  const [tab, setTab] = useState<"active" | "ended">("active");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [canSee, setCanSee] = useState("any");
  const [sharing, setSharing] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  // One person open at a time; their Activity shows only when asked for.
  const [openId, setOpenId] = useState<string | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const [openActivity, setOpenActivity] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "revoke" | "remove"; person: AccessPerson } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [gmail, setGmail] = useState(false);
  const focusRef = useRef<HTMLLIElement>(null);

  const refresh = useCallback(async () => {
    try {
      setListed(await loadAccess());
    } catch {
      setError("Access could not be loaded.");
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setError("");
    setMessage("");
    setSharing(startSharing);
    setEditing(null);
    setOpenId(focusId);
    setOpenActivity(null);
    setTab("active");
    setFilter("all");
    void refresh();
    void fetch("/api/gmail")
      .then(async (response) => (await response.json()) as { connected?: boolean; enabled?: boolean })
      .then((account) => setGmail(Boolean(account.connected && account.enabled)))
      .catch(() => setGmail(false));
  }, [isOpen, focusId, startSharing, refresh]);

  useEffect(() => {
    if (!listed || !focusId) return;
    const person = listed.people.find((item) => item.id === focusId);
    if (person && !isActive(person)) setTab("ended");
    queueMicrotask(() => focusRef.current?.scrollIntoView({ block: "nearest" }));
  }, [listed, focusId]);

  const people = useMemo(() => listed?.people ?? [], [listed]);
  const page = listed?.page ?? null;
  const active = people.filter(isActive);
  const ended = people.filter((person) => !isActive(person));
  const filters = tab === "active" ? ACTIVE_FILTERS : ENDED_FILTERS;
  const narrowed = (tab === "active" ? active : ended).filter(
    (person) =>
      (canSee === "any" || person.sections.includes(canSee as WorkMapPublishSection)) &&
      matches(query, person.name, person.email),
  );
  const shown = narrowed.filter(filters.find((item) => item.id === filter)?.match ?? (() => true));

  async function act(path: string, method: string, body: unknown, done: string): Promise<AccessPerson | null> {
    setError("");
    setMessage("");
    const response = await fetch(path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string; person?: AccessPerson };
    if (!response.ok) {
      setError(ERRORS[result.error ?? ""] ?? "That didn't work. Try again.");
      return null;
    }
    setMessage(done);
    window.dispatchEvent(new Event(ACCESS_CHANGED));
    await refresh();
    return result.person ?? null;
  }

  async function draft(person: AccessPerson) {
    setError("");
    const response = await fetch(`/api/access/${person.id}/gmail-draft`, { method: "POST" });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    if (response.ok) {
      setMessage(`An email to ${person.email} is in Gmail. Send it when you're ready.`);
      await refresh();
    } else setError(ERRORS[result.error ?? ""] ?? "The draft could not be made.");
  }

  const sectionOptions = page?.sections ?? [];

  return (
    <Dialog isOpen={isOpen} onOpenChange={(next) => (!next ? onClose() : undefined)} width={620} purpose="form">
      <Layout
        padding={4}
        header={<DialogHeader title="Access" onOpenChange={onClose} hasDivider={false} />}
        content={
          <LayoutContent label="Access">
            <VStack gap={3}>
              {error ? <Banner status="error" title={error} container="section" collapsible={false} role="alert" /> : null}
              {listed && !listed.relayConfigured ? (
                <Banner
                  status="warning"
                  title="Access needs your Relay"
                  description="Links open your page on the Relay. Set RELAY_URL and RELAY_OWNER_TOKEN for the server first."
                  container="section"
                  collapsible={false}
                />
              ) : null}
              {page && page.published && page.visibility !== "access-controlled" ? (
                <Banner
                  status="info"
                  title="Your page is open to anyone right now"
                  description="Links only limit what someone sees when Visibility is set to Access-controlled in the Relay menu."
                  container="section"
                  collapsible={false}
                />
              ) : null}
              {listed?.stale ? (
                <Text type="supporting" color="secondary">
                  The Relay couldn't be reached, so opens may be missing.
                </Text>
              ) : null}
              {message ? (
                <Text type="supporting" color="secondary" role="status">
                  {message}
                </Text>
              ) : null}

              {sharing ? (
                <ShareForm
                  page={page}
                  onCancel={() => setSharing(false)}
                  people={people}
                  onOpenPerson={(person) => {
                    // Someone who already has a record: change it, or give access again.
                    setSharing(false);
                    setTab(isActive(person) ? "active" : "ended");
                    setOpenId(person.id);
                    setEditing({ mode: isActive(person) ? "change" : "restore", person });
                  }}
                  onShare={async (body) => {
                    const person = await act("/api/access", "POST", body, `Shared with ${body.name}. Send them the link.`);
                    if (person) {
                      setSharing(false);
                      setTab("active");
                      setOpenId(person.id);
                    }
                  }}
                />
              ) : (
                <HStack gap={2} className="access-top">
                  <TabList
                    value={tab}
                    onChange={(next) => {
                      setTab(next === "ended" ? "ended" : "active");
                      setFilter("all");
                    }}
                    hasDivider
                  >
                    <Tab value="active" label={`Active · ${active.length}`} />
                    <Tab value="ended" label={`Revoked & expired · ${ended.length}`} />
                  </TabList>
                  {page?.published ? (
                    <Button
                      label="Share"
                      icon={<Share2 size={14} aria-hidden="true" />}
                      variant="secondary"
                      size="sm"
                      onClick={() => setSharing(true)}
                    />
                  ) : null}
                </HStack>
              )}

              {!sharing ? (
                !listed ? (
                  <Text type="supporting" color="secondary">
                    Loading…
                  </Text>
                ) : (tab === "active" ? active : ended).length === 0 ? (
                  <EmptyState
                    isCompact
                    title={tab === "active" ? "Nobody has a link" : "Nothing here"}
                    description={
                      tab === "active"
                        ? page?.published
                          ? "Share your page with someone, or approve a request in Requests."
                          : "Publish your page first, then share it."
                        : "Revoked and expired links show here, with their Activity."
                    }
                  />
                ) : (
                  <>
                    <div className="req-tools">
                      <TextInput
                        label="Search people"
                        isLabelHidden
                        placeholder="Search by name or email"
                        value={query}
                        onChange={setQuery}
                      />
                      <Selector
                        label="Can see"
                        isLabelHidden
                        value={canSee}
                        width="12rem"
                        onChange={(value) => setCanSee(String(value))}
                        options={[
                          { value: "any", label: "Can see anything" },
                          ...sectionOptions.map((section) => ({
                            value: section,
                            label: `Can see ${ACCESS_SECTION_LABEL[section].toLowerCase()}`,
                          })),
                        ]}
                      />
                    </div>
                    <SegmentedControl label="Filter" size="sm" value={filter} onChange={setFilter}>
                      {filters.map((item) => {
                        const count = narrowed.filter(item.match).length;
                        return (
                          <SegmentedControlItem
                            key={item.id}
                            value={item.id}
                            label={item.id !== "all" && count ? `${item.label} · ${count}` : item.label}
                          />
                        );
                      })}
                    </SegmentedControl>
                    {shown.length === 0 ? (
                      <EmptyState isCompact title="Nobody matches" description="No one matches these filters." />
                    ) : (
                      <List>
                        {shown.map((person) => {
                          const edit = editing?.person.id === person.id ? editing : null;
                          const live = isActive(person);
                          const open = openId === person.id || Boolean(edit);
                          return (
                            <ListItem
                              key={person.id}
                              itemKey={person.id}
                              ref={person.id === focusId ? focusRef : undefined}
                              isSelected={open}
                              align="start"
                              onClick={() => {
                                // One card open at a time: opening this one closes any other form.
                                setOpenId(open ? null : person.id);
                                setOpenActivity(null);
                                setEditing(null);
                                setNaming(null);
                              }}
                              label={person.name}
                              endContent={stateBadge(person)}
                              description={
                                <VStack gap={2}>
                                  <span>
                                    {summary(person)} ·{" "}
                                    {live ? until(person) : `ended ${shortDate(person.revokedAt ?? person.expiresAt)}`}
                                  </span>
                                  {open ? (
                                  // Clicks inside the open card don't fold it.
                                  <div className="access-open" onClick={(event) => event.stopPropagation()}>
                                  {naming === person.id ? (
                                    <NameForm
                                      person={person}
                                      onCancel={() => setNaming(null)}
                                      onSave={async (body) => {
                                        const done = await act(
                                          `/api/access/${person.id}/person`,
                                          "PUT",
                                          body,
                                          person.named ? "Saved." : `This link is now ${body.name}'s.`,
                                        );
                                        if (done) setNaming(null);
                                      }}
                                    />
                                  ) : (
                                    <span className="access-who">
                                      {person.named ? (
                                        <span className="access-faint">{person.email || "No email"}</span>
                                      ) : (
                                        <span className="access-faint">Made before Docier kept names</span>
                                      )}
                                      <button type="button" className="req-more" onClick={() => setNaming(person.id)}>
                                        {person.named ? "Edit" : "Name this link"}
                                      </button>
                                    </span>
                                  )}
                                  <span className="access-sees">
                                    {scope(person) === "Whole page" ? (
                                      <>
                                        Sees <strong>your whole page</strong>
                                      </>
                                    ) : (
                                      <>
                                        Sees <strong>{scope(person)}</strong>
                                      </>
                                    )}
                                  </span>
                                  <span>
                                    {person.source === "asked" ? "Asked on your page" : "Shared by you"} · {opens(person)}
                                  </span>
                                  {edit ? (
                                    <EditAccess
                                      person={person}
                                      mode={edit.mode}
                                      onCancel={() => setEditing(null)}
                                      onSave={async (body) => {
                                        const done =
                                          edit.mode === "change"
                                            ? await act(`/api/access/${person.id}`, "PUT", body, `${firstName(person.name)}'s access changed.`)
                                            : await act(
                                                `/api/access/${person.id}/restore`,
                                                "POST",
                                                body,
                                                `${firstName(person.name)} has access again, with a new link.`,
                                              );
                                        if (done) {
                                          setEditing(null);
                                          if (edit.mode === "restore") setTab("active");
                                        }
                                      }}
                                    />
                                  ) : openActivity === person.id ? (
                                    <ActivityList activity={person.activity} name={person.name} />
                                  ) : null}
                                  {edit ? null : (
                                    <HStack gap={1} className="access-actions">
                                      {live ? (
                                        <>
                                          {person.link ? (
                                            <Button
                                              label={copiedId === person.id ? "Copied" : "Copy link"}
                                              variant="secondary"
                                              size="sm"
                                              onClick={() =>
                                                void navigator.clipboard
                                                  .writeText(person.link as string)
                                                  .then(() => setCopiedId(person.id))
                                              }
                                            />
                                          ) : null}
                                          <Button
                                            label="Change access"
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => setEditing({ mode: "change", person })}
                                          />
                                        </>
                                      ) : (
                                        <Button
                                          label="Give access again"
                                          variant="secondary"
                                          size="sm"
                                          onClick={() => setEditing({ mode: "restore", person })}
                                        />
                                      )}
                                      <Button
                                        label={openActivity === person.id ? "Hide activity" : "Activity"}
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setOpenActivity((current) => (current === person.id ? null : person.id))}
                                      />
                                      {live && gmail && person.link && person.email ? (
                                        <Button label="Draft in Gmail" variant="ghost" size="sm" onClick={() => void draft(person)} />
                                      ) : null}
                                      <Button
                                        label={live ? "Revoke" : "Remove"}
                                        variant="ghost"
                                        size="sm"
                                        className="access-danger"
                                        onClick={() => setConfirm({ kind: live ? "revoke" : "remove", person })}
                                      />
                                    </HStack>
                                  )}
                                  {live && !person.link ? (
                                    <Text type="supporting" color="secondary">
                                      This link was made before Docier kept links, so it can't be copied again.
                                    </Text>
                                  ) : null}
                                  </div>
                                  ) : null}
                                </VStack>
                              }
                            />
                          );
                        })}
                      </List>
                    )}
                    {tab === "ended" ? (
                      <Text type="supporting" color="secondary">
                        Their old links no longer work. Giving access again makes a new link. Remove deletes the record and its Activity.
                      </Text>
                    ) : null}
                  </>
                )
              ) : null}
            </VStack>
            <AlertDialog
              isOpen={confirm != null}
              onOpenChange={(next) => (!next ? setConfirm(null) : undefined)}
              title={confirm?.kind === "remove" ? `Remove ${confirm.person.name}?` : `Revoke ${confirm?.person.name ?? ""}'s access?`}
              description={
                confirm?.kind === "remove"
                  ? "Their record and its Activity are deleted. This can't be undone."
                  : "Their link stops working right away. You can give access again later with a new link."
              }
              actionLabel={confirm?.kind === "remove" ? "Remove" : "Revoke"}
              onAction={() => {
                const current = confirm;
                setConfirm(null);
                if (!current) return;
                if (current.kind === "remove") {
                  void act(`/api/access/${current.person.id}`, "DELETE", undefined, `${current.person.name} was removed.`);
                } else {
                  void act(`/api/access/${current.person.id}/revoke`, "POST", {}, `${firstName(current.person.name)} can no longer open your page.`);
                }
              }}
            />
          </LayoutContent>
        }
      />
    </Dialog>
  );
}

function EditAccess({
  person,
  mode,
  onCancel,
  onSave,
}: {
  person: AccessPerson;
  mode: "change" | "restore";
  onCancel: () => void;
  onSave: (body: ReturnType<typeof choiceBody>) => Promise<void>;
}) {
  const [choice, setChoice] = useState<AccessChoiceValue>(() => ({
    sections: person.sections.length ? person.sections : [...person.pageSections],
    length: person.untilRevoked ? "none" : "30",
    message: "",
  }));
  const [busy, setBusy] = useState(false);
  return (
    <div className="access-box">
      <AccessChoice page={person.pageSections} value={choice} onChange={setChoice} who={firstName(person.name)} />
      <Text type="supporting" color="secondary">
        {mode === "change"
          ? "Their link stays the same. They see the change the next time they open it. The length counts from today."
          : "They get a new link. Their old one stays off."}
      </Text>
      <div className="req-actions">
        <Button label="Cancel" variant="ghost" onClick={onCancel} />
        <Button
          label={mode === "change" ? "Save" : "Give access"}
          variant="primary"
          isDisabled={busy || choice.sections.length === 0}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave(choiceBody(choice, person.pageSections));
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>
    </div>
  );
}

type NetworkContact = { id: string; name: string; email: string };

/** A name and email, the same fields that share a link. */
function NameForm({
  person,
  onCancel,
  onSave,
}: {
  person: AccessPerson;
  onCancel: () => void;
  onSave: (body: { name: string; email: string }) => Promise<void>;
}) {
  const [name, setName] = useState(person.named ? person.name : "");
  const [email, setEmail] = useState(person.email);
  return (
    <div className="access-box">
      <div className="req-row2">
        <TextInput label="Name" value={name} onChange={setName} hasAutoFocus />
        <TextInput label="Email" type="email" value={email} onChange={setEmail} />
      </div>
      <div className="req-actions">
        <Button label="Cancel" variant="ghost" size="sm" onClick={onCancel} />
        <Button
          label="Save"
          variant="primary"
          size="sm"
          isDisabled={!name.trim()}
          onClick={() => void onSave({ name: name.trim(), email: email.trim() })}
        />
      </div>
    </div>
  );
}

function ShareForm({
  page,
  people,
  onCancel,
  onShare,
  onOpenPerson,
}: {
  page: AccessPage | null;
  people: AccessPerson[];
  onCancel: () => void;
  onShare: (body: ReturnType<typeof choiceBody> & { name: string; email: string }) => Promise<void>;
  onOpenPerson: (person: AccessPerson) => void;
}) {
  const sections = page?.sections ?? [];
  const [to, setTo] = useState("network");
  const [contacts, setContacts] = useState<NetworkContact[] | null>(null);
  const [contactId, setContactId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [choice, setChoice] = useState<AccessChoiceValue>(() => defaultChoice(sections));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/career-management")
      .then(async (response) => (await response.json()) as { contacts?: NetworkContact[] })
      .then((body) => setContacts(body.contacts ?? []))
      .catch(() => setContacts([]));
  }, []);

  if (!page?.published) {
    return <EmptyState isCompact title="Publish your page first" description="Then you can share it with someone." />;
  }
  const contact = contacts?.find((item) => item.id === contactId) ?? null;
  const who = to === "network" ? (contact ? { name: contact.name, email: contact.email } : null) : { name, email };
  // Someone who already has a record is pointed at it, not given a second link.
  const existing = who?.email
    ? people.find((person) => person.email.toLowerCase() === who.email.trim().toLowerCase()) ?? null
    : null;

  return (
    <div className="access-box">
      <Text type="label">Share your page</Text>
      <SegmentedControl label="With" size="sm" value={to} onChange={setTo}>
        <SegmentedControlItem value="network" label="My Network" />
        <SegmentedControlItem value="new" label="Someone new" />
      </SegmentedControl>
      {to === "network" ? (
        contacts && contacts.length === 0 ? (
          <Text type="supporting" color="secondary">
            Nobody is in My Network yet. Choose Someone new.
          </Text>
        ) : (
          <Selector
            label="Person"
            value={contactId}
            placeholder="Choose someone"
            hasSearch
            onChange={(value) => setContactId(String(value))}
            options={(contacts ?? []).map((item) => ({
              value: item.id,
              label: item.email ? item.name : `${item.name} (no email)`,
              isDisabled: !item.email,
            }))}
          />
        )
      ) : (
        <div className="req-row2">
          <TextInput label="Name" value={name} onChange={setName} />
          <TextInput label="Email" type="email" value={email} onChange={setEmail} />
        </div>
      )}
      {existing ? (
        <div className="access-existing" role="status">
          <span>
            {existing.name} already {isActive(existing) ? "has a link" : "had a link"}.{" "}
            {isActive(existing) ? "Change what they see instead?" : "Give them access again instead?"}
          </span>
          <Button
            label={isActive(existing) ? "Change access" : "Give access again"}
            variant="secondary"
            size="sm"
            onClick={() => onOpenPerson(existing)}
          />
        </div>
      ) : (
        <>
          <AccessChoice page={sections} value={choice} onChange={setChoice} who={firstName(who?.name ?? "") || "they"} />
          <Text type="supporting" color="secondary">
            You get a private link to send them. Docier doesn't send anything.
          </Text>
        </>
      )}
      <div className="req-actions">
        <Button label="Cancel" variant="ghost" onClick={onCancel} />
        <Button
          label="Share"
          variant="primary"
          isDisabled={busy || Boolean(existing) || !who?.name.trim() || !who.email.trim() || choice.sections.length === 0}
          onClick={async () => {
            if (!who) return;
            setBusy(true);
            try {
              await onShare({ ...choiceBody(choice, sections), name: who.name.trim(), email: who.email.trim() });
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>
    </div>
  );
}

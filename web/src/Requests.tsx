import { useEffect, useMemo, useRef, useState } from "react";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import {
  REQUEST_BODY_MAX,
  REQUEST_KINDS,
  REQUEST_KIND_LABEL,
  REQUEST_NOTE_MAX,
  RECEIVED_STATUS_LABEL,
  SENT_STATUS_LABEL,
  type ReceivedRequestStatus,
  type RequestKind,
  type SentRequestStatus,
} from "@core/requests";
import "./requests.css";

export type RequestsTab = "new" | "sent" | "received";

/** Fired after something changes what the Request button counts. */
export const REQUESTS_CHANGED = "docier:requests-changed";
/** Ask Home to open the Requests dialog, e.g. from an Opportunities card. */
export const OPEN_REQUESTS = "docier:open-requests";

export function openRequests(tab: RequestsTab, id?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_REQUESTS, { detail: { tab, id } }));
}

type SentRequest = {
  id: string;
  kind: RequestKind;
  body: string;
  contactId: string | null;
  recipientName: string;
  recipientEmail: string;
  status: SentRequestStatus;
  changed: boolean;
  note: string;
  link: string | null;
  createdAt: string;
  expiresAt: string;
  joinStatus: "joined" | "declined" | "ignored" | null;
};

type ReceivedRequest = {
  id: string;
  kind: "access";
  requesterName: string;
  requesterEmail: string;
  message: string;
  status: ReceivedRequestStatus;
  note: string;
  pageSlug: string;
  createdAt: string;
};

type Listed = {
  requests: SentRequest[];
  received: ReceivedRequest[];
  waiting: number;
  stale: boolean;
  relayConfigured: boolean;
};
type Person = { id: string; name: string; organization: string; email: string };

const PENDING: SentRequestStatus[] = ["sent", "opened"];

async function loadRequests(): Promise<Listed> {
  const response = await fetch("/api/requests");
  if (!response.ok) throw new Error("load");
  return (await response.json()) as Listed;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const STATUS_VARIANT: Record<SentRequestStatus, "neutral" | "warning" | "success" | "error"> = {
  sent: "neutral",
  opened: "warning",
  approved: "success",
  declined: "error",
  expired: "neutral",
  withdrawn: "neutral",
};

function StatusBadge({ status }: { status: SentRequestStatus }) {
  return <Badge label={SENT_STATUS_LABEL[status]} variant={STATUS_VARIANT[status]} />;
}

/** A dot for an answer or expiry the occupant hasn't seen. */
function NewDot() {
  return <StatusDot variant="accent" label="New answer" tooltip="New since you last looked" />;
}

/** How many received requests wait on the occupant, kept fresh for the Request button. */
export function useRequestsWaiting(): number {
  const [waiting, setWaiting] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      void loadRequests().then(
        (listed) => !cancelled && setWaiting(listed.waiting),
        () => undefined,
      );
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener(REQUESTS_CHANGED, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
      window.removeEventListener(REQUESTS_CHANGED, refresh);
    };
  }, []);
  return waiting;
}

/** Lines a text box needs for its text, so it grows from `min` up to `max` and then scrolls. */
function growRows(value: string, min: number, max: number): number {
  const lines = value.split("\n").reduce((total, line) => total + Math.max(1, Math.ceil(line.length / 70)), 0);
  return Math.min(max, Math.max(min, lines));
}

/** Astryx's counter, shown only once a text is close to its limit. */
function nearLimit(value: string, max: number): number | undefined {
  return value.length >= max * 0.75 ? max : undefined;
}

/** A quoted message cut to three lines, with Show more when it's longer. */
function Quote({ text, prefix = "" }: { text: string; prefix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (el && !open) setLong(el.scrollHeight > el.clientHeight + 1);
  }, [text, open]);
  return (
    <span className="req-quote">
      <span ref={ref} className={open ? "req-note" : "req-note is-clamped"}>
        {prefix}“{text}”
      </span>
      {long || open ? (
        <button type="button" className="req-more" onClick={() => setOpen((value) => !value)}>
          {open ? "Show less" : "Show more"}
        </button>
      ) : null}
    </span>
  );
}

const ERRORS: Record<string, string> = {
  "relay-not-configured": "Requests are answered on your Relay, and no Relay is set up yet.",
  "relay-unavailable": "The Relay could not be reached. Nothing was sent. Try again.",
  "body-required": "Write what you're asking.",
  "body-too-long": "That request is too long.",
  "recipient-required": "Add the person's name and email.",
  "email-invalid": "That email doesn't look right.",
  "contact-missing": "That person is no longer in My Network.",
  "profile-name-required": "Add your name in Settings → Profile first, so they know who's asking.",
  "request-closed": "That request was already answered, withdrawn, or expired.",
  "gmail-not-connected": "Connect Gmail in Settings to draft an email.",
};

/** The quick look under Request: start one, or open the full list. It only shows. */
export function RequestsMenu({
  onNew,
  onOpen,
}: {
  onNew: () => void;
  onOpen: (tab: RequestsTab, id?: string) => void;
}) {
  const [listed, setListed] = useState<Listed | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadRequests().then(
      (next) => !cancelled && setListed(next),
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const recent = listed?.requests.slice(0, 4) ?? [];
  const waiting = listed?.received.filter((request) => request.status === "waiting").slice(0, 3) ?? [];
  return (
    <VStack gap={0} className="req-menu">
      <HStack gap={2} className="req-menu-top">
        <Text type="label" weight="semibold">
          Requests
        </Text>
        <Button label="New request" variant="primary" size="sm" onClick={onNew} />
      </HStack>
      {failed ? (
        <EmptyState isCompact title="Requests could not be loaded." />
      ) : !listed ? (
        <Text type="supporting" color="secondary" className="req-menu-pad">
          Loading…
        </Text>
      ) : recent.length === 0 && waiting.length === 0 ? (
        <EmptyState
          isCompact
          title="No requests yet"
          description="Ask anyone for a reference, an introduction, or a recommendation. They answer on a private link."
        />
      ) : (
        <>
          {waiting.length > 0 ? (
            <>
              <Text type="supporting" color="secondary" className="req-menu-heading">
                Needs your answer · {listed.waiting}
              </Text>
              <List>
                {waiting.map((request) => (
                  <ListItem
                    key={request.id}
                    itemKey={request.id}
                    label={request.requesterName}
                    description={`Access to your page · ${shortDate(request.createdAt)}`}
                    endContent={<Badge label={RECEIVED_STATUS_LABEL.waiting} variant="info" />}
                    onClick={() => onOpen("received", request.id)}
                  />
                ))}
              </List>
            </>
          ) : null}
          {recent.length > 0 ? (
            <Text type="supporting" color="secondary" className="req-menu-heading">
              Recent
            </Text>
          ) : null}
          <List>
            {recent.map((request) => (
              <ListItem
                key={request.id}
                itemKey={request.id}
                label={
                  <HStack gap={1}>
                    <span>{request.recipientName}</span>
                    {request.changed ? <NewDot /> : null}
                  </HStack>
                }
                description={`${REQUEST_KIND_LABEL[request.kind]} · ${request.contactId ? "My Network" : "Not in your network"} · ${shortDate(request.createdAt)}`}
                endContent={<StatusBadge status={request.status} />}
                onClick={() => onOpen("sent", request.id)}
              />
            ))}
          </List>
          <div className="req-menu-foot">
            <Button
              label="View all requests"
              variant="ghost"
              size="sm"
              onClick={() => onOpen(listed.waiting > 0 ? "received" : "sent")}
            />
          </div>
        </>
      )}
    </VStack>
  );
}

/** The full Requests dialog: New request and Sent. */
export function RequestsDialog({
  isOpen,
  tab,
  focusId,
  onTab,
  onClose,
  onOpenNetwork,
}: {
  isOpen: boolean;
  tab: RequestsTab;
  focusId: string | null;
  onTab: (tab: RequestsTab) => void;
  onClose: () => void;
  onOpenNetwork: () => void;
}) {
  const [listed, setListed] = useState<Listed | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<SentRequest | null>(null);
  const [created, setCreated] = useState<SentRequest | null>(null);

  async function refresh() {
    try {
      setListed(await loadRequests());
    } catch {
      setError("Requests could not be loaded.");
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    setError("");
    setCreated(null);
    setEditing(null);
    void refresh();
  }, [isOpen]);

  // Looking at Sent clears the "new answer" dots.
  useEffect(() => {
    if (!isOpen || tab !== "sent" || !listed) return;
    const ids = listed.requests.filter((request) => request.changed).map((request) => request.id);
    if (ids.length === 0) return;
    void fetch("/api/requests/seen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    });
  }, [isOpen, tab, listed]);

  const formOpen = tab === "new";
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      width={560}
      purpose="form"
    >
      <Layout
        padding={4}
        header={<DialogHeader title="Requests" onOpenChange={onClose} hasDivider={false} />}
        content={
          <LayoutContent label="Requests">
            <div className="req-tabs">
              <TabList
                value={tab}
                onChange={(next) => onTab(next === "new" ? "new" : next === "received" ? "received" : "sent")}
                hasDivider
              >
                <Tab value="new" label={editing ? "Edit request" : "New request"} />
                <Tab value="sent" label="Sent" />
                <Tab value="received" label={listed?.waiting ? `Received · ${listed.waiting}` : "Received"} />
              </TabList>
            </div>
            {error ? <Banner status="error" title={error} container="section" collapsible={false} role="alert" /> : null}
            {listed && !listed.relayConfigured ? (
              <Banner
                status="warning"
                title="Requests need your Relay"
                description="People answer on a private link on your Relay. Set RELAY_URL and RELAY_OWNER_TOKEN for the server, then requests can be sent."
                container="section"
                collapsible={false}
              />
            ) : null}
            {listed?.stale ? (
              <Text type="supporting" color="secondary">
                The Relay couldn't be reached, so these are the last known answers.
              </Text>
            ) : null}
            {formOpen ? (
              created ? (
                <CreatedRequest
                  request={created}
                  onDone={() => {
                    setCreated(null);
                    onTab("sent");
                  }}
                />
              ) : (
                <RequestForm
                  key={editing?.id ?? "new"}
                  editing={editing}
                  disabled={!listed?.relayConfigured}
                  onOpenNetwork={onOpenNetwork}
                  onCancel={() => {
                    setEditing(null);
                    onTab("sent");
                  }}
                  onSaved={async (request, wasEdit) => {
                    await refresh();
                    setEditing(null);
                    if (wasEdit) onTab("sent");
                    else setCreated(request);
                  }}
                />
              )
            ) : tab === "received" ? (
              <ReceivedList listed={listed} focusId={focusId} onChanged={refresh} />
            ) : (
              <SentList
                listed={listed}
                focusId={focusId}
                onChanged={refresh}
                onEdit={(request) => {
                  setEditing(request);
                  onTab("new");
                }}
              />
            )}
          </LayoutContent>
        }
      />
    </Dialog>
  );
}

function RequestForm({
  editing,
  disabled,
  onSaved,
  onCancel,
  onOpenNetwork,
}: {
  editing: SentRequest | null;
  disabled: boolean;
  onSaved: (request: SentRequest, wasEdit: boolean) => void | Promise<void>;
  onCancel: () => void;
  onOpenNetwork: () => void;
}) {
  const [people, setPeople] = useState<Person[]>([]);
  const [to, setTo] = useState<"network" | "new">(editing ? (editing.contactId ? "network" : "new") : "network");
  const [contactId, setContactId] = useState(editing?.contactId ?? "");
  const [name, setName] = useState(editing && !editing.contactId ? editing.recipientName : "");
  const [email, setEmail] = useState(editing && !editing.contactId ? editing.recipientEmail : "");
  const [kind, setKind] = useState<RequestKind>(editing?.kind ?? "reference");
  const [body, setBody] = useState(editing?.body ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/career-management")
      .then(async (response) => ((await response.json()) as { contacts?: Person[] }).contacts ?? [])
      .then((contacts) => {
        setPeople(contacts);
        if (!editing && contacts.length === 0) setTo("new");
      })
      .catch(() => setPeople([]));
  }, [editing]);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const payload =
        to === "network" ? { kind, body, contactId } : { kind, body, recipientName: name, recipientEmail: email };
      const response = await fetch(editing ? `/api/requests/${editing.id}` : "/api/requests", {
        method: editing ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { request?: SentRequest; error?: string };
      if (!response.ok || !result.request) {
        setError(ERRORS[result.error ?? ""] ?? "The request could not be saved.");
        return;
      }
      await onSaved(result.request, Boolean(editing));
    } finally {
      setBusy(false);
    }
  }

  const ready = body.trim() && (to === "network" ? contactId : name.trim() && email.trim());
  return (
    <div className="req-form">
      {error ? <Banner status="error" title={error} container="section" collapsible={false} role="alert" /> : null}
      <SegmentedControl label="To" size="sm" value={to} onChange={(value) => setTo(value === "new" ? "new" : "network")}>
        <SegmentedControlItem value="network" label="My Network" />
        <SegmentedControlItem value="new" label="Someone new" />
      </SegmentedControl>
      {to === "network" ? (
        people.length > 0 ? (
          <Selector
            label="Person"
            value={contactId}
            placeholder="Choose someone"
            onChange={(value) => setContactId(typeof value === "string" ? value : "")}
            options={people.map((person) => ({
              value: person.id,
              label: person.organization ? `${person.name} · ${person.organization}` : person.name,
            }))}
          />
        ) : (
          <EmptyState
            isCompact
            title="No one in My Network yet"
            description="Choose Someone new, or add a person first."
            actions={<Button label="My Network" variant="secondary" size="sm" onClick={onOpenNetwork} />}
          />
        )
      ) : (
        <div className="req-row2">
          <TextInput label="Name" value={name} onChange={setName} />
          <TextInput label="Email" type="email" value={email} onChange={setEmail} />
        </div>
      )}
      <SegmentedControl
        label="Kind"
        size="sm"
        value={kind}
        onChange={(value) => setKind((REQUEST_KINDS as readonly string[]).includes(value) ? (value as RequestKind) : "general")}
      >
        {REQUEST_KINDS.map((option) => (
          <SegmentedControlItem key={option} value={option} label={REQUEST_KIND_LABEL[option]} />
        ))}
      </SegmentedControl>
      <TextArea
        label="Request"
        value={body}
        // Typing stops at the limit rather than failing on Create.
        onChange={(value) => setBody(value.slice(0, REQUEST_BODY_MAX))}
        rows={growRows(body, 4, 12)}
        maxLength={nearLimit(body, REQUEST_BODY_MAX)}
      />
      {to === "new" ? (
        <Text type="supporting" color="secondary">
          They won't be added to My Network. They answer on a private link that works for 30 days.
        </Text>
      ) : null}
      <div className="req-actions">
        <Button label="Cancel" variant="ghost" onClick={onCancel} />
        <Button
          label={busy ? "Saving…" : editing ? "Save request" : "Create request"}
          variant="primary"
          isDisabled={busy || disabled || !ready}
          onClick={() => void submit()}
        />
      </div>
    </div>
  );
}

function CreatedRequest({ request, onDone }: { request: SentRequest; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const [gmail, setGmail] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    void fetch("/api/gmail")
      .then(async (response) => (await response.json()) as { connected?: boolean; enabled?: boolean })
      .then((account) => setGmail(Boolean(account.connected && account.enabled)))
      .catch(() => setGmail(false));
  }, []);

  async function draft() {
    setNote("");
    const response = await fetch(`/api/requests/${request.id}/gmail-draft`, { method: "POST" });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    setNote(response.ok ? `A draft to ${request.recipientEmail} is in Gmail. Send it when you're ready.` : ERRORS[result.error ?? ""] ?? "The draft could not be made.");
  }

  return (
    <div className="req-form">
      <div className="req-note">
        <strong>Request created.</strong> Send {request.recipientName.split(/\s+/)[0]} the link. They answer there, and you'll see it here.
      </div>
      <div className="req-linkbox">
        <code>{request.link}</code>
        <Button
          label={copied ? "Copied" : "Copy link"}
          variant="secondary"
          size="sm"
          onClick={() => {
            if (!request.link) return;
            void navigator.clipboard.writeText(request.link).then(() => setCopied(true));
          }}
        />
      </div>
      {gmail && request.recipientEmail ? (
        <div className="req-actions is-start">
          <Button label="Draft in Gmail" variant="secondary" onClick={() => void draft()} />
          <Text type="supporting" color="secondary">
            Docier never sends it for you.
          </Text>
        </div>
      ) : null}
      {note ? (
        <Text type="supporting" color="secondary" role="status">
          {note}
        </Text>
      ) : null}
      <div className="req-actions">
        <Button label="Done" variant="primary" onClick={onDone} />
      </div>
    </div>
  );
}

/** Search, plus a kind choice when there's more than one kind, above a long list. */
const SEARCH_FROM = 5;

function matches(query: string, ...fields: string[]): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = fields.join(" ").toLowerCase();
  return words.every((word) => text.includes(word));
}

function ListTools({
  query,
  onQuery,
  kinds,
  kind,
  onKind,
}: {
  query: string;
  onQuery: (value: string) => void;
  kinds?: RequestKind[];
  kind?: string;
  onKind?: (value: string) => void;
}) {
  return (
    <div className="req-tools">
      <TextInput
        label="Search requests"
        isLabelHidden
        placeholder="Search by name, email, or message"
        value={query}
        onChange={onQuery}
      />
      {kinds && kinds.length > 1 && onKind ? (
        <Selector
          label="Kind"
          isLabelHidden
          value={kind ?? "all"}
          width="10.5rem"
          onChange={(value) => onKind(String(value))}
          options={[
            { value: "all", label: "All kinds" },
            ...kinds.map((item) => ({ value: item, label: REQUEST_KIND_LABEL[item] })),
          ]}
        />
      ) : null}
    </div>
  );
}

const FILTERS: Array<{ id: string; label: string; match: (status: SentRequestStatus) => boolean }> = [
  { id: "all", label: "All", match: () => true },
  { id: "pending", label: "Pending", match: (status) => PENDING.includes(status) },
  { id: "approved", label: "Approved", match: (status) => status === "approved" },
  { id: "declined", label: "Declined", match: (status) => status === "declined" },
  { id: "closed", label: "Closed", match: (status) => status === "expired" || status === "withdrawn" },
];

function SentList({
  listed,
  focusId,
  onChanged,
  onEdit,
}: {
  listed: Listed | null;
  focusId: string | null;
  onChanged: () => Promise<void>;
  onEdit: (request: SentRequest) => void;
}) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [withdrawing, setWithdrawing] = useState<SentRequest | null>(null);
  const [message, setMessage] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const focusRef = useRef<HTMLLIElement>(null);
  const requests = useMemo(() => listed?.requests ?? [], [listed]);

  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: "nearest" });
  }, [focusId, requests.length]);

  if (!listed) return <Text type="supporting" color="secondary">Loading…</Text>;
  if (requests.length === 0) {
    return <EmptyState isCompact title="Nothing sent yet" description="Start one in New request." />;
  }

  const kinds = REQUEST_KINDS.filter((item) => requests.some((request) => request.kind === item));
  // Search and kind narrow the list first; the status counts follow them.
  const narrowed = requests.filter(
    (request) =>
      (kind === "all" || request.kind === kind) &&
      matches(query, request.recipientName, request.recipientEmail, request.body, request.note),
  );
  const shown = narrowed.filter((request) => FILTERS.find((item) => item.id === filter)!.match(request.status));
  const count = (id: string) => narrowed.filter((request) => FILTERS.find((item) => item.id === id)!.match(request.status)).length;

  async function act(url: string, method: string, done: string) {
    const response = await fetch(url, { method });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    setMessage(response.ok ? done : ERRORS[result.error ?? ""] ?? "That didn't work. Try again.");
    await onChanged();
  }

  return (
    <div className="req-sent">
      {requests.length >= SEARCH_FROM || query || kind !== "all" ? (
        <ListTools query={query} onQuery={setQuery} kinds={kinds} kind={kind} onKind={setKind} />
      ) : null}
      <SegmentedControl label="Filter" size="sm" value={filter} onChange={setFilter}>
        {FILTERS.map((item) => (
          <SegmentedControlItem
            key={item.id}
            value={item.id}
            label={item.id !== "all" && count(item.id) ? `${item.label} · ${count(item.id)}` : item.label}
          />
        ))}
      </SegmentedControl>
      {message ? (
        <Text type="supporting" color="secondary" role="status">
          {message}
        </Text>
      ) : null}
      {shown.length === 0 ? (
        <EmptyState isCompact title="Nothing here" description="No requests match this filter." />
      ) : (
        <List>
          {shown.map((request) => {
            const pending = PENDING.includes(request.status);
            return (
              <ListItem
                key={request.id}
                itemKey={request.id}
                ref={request.id === focusId ? focusRef : undefined}
                isSelected={request.id === focusId}
                align="start"
                label={
                  <HStack gap={2}>
                    <span>{request.recipientName}</span>
                    <Badge label={REQUEST_KIND_LABEL[request.kind]} variant="neutral" />
                    {request.changed ? <NewDot /> : null}
                  </HStack>
                }
                description={
                  <VStack gap={2}>
                    <span>
                      {request.contactId ? "My Network" : "Not in your network"} · {shortDate(request.createdAt)}
                      {pending ? ` · expires ${shortDate(request.expiresAt)}` : ""}
                    </span>
                    {request.note ? <Quote text={request.note} /> : null}
                    {request.joinStatus === "joined" ? (
                      <span>Joined your network</span>
                    ) : request.joinStatus === "declined" ? (
                      <span>Didn't join your network</span>
                    ) : null}
                    <HStack gap={1}>
                      {pending ? (
                        <>
                          <Button
                            label={copiedId === request.id ? "Copied" : "Copy link"}
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              if (!request.link) return;
                              void navigator.clipboard.writeText(request.link).then(() => setCopiedId(request.id));
                            }}
                          />
                          <Button label="Edit" variant="ghost" size="sm" onClick={() => onEdit(request)} />
                          <Button label="Withdraw" variant="ghost" size="sm" onClick={() => setWithdrawing(request)} />
                        </>
                      ) : (
                        <Button
                          label="Remove from list"
                          variant="ghost"
                          size="sm"
                          onClick={() => void act(`/api/requests/${request.id}`, "DELETE", "Removed from the list.")}
                        />
                      )}
                    </HStack>
                  </VStack>
                }
                endContent={<StatusBadge status={request.status} />}
              />
            );
          })}
        </List>
      )}
      <AlertDialog
        isOpen={withdrawing != null}
        onOpenChange={(next) => {
          if (!next) setWithdrawing(null);
        }}
        title="Withdraw this request?"
        description={withdrawing ? `${withdrawing.recipientName}'s link will say it was withdrawn, and they can no longer answer.` : ""}
        actionLabel="Withdraw"
        onAction={() => {
          const request = withdrawing;
          setWithdrawing(null);
          if (request) void act(`/api/requests/${request.id}/withdraw`, "POST", "Withdrawn.");
        }}
      />
    </div>
  );
}

const RECEIVED_FILTERS: Array<{ id: string; label: string; match: (status: ReceivedRequestStatus) => boolean }> = [
  { id: "all", label: "All", match: () => true },
  { id: "waiting", label: "Needs answer", match: (status) => status === "waiting" },
  { id: "approved", label: "Approved", match: (status) => status === "approved" },
  { id: "declined", label: "Declined", match: (status) => status === "declined" },
];

const RECEIVED_VARIANT: Record<ReceivedRequestStatus, "info" | "success" | "error"> = {
  waiting: "info",
  approved: "success",
  declined: "error",
};

/** Requests people sent the occupant, answered here with a note. */
function ReceivedList({
  listed,
  focusId,
  onChanged,
}: {
  listed: Listed | null;
  focusId: string | null;
  onChanged: () => Promise<void>;
}) {
  const [filter, setFilter] = useState("all");
  // Opens on what needs an answer, when anything does: chosen once the list arrives.
  const chosen = useRef(false);
  useEffect(() => {
    if (!listed || chosen.current) return;
    chosen.current = true;
    if (listed.waiting > 0) setFilter("waiting");
  }, [listed]);
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [granted, setGranted] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [gmail, setGmail] = useState(false);
  const focusRef = useRef<HTMLLIElement>(null);
  const received = useMemo(() => listed?.received ?? [], [listed]);

  useEffect(() => {
    void fetch("/api/gmail")
      .then(async (response) => (await response.json()) as { connected?: boolean; enabled?: boolean })
      .then((account) => setGmail(Boolean(account.connected && account.enabled)))
      .catch(() => setGmail(false));
  }, []);

  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: "nearest" });
  }, [focusId, received.length]);

  if (!listed) return <Text type="supporting" color="secondary">Loading…</Text>;
  if (received.length === 0) {
    return (
      <EmptyState
        isCompact
        title="Nothing received yet"
        description="When someone asks to see your career page, it arrives here for you to answer."
      />
    );
  }

  const narrowed = received.filter((request) =>
    matches(query, request.requesterName, request.requesterEmail, request.message, request.note),
  );
  const shown = narrowed.filter((request) => RECEIVED_FILTERS.find((item) => item.id === filter)!.match(request.status));
  const count = (id: string) => narrowed.filter((request) => RECEIVED_FILTERS.find((item) => item.id === id)!.match(request.status)).length;

  async function answer(request: ReceivedRequest, decision: "approved" | "declined") {
    setBusyId(request.id);
    setMessage("");
    try {
      const response = await fetch(`/api/requests/received/${request.id}/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, note: notes[request.id] ?? "" }),
      });
      const result = (await response.json().catch(() => ({}))) as { accessLink?: string | null; error?: string };
      if (!response.ok) {
        setMessage(ERRORS[result.error ?? ""] ?? "That answer could not be saved. Try again.");
        return;
      }
      if (result.accessLink) setGranted((current) => ({ ...current, [request.id]: result.accessLink as string }));
      setMessage(decision === "approved" ? `Approved. Send ${request.requesterName.split(/\s+/)[0]} the link.` : "Declined.");
      window.dispatchEvent(new Event(REQUESTS_CHANGED));
      await onChanged();
    } finally {
      setBusyId(null);
    }
  }

  async function draft(request: ReceivedRequest) {
    setMessage("");
    const response = await fetch(`/api/requests/received/${request.id}/gmail-draft`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accessLink: granted[request.id] ?? null }),
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    setMessage(
      response.ok
        ? `A reply to ${request.requesterEmail} is in Gmail. Send it when you're ready.`
        : ERRORS[result.error ?? ""] ?? "The draft could not be made.",
    );
  }

  return (
    <div className="req-sent">
      {received.length >= SEARCH_FROM || query ? <ListTools query={query} onQuery={setQuery} /> : null}
      <SegmentedControl label="Filter" size="sm" value={filter} onChange={setFilter}>
        {RECEIVED_FILTERS.map((item) => (
          <SegmentedControlItem
            key={item.id}
            value={item.id}
            label={item.id !== "all" && count(item.id) ? `${item.label} · ${count(item.id)}` : item.label}
          />
        ))}
      </SegmentedControl>
      {message ? (
        <Text type="supporting" color="secondary" role="status">
          {message}
        </Text>
      ) : null}
      {shown.length === 0 ? (
        <EmptyState isCompact title="Nothing here" description="No requests match this filter." />
      ) : (
        <List>
          {shown.map((request) => {
            const waiting = request.status === "waiting";
            const link = granted[request.id];
            return (
              <ListItem
                key={request.id}
                itemKey={request.id}
                ref={request.id === focusId ? focusRef : undefined}
                isSelected={request.id === focusId}
                align="start"
                label={
                  <HStack gap={2}>
                    <span>{request.requesterName}</span>
                    <Badge label="Access" variant="neutral" />
                  </HStack>
                }
                description={
                  <VStack gap={2}>
                    <span>
                      {request.requesterEmail} · {shortDate(request.createdAt)}
                    </span>
                    {request.message ? <Quote text={request.message} /> : null}
                    {waiting ? (
                      <>
                        {request.id in notes ? (
                          <TextArea
                            label={`Your note to ${request.requesterName.split(/\s+/)[0]} (optional)`}
                            value={notes[request.id] ?? ""}
                            onChange={(value) =>
                              setNotes((current) => ({ ...current, [request.id]: value.slice(0, REQUEST_NOTE_MAX) }))
                            }
                            rows={growRows(notes[request.id] ?? "", 2, 8)}
                            maxLength={nearLimit(notes[request.id] ?? "", REQUEST_NOTE_MAX)}
                            hasAutoFocus
                          />
                        ) : null}
                        <HStack gap={1}>
                          <Button
                            label="Approve"
                            variant="primary"
                            size="sm"
                            isDisabled={busyId === request.id}
                            onClick={() => void answer(request, "approved")}
                          />
                          <Button
                            label="Decline"
                            variant="secondary"
                            size="sm"
                            isDisabled={busyId === request.id}
                            onClick={() => void answer(request, "declined")}
                          />
                          {request.id in notes ? null : (
                            <Button
                              label="Add a note"
                              variant="ghost"
                              size="sm"
                              onClick={() => setNotes((current) => ({ ...current, [request.id]: "" }))}
                            />
                          )}
                        </HStack>
                      </>
                    ) : (
                      <>
                        {request.note ? <Quote text={request.note} prefix="Your note: " /> : null}
                        {link ? (
                          <div className="req-linkbox">
                            <code>{link}</code>
                            <Button
                              label={copiedId === request.id ? "Copied" : "Copy link"}
                              variant="secondary"
                              size="sm"
                              onClick={() => void navigator.clipboard.writeText(link).then(() => setCopiedId(request.id))}
                            />
                          </div>
                        ) : null}
                        {gmail ? (
                          <HStack gap={1}>
                            <Button label="Draft reply in Gmail" variant="ghost" size="sm" onClick={() => void draft(request)} />
                          </HStack>
                        ) : null}
                      </>
                    )}
                  </VStack>
                }
                endContent={<Badge label={RECEIVED_STATUS_LABEL[request.status]} variant={RECEIVED_VARIANT[request.status]} />}
              />
            );
          })}
        </List>
      )}
    </div>
  );
}

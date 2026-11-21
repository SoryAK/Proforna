import { useEffect, useMemo, useRef, useState } from "react";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Avatar } from "@astryxdesign/core/Avatar";
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
import type { AccessActivity } from "@core/access";
import type { WorkMapPublishSection } from "@core/work-map";
import {
  AccessChoice,
  ActivityList,
  choiceBody,
  defaultChoice,
  openAccess,
  type AccessChoiceValue,
} from "./Access";
import { Quote, growRows, matches, nearLimit, relativeTime, shortDate } from "./list-parts";
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
  openedAt: string | null;
  answeredAt: string | null;
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
  pageSections: WorkMapPublishSection[];
  createdAt: string;
  grantId: string | null;
  activity: AccessActivity[];
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

  const waiting = listed?.received.filter((request) => request.status === "waiting").slice(0, 3) ?? [];
  const yours = listed?.requests.slice(0, 3) ?? [];
  const nothing = listed != null && listed.requests.length === 0 && listed.received.length === 0;
  return (
    <VStack gap={0} className="req-menu">
      <HStack gap={2} className="req-menu-top">
        <Text type="label" weight="semibold">
          Requests
        </Text>
        <Button label="+ New" variant="secondary" size="sm" onClick={onNew} />
      </HStack>
      {failed ? (
        <EmptyState isCompact title="Requests could not be loaded." />
      ) : !listed ? (
        <Text type="supporting" color="secondary" className="req-menu-pad">
          Loading…
        </Text>
      ) : nothing ? (
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
                Waiting on you · {listed.waiting}
              </Text>
              <ul className="req-menu-rows">
                {waiting.map((request) => (
                  <li key={request.id} className="req-menu-row">
                    <Avatar name={request.requesterName} size={32} />
                    <span className="req-menu-who">
                      <span className="req-menu-name">{request.requesterName}</span>
                      <span className="req-menu-meta">wants to see your page · {relativeTime(request.createdAt)}</span>
                    </span>
                    <Button label="Answer" variant="primary" size="sm" onClick={() => onOpen("received", request.id)} />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="req-menu-caught" role="status">
              ✓ You're all caught up
            </div>
          )}
          {yours.length > 0 ? (
            <>
              <Text type="supporting" color="secondary" className="req-menu-heading">
                Your requests
              </Text>
              <ul className="req-menu-rows">
                {yours.map((request) => (
                  <li key={request.id}>
                    {/* A new answer is tinted until it's seen. */}
                    <button
                      type="button"
                      className={request.changed ? "req-menu-row is-fresh" : "req-menu-row"}
                      onClick={() => onOpen("sent", request.id)}
                    >
                      <Avatar name={request.recipientName} size={32} />
                      <span className="req-menu-who">
                        <span className="req-menu-name">{request.recipientName}</span>
                        <span className="req-menu-meta">
                          {REQUEST_KIND_LABEL[request.kind]} ·{" "}
                          {relativeTime(request.answeredAt ?? request.openedAt ?? request.createdAt)}
                        </span>
                      </span>
                      <span className={`req-menu-status is-${request.status}${request.changed ? " is-fresh" : ""}`}>
                        {SENT_STATUS_LABEL[request.status]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <div className="req-menu-foot">
            <button type="button" className="req-menu-all" onClick={() => onOpen(listed.waiting > 0 ? "received" : "sent")}>
              View all →
            </button>
            <span className="req-menu-counts">
              Sent {listed.requests.length} · Received {listed.received.length}
            </span>
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
  // One request at a time is being answered, with its choice of what they see.
  const [answering, setAnswering] = useState<{ id: string; decision: "approved" | "declined" } | null>(null);
  const [choice, setChoice] = useState<AccessChoiceValue>(() => defaultChoice([]));
  const [declineMessage, setDeclineMessage] = useState("");
  const [openActivity, setOpenActivity] = useState<string | null>(null);
  const [justAnswered, setJustAnswered] = useState<string | null>(null);
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

  const focused = justAnswered ?? focusId;
  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: "nearest" });
  }, [focused, received.length]);

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

  function startAnswer(request: ReceivedRequest, decision: "approved" | "declined") {
    setAnswering({ id: request.id, decision });
    setChoice(defaultChoice(request.pageSections));
    setDeclineMessage("");
  }

  async function answer(request: ReceivedRequest, decision: "approved" | "declined") {
    setBusyId(request.id);
    setMessage("");
    try {
      const body =
        decision === "approved"
          ? { decision, note: choice.message, ...choiceBody(choice, request.pageSections) }
          : { decision, note: declineMessage };
      const response = await fetch(`/api/requests/received/${request.id}/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as { accessLink?: string | null; error?: string };
      if (!response.ok) {
        setMessage(ERRORS[result.error ?? ""] ?? "That answer could not be saved. Try again.");
        return;
      }
      if (result.accessLink) setGranted((current) => ({ ...current, [request.id]: result.accessLink as string }));
      setMessage(decision === "approved" ? `Approved. Send ${request.requesterName.split(/\s+/)[0]} the link.` : "Declined.");
      setAnswering(null);
      // Keep the answered request in view, with its link and the way into Access.
      setFilter("all");
      setJustAnswered(request.id);
      window.dispatchEvent(new Event(REQUESTS_CHANGED));
      window.dispatchEvent(new Event("docier:access-changed"));
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
                ref={request.id === focused ? focusRef : undefined}
                isSelected={request.id === focused}
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
                    {waiting && answering?.id === request.id && answering.decision === "approved" ? (
                      <div className="access-box">
                        <Text type="label">Approve {request.requesterName.split(/\s+/)[0]} — what can they see?</Text>
                        <AccessChoice
                          page={request.pageSections}
                          value={choice}
                          onChange={setChoice}
                          who={request.requesterName.split(/\s+/)[0]}
                        />
                        <div className="req-actions">
                          <Button label="Cancel" variant="ghost" size="sm" onClick={() => setAnswering(null)} />
                          <Button
                            label="Approve"
                            variant="primary"
                            size="sm"
                            isDisabled={busyId === request.id || choice.sections.length === 0}
                            onClick={() => void answer(request, "approved")}
                          />
                        </div>
                      </div>
                    ) : waiting && answering?.id === request.id ? (
                      <div className="access-box">
                        <TextArea
                          label={`Message to ${request.requesterName.split(/\s+/)[0]} (optional)`}
                          value={declineMessage}
                          onChange={(value) => setDeclineMessage(value.slice(0, REQUEST_NOTE_MAX))}
                          rows={growRows(declineMessage, 2, 8)}
                          maxLength={nearLimit(declineMessage, REQUEST_NOTE_MAX)}
                          hasAutoFocus
                        />
                        <div className="req-actions">
                          <Button label="Cancel" variant="ghost" size="sm" onClick={() => setAnswering(null)} />
                          <Button
                            label="Decline"
                            variant="primary"
                            size="sm"
                            isDisabled={busyId === request.id}
                            onClick={() => void answer(request, "declined")}
                          />
                        </div>
                      </div>
                    ) : waiting ? (
                      <HStack gap={1}>
                        <Button label="Approve" variant="primary" size="sm" onClick={() => startAnswer(request, "approved")} />
                        <Button label="Decline" variant="secondary" size="sm" onClick={() => startAnswer(request, "declined")} />
                      </HStack>
                    ) : (
                      <>
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
                        {openActivity === request.id ? (
                          <ActivityList activity={request.activity} name={request.requesterName} />
                        ) : null}
                        <HStack gap={1} className="access-actions">
                          {request.grantId ? (
                            <Button
                              label="Manage in Access"
                              variant="secondary"
                              size="sm"
                              onClick={() => openAccess(request.grantId ?? undefined)}
                            />
                          ) : null}
                          <Button
                            label={openActivity === request.id ? "Hide activity" : "Activity"}
                            variant="ghost"
                            size="sm"
                            onClick={() => setOpenActivity((current) => (current === request.id ? null : request.id))}
                          />
                          {gmail ? (
                            <Button label="Draft reply in Gmail" variant="ghost" size="sm" onClick={() => void draft(request)} />
                          ) : null}
                        </HStack>
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

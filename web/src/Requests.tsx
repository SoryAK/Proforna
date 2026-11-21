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
  REQUEST_KINDS,
  REQUEST_KIND_LABEL,
  SENT_STATUS_LABEL,
  type RequestKind,
  type SentRequestStatus,
} from "@core/requests";
import "./requests.css";

export type RequestsTab = "new" | "sent";

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
};

type Listed = { requests: SentRequest[]; stale: boolean; relayConfigured: boolean };
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
      ) : recent.length === 0 ? (
        <EmptyState
          isCompact
          title="No requests yet"
          description="Ask anyone for a reference, an introduction, or a recommendation. They answer on a private link."
        />
      ) : (
        <>
          <Text type="supporting" color="secondary" className="req-menu-heading">
            Recent
          </Text>
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
            <Button label="View all requests" variant="ghost" size="sm" onClick={() => onOpen("sent")} />
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
              <TabList value={tab} onChange={(next) => onTab(next === "new" ? "new" : "sent")} hasDivider>
                <Tab value="new" label={editing ? "Edit request" : "New request"} />
                <Tab value="sent" label="Sent" />
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
      <TextArea label="Request" value={body} onChange={setBody} rows={4} />
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

  const shown = requests.filter((request) => FILTERS.find((item) => item.id === filter)!.match(request.status));
  const count = (id: string) => requests.filter((request) => FILTERS.find((item) => item.id === id)!.match(request.status)).length;

  async function act(url: string, method: string, done: string) {
    const response = await fetch(url, { method });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    setMessage(response.ok ? done : ERRORS[result.error ?? ""] ?? "That didn't work. Try again.");
    await onChanged();
  }

  return (
    <div className="req-sent">
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
                    {request.note ? <span className="req-note">“{request.note}”</span> : null}
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

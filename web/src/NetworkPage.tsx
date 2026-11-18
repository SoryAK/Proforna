import { useEffect, useRef, useState } from "react";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Heading } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { UserRound } from "lucide-react";

type NetworkContact = {
  id: string;
  name: string;
  organization: string;
  role: string;
  email: string;
  unread_inbound?: number;
};

type ThreadMessage = {
  id: string;
  direction: string;
  body: string;
  createdAt: string;
};

type ProposedReply = {
  id: string;
  purpose: string;
  body: string;
};

type PersonDraft = {
  id: string | null;
  name: string;
  organization: string;
  role: string;
  email: string;
};

const EMPTY_PERSON: PersonDraft = {
  id: null,
  name: "",
  organization: "",
  role: "",
  email: "",
};

export function NetworkPage() {
  const [contacts, setContacts] = useState<NetworkContact[]>([]);
  const [loadError, setLoadError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [proposedReplies, setProposedReplies] = useState<ProposedReply[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("");
  const [formError, setFormError] = useState("");
  const [person, setPerson] = useState<PersonDraft | null>(null);
  const [removing, setRemoving] = useState<NetworkContact | null>(null);
  const [allowRemote, setAllowRemote] = useState(false);
  const [agencyBusy, setAgencyBusy] = useState(false);
  const agencyAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    void load();
    return () => {
      agencyAbort.current?.abort();
    };
  }, []);

  async function load() {
    try {
      const response = await fetch("/api/career-management");
      if (!response.ok) {
        setLoadError("Could not load My Network.");
        return;
      }
      const body = (await response.json()) as { contacts: NetworkContact[] };
      setContacts(body.contacts);
      setLoadError("");
    } catch {
      setLoadError("Could not load My Network.");
    }
  }

  async function openThread(contactId: string) {
    setSelectedId(contactId);
    setStatus("");
    const response = await fetch(`/api/contacts/${contactId}/messages`);
    if (!response.ok) {
      setMessages([]);
      setProposedReplies([]);
      return;
    }
    const body = (await response.json()) as {
      messages: ThreadMessage[];
      proposedReplies?: ProposedReply[];
    };
    setMessages(body.messages);
    setProposedReplies(body.proposedReplies ?? []);
    window.dispatchEvent(new Event("proforna:notices-changed"));
    await load();
  }

  function openAdd() {
    setFormError("");
    setPerson({ ...EMPTY_PERSON });
  }

  function openEdit(contact: NetworkContact) {
    setFormError("");
    setPerson({
      id: contact.id,
      name: contact.name,
      organization: contact.organization,
      role: contact.role,
      email: contact.email,
    });
  }

  async function savePerson() {
    if (!person) return;
    const payload = {
      name: person.name,
      organization: person.organization,
      role: person.role,
      email: person.email,
    };
    const response = await fetch(
      person.id ? `/api/contacts/${person.id}` : "/api/contacts",
      {
        method: person.id ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setFormError(contactError(body?.error));
      return;
    }
    setPerson(null);
    await load();
  }

  async function removePerson() {
    if (!removing) return;
    const response = await fetch(`/api/contacts/${removing.id}`, { method: "DELETE" });
    if (!response.ok) {
      setStatus("Could not remove that person.");
      setRemoving(null);
      return;
    }
    if (selectedId === removing.id) {
      setSelectedId(null);
      setMessages([]);
      setProposedReplies([]);
    }
    setRemoving(null);
    await load();
  }

  async function sendMessage() {
    if (!selectedId || !draft.trim()) {
      setStatus("Add a message before sending.");
      return;
    }
    const response = await fetch(`/api/contacts/${selectedId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: draft }),
    });
    setStatus(response.ok ? "" : "Add a message before sending.");
    if (!response.ok) return;
    setDraft("");
    await openThread(selectedId);
  }

  async function suggestReply() {
    if (!selectedId || agencyBusy) return;
    setStatus("");
    const abort = new AbortController();
    agencyAbort.current = abort;
    setAgencyBusy(true);
    try {
      const response = await fetch("/api/agency/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          purpose: "suggest-reply",
          scope: { type: "contact", id: selectedId },
          grant: { remoteModel: allowRemote },
        }),
        signal: abort.signal,
      });
      if (response.status === 403) {
        setAllowRemote(true);
        setStatus("This uses a cloud model. Suggest again if this thread may leave the machine.");
        return;
      }
      if (response.status === 409) {
        setStatus("Proforna is already using the model.");
        return;
      }
      if (!response.ok) {
        setStatus("Connect a model in Settings before asking Proforna.");
        return;
      }
      await openThread(selectedId);
      window.dispatchEvent(new Event("proforna:notices-changed"));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      throw error;
    } finally {
      if (agencyAbort.current === abort) agencyAbort.current = null;
      setAgencyBusy(false);
    }
  }

  async function approveReply(changeSetId: string) {
    if (!selectedId) return;
    const response = await fetch(
      `/api/contacts/${selectedId}/replies/${changeSetId}/approve`,
      { method: "POST" },
    );
    setStatus(response.ok ? "" : "Could not send that draft.");
    if (!response.ok) return;
    await openThread(selectedId);
    window.dispatchEvent(new Event("proforna:notices-changed"));
  }

  const selected = contacts.find((contact) => contact.id === selectedId) ?? null;

  return (
    <section className="career-page network-page">
      <div className="network-head">
        <Heading level={2}>My Network</Heading>
        <Button label="Add person" variant="primary" onClick={openAdd} />
      </div>
      <div className="network-split">
        <div className="network-people">
          {loadError ? (
            <VStack gap={3}>
              <Banner status="error" title={loadError} container="section" collapsible={false} role="alert" />
              <Button label="Try again" variant="secondary" onClick={() => void load()} />
            </VStack>
          ) : contacts.length === 0 ? (
            <EmptyState
              title="No one yet"
              description="Add a person to keep the conversation with them."
              icon={<UserRound size={28} aria-hidden="true" />}
            />
          ) : (
            <List hasDividers edge="outset" aria-label="People">
              {contacts.map((contact) => {
                const detail = [contact.role, contact.organization].filter(Boolean).join(" · ");
                const unread = Number(contact.unread_inbound) || 0;
                return (
                  <ListItem
                    key={contact.id}
                    itemKey={contact.id}
                    label={contact.name}
                    description={detail || contact.email || "No details yet"}
                    startContent={<Avatar name={contact.name} size={32} tooltip={false} />}
                    endContent={unread > 0 ? <Badge label={String(unread)} variant="info" /> : undefined}
                    isSelected={contact.id === selectedId}
                    onClick={() => void openThread(contact.id)}
                  />
                );
              })}
            </List>
          )}
        </div>
        <div className="network-thread">
          {selected ? (
            <>
              <div className="network-thread-head">
                <div>
                  <Heading level={3}>{selected.name}</Heading>
                  <p className="network-meta">
                    {[selected.role, selected.organization, selected.email].filter(Boolean).join(" · ") ||
                      "No details yet"}
                  </p>
                </div>
                <HStack gap={2}>
                  <Button label="Edit" variant="secondary" size="sm" onClick={() => openEdit(selected)} />
                  <Button label="Remove" variant="ghost" size="sm" onClick={() => setRemoving(selected)} />
                </HStack>
              </div>
              {messages.length === 0 ? (
                <EmptyState title="No messages yet" description="Write the first message in this thread." />
              ) : (
                <ol className="network-messages">
                  {messages.map((message) => (
                    <li
                      key={message.id}
                      className={
                        message.direction === "outbound"
                          ? "network-message is-outbound"
                          : "network-message"
                      }
                    >
                      <span>{message.direction === "outbound" ? "You" : selected.name}</span>
                      <p>{message.body}</p>
                    </li>
                  ))}
                </ol>
              )}
              {proposedReplies.length > 0 ? (
                <VStack gap={3}>
                  <Heading level={4}>Review the draft</Heading>
                  {proposedReplies.map((reply) => (
                    <VStack key={reply.id} gap={2}>
                      <p className="network-draft">{reply.body}</p>
                      <Button
                        label="Approve and send"
                        variant="primary"
                        size="sm"
                        isDisabled={agencyBusy}
                        onClick={() => void approveReply(reply.id)}
                      />
                    </VStack>
                  ))}
                </VStack>
              ) : null}
              <div className="network-composer">
                <TextArea
                  label="Message"
                  isLabelHidden
                  value={draft}
                  onChange={setDraft}
                  placeholder="Write a message"
                  rows={3}
                />
                <HStack gap={2}>
                  <Button label="Send" variant="primary" onClick={() => void sendMessage()} />
                  <Button
                    label={agencyBusy ? "Working…" : "Suggest a reply"}
                    variant="secondary"
                    isDisabled={agencyBusy}
                    onClick={() => void suggestReply()}
                  />
                </HStack>
              </div>
              {status ? (
                <Banner status="error" title={status} container="section" collapsible={false} role="alert" />
              ) : null}
            </>
          ) : (
            <EmptyState
              title="Choose a person"
              description="Open someone on the left to continue the conversation."
              icon={<UserRound size={28} aria-hidden="true" />}
            />
          )}
        </div>
      </div>
      <Dialog
        isOpen={person != null}
        onOpenChange={(next) => {
          if (!next) setPerson(null);
        }}
        width={440}
        purpose="form"
      >
        <Layout
          padding={4}
          header={
            <DialogHeader
              title={person?.id ? "Edit person" : "Add person"}
              onOpenChange={() => setPerson(null)}
              hasDivider={false}
            />
          }
          content={
            <LayoutContent label={person?.id ? "Edit person" : "Add person"}>
              <VStack gap={3}>
                {formError ? (
                  <Banner status="error" title={formError} container="section" collapsible={false} role="alert" />
                ) : null}
                <TextInput
                  label="Name"
                  isRequired
                  value={person?.name ?? ""}
                  onChange={(name) => setPerson((current) => (current ? { ...current, name } : current))}
                />
                <TextInput
                  label="Organization"
                  value={person?.organization ?? ""}
                  onChange={(organization) =>
                    setPerson((current) => (current ? { ...current, organization } : current))
                  }
                />
                <TextInput
                  label="Role"
                  value={person?.role ?? ""}
                  onChange={(role) => setPerson((current) => (current ? { ...current, role } : current))}
                />
                <TextInput
                  label="Email"
                  value={person?.email ?? ""}
                  onChange={(email) => setPerson((current) => (current ? { ...current, email } : current))}
                />
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} vAlign="center">
                <Button label="Cancel" variant="secondary" onClick={() => setPerson(null)} />
                <Button label="Save" variant="primary" onClick={() => void savePerson()} />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
      <AlertDialog
        isOpen={removing != null}
        onOpenChange={(next) => {
          if (!next) setRemoving(null);
        }}
        title="Remove this person?"
        description={removing ? `${removing.name} leaves My Network.` : ""}
        actionLabel="Remove"
        onAction={() => void removePerson()}
      />
    </section>
  );
}

function contactError(code: string | undefined): string {
  if (code === "name-required") return "A name is required.";
  if (code === "not-found") return "That person is no longer in My Network.";
  return "Could not save this person.";
}

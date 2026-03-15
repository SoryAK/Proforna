"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, MoreHorizontal, Pencil, Trash2, Mail, Phone, Linkedin } from "lucide-react";
import { toast } from "sonner";
import { RELATIONSHIP_TYPES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface Contact {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  role?: string | null;
  linkedinUrl?: string | null;
  relationship: string;
  notes?: string | null;
  lastContactedAt?: string | null;
  createdAt: string;
}

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  company: "",
  role: "",
  linkedinUrl: "",
  relationship: "other",
  notes: "",
  lastContactedAt: "",
};

const relationshipColors: Record<string, string> = {
  recruiter: "bg-blue-100 text-blue-700",
  referral: "bg-purple-100 text-purple-700",
  colleague: "bg-green-100 text-green-700",
  mentor: "bg-amber-100 text-amber-700",
  other: "bg-gray-100 text-gray-700",
};

export default function ContactsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");

  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ["contacts"],
    queryFn: () => fetch("/api/contacts").then((r) => r.json()),
  });

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const url = editingId ? `/api/contacts/${editingId}` : "/api/contacts";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success(editingId ? "Contact updated" : "Contact added");
      closeDialog();
    },
    onError: () => toast.error("Failed to save contact"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/contacts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Contact deleted");
    },
  });

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function openEdit(c: Contact) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      email: c.email || "",
      phone: c.phone || "",
      company: c.company || "",
      role: c.role || "",
      linkedinUrl: c.linkedinUrl || "",
      relationship: c.relationship,
      notes: c.notes || "",
      lastContactedAt: c.lastContactedAt ? c.lastContactedAt.slice(0, 10) : "",
    });
    setDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: Record<string, unknown> = {
      name: form.name,
      email: form.email || null,
      phone: form.phone || null,
      company: form.company || null,
      role: form.role || null,
      linkedinUrl: form.linkedinUrl || null,
      relationship: form.relationship,
      notes: form.notes || null,
      lastContactedAt: form.lastContactedAt ? new Date(form.lastContactedAt).toISOString() : null,
    };
    saveMutation.mutate(data);
  }

  function initials(name: string) {
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  const filtered = contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.company || "").toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-2xl font-bold">Contacts</h1>
          <p className="text-sm text-muted-foreground">{contacts.length} contacts</p>
        </div>
        <div className="flex items-center gap-3">
          <Input
            placeholder="Search name or company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Contact
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No contacts found</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((c) => (
              <Card key={c.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback>{initials(c.name)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">{c.name}</p>
                        {c.role && c.company && (
                          <p className="text-xs text-muted-foreground">
                            {c.role} at {c.company}
                          </p>
                        )}
                        {!c.role && c.company && (
                          <p className="text-xs text-muted-foreground">{c.company}</p>
                        )}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-accent">
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(c)}>
                          <Pencil className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => deleteMutation.mutate(c.id)} className="text-red-600">
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <Badge className={`text-xs capitalize ${relationshipColors[c.relationship] || ""}`}>
                      {c.relationship}
                    </Badge>
                  </div>

                  <div className="mt-3 space-y-1">
                    {c.email && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Mail className="h-3.5 w-3.5" />
                        <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a>
                      </div>
                    )}
                    {c.phone && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Phone className="h-3.5 w-3.5" />
                        {c.phone}
                      </div>
                    )}
                    {c.linkedinUrl && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Linkedin className="h-3.5 w-3.5" />
                        <a href={c.linkedinUrl} target="_blank" rel="noopener noreferrer" className="hover:underline truncate">
                          LinkedIn
                        </a>
                      </div>
                    )}
                  </div>

                  {c.lastContactedAt && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Last contacted {format(new Date(c.lastContactedAt), "MMM d, yyyy")}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Contact" : "Add Contact"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Company</Label>
                <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
              </div>
              <div>
                <Label>Role</Label>
                <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>LinkedIn URL</Label>
              <Input type="url" value={form.linkedinUrl} onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Relationship</Label>
                <Select value={form.relationship} onValueChange={(v) => setForm({ ...form, relationship: v ?? form.relationship })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIP_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Last Contacted</Label>
                <Input
                  type="date"
                  value={form.lastContactedAt}
                  onChange={(e) => setForm({ ...form, lastContactedAt: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : editingId ? "Update" : "Add"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

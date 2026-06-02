"use client";

import { Camera } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { AVAILABILITY_STATUSES, AVAILABILITY_LABELS } from "@/lib/constants";
import type { EditProfileForm } from "./types";

interface EditProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editForm: EditProfileForm;
  setEditForm: React.Dispatch<React.SetStateAction<EditProfileForm>>;
  isPending: boolean;
  onSubmit: () => void;
}

export function EditProfileDialog({
  open,
  onOpenChange,
  editForm,
  setEditForm,
  isPending,
  onSubmit,
}: EditProfileDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          className="space-y-4"
        >
          {/* Profile Picture */}
          <div className="flex flex-col items-center gap-2">
            <div className="relative group">
              <div className="h-24 w-24 rounded-full border-2 border-muted bg-muted/30 overflow-hidden flex items-center justify-center">
                {editForm.avatarUrl ? (
                  <img src={editForm.avatarUrl} alt="Profile" className="h-full w-full object-cover" />
                ) : (
                  <Camera className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <label className="absolute inset-0 flex items-center justify-center rounded-full cursor-pointer bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="h-5 w-5 text-white" />
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      setEditForm((f) => ({ ...f, avatarUrl: reader.result as string }));
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
            </div>
            <span className="text-xs text-muted-foreground">Click to change photo</span>
            {editForm.avatarUrl && (
              <button
                type="button"
                className="text-xs text-red-500 hover:underline"
                onClick={() => setEditForm((f) => ({ ...f, avatarUrl: "" }))}
              >
                Remove photo
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ep-fullName">Full Name</Label>
              <Input
                id="ep-fullName"
                value={editForm.fullName}
                onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep-headline">Headline</Label>
              <Input
                id="ep-headline"
                value={editForm.headline}
                onChange={(e) => setEditForm((f) => ({ ...f, headline: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ep-email">Email</Label>
              <Input
                id="ep-email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep-phone">Phone</Label>
              <Input
                id="ep-phone"
                value={editForm.phone}
                onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ep-city">City</Label>
              <Input
                id="ep-city"
                value={editForm.city}
                onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep-state">State</Label>
              <Input
                id="ep-state"
                value={editForm.state}
                onChange={(e) => setEditForm((f) => ({ ...f, state: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Availability</Label>
            <Select
              value={editForm.availability}
              onValueChange={(v) => setEditForm((f) => ({ ...f, availability: v ?? f.availability }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AVAILABILITY_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {AVAILABILITY_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ep-bio">Bio</Label>
            <Textarea
              id="ep-bio"
              rows={3}
              value={editForm.bio}
              onChange={(e) => setEditForm((f) => ({ ...f, bio: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ep-roles">Preferred Roles</Label>
            <Input
              id="ep-roles"
              placeholder="e.g. Frontend Engineer, Full-Stack"
              value={editForm.preferredRoles}
              onChange={(e) => setEditForm((f) => ({ ...f, preferredRoles: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ep-locPref">Location Preference</Label>
            <Input
              id="ep-locPref"
              placeholder="e.g. Remote, NYC, SF"
              value={editForm.locationPreference}
              onChange={(e) => setEditForm((f) => ({ ...f, locationPreference: e.target.value }))}
            />
          </div>
          <Separator />
          <div className="space-y-1.5">
            <Label htmlFor="ep-linkedin">LinkedIn URL</Label>
            <Input
              id="ep-linkedin"
              value={editForm.linkedinUrl}
              onChange={(e) => setEditForm((f) => ({ ...f, linkedinUrl: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ep-github">GitHub URL</Label>
            <Input
              id="ep-github"
              value={editForm.githubUrl}
              onChange={(e) => setEditForm((f) => ({ ...f, githubUrl: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ep-portfolio">Portfolio URL</Label>
            <Input
              id="ep-portfolio"
              value={editForm.portfolioUrl}
              onChange={(e) => setEditForm((f) => ({ ...f, portfolioUrl: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ep-scheduling">Scheduling URL</Label>
            <Input
              id="ep-scheduling"
              placeholder="https://calendly.com/your-handle"
              value={editForm.schedulingUrl}
              onChange={(e) => setEditForm((f) => ({ ...f, schedulingUrl: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              Calendly, Cal.com, or any link where recruiters can book time. Powers the
              &ldquo;Schedule interview&rdquo; button on your public resume.
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Shared category metadata + small helpers used across the documents UI.
 * Kept here so tiles, list rows, edit dialog, and upload dialog stay in sync.
 */

import { File as FileIcon, FileSpreadsheet, Image as ImageIcon } from "lucide-react";
import type { ComponentType } from "react";

export const CATEGORIES = [
  { value: "offer_letter", label: "Offer Letter" },
  { value: "cover_letter", label: "Cover Letter" },
  { value: "certificate", label: "Certificate" },
  { value: "contract", label: "Contract" },
  { value: "pay_stub", label: "Pay Stub" },
  { value: "tax_form", label: "Tax Form" },
  { value: "manual", label: "Manual / Guide" },
  { value: "ebook", label: "eBook" },
  { value: "learning_material", label: "Learning Material" },
  { value: "other", label: "Other" },
] as const;

export const CATEGORY_COLORS: Record<string, string> = {
  offer_letter: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  cover_letter: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  certificate: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  contract: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  pay_stub: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  tax_form: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  manual: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
  ebook: "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300",
  learning_material: "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300",
  other: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

export function categoryLabel(value: string): string {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

type IconType = ComponentType<{ className?: string }>;

export function fileIcon(mime: string): IconType {
  if (mime.startsWith("image/")) return ImageIcon;
  if (mime.includes("spreadsheet") || mime === "text/csv") return FileSpreadsheet;
  return FileIcon;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Mime types accepted by the upload dialog (matches API server-side allowlist). */
export const UPLOAD_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.txt,.csv";

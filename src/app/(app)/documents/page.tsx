"use client";

import { DocumentsPage } from "@/components/documents/documents-page";

/**
 * Thin entry-point: the real implementation lives under src/components/documents/
 * so the page can be split across multiple focused files (toolbar, breadcrumb,
 * grid, list, dialogs) without dumping everything into one route file.
 */
export default function DocumentsRoutePage() {
  return <DocumentsPage />;
}

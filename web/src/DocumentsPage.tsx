import { useEffect, useRef, useState } from "react";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { Selector } from "@astryxdesign/core/Selector";
import { pixel, proportional, Table } from "@astryxdesign/core/Table";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { DOCUMENT_KINDS, type DocumentKind } from "@core/document-vault";
import { File as FileIcon, Upload } from "lucide-react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

type VaultDocument = {
  id: string;
  originalName: string;
  mediaType: string;
  sizeBytes: number;
  category: string;
  createdAt: string;
};

const KIND_LABELS: Record<DocumentKind, string> = {
  evidence: "Evidence",
  resume: "Resume",
  offer: "Offer",
  certificate: "Certificate",
};

type FileSort = "newest" | "name" | "size";

export function DocumentsPage() {
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const loadGeneration = useRef(0);
  const [editing, setEditing] = useState<VaultDocument | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<DocumentKind>("evidence");
  const [removing, setRemoving] = useState<VaultDocument | null>(null);
  const [preview, setPreview] = useState<VaultDocument | null>(null);
  const [sort, setSort] = useState<FileSort>("newest");
  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const generation = loadGeneration.current + 1;
    loadGeneration.current = generation;
    try {
      const response = await fetch("/api/documents");
      if (generation !== loadGeneration.current) return;
      if (!response.ok) {
        setLoadError("Could not load your files.");
        return;
      }
      const payload = (await response.json()) as { documents: VaultDocument[] };
      if (generation !== loadGeneration.current) return;
      setDocuments(payload.documents);
      setLoadError("");
    } catch {
      if (generation !== loadGeneration.current) return;
      setLoadError("Could not load your files.");
    }
  }

  async function upload(files: File[]) {
    setMessage("");
    for (const file of files) {
      const form = new FormData();
      form.set("file", file);
      form.set("category", "evidence");
      const response = await fetch("/api/documents", { method: "POST", body: form });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setMessage(documentError(body?.error));
        break;
      }
    }
    await load();
  }

  function openEditor(document: VaultDocument) {
    setEditing(document);
    setName(document.originalName);
    setKind(isKind(document.category) ? document.category : "evidence");
    setMessage("");
  }

  async function saveEdit() {
    if (!editing) return;
    const response = await fetch(`/api/documents/${editing.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, kind }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setMessage(documentError(body?.error));
      return;
    }
    setEditing(null);
    await load();
  }

  async function remove() {
    if (!removing) return;
    const response = await fetch(`/api/documents/${removing.id}`, { method: "DELETE" });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setMessage(documentError(body?.error));
    }
    setRemoving(null);
    await load();
  }

  const uploadControl = (
    <>
      <Button
        label="Upload"
        variant="primary"
        icon={<Upload size={16} aria-hidden="true" />}
        onClick={() => uploadRef.current?.click()}
      />
      <input
        ref={uploadRef}
        className="documents-upload-input"
        type="file"
        multiple
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const picked = [...(event.target.files ?? [])];
          event.target.value = "";
          if (picked.length > 0) void upload(picked);
        }}
      />
    </>
  );

  const recent = [...documents].sort(byNewest).slice(0, 5);
  const rows = [...documents].sort(sorter(sort));

  return (
    <section className="career-page documents-page">
      <h1 className="documents-title">My Docs</h1>
      <Layout
        height="fill"
        header={
          <HStack className="documents-toolbar" hAlign="between" vAlign="center" style={{ width: "100%" }}>
            {uploadControl}
            {documents.length > 0 ? (
              <Selector
                label="Sort"
                value={sort}
                width="11rem"
                onChange={(value) => {
                  if (value === "newest" || value === "name" || value === "size") setSort(value);
                }}
                options={[
                  { value: "newest", label: "Newest" },
                  { value: "name", label: "Name" },
                  { value: "size", label: "Size" },
                ]}
              />
            ) : null}
          </HStack>
        }
        content={
          <LayoutContent label="My Docs">
            <VStack gap={5}>
              {message ? <Banner status="error" title={message} container="section" collapsible={false} role="alert" /> : null}
              {loadError ? (
                <VStack gap={3}>
                  <Banner status="error" title={loadError} container="section" collapsible={false} role="alert" />
                  <Button label="Try again" variant="secondary" onClick={() => void load()} />
                </VStack>
              ) : null}
              {documents.length === 0 && !loadError ? (
                <EmptyState
                  title="No files yet"
                  description="Upload evidence, a resume, an offer, or a certificate."
                  icon={<FileIcon size={28} aria-hidden="true" />}
                />
              ) : (
                <>
                  <section className="documents-block" aria-labelledby="documents-recent-title">
                    <h2 id="documents-recent-title">Recently added</h2>
                    <div className="documents-recent">
                      {recent.map((document) => (
                        <article className="documents-tile" key={document.id}>
                          <button
                            type="button"
                            className="documents-tile-link"
                            onClick={() => setPreview(document)}
                          >
                            <span className="documents-tile-preview">
                              {isImage(document) ? (
                                <img src={`/api/documents/${document.id}?inline=1`} alt="" />
                              ) : (
                                <FileIcon size={28} aria-hidden="true" />
                              )}
                            </span>
                            <strong>{document.originalName}</strong>
                            <span>{tileDetail(document)}</span>
                          </button>
                          <div className="documents-tile-menu">
                            <FileMenu document={document} onPreview={setPreview} onRename={openEditor} onRemove={setRemoving} />
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                  <section className="documents-block" aria-labelledby="documents-all-title">
                    <h2 id="documents-all-title">All files</h2>
                    <Table
                      data={rows}
                      columns={[
                        {
                          key: "originalName",
                          header: "Name",
                          width: proportional(2, { minWidth: 120 }),
                          renderCell: (document) => (
                            <button type="button" className="documents-name" onClick={() => setPreview(document)}>
                              <FileIcon size={16} aria-hidden="true" />
                              <span>{document.originalName}</span>
                            </button>
                          ),
                        },
                        {
                          key: "createdAt",
                          header: "Added",
                          width: pixel(78),
                          renderCell: (document) => fileWhen(document.createdAt),
                        },
                        {
                          key: "sizeBytes",
                          header: "Size",
                          width: pixel(64),
                          renderCell: (document) => fileSize(document.sizeBytes),
                        },
                        {
                          key: "id",
                          header: "Manage",
                          width: pixel(84),
                          align: "end",
                          renderCell: (document) => (
                            <FileMenu document={document} onPreview={setPreview} onRename={openEditor} onRemove={setRemoving} />
                          ),
                        },
                      ]}
                      density="compact"
                      dividers="rows"
                      hasHover
                    />
                  </section>
                </>
              )}
            </VStack>
          </LayoutContent>
        }
      />
      <Dialog
        isOpen={editing != null}
        onOpenChange={(next) => {
          if (!next) setEditing(null);
        }}
        width={440}
        purpose="form"
      >
        <Layout
          padding={4}
          header={<DialogHeader title="File" onOpenChange={() => setEditing(null)} hasDivider={false} />}
          content={
            <LayoutContent label="File">
              <VStack gap={3}>
                {message ? <Banner status="error" title={message} container="section" collapsible={false} role="alert" /> : null}
                <TextInput label="Name" value={name} onChange={setName} />
                <Selector
                  label="Kind"
                  value={kind}
                  onChange={(value) => {
                    if (isKind(value)) setKind(value);
                  }}
                  options={DOCUMENT_KINDS.map((item) => ({ value: item, label: KIND_LABELS[item] }))}
                />
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} vAlign="center">
                <Button label="Cancel" variant="secondary" onClick={() => setEditing(null)} />
                <Button label="Save" variant="primary" onClick={() => void saveEdit()} />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
      <Dialog
        isOpen={preview != null}
        onOpenChange={(next) => {
          if (!next) setPreview(null);
        }}
        width={720}
        purpose="info"
      >
        <Layout
          padding={4}
          header={
            <DialogHeader
              title={preview?.originalName ?? "File"}
              onOpenChange={() => setPreview(null)}
              hasDivider={false}
            />
          }
          content={
            <LayoutContent label="Preview">
              {preview ? <FilePreview file={preview} /> : null}
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} vAlign="center">
                <Button label="Close" variant="secondary" onClick={() => setPreview(null)} />
                {preview ? (
                  <Button label="Download" variant="primary" onClick={() => downloadFile(preview)} />
                ) : null}
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
        title="Remove this file?"
        description={removing ? `${removing.originalName} leaves My Docs.` : ""}
        actionLabel="Remove"
        onAction={() => void remove()}
      />
    </section>
  );
}

function FileMenu({
  document,
  onPreview,
  onRename,
  onRemove,
}: {
  document: VaultDocument;
  onPreview: (document: VaultDocument) => void;
  onRename: (document: VaultDocument) => void;
  onRemove: (document: VaultDocument) => void;
}) {
  return (
    <MoreMenu
      label={`Actions for ${document.originalName}`}
      items={[
        { id: "open", label: "Open", onClick: () => onPreview(document) },
        { id: "download", label: "Download", onClick: () => downloadFile(document) },
        { id: "rename", label: "Rename", onClick: () => onRename(document) },
        { id: "remove", label: "Remove", variant: "destructive", onClick: () => onRemove(document) },
      ]}
    />
  );
}

function downloadFile(file: VaultDocument) {
  const link = window.document.createElement("a");
  link.href = `/api/documents/${file.id}`;
  link.download = file.originalName;
  link.click();
}

function FilePreview({ file }: { file: VaultDocument }) {
  const url = `/api/documents/${file.id}?inline=1`;
  if (isImage(file)) return <img className="documents-preview-media" src={url} alt={file.originalName} />;
  if (isPdf(file)) return <PdfPreview url={url} />;
  if (isVideo(file)) return <video className="documents-preview-media" src={url} controls />;
  if (isAudio(file)) return <audio src={url} controls />;
  if (isText(file)) return <TextPreview url={url} />;
  return (
    <p className="documents-preview-note">
      This file can’t be shown here. Download it to open it on this computer.
    </p>
  );
}

function PdfPreview({ url }: { url: string }) {
  const host = useRef<HTMLDivElement>(null);
  const docRef = useRef<Awaited<ReturnType<ReturnType<typeof getDocument>["promise"]>> | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);

  useEffect(() => {
    let cancel = false;
    const controller = new AbortController();
    setNote(null);
    setPage(1);
    setPageCount(0);
    const taskPromise = fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("unreadable");
        return response.arrayBuffer();
      })
      .then((buffer) => getDocument({ data: new Uint8Array(buffer) }));
    void taskPromise
      .then(async (task) => {
        try {
          const doc = await task.promise;
          if (cancel) return;
          docRef.current = doc;
          setPageCount(doc.numPages);
        } catch {
          if (!cancel) setNote("This file can’t be shown here. Download it to open it on this computer.");
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancel) setNote("This file can’t be shown here. Download it to open it on this computer.");
      });
    return () => {
      cancel = true;
      controller.abort();
      docRef.current = null;
      void taskPromise.then((task) => task.destroy()).catch(() => undefined);
    };
  }, [url]);

  useEffect(() => {
    const doc = docRef.current;
    const target = host.current;
    if (!doc || !target || pageCount < 1) return;
    let cancel = false;
    let renderTask: { cancel: () => void } | null = null;
    void (async () => {
      try {
        const pageView = await doc.getPage(page);
        if (cancel) return;
        const unscaled = pageView.getViewport({ scale: 1 });
        const width = target.clientWidth || unscaled.width;
        const scale = Math.min(2, width / unscaled.width);
        const viewport = pageView.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = "100%";
        canvas.style.height = "auto";
        renderTask = pageView.render({ canvas, viewport });
        await renderTask.promise;
        if (cancel) return;
        pageView.cleanup();
        target.replaceChildren(canvas);
      } catch (error) {
        if (cancel || (error instanceof Error && error.name === "RenderingCancelledException")) return;
        setNote("This file can’t be shown here. Download it to open it on this computer.");
      }
    })();
    return () => {
      cancel = true;
      renderTask?.cancel();
      target.replaceChildren();
    };
  }, [page, pageCount]);

  return (
    <>
      {pageCount > 1 ? (
        <HStack gap={2} vAlign="center">
          <Button
            label="Previous"
            size="sm"
            variant="secondary"
            isDisabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          />
          <span className="documents-preview-note">
            {page} of {pageCount}
          </span>
          <Button
            label="Next"
            size="sm"
            variant="secondary"
            isDisabled={page >= pageCount}
            onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
          />
        </HStack>
      ) : null}
      <div ref={host} className="documents-preview-frame" />
      {note ? <p className="documents-preview-note">{note}</p> : null}
    </>
  );
}

function TextPreview({ url }: { url: string }) {
  const [text, setText] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch(url, { signal: controller.signal })
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error("unreadable"))))
      .then((body) => setText(body.slice(0, 100_000)))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setText("Could not read this file.");
      });
    return () => controller.abort();
  }, [url]);
  return <pre className="documents-preview-text">{text}</pre>;
}

function byNewest(left: VaultDocument, right: VaultDocument): number {
  return right.createdAt.localeCompare(left.createdAt);
}

function sorter(sort: FileSort): (left: VaultDocument, right: VaultDocument) => number {
  if (sort === "name") return (left, right) => left.originalName.localeCompare(right.originalName);
  if (sort === "size") return (left, right) => right.sizeBytes - left.sizeBytes;
  return byNewest;
}

function isKind(value: string): value is DocumentKind {
  return (DOCUMENT_KINDS as readonly string[]).includes(value);
}

function kindLabel(kind: string): string {
  return isKind(kind) ? KIND_LABELS[kind] : kind;
}

function isImage(document: VaultDocument): boolean {
  return document.mediaType.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(document.originalName);
}

function isPdf(document: VaultDocument): boolean {
  const type = document.mediaType.toLowerCase();
  if (type.startsWith("text/") || type.startsWith("application/xhtml") || type === "image/svg+xml") return false;
  return type === "application/pdf" || (type === "application/octet-stream" && document.originalName.toLowerCase().endsWith(".pdf"));
}

function isVideo(document: VaultDocument): boolean {
  return document.mediaType.startsWith("video/") || /\.(webm|mp4|mov)$/i.test(document.originalName);
}

function isAudio(document: VaultDocument): boolean {
  return document.mediaType.startsWith("audio/") || /\.(mp3|wav|m4a)$/i.test(document.originalName);
}

function isText(document: VaultDocument): boolean {
  return document.mediaType.startsWith("text/") || /\.(txt|md|csv|json)$/i.test(document.originalName);
}

function tileDetail(document: VaultDocument): string {
  return `${kindLabel(document.category)} · ${fileSize(document.sizeBytes)}`;
}

function fileWhen(value: string): string {
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) return "";
  return when.toLocaleDateString(undefined, { month: "numeric", day: "numeric", year: "2-digit" });
}

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function documentError(code: string | undefined): string {
  if (code === "file-required") return "That file is empty.";
  if (code === "file-too-large") return "That file is larger than 25 MB.";
  if (code === "name-required") return "A file needs a name.";
  if (code === "kind-invalid") return "Choose a kind.";
  if (code === "not-found") return "That file is no longer here.";
  return "Could not store that file.";
}

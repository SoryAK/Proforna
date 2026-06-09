"use client";
/**
 * RichTextEditor — tiptap wrapper used in the annotation editor.
 * Supports inline images (paste/drop/upload), links, and a Templates dropdown
 * for inserting common note skeletons (Troubleshooting, Decision, How-to, etc).
 */
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import {
  Bold, Italic, List, ListOrdered, Heading2, Quote, Code, Image as ImageIcon,
  Link as LinkIcon, FileText, ChevronDown, Loader2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
};

const TEMPLATES: Array<{ key: string; label: string; html: string }> = [
  {
    key: "troubleshoot",
    label: "Troubleshooting log",
    html:
      "<h2>Troubleshooting</h2>" +
      "<p><strong>Symptom:</strong> </p>" +
      "<p><strong>Hypothesis:</strong> </p>" +
      "<p><strong>Action taken:</strong> </p>" +
      "<p><strong>Result:</strong> </p>",
  },
  {
    key: "decision",
    label: "Decision",
    html:
      "<h2>Decision</h2>" +
      "<p><strong>Context:</strong> </p>" +
      "<p><strong>Options considered:</strong> </p>" +
      "<ul><li></li><li></li></ul>" +
      "<p><strong>Decision:</strong> </p>" +
      "<p><strong>Trade-offs:</strong> </p>",
  },
  {
    key: "howto",
    label: "How-to / steps",
    html:
      "<h2>How to</h2>" +
      "<ol><li>Step one</li><li>Step two</li><li>Step three</li></ol>" +
      "<p><strong>Tips:</strong> </p>",
  },
  {
    key: "spec",
    label: "Specs / part numbers",
    html:
      "<h2>Specs</h2>" +
      "<ul>" +
      "<li><strong>Part #:</strong> </li>" +
      "<li><strong>Mfr:</strong> </li>" +
      "<li><strong>Rating:</strong> </li>" +
      "<li><strong>Notes:</strong> </li>" +
      "</ul>",
  },
  {
    key: "callout",
    label: "Warning / callout",
    html: "<blockquote><p><strong>⚠ Warning:</strong> </p></blockquote>",
  },
];

async function uploadImage(file: File): Promise<string | null> {
  const fd = new FormData();
  fd.append("file", file);
  try {
    const res = await fetch("/api/gallery/annotations/upload", { method: "POST", body: fd });
    if (!res.ok) throw new Error(await res.text());
    const j = await res.json();
    return j.url ?? null;
  } catch (e) {
    toast.error(`Image upload failed: ${String(e)}`);
    return null;
  }
}

export function RichTextEditor({ value, onChange, placeholder, minHeight = 140 }: Props) {
  const [uploading, setUploading] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const tplRef = useRef<HTMLDivElement | null>(null);

  const editor = useEditor({
    extensions: [
      // `link: false` opts out of StarterKit's built-in Link so the custom
      // Link.configure(...) below is the sole Link in the schema (Tiptap 3
      // otherwise warns: "Duplicate extension names found: ['link']").
      StarterKit.configure({ link: false }),
      Image.configure({
        HTMLAttributes: { class: "rounded-md max-w-full h-auto my-2 border" },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { class: "text-primary underline", rel: "noopener noreferrer", target: "_blank" },
      }),
    ],
    content: value || "",
    onUpdate: ({ editor: e }) => {
      const html = e.getHTML();
      onChange(html === "<p></p>" ? "" : html);
    },
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none focus:outline-none px-3 py-2 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_h2]:my-2 [&_img]:my-2",
        style: `min-height:${minHeight}px`,
      },
      handlePaste: (_view, event) => {
        const items = Array.from(event.clipboardData?.items ?? []);
        const imgItem = items.find((i) => i.type.startsWith("image/"));
        if (!imgItem) return false;
        const file = imgItem.getAsFile();
        if (!file) return false;
        event.preventDefault();
        setUploading(true);
        void uploadImage(file).then((url) => {
          setUploading(false);
          if (!url) return;
          editor?.chain().focus().setImage({ src: url, alt: "Pasted image" }).run();
        });
        return true;
      },
      handleDrop: (_view, event, _slice, moved) => {
        if (moved) return false;
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
        if (files.length === 0) return false;
        event.preventDefault();
        setUploading(true);
        void Promise.all(files.map(uploadImage)).then((urls) => {
          setUploading(false);
          urls.forEach((url) => {
            if (url) editor?.chain().focus().setImage({ src: url, alt: "Dropped image" }).run();
          });
        });
        return true;
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (current === value || (current === "<p></p>" && !value)) return;
    editor.commands.setContent(value || "", { emitUpdate: false });
  }, [value, editor]);

  useEffect(() => {
    if (!tplOpen) return;
    const onDown = (e: MouseEvent) => {
      if (tplRef.current && !tplRef.current.contains(e.target as Node)) setTplOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [tplOpen]);

  if (!editor) {
    return (
      <div
        className="rounded-md border bg-background"
        style={{ minHeight: minHeight + 40 }}
        aria-busy
      />
    );
  }

  const Btn = ({
    onClick, active, title, children, disabled,
  }: {
    onClick: () => void; active?: boolean; title: string; children: React.ReactNode; disabled?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1 rounded hover:bg-muted transition-colors disabled:opacity-40 disabled:hover:bg-transparent ${
        active ? "bg-muted text-foreground" : "text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );

  const onPickImage = async (file: File) => {
    setUploading(true);
    const url = await uploadImage(file);
    setUploading(false);
    if (!url) return;
    editor.chain().focus().setImage({ src: url, alt: file.name }).run();
  };

  const onAddLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const insertTemplate = (html: string) => {
    if (editor.isEmpty) editor.chain().focus().setContent(html, { emitUpdate: true }).run();
    else editor.chain().focus().insertContent(html).run();
    setTplOpen(false);
  };

  return (
    <div className="rounded-md border bg-background overflow-hidden">
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b bg-muted/30 flex-wrap">
        <Btn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold (Ctrl+B)">
          <Bold className="h-3.5 w-3.5" />
        </Btn>
        <Btn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic (Ctrl+I)">
          <Italic className="h-3.5 w-3.5" />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive("heading", { level: 2 })}
          title="Heading"
        >
          <Heading2 className="h-3.5 w-3.5" />
        </Btn>
        <span className="w-px h-4 bg-border mx-1" />
        <Btn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullets">
          <List className="h-3.5 w-3.5" />
        </Btn>
        <Btn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Numbered">
          <ListOrdered className="h-3.5 w-3.5" />
        </Btn>
        <Btn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Quote">
          <Quote className="h-3.5 w-3.5" />
        </Btn>
        <Btn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive("codeBlock")} title="Code">
          <Code className="h-3.5 w-3.5" />
        </Btn>
        <span className="w-px h-4 bg-border mx-1" />
        <Btn onClick={onAddLink} active={editor.isActive("link")} title="Link">
          <LinkIcon className="h-3.5 w-3.5" />
        </Btn>
        <Btn
          onClick={() => fileInputRef.current?.click()}
          title="Insert image (paste / drop also works)"
          disabled={uploading}
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
        </Btn>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void onPickImage(f);
          }}
        />
        <span className="ml-auto" />
        <div className="relative" ref={tplRef}>
          <button
            type="button"
            onClick={() => setTplOpen((v) => !v)}
            title="Templates"
            className="px-1.5 py-0.5 rounded hover:bg-muted transition-colors text-muted-foreground flex items-center gap-1 text-xs"
          >
            <FileText className="h-3.5 w-3.5" />
            Templates
            <ChevronDown className="h-3 w-3" />
          </button>
          {tplOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-md border bg-background shadow-lg py-1 text-xs">
              {TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => insertTemplate(t.html)}
                  className="w-full text-left px-3 py-1.5 hover:bg-muted"
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <EditorContent editor={editor} placeholder={placeholder} />
    </div>
  );
}

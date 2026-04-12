"use client";

import dynamic from "next/dynamic";
import { useState, useRef } from "react";
import type { TracingEditorHandle } from "@/components/floor-plan-tracing-editor";

const IndoorMap = dynamic(() => import("@/components/indoor-map"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen bg-zinc-950 text-zinc-400">
      Loading indoor map…
    </div>
  ),
});

const FloorPlanTracingEditor = dynamic(
  () => import("@/components/floor-plan-tracing-editor"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-screen bg-zinc-950 text-zinc-400">
        Loading editor…
      </div>
    ),
  },
);

type Tab = "viewer" | "editor";

export default function IndoorMapPage() {
  const [tab, setTab] = useState<Tab>("viewer");
  const editorRef = useRef<TracingEditorHandle>(null);

  return (
    <div className="h-screen w-screen bg-zinc-950 flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 bg-zinc-900 border-b border-zinc-800">
        <a
          href="/"
          className="text-zinc-400 hover:text-white text-sm transition-colors"
        >
          ← Back
        </a>
        <div className="h-5 w-px bg-zinc-700" />
        <h1 className="text-lg font-bold text-white">
          🏭 Indoor Map Demo
        </h1>
        <span className="text-xs text-zinc-500 hidden sm:inline">
          Barry Callebaut — 1101 &amp; 903 Industrial Highway
        </span>

        {/* Tab toggle */}
        <div className="ml-auto flex bg-zinc-800 rounded-lg p-0.5 border border-zinc-700">
          {(
            [
              { id: "viewer", label: "🗺 Viewer" },
              { id: "editor", label: "✏️ Tracing Editor" },
            ] as { id: Tab; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                tab === t.id
                  ? "bg-indigo-600 text-white shadow"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 min-h-0">
        {tab === "viewer" ? (
          <IndoorMap className="h-full" />
        ) : (
          <FloorPlanTracingEditor
            ref={editorRef}
            imageUrl="/uploads/floorplans/barry-callebaut.jpg"
            imageWidth={4000}
            imageHeight={2252}
            className="h-full"
          />
        )}
      </main>
    </div>
  );
}

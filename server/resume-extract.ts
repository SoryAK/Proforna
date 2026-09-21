import {
  EXTRACT_SYSTEM_PROMPT,
  isExtractableResumeText,
  parseExtractedResumeText,
  type ExtractedResume,
} from "../core/resume-extract";
import { classifyResumePreview } from "../core/resume-preview";
import { loadLatestModelConnection } from "./models";
import { completeOpenAiChat, type CompleteFn } from "./openai-compat";
import { readPdfText } from "./pdf-read";
import type { DatabaseSync } from "node:sqlite";

export class ResumeExtractError extends Error {
  readonly status: 400 | 422 | 502;
  constructor(message: string, status: 400 | 422 | 502) {
    super(message);
    this.status = status;
  }
}

export type ResumeExtractDeps = {
  readPdfText?: (bytes: Uint8Array) => Promise<string>;
  complete?: CompleteFn;
};

export async function extractResumeFromFile(
  db: DatabaseSync,
  occupantId: string,
  file: { name: string; type: string; bytes: Uint8Array },
  deps: ResumeExtractDeps = {},
  signal?: AbortSignal,
): Promise<{ data: ExtractedResume; model: string }> {
  const connection = loadLatestModelConnection(db, occupantId);
  if (!connection) {
    throw new ResumeExtractError("Connect a model before extracting.", 400);
  }
  if (!connection.model.trim()) {
    throw new ResumeExtractError("A model name is required to extract.", 400);
  }

  const kind = classifyResumePreview(file);
  let text = "";
  if (kind === "text") {
    text = new TextDecoder().decode(file.bytes).trim();
  } else if (kind === "pdf") {
    const read = deps.readPdfText ?? readPdfText;
    try {
      text = (await read(file.bytes)).trim();
    } catch {
      throw new ResumeExtractError("Could not read that PDF.", 422);
    }
  } else {
    throw new ResumeExtractError("Extract currently supports PDF and text files.", 400);
  }

  if (!isExtractableResumeText(text)) {
    throw new ResumeExtractError(
      "This file looks like a scan or has no readable text. Try a text PDF.",
      422,
    );
  }

  const complete = deps.complete ?? completeOpenAiChat;
  let reply: { text: string; model: string };
  try {
    reply = await complete({
      baseUrl: connection.baseUrl,
      apiKey: connection.apiKey,
      model: connection.model,
      messages: [
        { role: "system", content: EXTRACT_SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
      signal,
    });
  } catch (err) {
    if (isAbortError(err)) {
      throw new ResumeExtractError("Extract cancelled.", 400);
    }
    throw new ResumeExtractError(
      err instanceof Error ? err.message : "The model could not extract this resume.",
      502,
    );
  }

  const data = parseExtractedResumeText(reply.text);
  if (!data) {
    throw new ResumeExtractError("The model did not return usable JSON.", 502);
  }
  return { data, model: reply.model };
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof Error && err.name === "AbortError") ||
    (typeof DOMException !== "undefined" &&
      err instanceof DOMException &&
      err.name === "AbortError")
  );
}

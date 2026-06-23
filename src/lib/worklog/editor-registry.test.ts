/**
 * Tests for src/lib/worklog/editor-registry.ts
 *
 * In-memory registry that lets mounted worklog editors expose a small RPC
 * surface (prepend) to other parts of the app — primarily the AI chat panel's
 * Send-to-Worklog action (ADR-0046 follow-up B Commit 2).
 *
 * Coverage:
 *  - registerEditor returns a disposer; getEditor returns the handle until disposed.
 *  - Multiple registers for the same id: last-write-wins; disposing the FIRST
 *    handle after a second one registered must NOT clear the active entry
 *    (otherwise the second mount silently loses its slot).
 *  - getEditor returns null for unknown ids.
 *  - waitForEditor resolves immediately when the handle is already present.
 *  - waitForEditor resolves when a handle registers mid-wait (polling path).
 *  - waitForEditor returns null after the timeout when no handle ever lands.
 *  - waitForEditor returns null if a handle registers then disposes during the wait.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  registerEditor,
  getEditor,
  waitForEditor,
  __resetEditorRegistry,
  type WorklogEditorHandle,
} from "@/lib/worklog/editor-registry";

function makeHandle(id: string, kind: string = "note"): WorklogEditorHandle {
  return {
    id,
    kind,
    prepend: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  __resetEditorRegistry();
});

describe("editor-registry — register / get / dispose", () => {
  it("getEditor returns null before any register", () => {
    expect(getEditor("missing")).toBeNull();
  });

  it("registerEditor exposes the handle via getEditor; disposer clears it", () => {
    const h = makeHandle("log1");
    const dispose = registerEditor(h);

    expect(getEditor("log1")).toBe(h);

    dispose();

    expect(getEditor("log1")).toBeNull();
  });

  it("last-write-wins when two handles register for the same id", () => {
    const h1 = makeHandle("log1");
    const h2 = makeHandle("log1");
    registerEditor(h1);
    const dispose2 = registerEditor(h2);

    expect(getEditor("log1")).toBe(h2);

    dispose2();
    expect(getEditor("log1")).toBeNull();
  });

  it("disposing the stale (first-registered) handle does NOT clear the active second registration", () => {
    const h1 = makeHandle("log1");
    const h2 = makeHandle("log1");
    const dispose1 = registerEditor(h1);
    registerEditor(h2); // h2 supersedes h1

    dispose1(); // h1's disposer fires AFTER h2 took the slot — must be a no-op

    expect(getEditor("log1")).toBe(h2);
  });
});

describe("editor-registry — waitForEditor", () => {
  it("resolves immediately with the handle when already present", async () => {
    const h = makeHandle("log1");
    registerEditor(h);

    const result = await waitForEditor("log1", 200);
    expect(result).toBe(h);
  });

  it("resolves with the handle if it registers mid-wait", async () => {
    const pending = waitForEditor("log1", 500);

    // Register after a short delay (well under the timeout).
    const h = makeHandle("log1");
    setTimeout(() => registerEditor(h), 100);

    const result = await pending;
    expect(result).toBe(h);
  });

  it("returns null after timeout when no handle is ever registered", async () => {
    const result = await waitForEditor("never", 120);
    expect(result).toBeNull();
  });

  it("returns null when a handle registers then disposes before timeout", async () => {
    const pending = waitForEditor("log1", 300);

    const h = makeHandle("log1");
    const dispose = registerEditor(h);
    // Immediately dispose — by the time the next poll fires, slot is empty.
    dispose();

    const result = await pending;
    expect(result).toBeNull();
  });
});

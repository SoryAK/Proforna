/**
 * computePlainTextDiff — ADR-0017 Phase 7b.
 *
 * Lightweight LCS-based diff between two plain-text strings. Returns an
 * array of {type, text} segments suitable for rendering with three
 * styles (equal / add / remove). Operates at the whitespace-token
 * level — granular enough that single-word edits are visible, but
 * cheap enough to run on the main thread for snapshot-sized text.
 *
 * Token model:
 *   - Words           = runs of non-whitespace.
 *   - Horizontal WS   = runs of spaces/tabs, as their OWN token.
 *   - Newlines        = each "\n" as its own token.
 * Keeping whitespace as separate tokens means that "hello world" vs
 * "hello world again" produces the cleanest possible diff (equal prefix
 * "hello world", added suffix " again") after segment coalescing.
 *
 * Algorithm: standard LCS DP O(n·m). Snapshot plain-text is bounded
 * (the editor enforces sane size) so quadratic is fine here; we'd swap
 * in Myers' algorithm only if we ever need to diff large documents.
 */

export type DiffSegmentType = "equal" | "add" | "remove";

export interface DiffSegment {
  type: DiffSegmentType;
  text: string;
}

/**
 * Tokenize the input so each token is one of:
 *   - A bare newline ("\n")
 *   - A run of non-whitespace, non-newline characters (a "word")
 *   - A run of horizontal whitespace (spaces / tabs)
 *
 * Keeping whitespace as standalone tokens means equal prefixes/suffixes
 * align cleanly, so an appended word produces exactly one added segment
 * after coalescing rather than three (word + whitespace + word).
 */
function tokenize(input: string): string[] {
  if (input.length === 0) return [];
  const tokens: string[] = [];
  const re = /(\n)|(\S+)|([ \t]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    tokens.push(m[0]);
  }
  return tokens;
}

/**
 * Coalesce neighbouring same-type segments into one. The diff loop can
 * emit single-token segments; coalescing keeps the render tree small
 * and the visual styling uninterrupted across word boundaries.
 */
function coalesce(segments: DiffSegment[]): DiffSegment[] {
  if (segments.length === 0) return segments;
  const out: DiffSegment[] = [];
  for (const seg of segments) {
    const last = out[out.length - 1];
    if (last && last.type === seg.type) {
      last.text += seg.text;
    } else {
      out.push({ ...seg });
    }
  }
  return out;
}

export function computePlainTextDiff(prev: string, next: string): DiffSegment[] {
  // Cheap fast-path: identical inputs.
  if (prev === next) {
    return prev.length === 0 ? [] : [{ type: "equal", text: prev }];
  }

  const a = tokenize(prev);
  const b = tokenize(next);

  if (a.length === 0) return [{ type: "add",    text: next }];
  if (b.length === 0) return [{ type: "remove", text: prev }];

  // LCS table — dp[i][j] = length of longest common subsequence between
  // a[0..i] and b[0..j].
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = dp[i - 1][j] >= dp[i][j - 1] ? dp[i - 1][j] : dp[i][j - 1];
      }
    }
  }

  // Backtrack to emit segments in reverse, then flip.
  const reversed: DiffSegment[] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      reversed.push({ type: "equal", text: a[i - 1] });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      reversed.push({ type: "remove", text: a[i - 1] });
      i--;
    } else {
      reversed.push({ type: "add", text: b[j - 1] });
      j--;
    }
  }
  while (i > 0) {
    reversed.push({ type: "remove", text: a[i - 1] });
    i--;
  }
  while (j > 0) {
    reversed.push({ type: "add", text: b[j - 1] });
    j--;
  }

  reversed.reverse();
  return coalesce(reversed);
}

export type PdfTextRun = { str: string; x: number; y: number };

/** Keep reading order: lines by vertical position, words left to right. */
export function linesFromPdfRuns(runs: PdfTextRun[]): string {
  const usable = runs.filter((r) => r.str.trim().length > 0);
  if (usable.length === 0) return "";

  const buckets = new Map<number, PdfTextRun[]>();
  for (const run of usable) {
    const key = Math.round(run.y / 3) * 3;
    const list = buckets.get(key) ?? [];
    list.push(run);
    buckets.set(key, list);
  }

  const yDesc = [...buckets.keys()].sort((a, b) => b - a);
  return yDesc
    .map((y) =>
      (buckets.get(y) ?? [])
        .sort((a, b) => a.x - b.x)
        .map((r) => r.str.trim())
        .join(" "),
    )
    .join("\n")
    .trim();
}

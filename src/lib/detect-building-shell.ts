/**
 * Building shell detection — pure JavaScript, zero dependencies.
 *
 * Designed for floor plan *photographs* (plan printed on paper, on a desk/board).
 *
 * Two-phase pipeline:
 *  Phase A — Paper isolation:
 *    A1. Downscale, grayscale
 *    A2. Bright-pixel mask (gray > paperThreshold) → largest connected white region
 *    A3. Convex hull of paper region → paper mask
 *
 *  Phase B — Wall detection within paper:
 *    B1. Mask out everything outside the paper (set to white/background)
 *    B2. Binary threshold (dark pixels = wall lines)
 *    B3. Morphological close to seal wall gaps through doors
 *    B4. Flood-fill from paper boundary inward (marks exterior-of-building)
 *    B5. Boundary extraction, contour trace, simplify, scale back
 */

/* ── Public types ─────────────────────────────────────────────── */
export interface ShellDetectionOptions {
  /** Simplification tolerance as fraction of perimeter (default 0.008) */
  simplifyEpsilon?: number;
  /** Wall threshold 0–255 — pixels darker than this within paper = wall (default 120) */
  wallThreshold?: number;
  /** Paper threshold — pixels brighter than this = paper (default 190) */
  paperThreshold?: number;
  /** Morphological close radius in px at processing scale (default 4) */
  closeRadius?: number;
  /** Max processing width in pixels (default 500) */
  maxProcessingWidth?: number;
  /** Min contour length as fraction of paper perimeter (default 0.10) */
  minPerimeterFraction?: number;
}

export interface ShellDetectionResult {
  polygon: [number, number][];
  area: number;
  totalContours: number;
  rawVertices: number;
}

/* ── Main entry point ─────────────────────────────────────────── */
export async function detectBuildingShell(
  imageUrl: string,
  imageWidth: number,
  imageHeight: number,
  options: ShellDetectionOptions = {},
): Promise<ShellDetectionResult> {
  const {
    simplifyEpsilon = 0.008,
    wallThreshold = 120,
    paperThreshold = 190,
    closeRadius = 4,
    maxProcessingWidth = 500,
    minPerimeterFraction = 0.10,
  } = options;

  /* 1. Load & downscale */
  const img = await loadImage(imageUrl);
  const scale = imageWidth > maxProcessingWidth ? maxProcessingWidth / imageWidth : 1;
  const w = Math.round(imageWidth * scale);
  const h = Math.round(imageHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  /* Compute grayscale once */
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    gray[i] = Math.round(
      0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2],
    );
  }

  await tick();

  /* ═══ Phase A: Paper isolation ══════════════════════════════════ */

  /* A1. Bright-pixel mask (1 = paper candidate) */
  const paperBin = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    paperBin[i] = gray[i] > paperThreshold ? 1 : 0;
  }

  /* A2. Find the largest connected bright region via BFS */
  const paperLabels = new Int32Array(w * h); // 0 = unlabeled
  let bestLabel = 0;
  let bestSize = 0;
  let nextLabel = 1;

  for (let i = 0; i < w * h; i++) {
    if (paperBin[i] === 1 && paperLabels[i] === 0) {
      const label = nextLabel++;
      let size = 0;
      const q = [i];
      paperLabels[i] = label;
      let head = 0;
      while (head < q.length) {
        const idx = q[head++];
        size++;
        const x = idx % w;
        const y = (idx - x) / w;
        const neighbors = [
          y > 0 ? idx - w : -1,
          y < h - 1 ? idx + w : -1,
          x > 0 ? idx - 1 : -1,
          x < w - 1 ? idx + 1 : -1,
        ];
        for (const n of neighbors) {
          if (n >= 0 && paperBin[n] === 1 && paperLabels[n] === 0) {
            paperLabels[n] = label;
            q.push(n);
          }
        }
      }
      if (size > bestSize) {
        bestSize = size;
        bestLabel = label;
      }
    }
  }

  if (bestSize < w * h * 0.05) {
    throw new Error("Could not detect paper region in the image.");
  }

  /* A3. Build paper mask — dilate slightly to include edges */
  const paperMask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    paperMask[i] = paperLabels[i] === bestLabel ? 1 : 0;
  }
  const paperMaskDilated = dilate1D(paperMask, w, h, 3);

  await tick();

  /* ═══ Phase B: Wall detection within paper ══════════════════════ */

  /* B1. Binary: wall lines within paper (dark pixels inside paper mask) */
  const wallBin = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    wallBin[i] = paperMaskDilated[i] === 1 && gray[i] < wallThreshold ? 1 : 0;
  }

  await tick();

  /* B2. Morph close walls to seal door gaps */
  const wallDilated = dilate1D(wallBin, w, h, closeRadius);
  const wallClosed = erode1D(wallDilated, w, h, closeRadius);

  await tick();

  /* B3. Flood-fill from paper boundary to mark building-exterior-on-paper
   *     Seeds = pixels inside paper mask but on the paper edge (touching non-paper) */
  const floodMap = new Uint8Array(wallClosed);
  // Also mark everything outside paper as 2 (exterior)
  for (let i = 0; i < w * h; i++) {
    if (paperMaskDilated[i] === 0) floodMap[i] = 2;
  }

  const q: number[] = [];
  // Seed from pixels at the paper boundary (paper pixel touching a non-paper pixel)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (floodMap[idx] !== 0) continue; // skip walls and non-paper
      // Check if any neighbor is outside paper (value 2)
      const hasExteriorNeighbor =
        (y > 0 && floodMap[idx - w] === 2) ||
        (y < h - 1 && floodMap[idx + w] === 2) ||
        (x > 0 && floodMap[idx - 1] === 2) ||
        (x < w - 1 && floodMap[idx + 1] === 2);
      if (hasExteriorNeighbor) {
        floodMap[idx] = 2;
        q.push(idx);
      }
    }
  }

  // BFS flood
  let head = 0;
  while (head < q.length) {
    const idx = q[head++];
    const x = idx % w;
    const y = (idx - x) / w;
    if (y > 0 && floodMap[idx - w] === 0) { floodMap[idx - w] = 2; q.push(idx - w); }
    if (y < h - 1 && floodMap[idx + w] === 0) { floodMap[idx + w] = 2; q.push(idx + w); }
    if (x > 0 && floodMap[idx - 1] === 0) { floodMap[idx - 1] = 2; q.push(idx - 1); }
    if (x < w - 1 && floodMap[idx + 1] === 0) { floodMap[idx + 1] = 2; q.push(idx + 1); }
  }

  await tick();

  /* B4. Boundary: non-exterior pixels within paper touching an exterior pixel */
  const bnd = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      if (floodMap[idx] === 2 || paperMaskDilated[idx] === 0) continue;
      if (
        floodMap[idx - 1] === 2 || floodMap[idx + 1] === 2 ||
        floodMap[idx - w] === 2 || floodMap[idx + w] === 2
      ) {
        bnd[idx] = 1;
      }
    }
  }

  await tick();

  /* B5. Moore-neighbor contour tracing */
  const visited = new Uint8Array(w * h);
  const contours: [number, number][][] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      if (bnd[idx] === 1 && !visited[idx]) {
        const c = traceMoore(bnd, visited, w, h, x, y);
        if (c.length > 20) contours.push(c);
      }
    }
  }

  if (contours.length === 0) {
    throw new Error("No building contour found — try adjusting threshold.");
  }

  /* B6. Pick longest contour meeting min-perimeter */
  const paperPerim = Math.sqrt(bestSize) * 4; // rough estimate
  const minLen = paperPerim * minPerimeterFraction;
  let best: [number, number][] = [];
  for (const c of contours) {
    if (c.length > best.length && c.length >= minLen) best = c;
  }
  if (best.length === 0) {
    for (const c of contours) { if (c.length > best.length) best = c; }
  }

  const rawVertices = best.length;

  /* B7. Simplify with Douglas–Peucker */
  const perim = perimeter(best);
  const simplified = douglasPeucker(best, simplifyEpsilon * perim);

  /* B8. Scale back to original coords */
  const polygon: [number, number][] = simplified.map(
    ([px, py]) => [Math.round(px / scale), Math.round(py / scale)],
  );

  return {
    polygon,
    area: Math.abs(shoelace(polygon)),
    totalContours: contours.length,
    rawVertices,
  };
}

/* ── Fast 1-D separable dilate (row pass + col pass) ──────────── */
function dilate1D(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(w * h);
  const dst = new Uint8Array(w * h);
  // Row pass
  for (let y = 0; y < h; y++) {
    let count = 0;
    // Init window [0, r]
    for (let x = 0; x <= r && x < w; x++) { if (src[y * w + x]) count++; }
    for (let x = 0; x < w; x++) {
      if (count > 0) tmp[y * w + x] = 1;
      const addX = x + r + 1;
      const remX = x - r;
      if (addX < w && src[y * w + addX]) count++;
      if (remX >= 0 && src[y * w + remX]) count--;
    }
  }
  // Col pass
  for (let x = 0; x < w; x++) {
    let count = 0;
    for (let y = 0; y <= r && y < h; y++) { if (tmp[y * w + x]) count++; }
    for (let y = 0; y < h; y++) {
      if (count > 0) dst[y * w + x] = 1;
      const addY = y + r + 1;
      const remY = y - r;
      if (addY < h && tmp[addY * w + x]) count++;
      if (remY >= 0 && tmp[remY * w + x]) count--;
    }
  }
  return dst;
}

/* ── Fast 1-D separable erode ─────────────────────────────────── */
function erode1D(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(w * h);
  const dst = new Uint8Array(w * h);
  const windowSize = 2 * r + 1;
  // Row pass
  for (let y = 0; y < h; y++) {
    let count = 0;
    for (let x = 0; x <= r && x < w; x++) { if (src[y * w + x]) count++; }
    for (let x = 0; x < w; x++) {
      const wLen = Math.min(x + r + 1, w) - Math.max(x - r, 0);
      tmp[y * w + x] = count === wLen ? 1 : 0;
      const addX = x + r + 1;
      const remX = x - r;
      if (addX < w && src[y * w + addX]) count++;
      if (remX >= 0 && src[y * w + remX]) count--;
    }
  }
  // Col pass
  for (let x = 0; x < w; x++) {
    let count = 0;
    for (let y = 0; y <= r && y < h; y++) { if (tmp[y * w + x]) count++; }
    for (let y = 0; y < h; y++) {
      const wLen = Math.min(y + r + 1, h) - Math.max(y - r, 0);
      dst[y * w + x] = count === wLen ? 1 : 0;
      const addY = y + r + 1;
      const remY = y - r;
      if (addY < h && tmp[addY * w + x]) count++;
      if (remY >= 0 && tmp[remY * w + x]) count--;
    }
  }
  return dst;
}

/* ── Moore-neighbor contour tracing ───────────────────────────── */
function traceMoore(
  bnd: Uint8Array, visited: Uint8Array,
  w: number, h: number, sx: number, sy: number,
): [number, number][] {
  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1];
  const pts: [number, number][] = [];
  let cx = sx, cy = sy, dir = 7;
  const limit = w * h;
  let steps = 0;
  do {
    visited[cy * w + cx] = 1;
    pts.push([cx, cy]);
    let sd = (dir + 5) % 8;
    let found = false;
    for (let i = 0; i < 8; i++) {
      const d = (sd + i) % 8;
      const nx = cx + dx[d], ny = cy + dy[d];
      if (nx >= 0 && nx < w && ny >= 0 && ny < h && bnd[ny * w + nx] === 1) {
        dir = d; cx = nx; cy = ny; found = true; break;
      }
    }
    if (!found) break;
  } while ((cx !== sx || cy !== sy) && ++steps < limit);
  return pts;
}

/* ── Douglas–Peucker simplification ───────────────────────────── */
function douglasPeucker(pts: [number, number][], eps: number): [number, number][] {
  if (pts.length <= 2) return pts;
  let maxD = 0, maxI = 0;
  const a = pts[0], b = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = ptLineDist(pts[i], a, b);
    if (d > maxD) { maxD = d; maxI = i; }
  }
  if (maxD > eps) {
    const l = douglasPeucker(pts.slice(0, maxI + 1), eps);
    const r = douglasPeucker(pts.slice(maxI), eps);
    return l.slice(0, -1).concat(r);
  }
  return [a, b];
}

function ptLineDist(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/* ── Helpers ──────────────────────────────────────────────────── */
function perimeter(pts: [number, number][]): number {
  let p = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    p += Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]);
  }
  return p;
}

function shoelace(pts: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
  }
  return a / 2;
}

function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

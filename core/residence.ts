export type Residence = {
  id: string;
  occupantId: string;
  label: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  startDate: string | null;
  endDate: string | null;
};

export type ResidenceInput = {
  label?: unknown;
  address?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  startDate?: unknown;
  endDate?: unknown;
};

export type ResidenceError =
  | "label-required"
  | "address-required"
  | "coordinates-invalid"
  | "dates-invalid";

export type ResidenceSpan = {
  startDate: string | null;
  endDate: string | null;
};

export type RoleSpan = {
  startDate: string;
  endDate: string;
  isCurrent: boolean;
};

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])/;

export function prepareResidence(
  input: ResidenceInput,
): { ok: true; value: Omit<Residence, "id" | "occupantId"> } | { ok: false; error: ResidenceError } {
  const label = text(input.label);
  const address = text(input.address);
  if (!label) return { ok: false, error: "label-required" };
  if (!address) return { ok: false, error: "address-required" };
  const latitude = coordinate(input.latitude);
  const longitude = coordinate(input.longitude);
  if (
    latitude === undefined ||
    longitude === undefined ||
    (latitude == null) !== (longitude == null)
  ) {
    return { ok: false, error: "coordinates-invalid" };
  }
  const startDate = month(input.startDate);
  const endDate = month(input.endDate);
  if (startDate === undefined || endDate === undefined) {
    return { ok: false, error: "dates-invalid" };
  }
  if (startDate && endDate && endDate < startDate) {
    return { ok: false, error: "dates-invalid" };
  }
  return {
    ok: true,
    value: { label, address, latitude, longitude, startDate, endDate },
  };
}

export function residencesToClose(
  existing: Array<ResidenceSpan & { id: string }>,
  opening: { id: string; startDate: string | null },
  closeAt: string,
): Array<{ id: string; endDate: string }> {
  const monthClose = month(closeAt);
  if (!monthClose) return [];
  const closes: Array<{ id: string; endDate: string }> = [];
  for (const residence of existing) {
    if (residence.id === opening.id || residence.endDate) continue;
    const start = residence.startDate;
    const endDate = start && start > monthClose ? start : monthClose;
    closes.push({ id: residence.id, endDate });
  }
  return closes;
}

export function residenceForMap<T extends ResidenceSpan & { id: string }>(
  residences: T[],
  role: RoleSpan | null,
): T | null {
  if (residences.length === 0) return null;
  if (!role) return openResidence(residences) ?? latestResidence(residences);
  const overlapping = residences.filter((residence) =>
    rangesOverlap(residence, role),
  );
  if (overlapping.length === 0) return null;
  return latestStart(overlapping);
}

function openResidence<T extends ResidenceSpan & { id: string }>(
  residences: T[],
): T | null {
  const open = residences.filter((residence) => !residence.endDate);
  return open.length ? latestResidence(open) : null;
}

function latestResidence<T extends ResidenceSpan>(residences: T[]): T {
  return latestStart(residences);
}

function latestStart<T extends ResidenceSpan>(residences: T[]): T {
  return [...residences].sort((a, b) =>
    (b.startDate ?? "0000-01").localeCompare(a.startDate ?? "0000-01"),
  )[0];
}

function rangesOverlap(residence: ResidenceSpan, role: RoleSpan): boolean {
  const homeStart = residence.startDate ?? "0000-01";
  const homeEnd = residence.endDate ?? "9999-12";
  const roleStart = month(role.startDate) || "0000-01";
  const roleEnd = role.isCurrent ? "9999-12" : month(role.endDate) || "9999-12";
  return homeStart <= roleEnd && roleStart <= homeEnd;
}

function month(value: unknown): string | null | undefined {
  const raw = text(value);
  if (!raw) return null;
  const match = MONTH.exec(raw);
  return match ? `${match[1]}-${match[2]}` : undefined;
}

function coordinate(value: unknown): number | null | undefined {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

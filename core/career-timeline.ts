export type CareerTimelineRole = {
  id: string;
  title: string;
  organization: string;
  place: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  pinned: boolean;
  milestones: Array<{ id: string; date: string; title: string }>;
  events: Array<{ id: string; date: string; title: string }>;
};

export type CareerTimelineResidence = {
  id: string;
  label: string;
  address: string;
  startDate: string | null;
  endDate: string | null;
  pinned: boolean;
};

export type CareerMomentKind = "started" | "milestone" | "event" | "moved";

export type CareerMoment = {
  id: string;
  at: string;
  kind: CareerMomentKind;
  title: string;
  roleId: string;
  residenceId?: string;
};

export type CareerFrame = {
  month: string;
  tone: "moment" | "underway" | "between";
  lead: CareerTimelineRole | null;
  alsoOpen: CareerTimelineRole[];
  moment: CareerMoment | null;
  earlier: CareerTimelineRole | null;
  home: CareerTimelineResidence | null;
};

export function careerMonth(value: string): string | null {
  const match = /^(\d{4})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return `${match[1]}-${match[2]}`;
}

export function careerMonths(start: string, end: string): string[] {
  const from = careerMonth(start);
  const to = careerMonth(end);
  if (!from || !to || from > to) return from ? [from] : to ? [to] : [];
  const months: string[] = [];
  let [year, month] = from.split("-").map(Number);
  const [endYear, endMonth] = to.split("-").map(Number);
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

export function careerMoments(
  roles: CareerTimelineRole[],
  residences: CareerTimelineResidence[] = [],
): CareerMoment[] {
  const moments: CareerMoment[] = [];
  for (const role of roles) {
    const start = careerMonth(role.startDate);
    if (start) {
      moments.push({
        id: `${role.id}:started`,
        at: start,
        kind: "started",
        title: "Started",
        roleId: role.id,
      });
    }
    for (const item of role.milestones) {
      const at = careerMonth(item.date);
      if (!at || !item.title.trim()) continue;
      moments.push({
        id: item.id,
        at,
        kind: "milestone",
        title: item.title.trim(),
        roleId: role.id,
      });
    }
    for (const item of role.events) {
      const at = careerMonth(item.date);
      if (!at || !item.title.trim()) continue;
      moments.push({
        id: item.id,
        at,
        kind: "event",
        title: item.title.trim(),
        roleId: role.id,
      });
    }
  }
  for (const home of residences) {
    const start = careerMonth(home.startDate ?? "");
    if (!start) continue;
    moments.push({
      id: `${home.id}:moved`,
      at: start,
      kind: "moved",
      title: home.label.trim() || "Home",
      roleId: "",
      residenceId: home.id,
    });
  }
  return moments.sort(
    (a, b) => a.at.localeCompare(b.at) || a.roleId.localeCompare(b.roleId) || a.id.localeCompare(b.id),
  );
}

export function careerSpan(roles: CareerTimelineRole[], moments: CareerMoment[], now: string): string[] {
  const dated = [
    ...roles.map((role) => careerMonth(role.startDate)),
    ...roles.map((role) => careerMonth(role.endDate)),
    ...moments.map((moment) => moment.at),
    careerMonth(now),
  ].filter((month): month is string => Boolean(month));
  if (dated.length === 0) return [];
  const sorted = [...dated].sort();
  return careerMonths(sorted[0], sorted[sorted.length - 1]);
}

export function rolesActiveAt(roles: CareerTimelineRole[], month: string): CareerTimelineRole[] {
  return roles.filter((role) => {
    const start = careerMonth(role.startDate);
    if (!start || start > month) return false;
    if (role.isCurrent) return true;
    const end = careerMonth(role.endDate);
    return !end || month <= end;
  });
}

export function rolesStartedBy(roles: CareerTimelineRole[], month: string): CareerTimelineRole[] {
  return roles.filter((role) => {
    const start = careerMonth(role.startDate);
    return Boolean(start && start <= month);
  });
}

export function nextCareerMoment(moments: CareerMoment[], month: string): CareerMoment | null {
  return moments.find((moment) => moment.at > month) ?? null;
}

export function residenceAt(
  residences: CareerTimelineResidence[],
  month: string,
): CareerTimelineResidence | null {
  const active = residences.filter((home) => {
    const start = careerMonth(home.startDate ?? "");
    if (!start || start > month) return false;
    const end = careerMonth(home.endDate ?? "");
    return !end || month <= end;
  });
  return (
    active.sort(
      (a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? "") || b.id.localeCompare(a.id),
    )[0] ?? null
  );
}

export function careerFrame(
  roles: CareerTimelineRole[],
  moments: CareerMoment[],
  month: string,
  residences: CareerTimelineResidence[] = [],
): CareerFrame {
  const active = rolesActiveAt(roles, month);
  const atMonth = moments.filter((item) => item.at === month);
  const roleMoment = [...atMonth].reverse().find((item) => item.kind !== "moved") ?? null;
  const home = residenceAt(residences, month);
  const moveMoment = home
    ? (atMonth.find((item) => item.residenceId === home.id) ?? null)
    : null;
  const moment = roleMoment ?? moveMoment;
  const lead = roleMoment
    ? (roles.find((role) => role.id === roleMoment.roleId) ?? null)
    : ([...active].sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null);
  const earlier = lead
    ? null
    : (roles
        .filter((role) => {
          const end = careerMonth(role.endDate);
          return Boolean(end && end < month);
        })
        .sort((a, b) => b.endDate.localeCompare(a.endDate))[0] ?? null);
  return {
    month,
    tone: moment ? "moment" : lead ? "underway" : "between",
    lead,
    alsoOpen: lead ? active.filter((role) => role.id !== lead.id) : [],
    moment,
    earlier,
    home,
  };
}

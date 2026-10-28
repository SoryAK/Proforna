import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ResumeImport } from "./ResumeImport";
import type { CareerFile } from "@core/career-file";
import {
  CAREER_HISTORY_SECTIONS,
  classifyCareerHistorySection,
  flagIdenticalRoles,
  identicalRoleReviews,
  careerHistoryIdentityKey,
  formatHistoryGist,
  formatHistoryPeriod,
  formatHistoryPlace,
  formatTenureMonths,
  groupCareerHistory,
  presentCareerHistoryStats,
  searchCareerHistory,
  tenureMonths,
  sortCareerHistory,
  type CareerHistoryIdentity,
  type CareerHistoryItem,
  type CareerHistorySectionKey,
} from "@core/career-history";
import {
  DEFAULT_WORK_MAP_OVERVIEW_FIELDS,
  WORK_MAP_OVERVIEW_FIELDS,
  publicationEmbed,
  roleCoverPhoto,
  type WorkMapOverviewField,
  type WorkMapPublicationSettings,
  type WorkMapPublishSection,
  type WorkMapRole,
} from "@core/work-map";
import {
  careerFrame,
  careerMoments,
  careerMonth,
  careerSpan,
  nextCareerMoment,
  rolesStartedBy,
  type CareerTimelineResidence,
  type CareerTimelineRole,
} from "@core/career-timeline";
import { CareerTimelineScrubber } from "./CareerTimelineScrubber";
import { residenceForMap, type Residence } from "@core/residence";
import { HomesPanel } from "./HomesPanel";
import { CareerMap } from "./CareerMap";
import { DuplicateReview, duplicateReviewCount, type MergeRequest, type ReviewDraft } from "./DuplicateReview";
import { readMapCamera, writeMapCamera, type MapCamera, type MapFitMode } from "./map-camera";
import { WorkMapPreview, type PublicWorkMapSnapshot } from "./WorkMapPreview";
import {
  notifyPreviewRefresh,
  previewWindowUrl,
  readPreviewPlacement,
  writePreviewPlacement,
  type PreviewPlacement,
} from "./preview-placement";
import type { WorkMapHome } from "./WorkMapCanvas";
import { type MapSettings } from "@core/map-settings";
import { lookupNote, reversePlace } from "./place-search";
import { RoleDetailPanel, type DetailTab } from "./RoleDetailPanel";
import { RoleCanvasEntry } from "./RoleCanvas";
import "./work-map.css";

type WorkMapResponse = {
  profile: {
    fullName: string;
    headline: string;
    address: string;
    addressLatitude: number | null;
    addressLongitude: number | null;
    city: string;
    state: string;
    bio: string;
    linkedinUrl: string;
    githubUrl: string;
    portfolioUrl: string;
    avatarUrl: string | null;
  };
  roles: WorkMapRole[];
  skills: string[];
  settings: WorkMapPublicationSettings;
  residences: Residence[];
  relayOrigin?: string | null;
  stats: {
    roles: number;
    education: number;
    mapped: number;
    publicMedia: number;
  };
};

type Publication = {
  id: string;
  slug: string;
  status: string;
  createdAt: string;
  analytics: { events: number; accessRequests: number };
};

export function WorkMap({
  fallbackCareer: _fallbackCareer,
  error,
  focusRoleId,
  focusTab,
  onHome,
  mapRevision = 0,
}: {
  fallbackCareer: CareerFile;
  error: string | null;
  focusRoleId?: string | null;
  focusTab?: DetailTab;
  onHome: () => void;
  mapRevision?: number;
}) {
  const [data, setData] = useState<WorkMapResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    focusRoleId ?? null,
  );
  const [canvasRoleId, setCanvasRoleId] = useState<string | null>(null);
  const [canvasMinimized, setCanvasMinimized] = useState(false);
  const [canvasSlot, setCanvasSlot] = useState<HTMLDivElement | null>(null);
  const [canvasDock, setCanvasDock] = useState<HTMLDivElement | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [closedSections, setClosedSections] = useState<
    Set<CareerHistorySectionKey>
  >(new Set());
  const [overviewOpen, setOverviewOpen] = useState(true);
  const [actionTabOpen, setActionTabOpen] = useState(true);
  const actionDockRef = useRef<HTMLDivElement>(null);
  const actionShellRef = useRef<HTMLDivElement>(null);
  const actionGesture = useRef<{ id: number; y: number; moved: boolean } | null>(null);
  const actionSwallow = useRef(false);
  const [view, setView] = useState<"map" | "timeline">("map");
  const [timelineMonth, setTimelineMonth] = useState(currentCareerMonth);
  const [timelinePlaying, setTimelinePlaying] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [publishMenu, setPublishMenu] = useState(false);
  const [menuHost, setMenuHost] = useState<"bio" | "tab">("tab");
  const publishMenuRef = useRef<HTMLDivElement>(null);
  const [placingForId, setPlacingForId] = useState<string | null>(null);
  const [placingLocationId, setPlacingLocationId] = useState<string | null>(
    null,
  );
  const [cameraNonce, setCameraNonce] = useState(0);
  const cameraBeforePlace = useRef<MapCamera | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewDrafts, setReviewDrafts] = useState<ReviewDraft[]>([]);
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);
  const [reviewFocus, setReviewFocus] = useState<string | null>(null);
  const [pendingPlacement, setPendingPlacement] = useState<{
    roleId: string;
    locationId?: string;
    latitude: number;
    longitude: number;
    address?: string;
  } | null>(null);
  const [settings, setSettings] =
    useState<WorkMapPublicationSettings | null>(null);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [mapSettings, setMapSettings] = useState<MapSettings | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!message) return;
    const life = message.length > 90 ? 5200 : 2800;
    const timer = window.setTimeout(() => setMessage(""), life);
    return () => window.clearTimeout(timer);
  }, [message]);
  const [publishing, setPublishing] = useState(false);
  const [preview, setPreview] = useState<{
    snapshot: PublicWorkMapSnapshot;
    publishable: boolean;
    exactLocations: boolean;
  } | null>(null);
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const [previewMenu, setPreviewMenu] = useState(false);
  const previewMenuRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<PreviewPlacement>(readPreviewPlacement);
  const [creatingKind, setCreatingKind] =
    useState<CareerHistorySectionKey | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("story");
  const [homesOpen, setHomesOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [removeAsk, setRemoveAsk] = useState<{
    ids: string[];
    detail: string;
  } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [ledgerMenu, setLedgerMenu] = useState<"import" | "add" | null>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const [mapOverride, setMapOverride] = useState<"auto" | "show" | "hide">(
    "auto",
  );

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!data) return;
    const live = new Set(data.roles.map((role) => role.id));
    setCheckedIds((current) => {
      const next = new Set([...current].filter((id) => live.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [data]);

  useEffect(() => {
    void fetch("/api/maps")
      .then(async (response) => {
        const body = (await response.json()) as { settings?: MapSettings };
        if (body.settings) setMapSettings(body.settings);
      })
      .catch(() => setMapSettings(null));
  }, [mapRevision]);

  useEffect(() => {
    if (focusRoleId) setSelectedId(focusRoleId);
  }, [focusRoleId]);

  useEffect(() => {
    if (!ledgerMenu) return;
    function onPointer(event: PointerEvent) {
      if (!toolsRef.current?.contains(event.target as Node)) setLedgerMenu(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setLedgerMenu(null);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [ledgerMenu]);

  const focusTabUsed = useRef(false);
  useEffect(() => {
    const opensFocus = Boolean(focusTab) && selectedId === focusRoleId && !focusTabUsed.current;
    if (opensFocus) focusTabUsed.current = true;
    setDetailTab(opensFocus && focusTab ? focusTab : "story");
    setMapOverride("auto");
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || !data) return;
    const role = data.roles.find((entry) => entry.id === selectedId);
    if (!role) return;
    const section = classifyCareerHistorySection(role);
    setClosedSections((current) => {
      if (!current.has(section)) return current;
      const next = new Set(current);
      next.delete(section);
      return next;
    });
  }, [data, selectedId]);

  async function load() {
    const [mapResponse, publicationResponse] = await Promise.all([
      fetch("/api/work-map"),
      fetch("/api/projections"),
    ]);
    if (!mapResponse.ok) {
      setMessage("Career History could not be loaded.");
      return;
    }
    const next = (await mapResponse.json()) as WorkMapResponse;
    setData(next);
    setSettings(next.settings);
    setSelectedId((current) =>
      current && next.roles.some((role) => role.id === current)
        ? current
        : null,
    );
    if (publicationResponse.ok) {
      const body = (await publicationResponse.json()) as {
        projections: Publication[];
      };
      setPublications(body.projections);
    }
    notifyPreviewRefresh();
    if (previewRef.current) {
      const next = await fetchPreview();
      if (next) setPreview(next);
    }
  }

  const historyItems = useMemo(() => {
    if (!data) return [];
    return sortCareerHistory(
      searchCareerHistory(data.roles.map(asHistoryItem), search),
      sort,
    );
  }, [data, search, sort]);
  const groups = useMemo(() => groupCareerHistory(historyItems), [historyItems]);
  const shownIds = useMemo(() => {
    const ids: string[] = [];
    for (const section of CAREER_HISTORY_SECTIONS) {
      if (closedSections.has(section.key)) continue;
      const items = groups.find((group) => group.key === section.key)?.items ?? [];
      for (const item of items) ids.push(item.id);
    }
    return ids;
  }, [groups, closedSections]);
  const identicalFlags = useMemo(() => {
    if (!data) return new Map<string, { count: number; keeper: boolean }>();
    const byId = new Map(data.roles.map((role) => [role.id, role]));
    const sorted = sortCareerHistory(data.roles.map(asHistoryItem), sort);
    return flagIdenticalRoles(
      sorted.map((item) => {
        const role = byId.get(item.id);
        return {
          ...item,
          description: role?.description ?? "",
          achievements: role?.achievements ?? [],
        };
      }),
    );
  }, [data, sort]);
  const listedReviews = useMemo(
    () => (data ? identicalRoleReviews(data.roles.map(roleIdentity)) : []),
    [data],
  );
  const duplicateCount = useMemo(
    () => duplicateReviewCount(data?.roles ?? [], reviewDrafts, listedReviews),
    [data, reviewDrafts, listedReviews],
  );
  const identicalExtraIds = useMemo(
    () =>
      [...identicalFlags.entries()]
        .filter(([, flag]) => flag.count > 1 && !flag.keeper)
        .map(([id]) => id),
    [identicalFlags],
  );
  const stats = useMemo(() => {
    const identities = (data?.roles ?? []).map((role) => ({
      ...asHistoryItem(role),
      description: role.description,
      achievements: role.achievements,
    }));
    const visibleIds = new Set(historyItems.map((item) => item.id));
    const counted = search.trim()
      ? identities.filter((item) => visibleIds.has(item.id))
      : identities;
    return presentCareerHistoryStats(counted);
  }, [data, historyItems, search]);
  const visibleRoles = useMemo(() => {
    if (!data) return [];
    const byId = new Map(data.roles.map((role) => [role.id, role]));
    return historyItems
      .map((item) => byId.get(item.id))
      .filter((role): role is WorkMapRole => Boolean(role));
  }, [data, historyItems]);
  const timelineRoles = useMemo(
    () => visibleRoles.map(asTimelineRole),
    [visibleRoles],
  );
  const timelineResidences = useMemo(
    () => (data?.residences ?? []).map(asTimelineResidence),
    [data],
  );
  const timelineMoments = useMemo(
    () => careerMoments(timelineRoles, timelineResidences),
    [timelineRoles, timelineResidences],
  );
  const timelineMonths = useMemo(
    () => careerSpan(timelineRoles, timelineMoments, currentCareerMonth()),
    [timelineRoles, timelineMoments],
  );
  const timelineActive = view === "timeline" && !placingForId;
  const shownMonth = timelineMonths.includes(timelineMonth)
    ? timelineMonth
    : (timelineMonths.at(-1) ?? timelineMonth);
  const timelineReading = useMemo(
    () =>
      careerFrame(
        timelineRoles,
        timelineMoments,
        shownMonth,
        timelineResidences,
        selectedId,
      ),
    [timelineRoles, timelineMoments, shownMonth, timelineResidences, selectedId],
  );
  const mapRoles = timelineActive
    ? visibleRoles.filter((role) =>
        rolesStartedBy(timelineRoles, shownMonth).some((item) => item.id === role.id),
      )
    : visibleRoles;
  const selectedOnMap = selectedId
    ? (mapRoles.find((role) => role.id === selectedId) ?? null)
    : null;
  const fitMode: MapFitMode = !selectedOnMap
    ? "visible"
    : selectedOnMap.locations.some(
          (location) =>
            Number.isFinite(location.latitude) && Number.isFinite(location.longitude),
        )
      ? "pin"
      : "hold";
  const cameraFitKey = [
    selectedId ?? "",
    timelineActive ? shownMonth : "map",
    fitMode,
    mapRoles
      .flatMap((role) =>
        role.locations.map(
          (location) =>
            `${role.id}:${location.latitude.toFixed(5)}:${location.longitude.toFixed(5)}`,
        ),
      )
      .sort()
      .join("|"),
  ].join(":");

  const selectRole = useCallback(
    (id: string, month?: string, keepPlaying = false) => {
      setSelectedId(id);
      const role = data?.roles.find((entry) => entry.id === id);
      const start = role ? careerMonth(role.startDate) : null;
      const next = month ?? start;
      if (!next) return;
      if (!keepPlaying) setTimelinePlaying(false);
      setTimelineMonth(next);
    },
    [data],
  );

  useEffect(() => {
    if (!timelinePlaying || !timelineActive) return;
    const timer = window.setInterval(() => {
      const upcoming = nextCareerMoment(timelineMoments, shownMonth);
      if (!upcoming) {
        setTimelinePlaying(false);
        return;
      }
      const frame = careerFrame(
        timelineRoles,
        timelineMoments,
        upcoming.at,
        timelineResidences,
      );
      if (frame.lead) selectRole(frame.lead.id, upcoming.at, true);
      else {
        setTimelinePlaying(false);
        setTimelineMonth(upcoming.at);
        setSelectedId(null);
      }
    }, 900);
    return () => window.clearInterval(timer);
  }, [
    timelinePlaying,
    timelineActive,
    timelineMoments,
    timelineRoles,
    timelineResidences,
    shownMonth,
    selectRole,
  ]);

  const selected = data?.roles.find((role) => role.id === selectedId) ?? null;
  const canvasRole = data?.roles.find((role) => role.id === canvasRoleId) ?? null;
  const latest = publications.find(
    (publication) => publication.slug === settings?.slug,
  );

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    const response = await fetch("/api/work-map/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (!response.ok) {
      setMessage("Could not save publication settings.");
      return;
    }
    setSettingsOpen(false);
    setMessage("Publication settings saved.");
    await load();
  }

  function selectMonth(month: string) {
    const frame = careerFrame(timelineRoles, timelineMoments, month, timelineResidences);
    if (frame.lead) {
      selectRole(frame.lead.id, month);
      return;
    }
    setTimelinePlaying(false);
    setTimelineMonth(month);
    setSelectedId(null);
  }

  const searchPick = useRef("");
  useEffect(() => {
    const query = search.trim();
    const id = historyItems.length === 1 ? historyItems[0]?.id : undefined;
    if (!query || !id) {
      searchPick.current = "";
      return;
    }
    const pick = `${query}:${id}`;
    if (searchPick.current === pick) return;
    searchPick.current = pick;
    selectRole(id);
  }, [search, historyItems, selectRole]);

  function openSettings() {
    setPublishMenu(false);
    setSettingsOpen(true);
  }

  function requestPublish(host: "bio" | "tab" = "tab") {
    if (!settings || publishing) return;
    setPreviewMenu(false);
    setMenuHost(host);
    setPublishMenu((open) => (menuHost === host ? !open : true));
  }

  function confirmPublish() {
    setPublishMenu(false);
    void publish();
  }

  async function requestPreview(host: "bio" | "tab" = "tab") {
    setPublishMenu(false);
    setMenuHost(host);
    const choice = readPreviewPlacement();
    if (choice === "ask") {
      setPreviewMenu((open) => (menuHost === host ? !open : true));
      return;
    }
    setPreviewMenu(false);
    await showPreview(choice);
  }

  async function choosePreview(where: "here" | "window") {
    setPreviewMenu(false);
    await showPreview(where);
  }

  async function showPreview(where: "here" | "window") {
    setMessage("");
    const next = await fetchPreview();
    if (!next) return;
    if (where === "here") {
      setPreview(next);
      return;
    }
    const opened = window.open(
      previewWindowUrl(),
      "proforna-public-preview",
      "popup,width=1100,height=800",
    );
    if (!opened) {
      setMessage("The browser blocked the preview window. Preview is staying in this window.");
      setPreview(next);
    }
  }

  async function fetchPreview() {
    const response = await fetch("/api/work-map/preview");
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setMessage(
        body.error === "slug-required"
          ? "Save a public slug in publication settings before previewing."
          : body.error === "sections-required"
            ? "Choose at least one section in publication settings before previewing."
            : "Could not build the preview.",
      );
      return null;
    }
    return (await response.json()) as {
      snapshot: PublicWorkMapSnapshot;
      publishable: boolean;
      exactLocations: boolean;
    };
  }

  async function publish() {
    if (!settings) return;
    setPublishing(true);
    setMessage("");
    const settingsResponse = await fetch("/api/work-map/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (!settingsResponse.ok) {
      setPublishing(false);
      setMessage("Save valid publication settings before publishing.");
      return;
    }
    const response = await fetch("/api/work-map/publish", { method: "POST" });
    setPublishing(false);
    if (response.ok) {
      setMessage(
        "Published this Work Map snapshot to the public link. Private edits stay local until you publish an update.",
      );
      await load();
    } else {
      const body = (await response.json()) as { error?: string };
      setMessage(body.error ?? "The Work Map could not be published.");
    }
  }

  function stopSelecting() {
    setSelecting(false);
    setCheckedIds(new Set());
    setRemoveAsk(null);
  }

  function toggleChecked(id: string) {
    setRemoveAsk(null);
    setCheckedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectShown(ids: string[]) {
    setRemoveAsk(null);
    setCheckedIds((current) => {
      const next = new Set(current);
      const allOn = ids.length > 0 && ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allOn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  function askRemove(ids: string[], detail: string) {
    if (ids.length === 0) return;
    setRemoveAsk({ ids, detail });
  }

  async function removeRoles(ids: string[]) {
    setRemoving(true);
    setMessage("");
    const failed: string[] = [];
    for (const id of ids) {
      const response = await fetch(`/api/work-map/roles/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) failed.push(id);
    }
    setRemoving(false);
    setRemoveAsk(null);
    setCheckedIds((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (!failed.includes(id)) next.delete(id);
      }
      return next;
    });
    if (selectedId && ids.includes(selectedId) && !failed.includes(selectedId)) {
      setSelectedId(null);
    }
    if (failed.length > 0) {
      setMessage(
        failed.length === ids.length
          ? "Could not remove those roles."
          : `Removed ${ids.length - failed.length}. ${failed.length} could not be removed.`,
      );
    } else {
      setMessage(ids.length === 1 ? "Role removed." : `${ids.length} roles removed.`);
    }
    await load();
  }

  async function addRole(kind: CareerHistorySectionKey) {
    setCreatingKind(kind);
    setSettingsOpen(false);
    setMessage("");
    const response = await fetch("/api/work-map/roles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    setCreatingKind(null);
    if (!response.ok) {
      setMessage("Could not add that role.");
      return;
    }
    const body = (await response.json()) as { role: { id: string } };
    setClosedSections((current) => {
      const next = new Set(current);
      next.delete(kind);
      return next;
    });
    setSelectedId(body.role.id);
    await load();
  }

  async function revoke() {
    if (!latest) return;
    const response = await fetch(`/api/projections/${latest.id}/revoke`, {
      method: "POST",
    });
    setMessage(response.ok ? "Public Work Map revoked." : "Could not revoke it.");
    await load();
  }

  function holdDuplicate(
    role: WorkMapRole,
    draft: Omit<ReviewDraft, "localId" | "sourceRoleId" | "matchesId">,
  ): boolean {
    if (!data) return false;
    const candidate = {
      ...roleIdentity(role),
      ...draft,
      id: role.id,
    };
    const savedKey = careerHistoryIdentityKey(roleIdentity(role));
    const others = data.roles
      .filter((item) => item.id !== role.id)
      .map(roleIdentity);
    const review = identicalRoleReviews([...others, candidate]).find((item) => item.id === role.id);
    if (!review) return false;
    if (savedKey === careerHistoryIdentityKey(candidate)) {
      setReviewFocus(role.id);
      setReviewNotice(null);
      setReviewOpen(true);
      return true;
    }
    const match = data.roles.find((item) => item.id === review.matchesId);
    const name = match?.organization || match?.title || "a role already in your history";
    const shell =
      !role.title.trim() &&
      !role.organization.trim() &&
      !role.description.trim() &&
      role.achievements.length === 0 &&
      !role.startDate.trim() &&
      role.locations.length === 0 &&
      role.media.length === 0;
    const held: ReviewDraft = {
      localId: crypto.randomUUID(),
      sourceRoleId: shell ? null : role.id,
      matchesId: review.matchesId,
      ...draft,
    };
    setReviewDrafts((current) => [...current, held]);
    setReviewFocus(held.localId);
    setReviewNotice(
      `This matches ${name}, already in Career History. It was not added to the list. Compare it here, then change it or discard it before saving.`,
    );
    setReviewOpen(true);
    if (shell) {
      setSelectedId(null);
      void fetch(`/api/work-map/roles/${role.id}`, { method: "DELETE" }).then(() => load());
    }
    return true;
  }

  async function commitDraft(draft: ReviewDraft) {
    if (!data) return;
    const source = draft.sourceRoleId
      ? data.roles.find((role) => role.id === draft.sourceRoleId)
      : null;
    const candidate = {
      id: draft.sourceRoleId ?? draft.localId,
      kind: draft.kind,
      title: draft.title,
      organization: draft.organization,
      locationLabel: draft.locationLabel,
      startDate: draft.startDate,
      endDate: draft.endDate,
      isCurrent: draft.isCurrent,
      description: draft.description,
      achievements: draft.achievements,
      locations: (source?.locations ?? []).map((location) => ({
        address: location.address,
        latitude: location.latitude,
        longitude: location.longitude,
      })),
    };
    const still = identicalRoleReviews([
      ...data.roles.filter((role) => role.id !== draft.sourceRoleId).map(roleIdentity),
      candidate,
    ]).some((item) => item.id === candidate.id);
    if (still) {
      setReviewNotice(
        "This still matches a role already in Career History. Change it here before it can be saved.",
      );
      return;
    }
    let roleId = draft.sourceRoleId;
    if (!roleId) {
      const created = await fetch("/api/work-map/roles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: draft.kind }),
      });
      if (!created.ok) {
        setReviewNotice("Could not save that role.");
        return;
      }
      const body = (await created.json()) as { role: { id: string } };
      roleId = body.role.id;
    }
    const saved = await fetch(`/api/work-map/roles/${roleId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
    if (!saved.ok) {
      setReviewNotice("Could not save that role.");
      return;
    }
    setReviewDrafts((current) => current.filter((item) => item.localId !== draft.localId));
    setReviewNotice(null);
    await load();
  }

  async function deleteReviewed(roleIds: string[], draftIds: string[]) {
    if (draftIds.length > 0) {
      setReviewDrafts((current) => current.filter((item) => !draftIds.includes(item.localId)));
    }
    if (roleIds.length === 0) {
      setReviewNotice(draftIds.length > 0 ? "Discarded the unsaved copies." : null);
      return;
    }
    await removeRoles(roleIds);
  }

  async function mergeReviewed(request: MergeRequest) {
    let keeperId = request.keeperRoleId;
    if (request.keeperPatch && keeperId) {
      const saved = await fetch(`/api/work-map/roles/${keeperId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request.keeperPatch),
      });
      if (!saved.ok) {
        setReviewNotice("Could not keep the values you chose.");
        return;
      }
    }
    if (request.keeperDraft) {
      const draft = request.keeperDraft;
      let roleId = draft.sourceRoleId;
      if (!roleId) {
        const created = await fetch("/api/work-map/roles", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind: draft.kind }),
        });
        if (!created.ok) {
          setReviewNotice("Could not keep that copy.");
          return;
        }
        const body = (await created.json()) as { role: { id: string } };
        roleId = body.role.id;
      }
      const saved = await fetch(`/api/work-map/roles/${roleId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!saved.ok) {
        setReviewNotice("Could not keep that copy.");
        return;
      }
      keeperId = roleId;
      setReviewDrafts((current) => current.filter((item) => item.localId !== draft.localId));
    }
    const protectedId = request.keeperDraft?.sourceRoleId ?? keeperId;
    const dropIds = request.dropRoleIds.filter((id) => id && id !== keeperId && id !== protectedId);
    const failed: string[] = [];
    for (const id of dropIds) {
      const response = await fetch(`/api/work-map/roles/${id}`, { method: "DELETE" });
      if (!response.ok) failed.push(id);
    }
    setReviewDrafts((current) =>
      current.filter((item) => !request.dropDraftIds.includes(item.localId)),
    );
    if (selectedId && dropIds.includes(selectedId) && !failed.includes(selectedId)) {
      setSelectedId(null);
    }
    setReviewNotice(
      failed.length > 0
        ? "Kept the role you chose. Some other copies could not be removed."
        : "Merged into the role you chose to keep.",
    );
    if (keeperId) setReviewFocus(keeperId);
    await load();
  }

  useEffect(() => {
    const shell = actionShellRef.current;
    if (!shell || !actionTabOpen) return;
    shell.classList.remove("is-rising");
    void shell.offsetWidth;
    shell.classList.add("is-rising");
  }, [actionTabOpen, selectedId]);

  useEffect(() => {
    if (!previewMenu && !publishMenu) return;
    function onPointer(event: PointerEvent) {
      const target = event.target as Node;
      if (previewMenu && !previewMenuRef.current?.contains(target)) {
        setPreviewMenu(false);
      }
      if (publishMenu && !publishMenuRef.current?.contains(target)) {
        setPublishMenu(false);
      }
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [previewMenu, publishMenu]);

  if (!data) {
    return (
      <section className="work-map-loading">
        <h1>Career History</h1>
        <p>{message || error || "Loading career history…"}</p>
      </section>
    );
  }

  const empty = data.roles.length === 0;
  const recordOpen = Boolean(selected);
  const mapVisible = placingForId ? true : mapOverride !== "hide";
  const publishLabel = publishing
    ? "Publishing…"
    : latest?.status === "published"
      ? "Update"
      : "Publish";

  function chooseDetailTab(next: DetailTab) {
    setDetailTab(next);
    setMapOverride("auto");
  }

  function collapseActionTab() {
    setActionTabOpen(false);
    setPreviewMenu(false);
    setPublishMenu(false);
  }

  function moveActionTab(event: ReactPointerEvent<HTMLButtonElement>) {
    const gesture = actionGesture.current;
    if (!gesture || event.pointerId !== gesture.id) return;
    const dy = event.clientY - gesture.y;
    const dock = actionDockRef.current;
    if (Math.abs(dy) > 4) gesture.moved = true;
    if (dock && ((actionTabOpen && dy > 0) || (!actionTabOpen && dy < 0))) {
      const shift = actionTabOpen ? Math.min(dy, 40) : Math.max(dy, -40);
      dock.style.transform = `translateY(${shift}px)`;
    }
    if (actionTabOpen && dy > 28) {
      actionGesture.current = null;
      actionSwallow.current = true;
      if (dock) dock.style.transform = "";
      collapseActionTab();
    }
    if (!actionTabOpen && dy < -28) {
      actionGesture.current = null;
      actionSwallow.current = true;
      if (dock) dock.style.transform = "";
      setActionTabOpen(true);
    }
  }

  function dropPin(latitude: number, longitude: number) {
    const roleId = placingForId;
    const locationId = placingLocationId ?? undefined;
    if (!roleId) return;
    setPendingPlacement({ roleId, locationId, latitude, longitude });
    setSelectedId(roleId);
    setPlacingForId(null);
    setPlacingLocationId(null);
    void reversePlace(latitude, longitude)
      .then((found) => {
        if (!found) return;
        const note = lookupNote(found);
        if (note) setMessage(note);
        const address = found.place?.address;
        if (!address) return;
        setPendingPlacement((current) =>
          current &&
          current.roleId === roleId &&
          current.latitude === latitude &&
          current.longitude === longitude
            ? { ...current, address }
            : current,
        );
      })
      .catch(() => undefined);
  }

  return (
    <section className="work-map">
      {canvasRole ? (
        <RoleCanvasEntry
          key={canvasRole.id}
          role={canvasRole}
          minimized={canvasMinimized}
          slot={selectedId === canvasRole.id ? canvasSlot : null}
          dockSlot={canvasDock}
          onMinimizedChange={setCanvasMinimized}
          onClose={() => {
            setCanvasRoleId(null);
            setCanvasMinimized(false);
          }}
        />
      ) : null}
      {message ? (
        <p
          className={message.length > 90 ? "work-map-toast is-long" : "work-map-toast"}
          role="status"
        >
          {message}
        </p>
      ) : null}

      {preview ? (
        <WorkMapPreview
          exactLocations={preview.exactLocations}
          mapSettings={mapSettings}
          publishable={preview.publishable}
          snapshot={preview.snapshot}
          onClose={() => setPreview(null)}
        />
      ) : null}
      <div
        className={["work-map-layout", mapVisible ? "is-map" : "is-record"].join(" ")}
        hidden={preview !== null}
      >
        <div className="work-map-float">
          <CareerBio
          profile={data.profile}
          onHome={onHome}
          onHistory={recordOpen ? () => setSelectedId(null) : undefined}
          onSaved={load}
          editOnName={recordOpen}
          controls={
            <div className="publication-cluster" role="group" aria-label="Publication">
              <span
                className="publication-status"
                title={
                  latest
                    ? `${latest.analytics.events} events · ${latest.analytics.accessRequests} requests`
                    : "Nothing leaves the vault until you publish"
                }
              >
                {latest?.status === "published"
                  ? "Published"
                  : latest?.status === "revoked"
                    ? "Revoked"
                    : "Private"}
              </span>
            </div>
          }
        />
        <HistoryOverview
          figures={
            recordOpen && selected
              ? roleOverviewFigures(selected)
              : [
                  { label: "Total Tenure", value: stats.tenure || "—" },
                  { label: "Roles", value: String(stats.roles) },
                  { label: "Miles Traveled", value: String(stats.miles) },
                  { label: "Cities", value: String(stats.cities) },
                ]
          }
          open={overviewOpen}
          role={recordOpen ? selected : null}
          onSaved={load}
          onToggle={() => setOverviewOpen((open) => !open)}
        />
          {recordOpen && selected ? (
          <RoleDetailPanel
            role={selected}
            tab={detailTab}
            onTab={chooseDetailTab}
            mapVisible={mapVisible}
            onToggleMap={() => setMapOverride(mapVisible ? "hide" : "show")}
            onClose={() => setSelectedId(null)}
            onSaved={load}
            reviewCount={duplicateCount.active}
            onOpenReview={duplicateCount.total > 0 ? () => setReviewOpen(true) : undefined}
            canvasExpanded={canvasRoleId === selected.id && !canvasMinimized}
            onShowCanvas={() => {
              if (canvasRoleId === selected.id && !canvasMinimized) {
                setCanvasRoleId(null);
                setCanvasMinimized(false);
                return;
              }
              setCanvasRoleId(selected.id);
              setCanvasMinimized(false);
            }}
            onCanvasSlot={setCanvasSlot}
            placement={
              pendingPlacement?.roleId === selected.id ? pendingPlacement : null
            }
            onHoldDuplicate={(draft) => holdDuplicate(selected, draft)}
            onStartPlacement={(locationId) => {
              cameraBeforePlace.current = readMapCamera("history");
              setDetailTab("places");
              setMapOverride("show");
              setView("map");
              setPlacingForId(selected.id);
              setPlacingLocationId(locationId ?? null);
            }}
            onLocationSaved={() => setPendingPlacement(null)}
          />
        ) : (
        <aside className="work-map-ledger">
          <header className="history-panel-head">
            <h2>Career History</h2>
            {duplicateCount.total > 0 ? (
              <button
                type="button"
                className="history-review-open"
                onClick={() => setReviewOpen(true)}
              >
                Review duplicates
                {duplicateCount.active > 0 ? ` (${duplicateCount.active})` : ""}
              </button>
            ) : null}
            <div className="history-publish">
              <button
                className="history-icon"
                type="button"
                aria-expanded={homesOpen}
                aria-label={`Homes (${data.residences.length})`}
                title={`Homes (${data.residences.length})`}
                onClick={() => setHomesOpen((open) => !open)}
              >
                <HomesIcon />
              </button>
              <button
                className="history-icon"
                type="button"
                aria-label="Settings"
                title="Settings"
                onClick={openSettings}
              >
                <SettingsIcon />
              </button>
            </div>
          </header>
          <div className="work-map-tools" ref={toolsRef}>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search…"
              aria-label="Search career history"
            />
            <label className="work-map-sort">
              <span>Sort</span>
              <select
                value={sort}
                onChange={(event) =>
                  setSort(event.target.value === "oldest" ? "oldest" : "newest")
                }
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
              </select>
            </label>
            <div className="history-tool-group">
            <div className="history-menu">
              <button
                type="button"
                className="history-tool"
                aria-label="Import"
                aria-haspopup="menu"
                aria-expanded={ledgerMenu === "import"}
                onClick={() =>
                  setLedgerMenu((current) => (current === "import" ? null : "import"))
                }
              >
                <ImportIcon />
              </button>
              {ledgerMenu === "import" ? (
                <div className="history-menu-panel" role="menu" aria-label="Import">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setLedgerMenu(null);
                      setImportOpen(true);
                    }}
                  >
                    Resume
                  </button>
                </div>
              ) : null}
            </div>
            <div className="history-menu">
              <button
                type="button"
                className="history-tool"
                aria-label="Add"
                aria-haspopup="menu"
                aria-expanded={ledgerMenu === "add"}
                aria-busy={creatingKind !== null}
                disabled={creatingKind !== null}
                onClick={() =>
                  setLedgerMenu((current) => (current === "add" ? null : "add"))
                }
              >
                +
              </button>
              {ledgerMenu === "add" ? (
                <div className="history-menu-panel" role="menu" aria-label="Add">
                  {CAREER_HISTORY_SECTIONS.map((section) => (
                    <button
                      key={section.key}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setLedgerMenu(null);
                        void addRole(section.key);
                      }}
                    >
                      {addKindLabel(section.key)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="history-tool"
              aria-label={selecting ? "Done selecting" : "Select"}
              aria-pressed={selecting}
              onClick={() => {
                setLedgerMenu(null);
                if (selecting) stopSelecting();
                else setSelecting(true);
              }}
            >
              <SelectIcon />
            </button>
            </div>
          </div>
          {removeAsk || selecting ? (
          <div className="history-actions" aria-label="Career history actions">
            {removeAsk ? (
              <div className="history-confirm">
                <p>{removeAsk.detail}</p>
                <div>
                  <button
                    className="is-danger"
                    disabled={removing}
                    type="button"
                    onClick={() => void removeRoles(removeAsk.ids)}
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    disabled={removing}
                    onClick={() => setRemoveAsk(null)}
                  >
                    Keep
                  </button>
                </div>
              </div>
            ) : selecting ? (
              <>
                <span>
                  {checkedIds.size === 0
                    ? "Select roles"
                    : `${checkedIds.size} selected`}
                </span>
                <button
                  type="button"
                  disabled={shownIds.length === 0}
                  onClick={() => selectShown(shownIds)}
                >
                  {shownIds.length > 0 &&
                  shownIds.every((id) => checkedIds.has(id))
                    ? "Clear shown"
                    : "Select shown"}
                </button>
                {identicalExtraIds.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => selectShown(identicalExtraIds)}
                  >
                    Select identical
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={checkedIds.size !== 1}
                  onClick={() => {
                    const id = [...checkedIds][0];
                    if (id) selectRole(id);
                  }}
                >
                  Edit
                </button>
                <button
                  className="is-danger"
                  type="button"
                  disabled={checkedIds.size === 0}
                  onClick={() =>
                    askRemove(
                      [...checkedIds],
                      checkedIds.size === 1
                        ? "Remove this role? Its sites and photos on this machine go with it."
                        : `Remove ${checkedIds.size} roles? Their sites and photos on this machine go with them.`,
                    )
                  }
                >
                  Remove
                </button>
              </>
            ) : null}
          </div>
          ) : null}
          {homesOpen ? (
            <HomesPanel
              residences={data.residences}
              activeId={homePin(data.residences, selected)?.id ?? null}
              onChanged={load}
            />
          ) : null}
          <div className="work-map-role-list">
            {empty ? (
              <p>Import a resume, or add a role.</p>
            ) : null}
            {CAREER_HISTORY_SECTIONS.map((section) => {
              const items =
                groups.find((group) => group.key === section.key)?.items ?? [];
              const open = !closedSections.has(section.key);
              return (
                <section key={section.key}>
                  <div className="history-cat-row">
                    <button
                      type="button"
                      className="history-cat"
                      aria-expanded={open}
                      onClick={() =>
                        setClosedSections((current) => {
                          const next = new Set(current);
                          if (next.has(section.key)) next.delete(section.key);
                          else next.add(section.key);
                          return next;
                        })
                      }
                    >
                      <b>{section.label}</b>
                      <em>({items.length})</em>
                      <span aria-hidden="true">{open ? "▾" : "▸"}</span>
                    </button>
                  </div>
                  {open
                    ? items.map((item) => (
                        <HistoryRow
                          key={item.id}
                          item={item}
                          identical={(identicalFlags.get(item.id)?.count ?? 1) > 1}
                          selecting={selecting}
                          checked={checkedIds.has(item.id)}
                          onToggle={() => toggleChecked(item.id)}
                          onOpen={() => selectRole(item.id)}
                        />
                      ))
                    : null}
                </section>
              );
            })}
            {!empty && historyItems.length === 0 ? (
              <p className="history-search-miss" role="status">
                No roles match that search.
                <button type="button" onClick={() => setSearch("")}>
                  Clear search
                </button>
              </p>
            ) : null}
          </div>
        </aside>
        )}
        </div>

        {mapVisible ? (
        <main
          className={[
            "work-map-stage",
            "has-action-tab",
            !actionTabOpen ? "is-actions-collapsed" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <CareerMap
            cameraNonce={cameraNonce}
            fitKey={cameraFitKey}
            fitMode={fitMode}
            holdView={Boolean(placingForId)}
            home={
              timelineActive
                ? homePinForTimeline(data.residences, timelineReading.home)
                : homePin(data.residences, selected)
            }
            onMapClick={placingForId ? dropPin : undefined}
            onSelect={selectRole}
            roles={mapRoles}
            selectedId={selectedId}
            settings={mapSettings}
            emptyNote={
              search.trim() && historyItems.length === 0
                ? {
                    title: "No roles match that search.",
                    detail: "Clear the search to see every role.",
                  }
                : null
            }
            suppressEmpty={timelineActive}
            viewKey="history"
          />
          {timelineActive && timelineMonths.length > 0 ? (
            <CareerTimelineScrubber
              frame={timelineReading}
              month={shownMonth}
              moments={timelineMoments}
              months={timelineMonths}
              onMonth={selectMonth}
              onPlay={() => {
                const upcoming = nextCareerMoment(timelineMoments, shownMonth);
                if (!upcoming) {
                  const first = timelineMoments[0];
                  if (first) {
                    const frame = careerFrame(
                      timelineRoles,
                      timelineMoments,
                      first.at,
                      timelineResidences,
                    );
                    if (frame.lead) selectRole(frame.lead.id, first.at, true);
                    else {
                      setTimelineMonth(first.at);
                      setSelectedId(null);
                    }
                  }
                }
                setTimelinePlaying((value) => !value);
              }}
              playing={timelinePlaying}
            />
          ) : null}
          {placingForId ? (
            <div className="map-placement-banner" role="status">
              <strong>Place this work site</strong>
              <span>Click its location on the map.</span>
              <button
                type="button"
                onClick={() => {
                  const shot = cameraBeforePlace.current;
                  setPlacingForId(null);
                  setPlacingLocationId(null);
                  if (!shot) return;
                  writeMapCamera("history", shot);
                  setCameraNonce((value) => value + 1);
                }}
              >
                Cancel
              </button>
            </div>
          ) : null}
          <div
              className={actionTabOpen ? "action-dock" : "action-dock is-collapsed"}
              ref={actionDockRef}
            >
              <div className={canvasMinimized ? "action-tab has-canvas" : "action-tab"} ref={actionShellRef}>
                {canvasMinimized ? <div className="action-canvas-slot" ref={setCanvasDock} /> : null}
                <div className="action-bar" role="toolbar" aria-label="Actions">
                  <div className="publication-menu-anchor" ref={menuHost === "tab" ? publishMenuRef : undefined}>
                    <button
                      disabled={publishing}
                      type="button"
                      aria-expanded={publishMenu && menuHost === "tab"}
                      aria-haspopup="menu"
                      onClick={() => requestPublish("tab")}
                    >
                      {publishLabel}
                    </button>
                    {publishMenu && menuHost === "tab" ? (
                      <div className="publication-menu" role="menu" aria-label="Publish">
                        <button type="button" role="menuitem" onClick={confirmPublish}>
                          Confirm publish
                        </button>
                        <button type="button" role="menuitem" onClick={() => setPublishMenu(false)}>
                          Cancel
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {latest?.status === "published" ? (
                    <button type="button" onClick={revoke}>
                      Revoke
                    </button>
                  ) : null}
                  <div className="publication-menu-anchor" ref={menuHost === "tab" ? previewMenuRef : undefined}>
                    <button
                      type="button"
                      aria-expanded={previewMenu && menuHost === "tab"}
                      aria-haspopup="menu"
                      onClick={() => void requestPreview("tab")}
                    >
                      Preview
                    </button>
                    {previewMenu && menuHost === "tab" ? (
                      <div className="publication-menu" role="menu" aria-label="Open preview">
                        <button type="button" role="menuitem" onClick={() => void choosePreview("here")}>
                          This window
                        </button>
                        <button type="button" role="menuitem" onClick={() => void choosePreview("window")}>
                          New window
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    aria-pressed={view === "map"}
                    onClick={() => setView("map")}
                  >
                    Map
                  </button>
                  <button
                    type="button"
                    aria-pressed={view === "timeline"}
                    onClick={() => {
                      if (view === "timeline") return;
                      setView("timeline");
                      const frame = careerFrame(
                        timelineRoles,
                        timelineMoments,
                        shownMonth,
                        timelineResidences,
                      );
                      if (frame.lead) selectRole(frame.lead.id, shownMonth);
                    }}
                  >
                    Timeline
                  </button>
                </div>
                <button
                  className="action-handle"
                  type="button"
                  aria-expanded={actionTabOpen}
                  aria-label={actionTabOpen ? "Collapse actions" : "Show actions"}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    actionGesture.current = { id: event.pointerId, y: event.clientY, moved: false };
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={moveActionTab}
                  onPointerUp={(event) => {
                    if (!actionGesture.current || event.pointerId !== actionGesture.current.id) return;
                    if (actionGesture.current.moved) actionSwallow.current = true;
                    actionGesture.current = null;
                    if (actionDockRef.current) actionDockRef.current.style.transform = "";
                  }}
                  onPointerCancel={() => {
                    actionGesture.current = null;
                    if (actionDockRef.current) actionDockRef.current.style.transform = "";
                  }}
                  onClick={() => {
                    if (actionSwallow.current) {
                      actionSwallow.current = false;
                      return;
                    }
                    if (actionTabOpen) collapseActionTab();
                    else setActionTabOpen(true);
                  }}
                >
                  <i aria-hidden="true" />
                </button>
              </div>
            </div>
        </main>
        ) : selected ? (
          <RoleSheet role={selected} tab={detailTab} />
        ) : null}

        {settingsOpen && settings ? (
          <>
            <button
              className="publication-settings-backdrop"
              type="button"
              aria-label="Close publication settings"
              onClick={() => setSettingsOpen(false)}
            />
            <PublicationSettings
              placement={placement}
              published={
                latest?.status === "published" && latest.slug === settings.slug
              }
              relayOrigin={data?.relayOrigin ?? null}
              settings={settings}
              onChange={setSettings}
              onClose={() => setSettingsOpen(false)}
              onPlacement={(value) => {
                writePreviewPlacement(value);
                setPlacement(value);
              }}
              onSubmit={saveSettings}
            />
          </>
        ) : null}
        {importOpen ? (
          <ResumeImport
            onClose={() => setImportOpen(false)}
            onDone={() => {
              setImportOpen(false);
              void load();
            }}
          />
        ) : null}
        {reviewOpen ? (
          <DuplicateReview
            drafts={reviewDrafts}
            focusId={reviewFocus}
            listedPairs={listedReviews}
            notice={reviewNotice}
            roles={data.roles}
            onClose={() => setReviewOpen(false)}
            onChangeDraft={(localId, patch) =>
              setReviewDrafts((current) =>
                current.map((item) => (item.localId === localId ? { ...item, ...patch } : item)),
              )
            }
            onCommitDraft={(draft) => void commitDraft(draft)}
            onDiscardDraft={(localId) => {
              setReviewDrafts((current) => current.filter((item) => item.localId !== localId));
              setReviewNotice(null);
            }}
            onBulkDelete={(roleIds, draftIds) => deleteReviewed(roleIds, draftIds)}
            onMerge={(request) => mergeReviewed(request)}
          />
        ) : null}
      </div>
    </section>
  );
}

function homePin(
  residences: Residence[],
  role: WorkMapRole | null,
): (WorkMapHome & { id: string }) | null {
  const residence = residenceForMap(residences, role);
  return residence ? toHomePin(residence) : null;
}

function homePinForTimeline(
  residences: Residence[],
  home: CareerTimelineResidence | null,
): (WorkMapHome & { id: string }) | null {
  if (home) {
    if (!home.pinned) return null;
    const residence = residences.find((item) => item.id === home.id);
    return residence ? toHomePin(residence) : null;
  }
  return homePin(
    residences.filter((item) => !careerMonth(item.startDate ?? "")),
    null,
  );
}

function toHomePin(residence: Residence): (WorkMapHome & { id: string }) | null {
  if (residence.latitude == null || residence.longitude == null) return null;
  const span = residence.endDate
    ? `${residence.startDate ?? "Start"} – ${residence.endDate}`
    : residence.startDate
      ? `${residence.startDate} – Present`
      : "";
  return {
    id: residence.id,
    latitude: residence.latitude,
    longitude: residence.longitude,
    label: residence.label,
    detail: [residence.address, span].filter(Boolean).join(" · "),
  };
}

function CareerBio({
  profile,
  onHome,
  onHistory,
  onSaved,
  controls,
  editOnName = false,
}: {
  profile: WorkMapResponse["profile"];
  onHome: () => void;
  onHistory?: () => void;
  onSaved: () => Promise<void>;
  controls?: ReactNode;
  editOnName?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [githubOpen, setGithubOpen] = useState(false);
  const [note, setNote] = useState("");
  const editorRef = useRef<HTMLDialogElement>(null);
  const githubRef = useRef<HTMLDialogElement>(null);
  const place = [
    profile.address,
    [profile.city, profile.state].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(", ");
  const initials = profile.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
  const socials = [
    profile.githubUrl
      ? { name: "GitHub", url: profile.githubUrl, github: true }
      : null,
    profile.linkedinUrl
      ? { name: "LinkedIn", url: profile.linkedinUrl, github: false }
      : null,
    profile.portfolioUrl
      ? { name: "Site", url: profile.portfolioUrl, github: false }
      : null,
  ].filter((item) => item !== null);

  useEffect(() => {
    const dialog = editorRef.current;
    if (!dialog) return;
    if (editing && !dialog.open) dialog.showModal();
    if (!editing && dialog.open) dialog.close();
  }, [editing]);

  useEffect(() => {
    const dialog = githubRef.current;
    if (!dialog) return;
    if (githubOpen && !dialog.open) dialog.showModal();
    if (!githubOpen && dialog.open) dialog.close();
  }, [githubOpen]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNote("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: String(form.get("fullName") ?? ""),
        headline: String(form.get("headline") ?? ""),
        address: String(form.get("address") ?? ""),
        city: String(form.get("city") ?? ""),
        state: String(form.get("state") ?? ""),
        bio: String(form.get("bio") ?? ""),
        linkedinUrl: String(form.get("linkedinUrl") ?? ""),
        githubUrl: String(form.get("githubUrl") ?? ""),
        portfolioUrl: String(form.get("portfolioUrl") ?? ""),
      }),
    });
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setNote(body.error ?? "Could not save this profile.");
      return;
    }
    const photo = form.get("avatar");
    if (photo instanceof File && photo.size > 0) {
      const upload = new FormData();
      upload.set("avatar", photo);
      const avatar = await fetch("/api/profile/avatar", {
        method: "POST",
        body: upload,
      });
      if (!avatar.ok) {
        const body = (await avatar.json()) as { error?: string };
        setNote(body.error ?? "The profile saved, but the photo did not.");
        await onSaved();
        return;
      }
    }
    setEditing(false);
    await onSaved();
  }

  return (
    <section className={editOnName ? "career-bio is-named-edit" : "career-bio"} aria-label="Profile">
      <div className="profile-bar">
        <span className="profile-links">
          <button className="career-bio-home" type="button" onClick={onHome}>
            Home
          </button>
          {onHistory ? (
            <button className="career-bio-home" type="button" onClick={onHistory}>
              History
            </button>
          ) : null}
        </span>
        <div className="profile-controls">
          {controls}
          {editOnName ? null : (
            <button className="focus-edit" type="button" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
        </div>
      </div>
      <div className="career-bio-row">
        {profile.avatarUrl ? (
          <img src={profile.avatarUrl} alt="" />
        ) : (
          <span className="career-bio-mark" aria-hidden="true">
            {initials || "P"}
          </span>
        )}
        <div>
          <h2>{profile.fullName || "Career"}</h2>
          {profile.headline ? <p>{profile.headline}</p> : null}
          {place ? <p className="career-bio-place">{place}</p> : null}
          {profile.bio ? <p className="career-bio-about">{profile.bio}</p> : null}
        </div>
        {editOnName ? (
          <button className="focus-edit" type="button" onClick={() => setEditing(true)}>
            Edit
          </button>
        ) : null}
      </div>
      {socials.length > 0 ? (
        <div className="socials">
          {socials.map((item) =>
            item.github ? (
              <button
                key={item.name}
                className="social-mark"
                type="button"
                onClick={() => setGithubOpen(true)}
              >
                {item.name}
              </button>
            ) : (
              <a
                key={item.name}
                className="social-mark"
                href={item.url}
                target="_blank"
                rel="noreferrer"
              >
                {item.name}
              </a>
            ),
          )}
        </div>
      ) : null}

      <dialog
        ref={githubRef}
        className="focus-pop"
        aria-label="GitHub"
        onClick={(event) => {
          if (event.target === event.currentTarget) setGithubOpen(false);
        }}
        onClose={() => setGithubOpen(false)}
      >
        <div className="sheet">
          <div className="sheet-head">
            <div>
              <h2>GitHub</h2>
              <p>{githubHandle(profile.githubUrl)}</p>
            </div>
            <button className="close" type="button" onClick={() => setGithubOpen(false)}>
              Close
            </button>
          </div>
          <a className="close" href={profile.githubUrl} target="_blank" rel="noreferrer">
            Open GitHub
          </a>
        </div>
      </dialog>

      <dialog
        ref={editorRef}
        className="focus-editor"
        aria-label="Edit profile"
        onClick={(event) => {
          if (event.target === event.currentTarget) setEditing(false);
        }}
        onClose={() => setEditing(false)}
      >
        <div className="sheet">
        <div className="sheet-head">
          <div>
            <h2>Edit profile</h2>
            <p>{profile.fullName}</p>
          </div>
          <button className="close" type="button" onClick={() => setEditing(false)}>
            Close
          </button>
        </div>
        <form className="role-form" onSubmit={(event) => void saveProfile(event)}>
          <label>
            Photo
            <input name="avatar" type="file" accept="image/*" />
          </label>
          <label>
            Name
            <input name="fullName" defaultValue={profile.fullName} />
          </label>
          <label>
            Headline
            <input name="headline" defaultValue={profile.headline} />
          </label>
          <label>
            Address
            <input name="address" defaultValue={profile.address} />
          </label>
          <div className="role-form-pair">
            <label>
              City
              <input name="city" defaultValue={profile.city} />
            </label>
            <label>
              State
              <input name="state" defaultValue={profile.state} />
            </label>
          </div>
          <label>
            Short bio
            <textarea name="bio" defaultValue={profile.bio} rows={3} />
          </label>
          <h3>Social links</h3>
          <label>
            GitHub
            <input name="githubUrl" defaultValue={profile.githubUrl} />
          </label>
          <label>
            LinkedIn
            <input name="linkedinUrl" defaultValue={profile.linkedinUrl} />
          </label>
          <label>
            Site
            <input name="portfolioUrl" defaultValue={profile.portfolioUrl} />
          </label>
          {note ? <p className="role-form-note">{note}</p> : null}
          <button type="submit">Save profile</button>
        </form>
        </div>
      </dialog>
    </section>
  );
}

function githubHandle(url: string): string {
  try {
    const parsed = new URL(url);
    const name = parsed.pathname.split("/").filter(Boolean)[0];
    return name || url;
  } catch {
    return url;
  }
}

function RoleSheet({
  role,
  tab,
}: {
  role: WorkMapRole;
  tab: DetailTab;
}) {
  const place = formatHistoryPlace({
    organization: role.organization,
    locationLabel: role.locationLabel,
    locations: role.locations.map((location) => ({
      address: location.address,
    })),
  });
  const period = formatHistoryPeriod(role.startDate, role.endDate, role.isCurrent);
  const tenure = formatTenureMonths(
    tenureMonths(role.startDate, role.endDate, role.isCurrent),
  );
  const cover = roleCoverPhoto(role.media);
  return (
    <article className="role-sheet" aria-label="Role record">
      <section className="role-focus">
        {cover ? (
          <div className="role-focus-photo">
            <img src={cover.url} alt="" />
          </div>
        ) : null}
        <div className="role-focus-body">
          <h2>{role.organization || "Untitled"}</h2>
          {role.title ? <p className="role-focus-title">{role.title}</p> : null}
          {place || period ? (
            <p className="role-focus-meta">
              {place ? <span>{place}</span> : null}
              {place && period ? <span aria-hidden="true">·</span> : null}
              {period ? <span>{period}</span> : null}
              {role.isCurrent ? <span className="role-focus-current">current</span> : null}
              {tenure ? <span className="role-focus-tenure">({tenure})</span> : null}
            </p>
          ) : null}
        </div>
      </section>
      {tab === "story" ? <StorySheet role={role} /> : null}
      {tab === "conditions" ? <ConditionsSheet role={role} /> : null}
      {tab === "media" ? <MediaSheet role={role} /> : null}
      {tab === "evidence" ? <EvidenceSheet role={role} /> : null}
    </article>
  );
}

function EvidenceSheet({ role }: { role: WorkMapRole }) {
  return (
    <>
      <h3 className="role-sheet-kicker">Linked evidence</h3>
      {role.linkedEvidence.length > 0 ? (
        <ul>
          {role.linkedEvidence.map((item) => (
            <li key={item.id}>
              <a href={item.url} target="_blank" rel="noreferrer">
                {item.title}
              </a>
              {item.outlet ? ` — ${item.outlet}` : ""}
              {item.credit === "names-me" ? " · names me" : " · about my work"}
              {item.contribution ? <p>{item.contribution}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="role-sheet-empty">No evidence linked to this role yet.</p>
      )}
    </>
  );
}

function StorySheet({ role }: { role: WorkMapRole }) {
  const story = role.description.trim();
  return (
    <>
      <h3 className="role-sheet-kicker">Story</h3>
      {story ? (
        <p className="role-sheet-body">{story}</p>
      ) : (
        <p className="role-sheet-empty">No story written for this role yet.</p>
      )}
      {role.achievements.length > 0 ? (
        <>
          <h3 className="role-sheet-kicker">Achievements</h3>
          <ul>
            {role.achievements.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}

function ConditionsSheet({ role }: { role: WorkMapRole }) {
  const details = role.details;
  const rows = [
    details.schedule.shift,
    details.schedule.workMode,
    details.schedule.hoursPerWeek
      ? `${details.schedule.hoursPerWeek} hours / week`
      : "",
    details.environment,
    details.paidTimeOff,
    details.uniform,
    details.equipment.join(", "),
    details.benefits.join(", "),
  ].filter(Boolean);

  return (
    <>
      <h3 className="role-sheet-kicker">Conditions</h3>
      {rows.length > 0 ? (
        <ul>
          {rows.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="role-sheet-empty">
          Conditions stay on this role until you write them. They remain private
          unless you approve a field for publishing.
        </p>
      )}
    </>
  );
}

function MediaSheet({ role }: { role: WorkMapRole }) {
  return (
    <>
      <h3 className="role-sheet-kicker">Media</h3>
      {role.media.length > 0 ? (
        <ul>
          {role.media.map((item) => (
            <li key={item.id}>
              {item.kind === "photo" ? <img src={item.url} alt="" /> : null}
              {item.title}
              {item.caption ? ` — ${item.caption}` : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p className="role-sheet-empty">No media attached to this role yet.</p>
      )}
    </>
  );
}

function PublicationSettings({
  placement,
  published,
  relayOrigin,
  settings,
  onChange,
  onClose,
  onPlacement,
  onSubmit,
}: {
  placement: PreviewPlacement;
  published: boolean;
  relayOrigin: string | null;
  settings: WorkMapPublicationSettings;
  onChange: (settings: WorkMapPublicationSettings) => void;
  onClose: () => void;
  onPlacement: (placement: PreviewPlacement) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [copied, setCopied] = useState(false);
  const embed = publicationEmbed({
    origin: relayOrigin,
    slug: settings.slug,
    visibility: settings.visibility,
  });
  const sections: Array<[WorkMapPublishSection, string]> = [
    ["profile", "Profile and bio"],
    ["history", "Career history"],
    ["map", "Approved locations"],
    ["milestones", "Milestones and events"],
    ["media", "Approved galleries"],
    ["evidence", "Linked evidence"],
    ["skills", "Skills"],
    ["contact", "Contact and inbound opportunities"],
  ];

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside className="publication-settings" role="dialog" aria-label="Publication settings">
      <header>
        <div>
          <h2>Publication settings</h2>
          <p>These settings shape the immutable snapshot sent to the relay.</p>
        </div>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </header>
      <label className="publication-preview-place">
        Open preview
        <select
          value={placement}
          onChange={(event) =>
            onPlacement(event.target.value as PreviewPlacement)
          }
        >
          <option value="ask">Ask each time</option>
          <option value="here">In this window</option>
          <option value="window">In a new window</option>
        </select>
      </label>
      <form onSubmit={onSubmit}>
        <div className="publication-fields">
          <label>
            Public slug
            <input
              value={settings.slug}
              onChange={(event) =>
                onChange({ ...settings, slug: event.target.value })
              }
            />
          </label>
          <label>
            Target role
            <input
              value={settings.targetRole}
              onChange={(event) =>
                onChange({ ...settings, targetRole: event.target.value })
              }
            />
          </label>
          <label>
            Visibility
            <select
              value={settings.visibility}
              onChange={(event) =>
                onChange({
                  ...settings,
                  visibility: event.target
                    .value as WorkMapPublicationSettings["visibility"],
                })
              }
            >
              <option value="public">Public</option>
              <option value="unlisted">Unlisted</option>
              <option value="access-controlled">Access controlled</option>
              <option value="stealth">Stealth — hide identity</option>
              <option value="anonymous">Anonymous — redact career detail</option>
              <option value="private">Private — keep off the relay</option>
            </select>
          </label>
        </div>
        <fieldset className="publication-sections">
          <legend>Published sections</legend>
          {sections.map(([value, label]) => (
            <label className="publication-check" key={value}>
              <input
                type="checkbox"
                checked={settings.sections.includes(value)}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    sections: event.target.checked
                      ? [...settings.sections, value]
                      : settings.sections.filter((section) => section !== value),
                  })
                }
              />
              {label}
            </label>
          ))}
        </fieldset>
        <div className="publication-options">
          <label className="publication-check">
            <input
              type="checkbox"
              checked={settings.hideCurrentEmployer}
              onChange={(event) =>
                onChange({
                  ...settings,
                  hideCurrentEmployer: event.target.checked,
                })
              }
            />
            Hide current employer in restricted modes
          </label>
          <label className="publication-check">
            <input
              type="checkbox"
              checked={settings.showExactLocations}
              onChange={(event) =>
                onChange({
                  ...settings,
                  showExactLocations: event.target.checked,
                })
              }
            />
            Publish exact coordinates and addresses
          </label>
        </div>
        <div className="publication-embed">
          <span>Frame</span>
          {embed.ok ? (
            <>
              <textarea readOnly rows={3} value={embed.code} />
              <div className="publication-embed-actions">
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(embed.code).then(
                      () => {
                        setCopied(true);
                        window.setTimeout(() => setCopied(false), 2000);
                      },
                      () => setCopied(false),
                    );
                  }}
                >
                  {copied ? "Copied" : "Copy frame"}
                </button>
                <p>
                  {published
                    ? "This frame shows the published career. A later edit stays private until you publish again."
                    : "Publish once, then this frame shows the career. A later edit stays private until you publish again."}
                </p>
              </div>
            </>
          ) : (
            <p>
              {embed.reason === "private"
                ? "A private career stays off the relay, so there is no frame to copy."
                : embed.reason === "access-controlled"
                  ? "An access-controlled career uses its own link, so there is no frame to copy."
                  : embed.reason === "slug"
                    ? "Save a public slug before copying a frame."
                    : "The frame address appears once the relay is connected."}
            </p>
          )}
        </div>
        <p className="publication-warning">
          Private notes stay out of the snapshot. Compensation, working
          conditions, unpublished locations, and unpublished media enter only
          when approved for publishing.
        </p>
        <button className="is-primary" type="submit">
          Save settings
        </button>
      </form>
    </aside>
  );
}

function currentCareerMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function asTimelineResidence(residence: Residence): CareerTimelineResidence {
  return {
    id: residence.id,
    label: residence.label,
    address: residence.address,
    startDate: residence.startDate,
    endDate: residence.endDate,
    pinned: residence.latitude != null && residence.longitude != null,
  };
}

function asTimelineRole(role: WorkMapRole): CareerTimelineRole {
  return {
    id: role.id,
    title: role.title,
    organization: role.organization,
    place: formatHistoryPlace(role),
    startDate: role.startDate,
    endDate: role.endDate,
    isCurrent: role.isCurrent,
    pinned: role.locations.some(
      (location) => Number.isFinite(location.latitude) && Number.isFinite(location.longitude),
    ),
    milestones: role.details?.milestones ?? [],
    events: role.details?.events ?? [],
  };
}

function addKindLabel(key: CareerHistorySectionKey): string {
  if (key === "school") return "Education";
  if (key === "internship") return "Internship";
  return "Job";
}

function ImportIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5v10" />
      <path d="m8 9.5 4 4 4-4" />
      <path d="M5 16.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5" />
    </svg>
  );
}

function SelectIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4.5" y="4.5" width="15" height="15" rx="2" />
      <path d="m8 12.2 2.6 2.6L16.2 9" />
    </svg>
  );
}

function roleIdentity(role: WorkMapRole): CareerHistoryIdentity {
  return {
    ...asHistoryItem(role),
    description: role.description,
    achievements: role.achievements,
  };
}

function asHistoryItem(role: WorkMapRole): CareerHistoryItem {
  return {
    id: role.id,
    kind: role.kind,
    title: role.title,
    organization: role.organization,
    locationLabel: role.locationLabel,
    startDate: role.startDate,
    endDate: role.endDate,
    isCurrent: role.isCurrent,
    locations: role.locations.map((location) => ({
      address: location.address,
      latitude: location.latitude,
      longitude: location.longitude,
    })),
  };
}

function roleOverviewFigures(role: WorkMapRole): { label: string; value: string }[] {
  const keys = role.details.overviewFields ?? DEFAULT_WORK_MAP_OVERVIEW_FIELDS;
  return keys.map((key) => ({
    label: WORK_MAP_OVERVIEW_FIELDS.find((field) => field.key === key)?.label ?? key,
    value: overviewFieldValue(role, key),
  }));
}

function overviewFieldValue(role: WorkMapRole, key: WorkMapOverviewField): string {
  switch (key) {
    case "achievements":
      return String(role.achievements.length);
    case "events":
      return String(role.details.events.length);
    case "media":
      return String(role.media.length);
    case "tools":
      return String(role.details.techStack.length);
    case "milestones":
      return String(role.details.milestones.length);
    case "skills":
      return String(role.details.skills.length);
    case "equipment":
      return String(role.details.equipment.length);
    case "colleagues":
      return String(role.details.colleagues.length);
  }
}

function HistoryOverview({
  figures,
  open,
  role,
  onSaved,
  onToggle,
}: {
  figures: { label: string; value: string }[];
  open: boolean;
  role: WorkMapRole | null;
  onSaved: () => void | Promise<void>;
  onToggle: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState<WorkMapOverviewField[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (editing && !dialog.open) dialog.showModal();
    if (!editing && dialog.open) dialog.close();
  }, [editing]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => setEditing(false);
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, []);

  function openEditor() {
    if (!role) return;
    setError("");
    setPicked([...(role.details.overviewFields ?? DEFAULT_WORK_MAP_OVERVIEW_FIELDS)]);
    setEditing(true);
  }

  function toggleField(key: WorkMapOverviewField) {
    setPicked((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }

  async function saveFields(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!role) return;
    setSaving(true);
    setError("");
    const ordered = WORK_MAP_OVERVIEW_FIELDS.map((field) => field.key).filter((key) =>
      picked.includes(key),
    );
    const response = await fetch(`/api/work-map/roles/${role.id}/details`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ overviewFields: ordered }),
    });
    setSaving(false);
    if (!response.ok) {
      setError("Could not save these overview fields.");
      return;
    }
    setEditing(false);
    await onSaved();
  }

  const columns =
    role && figures.length > 0 ? Math.min(figures.length, 4) : undefined;

  return (
    <section
      className={[
        "history-overview",
        open ? "" : "is-collapsed",
        role ? "is-role" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label="Overview"
    >
      <div className="history-overview-bar">
        <button
          className="history-overview-toggle"
          type="button"
          aria-expanded={open}
          aria-controls="history-overview-stats"
          onClick={onToggle}
        >
          <span>Overview</span>
          <i className="history-overview-chevron" aria-hidden="true" />
        </button>
        {role ? (
          <button className="focus-edit" type="button" onClick={openEditor}>
            Edit
          </button>
        ) : null}
      </div>
      {figures.length === 0 ? (
        <p className="history-overview-empty" id="history-overview-stats">
          No fields highlighted.
        </p>
      ) : (
        <div
          className="work-map-stats"
          id="history-overview-stats"
          style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
        >
          {figures.map((figure) => (
            <div key={figure.label}>
              <span>{figure.label}</span>
              <strong>{figure.value}</strong>
            </div>
          ))}
        </div>
      )}
      {role ? (
        <dialog
          ref={dialogRef}
          className="focus-pop"
          aria-label="Overview fields"
          onClick={(event: MouseEvent<HTMLDialogElement>) => {
            if (event.target === event.currentTarget) setEditing(false);
          }}
        >
          <div className="sheet">
            <div className="sheet-head">
              <div>
                <h2>Overview</h2>
                <p>{role.organization || role.title || "This role"}</p>
              </div>
              <button className="close" type="button" onClick={() => setEditing(false)}>
                Close
              </button>
            </div>
            <form className="role-form" onSubmit={(event) => void saveFields(event)}>
              <p>Choose the fields to show for this role.</p>
              {WORK_MAP_OVERVIEW_FIELDS.map((field) => (
                <label className="role-check" key={field.key}>
                  <input
                    type="checkbox"
                    checked={picked.includes(field.key)}
                    onChange={() => toggleField(field.key)}
                  />
                  <span>
                    {field.label}
                    <em> · {overviewFieldValue(role, field.key)}</em>
                  </span>
                </label>
              ))}
              {error ? <p>{error}</p> : null}
              <button disabled={saving} type="submit">
                {saving ? "Saving…" : "Save overview"}
              </button>
            </form>
          </div>
        </dialog>
      ) : null}
    </section>
  );
}

function HistoryRow({
  item,
  identical,
  selecting,
  checked,
  onToggle,
  onOpen,
}: {
  item: CareerHistoryItem;
  identical: boolean;
  selecting: boolean;
  checked: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const name = item.organization || item.title || "Untitled";
  const row = (
    <button className="career-history-row" onClick={onOpen} type="button">
      <span>
        <strong>
          {name}
          {item.isCurrent ? <mark>Current</mark> : null}
          {identical ? <mark className="is-identical">Identical</mark> : null}
        </strong>
        {item.organization && item.title ? <b>{item.title}</b> : null}
        {formatHistoryGist(item) ? <small>{formatHistoryGist(item)}</small> : null}
      </span>
    </button>
  );
  if (!selecting) return row;
  return (
    <div className="history-entry">
      <label className="history-check">
        <input
          type="checkbox"
          checked={checked}
          aria-label={`Select ${name}`}
          onChange={onToggle}
        />
      </label>
      {row}
    </div>
  );
}

function HomesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 11.2 12 4l8 7.2V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
      <circle cx="9" cy="7" r="1.7" />
      <circle cx="15" cy="12" r="1.7" />
      <circle cx="11" cy="17" r="1.7" />
    </svg>
  );
}


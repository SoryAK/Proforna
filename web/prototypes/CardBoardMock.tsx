// Throwaway. Four cards on one board.
// #/prototype/card-board
// Bio sits top left. The map sits top right, and its menu also opens live updates.
// Career history sits bottom left.
// Media and events sit bottom right, in the smaller card.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type SVGProps } from "react";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { ButtonGroup } from "@astryxdesign/core/ButtonGroup";
import { CommandPalette } from "@astryxdesign/core/CommandPalette";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { Icon, type IconType } from "@astryxdesign/core/Icon";
import { ScrollableArea } from "@astryxdesign/core/ScrollableArea";
import { Thumbnail } from "@astryxdesign/core/Thumbnail";
import { Heading } from "@astryxdesign/core/Text";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import {
  ChatComposer,
  ChatComposerDrawer,
  ChatComposerInput,
  ChatLayout,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
  type ChatComposerInputHandle,
} from "@astryxdesign/core/Chat";
import type { SearchableItem, SearchSource } from "@astryxdesign/core/Typeahead";
import {
  ArrowLeft,
  AtSign,
  Bell,
  ChevronDown,
  Folder,
  Frame,
  History,
  House,
  Library,
  List,
  Map as MapIcon,
  MapPin,
  Paperclip,
  Plus,
  Plug,
  Puzzle,
  SquareCheck,
  Users,
} from "lucide-react";
import {
  flagIdenticalRoles,
  formatHistoryGist,
  formatHistoryPeriod,
  formatHistoryPlace,
  formatTenureMonths,
  tenureMonths,
} from "@core/career-history";
import type { MapSettings } from "@core/map-settings";
import { prepareProfile } from "@core/profile";
import type { CanvasBoard } from "@core/canvas-board";
import { roleCoverPhoto, type WorkMapRole } from "@core/work-map";
import { CareerMap } from "../src/CareerMap";
import { RoleCanvasEntry } from "../src/RoleCanvas";
import type { MapFitMode } from "../src/map-camera";
import "./card-board-mock.css";

type Profile = {
  fullName: string;
  headline: string;
  address: string;
  city: string;
  state: string;
  bio: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  avatarUrl: string | null;
};

type HistoryFile = {
  profile: Profile;
  roles: WorkMapRole[];
  studyBoards?: CanvasBoard[];
};

type Sheet = "people" | "more" | "media" | "canvas" | "edit" | null;

const EMPTY_PROFILE: Profile = {
  fullName: "Sory Kaba",
  headline: "",
  address: "",
  city: "",
  state: "",
  bio: "",
  linkedinUrl: "",
  githubUrl: "",
  portfolioUrl: "",
  avatarUrl: null,
};

const BOARD_PLACES = [
  { id: "profile", label: "Profile", detail: "Name and links" },
  { id: "history", label: "Career history", detail: "Roles on this board" },
  { id: "map", label: "Map", detail: "Places for the roles" },
  { id: "updates", label: "Live updates", detail: "Notes from current roles" },
  { id: "media", label: "Media and events", detail: "Photos and events" },
  { id: "proforna", label: "Proforna", detail: "The right panel" },
] as const;

type PaletteHit = SearchableItem<{
  group: string;
  detail: string;
  haystack: string;
}>;

function buildPalette(roles: WorkMapRole[]): SearchSource<PaletteHit> {
  const places: PaletteHit[] = BOARD_PLACES.map((item) => ({
    id: `place:${item.id}`,
    label: item.label,
    auxiliaryData: {
      group: "Places",
      detail: item.detail,
      haystack: `${item.label} ${item.detail}`,
    },
  }));
  const roleHits: PaletteHit[] = roles.map((role) => {
    const label = role.organization || role.title || "Untitled";
    const detail = [role.title, formatHistoryPlace(role)].filter(Boolean).join(" · ");
    return {
      id: `role:${role.id}`,
      label,
      auxiliaryData: {
        group: "Roles",
        detail,
        haystack: `${label} ${detail} ${role.details.summary}`,
      },
    };
  });
  const updateHits: PaletteHit[] = liveUpdates(roles).map((item) => ({
    id: `update:${item.id}`,
    label: item.organization,
    auxiliaryData: {
      group: "Live updates",
      detail: `${item.kind} · ${item.text}`,
      haystack: `${item.organization} ${item.kind} ${item.text}`,
    },
  }));
  const all = [...places, ...roleHits, ...updateHits];
  return {
    bootstrap: () => places,
    search: (query) => {
      const needle = query.trim().toLowerCase();
      if (!needle) return places;
      return all.filter((item) => (item.auxiliaryData?.haystack ?? item.label).toLowerCase().includes(needle));
    },
  };
}

const CHAT_SESSIONS = [
  { id: "board", label: "This board" },
  { id: "history", label: "Career history" },
  { id: "map", label: "Map notes" },
] as const;

type RoleContext = {
  id: string;
  organization: string;
  title: string;
  kind: WorkMapRole["kind"];
  locationLabel: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
};

type SessionNote = {
  sender: "user" | "assistant";
  text: string;
  roles: RoleContext[];
};

function roleContext(role: WorkMapRole): RoleContext {
  return {
    id: role.id,
    organization: role.organization,
    title: role.title,
    kind: role.kind,
    locationLabel: role.locationLabel,
    startDate: role.startDate,
    endDate: role.endDate,
    isCurrent: role.isCurrent,
  };
}

function roleContextLabel(role: Pick<RoleContext, "organization" | "title" | "startDate" | "endDate" | "isCurrent">): string {
  const name = role.organization || role.title || "Untitled";
  const title = role.organization && role.title ? role.title : "";
  const period = formatHistoryPeriod(role.startDate, role.endDate, role.isCurrent);
  return [name, title, period].filter(Boolean).join(", ");
}

function contextLine(attached: RoleContext[]): string {
  const names = attached.map((role) => role.organization || role.title || "Untitled");
  const lead = names.slice(0, 3).join(", ");
  const rest = names.length > 3 ? ` and ${names.length - 3} more` : "";
  return attached.length === 1 ? `About 1 role: ${lead}` : `About ${attached.length} roles: ${lead}${rest}`;
}

function assistantReply(attached: RoleContext[]): string {
  if (attached.length === 0) {
    return "No roles are attached. Select roles on the career history, then ask again.";
  }
  const lines = attached.slice(0, 3).map((role) => roleContextLabel(role));
  const more = attached.length > 3 ? `, and ${attached.length - 3} more` : "";
  return `On the ledger for this question: ${lines.join("; ")}${more}.`;
}

const PANEL_BEFORE = [
  { id: "home", label: "Home", icon: "home" },
] as const;

const PANEL_AFTER = [
  { id: "opportunities", label: "Opportunities", icon: "search" },
  { id: "studio", label: "Resume Studio", icon: "library" },
  { id: "documents", label: "My Docs", icon: "folder" },
  { id: "network", label: "My Network", icon: "organization" },
] as const;

const CUSTOMIZATIONS = [
  { id: "overview", label: "Overview", icon: "home" },
  { id: "canvas", label: "Canvas", icon: "canvas" },
  { id: "plugins", label: "Plugins", icon: "plug" },
  { id: "extensions", label: "Extensions", icon: "extensions" },
  { id: "tools", label: "Tools", icon: "tools" },
] as const;

function panelGlyph(side: "left" | "right", open: boolean): IconType {
  const edge = side === "left" ? "M9.5 4v16" : "M14.5 4v16";
  const fill = side === "left" ? "M4.2 5.2H9.5v13.6H4.2z" : "M14.5 5.2h5.3v13.6H14.5z";
  function Glyph(props: SVGProps<SVGSVGElement>) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...props} fill="none">
        <rect x="3" y="4" width="18" height="16" rx="1.5" />
        <path d={edge} />
        {open ? <path className="cbm-panel-fill" d={fill} /> : null}
      </svg>
    );
  }
  return Glyph;
}

const PANEL_GLYPH = {
  leftOpen: panelGlyph("left", true),
  leftClosed: panelGlyph("left", false),
  rightOpen: panelGlyph("right", true),
  rightClosed: panelGlyph("right", false),
} as const;

function PanelIcon({ side, open }: { side: "left" | "right"; open: boolean }) {
  const icon =
    side === "left"
      ? open
        ? PANEL_GLYPH.leftOpen
        : PANEL_GLYPH.leftClosed
      : open
        ? PANEL_GLYPH.rightOpen
        : PANEL_GLYPH.rightClosed;
  return <Icon icon={icon} size="sm" />;
}

const NAV_ICONS = {
  home: House,
  history: History,
  search: "search",
  library: Library,
  folder: Folder,
  organization: Users,
  plug: Plug,
  extensions: Puzzle,
  tools: "wrench",
  canvas: Frame,
} as const;

function CustomIcon({ kind }: { kind: keyof typeof NAV_ICONS }) {
  return <Icon className="cbm-mark-icon" icon={NAV_ICONS[kind]} size="sm" />;
}

export function CardBoardMock() {
  const [file, setFile] = useState<HistoryFile | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyFindOpen, setHistoryFindOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [removeAsk, setRemoveAsk] = useState<{ ids: string[]; detail: string } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [message, setMessage] = useState("");
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const [mapSettings, setMapSettings] = useState<MapSettings | null>(null);
  const [updateId, setUpdateId] = useState<string | null>(null);
  const [notices, setNotices] = useState<Array<{ id: string; title: string; detail: string }>>([]);
  const [topMenu, setTopMenu] = useState<"notices" | "profile" | "publish" | "preview" | null>(null);
  const [bioDialog, setBioDialog] = useState<"know" | "contact" | "place" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState({ linkedinUrl: "", githubUrl: "", portfolioUrl: "" });
  const [settingsError, setSettingsError] = useState("");
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [noteName, setNoteName] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteKept, setNoteKept] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [panel, setPanel] = useState<"menu" | "history">("menu");
  const [customizationsOpen, setCustomizationsOpen] = useState(true);
  const [navId, setNavId] = useState("");
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [bioMode, setBioMode] = useState<"browse" | "preview" | "share">("browse");
  const [rightOpen, setRightOpen] = useState(false);
  const [sessionId, setSessionId] = useState<(typeof CHAT_SESSIONS)[number]["id"]>("board");
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [sessionNotes, setSessionNotes] = useState<Record<string, SessionNote[]>>({});
  const [composerMode, setComposerMode] = useState<"ask" | "edit">("ask");
  const [pendingComposerFocus, setPendingComposerFocus] = useState(false);
  const topBar = useRef<HTMLElement>(null);
  const composerRef = useRef<ChatComposerInputHandle>(null);
  const lastComposerPost = useRef<{ signature: string; at: number } | null>(null);
  const brandWrap = useRef<HTMLDivElement>(null);
  const topEnd = useRef<HTMLDivElement>(null);
  const sessionsRef = useRef<HTMLDivElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  async function load() {
    const response = await fetch("/api/work-map");
    if (!response.ok) return;
    const body = (await response.json()) as HistoryFile;
    setFile({ ...body, roles: body.roles });
  }

  useEffect(() => {
    if (!file) return;
    const live = new Set(file.roles.map((role) => role.id));
    setCheckedIds((current) => {
      const next = new Set([...current].filter((id) => live.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [file]);

  useEffect(() => {
    if (!pendingComposerFocus || !rightOpen) return;
    composerRef.current?.focus();
    setPendingComposerFocus(false);
  }, [pendingComposerFocus, rightOpen]);

  useEffect(() => {
    void load().finally(() => setReady(true));
    void fetch("/api/maps")
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { settings?: MapSettings };
        if (body.settings) setMapSettings(body.settings);
      })
      .catch(() => setMapSettings(null));
    void fetch("/api/notices")
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { notices?: Array<{ id: string; title: string; detail: string }> };
        if (Array.isArray(body.notices)) setNotices(body.notices);
      })
      .catch(() => setNotices([]));
  }, []);

  useLayoutEffect(() => {
    const header = topBar.current;
    const brand = brandWrap.current;
    const end = topEnd.current;
    if (!header || !brand || !end) return;
    const fit = () => {
      const side = Math.max(brand.offsetWidth, end.offsetWidth);
      const room = header.clientWidth - side * 2 - 24;
      header.style.setProperty("--cbm-search-max", `${Math.max(room, 0)}px`);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(header);
    observer.observe(brand);
    observer.observe(end);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!topMenu) return;
    function onPointer(event: MouseEvent) {
      if (topEnd.current && !topEnd.current.contains(event.target as Node)) setTopMenu(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setTopMenu(null);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [topMenu]);

  useEffect(() => {
    if (!sortMenuOpen) return;
    function onPointer(event: MouseEvent) {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) setSortMenuOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSortMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [sortMenuOpen]);

  useEffect(() => {
    if (!sessionsOpen) return;
    function onPointer(event: MouseEvent) {
      if (sessionsRef.current && !sessionsRef.current.contains(event.target as Node)) setSessionsOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSessionsOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [sessionsOpen]);

  useEffect(() => {
    if (!bioDialog) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setBioDialog(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [bioDialog]);

  useEffect(() => {
    if (!settingsOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSettingsOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [settingsOpen]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || event.shiftKey || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      setSearchOpen((open) => !open);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const profile = file?.profile ?? EMPTY_PROFILE;
  const roles = useMemo(
    () =>
      [...(file?.roles ?? [])].sort((a, b) =>
        sort === "newest" ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate),
      ),
    [file?.roles, sort],
  );
  const needle = historyQuery.trim().toLowerCase();
  const palette = useMemo(() => buildPalette(roles), [roles]);
  const shown = roles.filter((role) => {
    if (!needle) return true;
    return `${role.organization} ${role.title} ${formatHistoryPlace(role)}`.toLowerCase().includes(needle);
  });
  const shownIds = shown.map((role) => role.id);
  const checkedRoles = useMemo(
    () => roles.filter((role) => checkedIds.has(role.id)),
    [roles, checkedIds],
  );
  const identicalExtraIds = useMemo(
    () =>
      [...flagIdenticalRoles(roles).entries()]
        .filter(([, flag]) => flag.count > 1 && !flag.keeper)
        .map(([id]) => id),
    [roles],
  );
  const focus = roles.find((role) => role.id === focusId) ?? null;
  const canvasRole = focus ?? roles[0] ?? null;
  const mediaRoles = focus ? [focus] : roles;
  const covers = mediaRoles.flatMap((role) => {
    const photo = roleCoverPhoto(role.media);
    return photo ? [{ ...photo, organization: role.organization || role.title }] : [];
  });
  const events = mediaRoles.flatMap((role) =>
    role.details.events.map((event) => ({ ...event, organization: role.organization })),
  );
  const place = [profile.city, profile.state].filter(Boolean).join(", ");
  const accountRole = profile.headline.trim();
  const updates = liveUpdates(focus ? [focus] : roles.filter((role) => role.isCurrent));
  const openUpdate = updates.find((item) => item.id === updateId) ?? null;
  const placed = roles.filter((role) => roleHasPlace(role));
  const mapFit: MapFitMode = focus && roleHasPlace(focus) ? "pin" : focus ? "hold" : "visible";

  function chooseRole(id: string | null) {
    setFocusId(id);
    setSheet(null);
    setMessage("");
    if (id) {
      setPanel("history");
      setNavId("history");
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

  function askAboutSelection() {
    if (checkedIds.size === 0) return;
    setRightOpen(true);
    setPendingComposerFocus(true);
  }

  function postComposerMessage(value: string) {
    const text = value.trim();
    if (!text) return;
    const attached = checkedRoles.map(roleContext);
    const signature = `${sessionId}|${composerMode}|${text}|${attached.map((role) => role.id).join(",")}`;
    const now = Date.now();
    const previous = lastComposerPost.current;
    if (previous && previous.signature === signature && now - previous.at < 500) return;
    lastComposerPost.current = { signature, at: now };
    const next: SessionNote[] = [{ sender: "user", text, roles: attached }];
    if (composerMode === "ask") {
      next.push({ sender: "assistant", text: assistantReply(attached), roles: [] });
    }
    setSessionNotes((notes) => ({
      ...notes,
      [sessionId]: [...(notes[sessionId] ?? []), ...next],
    }));
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

  async function removeChecked(ids: string[]) {
    setRemoving(true);
    setMessage("");
    const failed: string[] = [];
    for (const id of ids) {
      const response = await fetch(`/api/work-map/roles/${id}`, { method: "DELETE" });
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
    if (focusId && ids.includes(focusId) && !failed.includes(focusId)) setFocusId(null);
    setMessage(
      failed.length === 0
        ? ids.length === 1
          ? "Role removed."
          : `${ids.length} roles removed.`
        : failed.length === ids.length
          ? "Could not remove those roles."
          : `Removed ${ids.length - failed.length}. ${failed.length} could not be removed.`,
    );
    await load();
  }

  function showMap() {
    setUpdatesOpen(false);
    setUpdateId(null);
  }

  function chooseStage(updates: boolean) {
    setUpdatesOpen(updates);
    setUpdateId(null);
  }

  function closeCanvas() {
    setCanvasOpen(false);
    setNavId((current) => (current === "canvas" ? "" : current));
  }

  function closeSearch() {
    setSearchOpen(false);
  }

  function pickPalette(value: string) {
    const split = value.indexOf(":");
    const kind = split === -1 ? "" : value.slice(0, split);
    const target = split === -1 ? value : value.slice(split + 1);
    if (kind === "place" && BOARD_PLACES.some((item) => item.id === target)) {
      pickPlace(target as (typeof BOARD_PLACES)[number]["id"]);
      return;
    }
    if (kind === "role") pickRole(target);
    if (kind === "update") pickUpdate(target);
  }

  async function saveLinks() {
    const prepared = prepareProfile({
      fullName: profile.fullName,
      headline: profile.headline,
      address: profile.address,
      city: profile.city,
      state: profile.state,
      bio: profile.bio,
      linkedinUrl: linkDraft.linkedinUrl,
      githubUrl: linkDraft.githubUrl,
      portfolioUrl: linkDraft.portfolioUrl,
    });
    if (!prepared.ok) {
      setSettingsError(
        prepared.error === "url-invalid"
          ? "Use an http(s) URL for LinkedIn, GitHub, or Site."
          : "A name is required.",
      );
      return;
    }
    setSettingsBusy(true);
    setSettingsError("");
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(prepared.value),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setSettingsError(body.error ?? "Could not save those links.");
        return;
      }
      setFile((current) =>
        current
          ? { ...current, profile: { ...current.profile, ...prepared.value } }
          : current,
      );
      setSettingsOpen(false);
    } catch {
      setSettingsError("Could not save those links.");
    } finally {
      setSettingsBusy(false);
    }
  }

  function pickPlace(id: (typeof BOARD_PLACES)[number]["id"]) {
    closeSearch();
    if (id === "profile" || id === "history") setLeftOpen(true);
    if (id === "history") {
      chooseRole(null);
      setPanel("history");
      setNavId("history");
    }
    if (id === "map") showMap();
    if (id === "updates") chooseStage(true);
    if (id === "proforna") setRightOpen(true);
  }

  function pickRole(id: string) {
    closeSearch();
    setLeftOpen(true);
    chooseRole(id);
  }

  function pickUpdate(id: string) {
    closeSearch();
    setUpdatesOpen(true);
    setUpdateId(id);
  }

  return (
    <div className="cbm">
      <p className="cbm-banner">Prototype. Career history keeps its own actions.</p>
      <div className="cbm-board">
      <div className={["cbm-sheet", leftOpen ? "" : "is-left-closed", rightOpen ? "is-right-open" : "", bioMode === "browse" ? "is-bio-hidden" : ""].filter(Boolean).join(" ")}>
      <header className="cbm-top" ref={topBar}>
        <div className="cbm-brand-wrap" ref={brandWrap}>
          <button
            type="button"
            className="cbm-panel-btn"
            aria-pressed={leftOpen}
            aria-label={leftOpen ? "Hide the left panel" : "Show the left panel"}
            onClick={() => setLeftOpen((open) => !open)}
          >
            <PanelIcon side="left" open={leftOpen} />
          </button>
          <p className="cbm-brand">Proforna</p>
        </div>
        <button type="button" className="cbm-top-search" aria-label="Search" onClick={() => setSearchOpen(true)}>
          <span>Type to search</span>
          <Icon icon="search" size="sm" />
        </button>
        <div className="cbm-top-end" ref={topEnd}>
          <div className="cbm-pub">
            <ButtonGroup label="Publication" size="sm">
              <Button
                label="Publish"
                variant="primary"
                size="sm"
                aria-expanded={topMenu === "publish"}
                aria-haspopup="menu"
                onClick={() => setTopMenu((current) => (current === "publish" ? null : "publish"))}
              />
              {bioMode === "preview" ? (
                <Button
                  label="Exit preview"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setBioMode("browse");
                    setTopMenu(null);
                  }}
                />
              ) : (
              <Button
                label="Preview"
                variant="secondary"
                size="sm"
                aria-expanded={topMenu === "preview"}
                aria-pressed={bioMode !== "browse"}
                aria-haspopup="menu"
                onClick={() => setTopMenu((current) => (current === "preview" ? null : "preview"))}
              />
              )}
            </ButtonGroup>
              {topMenu === "publish" ? (
                <div className="cbm-top-menu cbm-pub-menu is-publish" role="menu" aria-label="Publish">
                  <button type="button" role="menuitem" onClick={() => setTopMenu(null)}>
                    Confirm publish
                  </button>
                  <button type="button" role="menuitem" onClick={() => setTopMenu(null)}>
                    Cancel
                  </button>
                </div>
              ) : null}
              {topMenu === "preview" && bioMode !== "preview" ? (
                <div className="cbm-top-menu cbm-pub-menu" role="menu" aria-label="Preview and share">
                  <button
                    type="button"
                    role="menuitem"
                    aria-checked={bioMode === "preview"}
                    onClick={() => {
                      setBioMode("preview");
                      setTopMenu(null);
                    }}
                  >
                    This window
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    aria-checked={bioMode === "share"}
                    onClick={() => {
                      setBioMode("share");
                      setTopMenu(null);
                    }}
                  >
                    Edit for sharing
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    aria-checked={bioMode === "browse"}
                    onClick={() => {
                      setBioMode("browse");
                      setTopMenu(null);
                    }}
                  >
                    Browsing
                  </button>
                </div>
              ) : null}
          </div>
          <div className="cbm-notice">
            <button
              type="button"
              className="cbm-notice-btn"
              aria-label={notices.length ? `Notices, ${notices.length} waiting` : "Notices"}
              aria-expanded={topMenu === "notices"}
              aria-haspopup="menu"
              onClick={() => setTopMenu((current) => (current === "notices" ? null : "notices"))}
            >
              <Icon icon={Bell} size="sm" />
              {notices.length > 0 ? <span>{notices.length > 9 ? "9+" : notices.length}</span> : null}
            </button>
            {topMenu === "notices" ? (
              <div className="cbm-top-menu" role="menu" aria-label="Notices">
                <p>Notices</p>
                {notices.length > 0 ? (
                  notices.map((notice) => (
                    <button key={notice.id} type="button" role="menuitem" onClick={() => setTopMenu(null)}>
                      <strong>{notice.title}</strong>
                      <span>{notice.detail}</span>
                    </button>
                  ))
                ) : (
                  <span className="cbm-top-empty">Nothing needs attention.</span>
                )}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="cbm-panel-btn"
            aria-pressed={rightOpen}
            aria-label={rightOpen ? "Hide the right panel" : "Show the right panel"}
            onClick={() => setRightOpen((open) => !open)}
          >
            <PanelIcon side="right" open={rightOpen} />
          </button>
          <div className="cbm-account">
            <button
              type="button"
              className="cbm-account-btn"
              aria-label={accountRole ? `${profile.fullName}, ${accountRole}` : profile.fullName || "Profile"}
              aria-expanded={topMenu === "profile"}
              aria-haspopup="menu"
              onClick={() => setTopMenu((current) => (current === "profile" ? null : "profile"))}
            >
              <Avatar
                name={profile.fullName || "Career"}
                src={profile.avatarUrl ?? undefined}
                size={32}
                tooltip={false}
              />
              <span className="cbm-account-copy">
                <strong>{profile.fullName || "Career"}</strong>
                {accountRole ? <small>{accountRole}</small> : null}
              </span>
              <Icon className="cbm-account-caret" icon={ChevronDown} size="xsm" />
            </button>
            {topMenu === "profile" ? (
              <div className="cbm-top-menu" role="menu" aria-label="Profile">
                <p>{profile.fullName || "Career"}</p>
                {profile.headline ? <span className="cbm-top-empty">{profile.headline}</span> : null}
                <button type="button" role="menuitem" onClick={() => setTopMenu(null)}>
                  Profile
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setTopMenu(null);
                    setLinkDraft({
                      linkedinUrl: profile.linkedinUrl,
                      githubUrl: profile.githubUrl,
                      portfolioUrl: profile.portfolioUrl,
                    });
                    setSettingsError("");
                    setSettingsOpen(true);
                  }}
                >
                  Settings
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>
        {bioMode === "browse" ? null : (
        <section className="cbm-card cbm-bio" aria-label="Profile">
          <div className="cbm-bio-row">
            <Avatar
              name={profile.fullName || "Career"}
              src={profile.avatarUrl ?? undefined}
              size={48}
              tooltip={false}
            />
            <div className="cbm-bio-id">
              <h2>{profile.fullName || "Career"}</h2>
              {accountRole ? <p>{accountRole}</p> : null}
            </div>
            <div className="cbm-socials">
              <button type="button" aria-label="Request location" onClick={() => setBioDialog("place")}>
                <Icon className="cbm-pin" icon={MapPin} size="sm" />
              </button>
              {socialLinks(profile).map((item) =>
                item.url ? (
                  <a key={item.name} href={item.url} target="_blank" rel="noreferrer" aria-label={item.name}>
                    <SocialMark kind={item.kind} />
                  </a>
                ) : (
                  <span key={item.name} aria-label={`${item.name}, not added`} title={item.name}>
                    <SocialMark kind={item.kind} />
                  </span>
                ),
              )}
            </div>
          </div>
          <div className="cbm-bio-actions">
            <Button label="Contact" variant="secondary" size="sm" onClick={() => { setNoteKept(false); setBioDialog("contact"); }} />
            <Button label="Get to know me" variant="secondary" size="sm" onClick={() => setBioDialog("know")} />
          </div>
        </section>
        )}

        <section className="cbm-card cbm-live" aria-label={updatesOpen ? "Live update" : "Map"}>
          <div className="cbm-stage-bar" role="tablist" aria-label="Card views">
            <button type="button" role="tab" aria-selected={!updatesOpen} onClick={() => chooseStage(false)}>
              <Icon icon={MapIcon} size="sm" />
              Map
            </button>
            <button type="button" role="tab" aria-selected={updatesOpen} onClick={() => chooseStage(true)}>
              <Icon icon={List} size="sm" />
              Live updates
              {updates.length > 0 ? <span className="cbm-count">{updates.length}</span> : null}
            </button>
          </div>
          <div className="cbm-stage">
            {updatesOpen ? (
              updates.length > 0 ? (
                <ScrollableArea className={openUpdate ? "cbm-updates is-reading" : "cbm-updates"} label="Live updates">
                  {openUpdate ? (
                    <article>
                      <button type="button" onClick={() => setUpdateId(null)}>
                        Updates
                      </button>
                      <b>
                        {openUpdate.organization}
                        {openUpdate.kind ? (
                          <>
                            <span aria-hidden="true"> · </span>
                            {openUpdate.kind === "Achievement" ? <mark>{openUpdate.kind}</mark> : openUpdate.kind}
                          </>
                        ) : null}
                      </b>
                      {openUpdate.frame ? <time>{openUpdate.frame}</time> : null}
                      <p>{openUpdate.text}</p>
                    </article>
                  ) : (
                    <ul>
                      {updateGroups(updates).map((group) => (
                        <li className="cbm-update-group" key={group.key}>
                          <span>
                            <b>{group.organization}</b>
                            {group.stamp ? <time>{group.stamp}</time> : null}
                          </span>
                          <ul>
                            {group.items.map((item) => (
                              <li key={item.id}>
                                <button className="cbm-line" type="button" onClick={() => setUpdateId(item.id)}>
                                  {item.kind ? (
                                    <b>{item.kind === "Achievement" ? <mark>{item.kind}</mark> : item.kind}</b>
                                  ) : null}
                                  <p>{item.text}</p>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  )}
                </ScrollableArea>
              ) : (
                <p className="cbm-empty">
                  {focus ? "Nothing recorded for this role yet." : "Nothing new from the jobs you're in."}
                </p>
              )
            ) : (
              <div className="cbm-map">
                <CareerMap
                  emptyNote={
                    placed.length === 0
                      ? { title: "No places yet.", detail: "Roles with a workplace show up here." }
                      : null
                  }
                  fitKey={`${focusId ?? "all"}:${mapFit}`}
                  fitMode={mapFit}
                  onSelect={(id) => chooseRole(id)}
                  roles={roles}
                  selectedId={focusId}
                  settings={mapSettings}
                  viewKey="card-board"
                />
              </div>
            )}
          </div>
        </section>

        <section className="cbm-card cbm-history" aria-label="Main">
          <nav className="cbm-nav">
            <div className="cbm-nav-main">
            {panel === "history" ? (
              focus ? (
              <ScrollableArea className="cbm-history-view is-role" label="Role">
                    <div className="cbm-history-bar">
                      <Button label="History" variant="secondary" size="sm" className="cbm-back" onClick={() => chooseRole(null)} />
                    </div>
                    <RoleCard
                      role={focus}
                      message={message}
                      onOpen={setSheet}
                      onReload={load}
                      onMessage={setMessage}
                    />
              </ScrollableArea>
              ) : (
              <div className="cbm-history-view">
                    <Toolbar
                      className="cbm-history-toolbar"
                      label="Career history"
                      size="sm"
                      dividers={["bottom"]}
                      startContent={
                        <>
                          <button className="cbm-back-arrow" type="button" aria-label="Back" onClick={() => { stopSelecting(); setPanel("menu"); }}>
                            <Icon icon={ArrowLeft} size="sm" />
                          </button>
                          <Heading level={4}>Career history</Heading>
                        </>
                      }
                      endContent={
                        <>
                          <div className="cbm-sort" ref={sortMenuRef}>
                            <button
                              className="cbm-tool-btn"
                              type="button"
                              aria-label="Sort"
                              aria-haspopup="menu"
                              aria-expanded={sortMenuOpen}
                              onClick={() => setSortMenuOpen((open) => !open)}
                            >
                              <Icon className="cbm-mark-icon" icon="funnel" size="sm" />
                            </button>
                            {sortMenuOpen ? (
                              <div className="cbm-sort-menu" role="menu" aria-label="Sort">
                                <button
                                  type="button"
                                  role="menuitemradio"
                                  aria-checked={sort === "newest"}
                                  onClick={() => {
                                    setSort("newest");
                                    setSortMenuOpen(false);
                                  }}
                                >
                                  Newest
                                </button>
                                <button
                                  type="button"
                                  role="menuitemradio"
                                  aria-checked={sort === "oldest"}
                                  onClick={() => {
                                    setSort("oldest");
                                    setSortMenuOpen(false);
                                  }}
                                >
                                  Oldest
                                </button>
                              </div>
                            ) : null}
                          </div>
                          <button
                            className="cbm-tool-btn"
                            type="button"
                            aria-label="Search career history"
                            aria-pressed={historyFindOpen}
                            onClick={() => {
                              setSortMenuOpen(false);
                              setHistoryFindOpen((open) => {
                                if (open) setHistoryQuery("");
                                return !open;
                              });
                            }}
                          >
                            <CustomIcon kind="search" />
                          </button>
                          <button
                            className="cbm-tool-btn"
                            type="button"
                            aria-label={selecting ? "Done selecting" : "Select"}
                            aria-pressed={selecting}
                            onClick={() => {
                              setSortMenuOpen(false);
                              if (selecting) stopSelecting();
                              else setSelecting(true);
                            }}
                          >
                            <Icon icon={SquareCheck} size="sm" />
                          </button>
                          <Button label="New" icon={<Icon icon={Plus} />} isIconOnly aria-keyshortcuts="Control+N" />
                        </>
                      }
                    />
                    {selecting ? (
                      <Toolbar
                        className="cbm-bulk-toolbar"
                        label="Career history actions"
                        size="sm"
                        variant="muted"
                        dividers={["bottom"]}
                        startContent={
                          removeAsk ? (
                            <>
                              <span className="cbm-bulk-note">{removeAsk.detail}</span>
                              <Button
                                label="Remove"
                                variant="destructive"
                                size="sm"
                                isLoading={removing}
                                onClick={() => void removeChecked(removeAsk.ids)}
                              />
                              <Button label="Keep" variant="ghost" size="sm" isDisabled={removing} onClick={() => setRemoveAsk(null)} />
                            </>
                          ) : (
                            <>
                              <Badge label={checkedIds.size === 0 ? "Select roles" : `${checkedIds.size} selected`} />
                              <Button
                                label={shownIds.length > 0 && shownIds.every((id) => checkedIds.has(id)) ? "Clear shown" : "Select shown"}
                                variant="ghost"
                                size="sm"
                                isDisabled={shownIds.length === 0}
                                onClick={() => selectShown(shownIds)}
                              />
                              {identicalExtraIds.length > 0 ? (
                                <Button label="Select identical" variant="ghost" size="sm" onClick={() => selectShown(identicalExtraIds)} />
                              ) : null}
                              <Button
                                label="Ask"
                                variant="ghost"
                                size="sm"
                                isDisabled={checkedIds.size === 0}
                                onClick={askAboutSelection}
                              />
                              <Button
                                label="Edit"
                                variant="ghost"
                                size="sm"
                                isDisabled={checkedIds.size !== 1}
                                onClick={() => {
                                  const id = [...checkedIds][0];
                                  if (id) chooseRole(id);
                                }}
                              />
                              <Button
                                label="Remove"
                                variant="destructive"
                                size="sm"
                                isDisabled={checkedIds.size === 0}
                                onClick={() => {
                                  if (checkedIds.size === 0) return;
                                  setRemoveAsk({
                                    ids: [...checkedIds],
                                    detail:
                                      checkedIds.size === 1
                                        ? "Remove this role? Its sites and photos on this machine go with it."
                                        : `Remove ${checkedIds.size} roles? Their sites and photos on this machine go with them.`,
                                  });
                                }}
                              />
                            </>
                          )
                        }
                      />
                    ) : null}
                    {historyFindOpen ? (
                      <div className="cbm-history-find">
                        <input
                          type="search"
                          value={historyQuery}
                          placeholder="Search"
                          aria-label="Search career history"
                          autoFocus
                          onChange={(event) => setHistoryQuery(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              setHistoryQuery("");
                              setHistoryFindOpen(false);
                            }
                          }}
                        />
                      </div>
                    ) : null}
                    <ScrollableArea className="cbm-groups cbm-roles-frame" label="Roles">
                      {groups(shown).map((group) => (
                        <section key={group.label}>
                          <h3>
                            {group.label} ({group.roles.length})
                          </h3>
                          <ul>
                            {group.roles.map((role) => (
                              <li key={role.id}>
                                {selecting ? (
                                  <div className="cbm-role-entry">
                                    <label className="cbm-role-check">
                                      <input
                                        type="checkbox"
                                        checked={checkedIds.has(role.id)}
                                        aria-label={`Select ${role.organization || role.title || "Untitled"}`}
                                        onChange={() => toggleChecked(role.id)}
                                      />
                                    </label>
                                    <button type="button" onClick={() => chooseRole(role.id)}>
                                      <span>
                                        <strong>
                                          {role.organization || role.title || "Untitled"}
                                          {role.isCurrent ? <mark>Current</mark> : null}
                                        </strong>
                                        {role.organization && role.title ? <b>{role.title}</b> : null}
                                        {formatHistoryGist(role) ? <small>{formatHistoryGist(role)}</small> : null}
                                      </span>
                                    </button>
                                  </div>
                                ) : (
                                <button type="button" onClick={() => chooseRole(role.id)}>
                                  <span>
                                    <strong>
                                      {role.organization || role.title || "Untitled"}
                                      {role.isCurrent ? <mark>Current</mark> : null}
                                    </strong>
                                    {role.organization && role.title ? <b>{role.title}</b> : null}
                                    {formatHistoryGist(role) ? <small>{formatHistoryGist(role)}</small> : null}
                                  </span>
                                </button>
                                )}
                              </li>
                            ))}
                          </ul>
                        </section>
                      ))}
                      {ready && shown.length === 0 ? <p className="cbm-empty">No roles match.</p> : null}
                    </ScrollableArea>
              </div>
              )
            ) : (
              <ScrollableArea className="cbm-nav-scroll" label="Main">
                {PANEL_BEFORE.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="cbm-nav-row"
                    aria-current={navId === item.id ? "page" : undefined}
                    onClick={() => setNavId(item.id)}
                  >
                    <CustomIcon kind={item.icon} />
                    {item.label}
                  </button>
                ))}
                <button
                  type="button"
                  className="cbm-nav-row"
                  aria-current={navId === "history" ? "page" : undefined}
                  onClick={() => {
                    setFocusId(null);
                    setPanel("history");
                    setNavId("history");
                  }}
                >
                  <CustomIcon kind="history" />
                  Career history
                </button>
                {PANEL_AFTER.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="cbm-nav-row"
                    aria-current={navId === item.id ? "page" : undefined}
                    onClick={() => setNavId(item.id)}
                  >
                    <CustomIcon kind={item.icon} />
                    {item.label}
                  </button>
                ))}
              </ScrollableArea>
            )}
            </div>
            <div className={customizationsOpen ? "cbm-custom" : "cbm-custom is-collapsed"}>
              <button
                type="button"
                className="cbm-custom-head"
                aria-expanded={customizationsOpen}
                onClick={() => setCustomizationsOpen((open) => !open)}
              >
                Customizations
                <Icon className="cbm-custom-chevron" icon={ChevronDown} size="sm" />
              </button>
              {customizationsOpen ? (
              <div className="cbm-custom-list">
                {CUSTOMIZATIONS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="cbm-custom-item"
                    aria-current={navId === item.id ? "page" : undefined}
                    onClick={() => {
                      if (item.id === "canvas") {
                        const next = !canvasOpen;
                        setCanvasOpen(next);
                        setNavId(next ? "canvas" : "");
                        return;
                      }
                      setNavId(item.id);
                    }}
                  >
                    <CustomIcon kind={item.icon} />
                    {item.label}
                  </button>
                ))}
              </div>
              ) : null}
            </div>
          </nav>
        </section>

        <section className="cbm-card cbm-media" aria-label="Media and events">
          <header>
            <h2>Media and events</h2>
            <p>{focus ? focus.organization || "This role" : "Across the career history."}</p>
          </header>
          {covers.length > 0 ? (
            <div className="cbm-photos">
              {covers.map((item) => (
                <Thumbnail
                  key={item.id}
                  className="cbm-thumb"
                  src={item.url}
                  alt={item.organization || item.title || "Photo"}
                  label={item.organization || item.title || "Photo"}
                />
              ))}
            </div>
          ) : (
            <p className="cbm-empty">No photos yet.</p>
          )}
          {events.length > 0 ? (
            <ul className="cbm-events">
              {events.map((event) => (
                <li key={event.id}>
                  <strong>{event.title || "Event"}</strong>
                  <span>{[event.date, event.organization].filter(Boolean).join(" · ")}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
        {rightOpen ? (
          <aside className="cbm-card cbm-side" aria-label="Conversations">
            <div className="cbm-sessions" ref={sessionsRef}>
              <button
                type="button"
                className="cbm-sessions-btn"
                aria-haspopup="listbox"
                aria-expanded={sessionsOpen}
                aria-label="Conversations"
                onClick={() => setSessionsOpen((open) => !open)}
              >
                <span>{CHAT_SESSIONS.find((session) => session.id === sessionId)?.label ?? "This board"}</span>
                <Icon className="cbm-account-caret" icon={ChevronDown} size="xsm" />
              </button>
              {sessionsOpen ? (
                <div className="cbm-sessions-menu" role="listbox" aria-label="Conversations">
                  {CHAT_SESSIONS.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      role="option"
                      aria-selected={session.id === sessionId}
                      onClick={() => {
                        setSessionId(session.id);
                        setSessionsOpen(false);
                      }}
                    >
                      {session.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <ChatLayout
              className="cbm-chat"
              density="spacious"
              emptyState={<p className="cbm-chat-empty">No conversations yet.</p>}
              composer={
                <ChatComposer
                  onSubmit={postComposerMessage}
                  placeholder={composerMode === "ask" ? "Ask anything..." : "Describe your edit..."}
                  drawer={
                    checkedRoles.length > 0 ? (
                      <ChatComposerDrawer count={checkedRoles.length} label="roles">
                        <div className="cbm-context-chips">
                          {checkedRoles.map((role) => (
                            <button
                              key={role.id}
                              type="button"
                              className="cbm-context-chip"
                              aria-label={`Remove ${roleContextLabel(role)} from this conversation`}
                              onClick={() => toggleChecked(role.id)}
                            >
                              <span>{role.organization || role.title || "Untitled"}</span>
                              <span aria-hidden="true">×</span>
                            </button>
                          ))}
                        </div>
                      </ChatComposerDrawer>
                    ) : null
                  }
                  input={<ChatComposerInput handleRef={composerRef} />}
                  headerActions={
                    <>
                      <Button label="Mention" variant="ghost" size="sm" icon={<Icon icon={AtSign} />} isIconOnly />
                      <Button label="Attach" variant="ghost" size="sm" icon={<Icon icon={Paperclip} />} isIconOnly />
                    </>
                  }
                  footerActions={
                    <DropdownMenu
                      button={{
                        label: composerMode === "ask" ? "Ask" : "Edit",
                        variant: "ghost",
                        size: "sm",
                      }}
                      items={[
                        { label: "Ask", onClick: () => setComposerMode("ask") },
                        { label: "Edit", onClick: () => setComposerMode("edit") },
                      ]}
                    />
                  }
                />
              }
            >
              {(sessionNotes[sessionId] ?? []).length > 0 ? (
                <ChatMessageList>
                  {(sessionNotes[sessionId] ?? []).map((note, index) => (
                    <ChatMessage
                      key={`${sessionId}-${index}-${note.sender}`}
                      sender={note.sender === "assistant" ? "assistant" : "user"}
                      name={note.sender === "assistant" ? "Proforna" : undefined}
                    >
                      <ChatMessageBubble>{note.text}</ChatMessageBubble>
                      {note.sender !== "assistant" && note.roles.length > 0 ? (
                        <p className="cbm-chat-context">{contextLine(note.roles)}</p>
                      ) : null}
                    </ChatMessage>
                  ))}
                </ChatMessageList>
              ) : null}
            </ChatLayout>
          </aside>
        ) : null}
      </div>
      </div>
      {focus && sheet ? (
        <RoleSheet
          role={focus}
          sheet={sheet}
          onClose={() => setSheet(null)}
          onReload={async () => {
            await load();
            setSheet(null);
          }}
          onMessage={setMessage}
        />
      ) : null}
      <CommandPalette
        isOpen={searchOpen}
        onOpenChange={setSearchOpen}
        searchSource={palette}
        label="Search"
        emptySearchText="Nothing matches that."
        onValueChange={pickPalette}
        renderItem={(item) => (
          <span className="cbm-palette-hit">
            <strong>{item.label}</strong>
            {item.auxiliaryData?.detail ? <span>{item.auxiliaryData.detail}</span> : null}
          </span>
        )}
      />
      {settingsOpen ? (
        <div
          className="cbm-pop"
          role="dialog"
          aria-modal="true"
          aria-label="Settings"
          onClick={(event) => {
            if (event.target === event.currentTarget) setSettingsOpen(false);
          }}
        >
          <ScrollableArea className="cbm-pop-card cbm-settings-card" label="Settings">
            <header>
              <h2>Settings</h2>
              <Button label="Close" variant="ghost" size="sm" onClick={() => setSettingsOpen(false)} />
            </header>
            <p>LinkedIn, GitHub, and Site show as the icons beside your name.</p>
            <form
              className="cbm-form"
              onSubmit={(event) => {
                event.preventDefault();
                void saveLinks();
              }}
            >
              <label>
                LinkedIn
                <input
                  value={linkDraft.linkedinUrl}
                  placeholder="https://"
                  autoComplete="url"
                  onChange={(event) => setLinkDraft((draft) => ({ ...draft, linkedinUrl: event.target.value }))}
                />
              </label>
              <label>
                GitHub
                <input
                  value={linkDraft.githubUrl}
                  placeholder="https://"
                  autoComplete="url"
                  onChange={(event) => setLinkDraft((draft) => ({ ...draft, githubUrl: event.target.value }))}
                />
              </label>
              <label>
                Site
                <input
                  value={linkDraft.portfolioUrl}
                  placeholder="https://"
                  autoComplete="url"
                  onChange={(event) => setLinkDraft((draft) => ({ ...draft, portfolioUrl: event.target.value }))}
                />
              </label>
              {settingsError ? <p className="cbm-settings-error">{settingsError}</p> : null}
              <Button type="submit" label="Save" variant="primary" size="sm" isLoading={settingsBusy} />
            </form>
          </ScrollableArea>
        </div>
      ) : null}
      {bioDialog ? (
        <div
          className="cbm-pop"
          role="dialog"
          aria-modal="true"
          aria-label={bioDialog === "know" ? "Get to know me" : bioDialog === "place" ? "Location" : "Contact"}
          onClick={(event) => {
            if (event.target === event.currentTarget) setBioDialog(null);
          }}
        >
          <ScrollableArea className="cbm-pop-card" label={bioDialog === "know" ? "Get to know me" : bioDialog === "place" ? "Location" : "Contact"}>
            <header>
              <h2>{bioDialog === "know" ? "Get to know me" : bioDialog === "place" ? "Location" : "Contact"}</h2>
              <Button label="Close" variant="ghost" size="sm" onClick={() => setBioDialog(null)} />
            </header>
            {bioDialog === "know" ? (
              <p>{profile.bio.trim() || "Nothing written yet."}</p>
            ) : bioDialog === "place" ? (
              <p>{place || "No location yet."}</p>
            ) : noteKept ? (
              <p>Noted.</p>
            ) : (
              <form
                className="cbm-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!noteName.trim() || !noteBody.trim()) return;
                  setNoteKept(true);
                }}
              >
                <label>
                  Name
                  <input value={noteName} onChange={(event) => setNoteName(event.target.value)} required />
                </label>
                <label>
                  Message
                  <textarea rows={3} value={noteBody} onChange={(event) => setNoteBody(event.target.value)} required />
                </label>
                <Button type="submit" label="Leave a note" variant="primary" size="sm" />
              </form>
            )}
          </ScrollableArea>
        </div>
      ) : null}
      {canvasOpen && canvasRole ? (
        <RoleCanvasEntry
          key={focus ? focus.id : "all"}
          role={canvasRole}
          roles={focus ? undefined : roles}
          scope={focus ? "role" : "all"}
          studyBoards={file?.studyBoards ?? []}
          minimized={false}
          slot={null}
          dockSlot={null}
          onMinimizedChange={() => undefined}
          onShowRole={() => undefined}
          onClose={closeCanvas}
        />
      ) : null}
    </div>
  );
}

function RoleCard({
  role,
  message,
  onOpen,
  onReload,
  onMessage,
}: {
  role: WorkMapRole;
  message: string;
  onOpen: (sheet: Sheet) => void;
  onReload: () => Promise<void>;
  onMessage: (value: string) => void;
}) {
  const cover = roleCoverPhoto(role.media);
  const place = formatHistoryPlace(role);
  const period = formatHistoryPeriod(role.startDate, role.endDate, role.isCurrent);
  const tenure = formatTenureMonths(tenureMonths(role.startDate, role.endDate, role.isCurrent));
  const gist = role.details.summary.trim();

  async function addPhoto(file: File) {
    onMessage("");
    const body = new FormData();
    body.set("photo", file);
    const response = await fetch(`/api/work-map/roles/${role.id}/photos`, { method: "POST", body });
    if (!response.ok) {
      onMessage("Could not add that photo.");
      return;
    }
    await onReload();
  }

  async function removePhoto() {
    if (!cover) return;
    onMessage("");
    const response = await fetch(`/api/work-map/roles/${role.id}/media/${cover.id}`, { method: "DELETE" });
    if (!response.ok) {
      onMessage("Could not remove that photo.");
      return;
    }
    await onReload();
  }

  return (
    <div className="cbm-role-card">
      <article className="cbm-job">
        <div className="cbm-cover-frame">
          {cover ? <img src={cover.url} alt="" /> : <div className="cbm-cover-empty">No cover photo</div>}
          <div className="cbm-cover-actions">
            <label>
              {cover ? "Change photo" : "Add photo"}
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void addPhoto(file);
                }}
              />
            </label>
            {cover ? (
              <Button label="Remove" variant="secondary" size="sm" onClick={() => void removePhoto()} />
            ) : null}
          </div>
        </div>
        <div className="cbm-job-body">
          <div className="cbm-title-row">
            <h2>{role.organization || "Untitled"}</h2>
            <Button label="Edit" variant="secondary" size="sm" onClick={() => onOpen("edit")} />
          </div>
          {role.title ? <p className="cbm-job-title">{role.title}</p> : null}
          {place || period ? (
            <p className="cbm-job-meta">
              {place ? <span>{place}</span> : null}
              {place && period ? <span aria-hidden="true">·</span> : null}
              {period ? <span>{period}</span> : null}
              {role.isCurrent ? <span className="cbm-current">current</span> : null}
              {tenure ? <span className="cbm-tenure">({tenure})</span> : null}
            </p>
          ) : null}
          {gist ? <p className="cbm-gist">{gist}</p> : null}
        </div>
        <ScrollableArea className="cbm-pills-scroll" label="Role actions">
        <div className="cbm-pills">
          {role.details.website ? (
            <a className="cbm-site" href={role.details.website} target="_blank" rel="noreferrer">
              <span>Website</span>
            </a>
          ) : null}
          {role.details.linkedin ? (
            <a className="cbm-site" href={role.details.linkedin} target="_blank" rel="noreferrer">
              <span>LinkedIn</span>
            </a>
          ) : null}
          <Button label="Worked with" variant="secondary" size="sm" onClick={() => onOpen("people")} />
          <Button label="More about this role" variant="secondary" size="sm" onClick={() => onOpen("more")} />
          <Button label="Show on canvas" variant="secondary" size="sm" onClick={() => onOpen("canvas")} />
        </div>
        </ScrollableArea>
      </article>
      <button type="button" className="cbm-gallery" onClick={() => onOpen("media")}>
        <GalleryStrip role={role} />
        <b>Media and events</b>
        <span>
          {role.media.length === 0 && role.details.events.length === 0
            ? "No media yet."
            : "Photos, video, and events."}
        </span>
      </button>
      {message ? <p className="cbm-message">{message}</p> : null}
    </div>
  );
}

function RoleSheet({
  role,
  sheet,
  onClose,
  onReload,
  onMessage,
}: {
  role: WorkMapRole;
  sheet: Exclude<Sheet, null>;
  onClose: () => void;
  onReload: () => Promise<void>;
  onMessage: (value: string) => void;
}) {
  const title =
    sheet === "people"
      ? "Worked with"
      : sheet === "more"
        ? "More about this role"
        : sheet === "media"
          ? "Media and events"
          : sheet === "canvas"
            ? "Canvas"
            : "Edit role";

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const story = await fetch(`/api/work-map/roles/${role.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: String(form.get("kind") ?? role.kind),
        title: String(form.get("title") ?? ""),
        organization: String(form.get("organization") ?? ""),
        locationLabel: String(form.get("locationLabel") ?? ""),
        startDate: String(form.get("startDate") ?? ""),
        endDate: String(form.get("endDate") ?? ""),
        isCurrent: form.get("isCurrent") === "on",
        description: String(form.get("description") ?? ""),
        achievements: String(form.get("achievements") ?? "")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      }),
    });
    if (!story.ok) {
      onMessage("Could not save this role.");
      return;
    }
    const details = await fetch(`/api/work-map/roles/${role.id}/details`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        summary: String(form.get("summary") ?? ""),
        website: String(form.get("website") ?? ""),
        linkedin: String(form.get("linkedin") ?? ""),
      }),
    });
    if (!details.ok) {
      onMessage("The story saved. The summary and links did not.");
      await onReload();
      return;
    }
    onMessage("Role saved.");
    await onReload();
  }

  return (
    <div className="cbm-pop" role="dialog" aria-label={title}>
      <ScrollableArea className="cbm-pop-card" label={title}>
        <header>
          <h2>{title}</h2>
          <Button label="Close" variant="ghost" size="sm" onClick={onClose} />
        </header>
        {sheet === "people" ? (
          role.details.colleagues.length === 0 ? (
            <p>No one listed on this role yet.</p>
          ) : (
            <ul className="cbm-plain">
              {role.details.colleagues.map((person) => (
                <li key={person.id}>
                  <strong>{person.name}</strong>
                  {person.title ? <span>{person.title}</span> : null}
                  {person.note ? <p>{person.note}</p> : null}
                </li>
              ))}
            </ul>
          )
        ) : null}
        {sheet === "more" ? (
          <>
            {role.description ? <p>{role.description}</p> : <p>No description yet.</p>}
            {role.achievements.length > 0 ? (
              <ul className="cbm-plain">
                {role.achievements.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
        {sheet === "media" ? (
          <>
            {role.media.length === 0 ? <p>No photos or video on this role yet.</p> : null}
            <div className="cbm-pop-photos">
              {role.media.map((item) =>
                item.kind === "photo" ? <img key={item.id} src={item.url} alt={item.title || ""} /> : null,
              )}
            </div>
            {role.details.events.length === 0 ? (
              <p>No events on this role yet.</p>
            ) : (
              <ul className="cbm-plain">
                {role.details.events.map((event) => (
                  <li key={event.id}>
                    <strong>{event.title || "Event"}</strong>
                    <span>{event.date}</span>
                    {event.detail ? <p>{event.detail}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
        {sheet === "canvas" ? (
          (role.canvasBoards ?? []).length === 0 ? (
            <p>No canvas for this role yet.</p>
          ) : (
            <ul className="cbm-plain">
              {(role.canvasBoards ?? []).map((board) => (
                <li key={board.id}>
                  <strong>{board.name || "Canvas"}</strong>
                  <span>{board.nodes.length} nodes</span>
                </li>
              ))}
            </ul>
          )
        ) : null}
        {sheet === "edit" ? (
          <form className="cbm-form" onSubmit={(event) => void save(event)}>
            <label>
              Kind
              <select name="kind" defaultValue={role.kind}>
                <option value="job">Job</option>
                <option value="internship">Internship</option>
                <option value="school">Education</option>
              </select>
            </label>
            <label>
              Title
              <input name="title" defaultValue={role.title} />
            </label>
            <label>
              Organization
              <input name="organization" defaultValue={role.organization} />
            </label>
            <label>
              Place
              <input name="locationLabel" defaultValue={role.locationLabel} />
            </label>
            <label>
              Start
              <input name="startDate" defaultValue={role.startDate} />
            </label>
            <label>
              End
              <input name="endDate" defaultValue={role.endDate} />
            </label>
            <label className="cbm-check">
              <input name="isCurrent" type="checkbox" defaultChecked={role.isCurrent} />
              Current
            </label>
            <label>
              Summary
              <textarea name="summary" defaultValue={role.details.summary} rows={3} />
            </label>
            <label>
              Description
              <textarea name="description" defaultValue={role.description} rows={4} />
            </label>
            <label>
              Achievements
              <textarea name="achievements" defaultValue={role.achievements.join("\n")} rows={4} />
            </label>
            <label>
              Website
              <input name="website" defaultValue={role.details.website} />
            </label>
            <label>
              LinkedIn
              <input name="linkedin" defaultValue={role.details.linkedin} />
            </label>
            <Button type="submit" label="Save" variant="primary" size="sm" />
          </form>
        ) : null}
      </ScrollableArea>
    </div>
  );
}

function GalleryStrip({ role }: { role: WorkMapRole }) {
  const items = role.media.filter((item) => item.kind === "photo" || item.kind === "video").slice(0, 3);
  if (items.length === 0) return null;
  const count = items.length >= 3 ? "" : items.length === 2 ? " is-two" : " is-one";
  return (
    <span className={`cbm-strip${count}`} aria-hidden="true">
      {items.map((item) =>
        item.kind === "photo" ? <img key={item.id} src={item.url} alt="" /> : <span key={item.id}>Video</span>,
      )}
    </span>
  );
}

type LiveUpdate = {
  id: string;
  organization: string;
  kind: string;
  text: string;
  stamp: string;
  frame: string;
  ownDate: boolean;
};

function httpUrl(value: string): string | null {
  const url = value.trim();
  return /^https?:\/\//i.test(url) ? url : null;
}

function socialLinks(profile: Profile): Array<{ name: string; kind: "linkedin" | "github" | "site"; url: string | null }> {
  return [
    { name: "LinkedIn", kind: "linkedin", url: httpUrl(profile.linkedinUrl) },
    { name: "GitHub", kind: "github", url: httpUrl(profile.githubUrl) },
    { name: "Site", kind: "site", url: httpUrl(profile.portfolioUrl) },
  ];
}

function SocialMark({ kind }: { kind: "linkedin" | "github" | "site" }) {
  if (kind === "linkedin") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.7 3.2a1.7 1.7 0 1 0 .02 3.4 1.7 1.7 0 0 0-.02-3.4ZM3.2 8.4h3.1V20.8H3.2V8.4Zm5 0h3v1.7h.04c.42-.8 1.44-1.64 2.96-1.64 3.17 0 3.76 2.08 3.76 4.79v7.55h-3.1v-6.7c0-1.6-.03-3.66-2.23-3.66-2.23 0-2.57 1.74-2.57 3.54v6.82H8.2V8.4Z" />
      </svg>
    );
  }
  if (kind === "github") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.36 1.12 2.94.86.09-.67.35-1.12.63-1.38-2.22-.26-4.55-1.14-4.55-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05a9.3 9.3 0 0 1 5 0c1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9 0 1.38-.01 2.49-.01 2.83 0 .27.18.6.69.49A10.04 10.04 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M3.75 12h16.5M12 3.75c2.15 2.25 3.25 5.05 3.25 8.25s-1.1 6-3.25 8.25c-2.15-2.25-3.25-5.05-3.25-8.25s1.1-6 3.25-8.25Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function liveUpdates(roles: WorkMapRole[]): LiveUpdate[] {
  return roles.flatMap((role) => {
    const organization = role.organization || role.title || "Role";
    const frame = formatHistoryPeriod(role.startDate, role.endDate, role.isCurrent);
    const stamp = inboxStamp(role.startDate);
    const items: LiveUpdate[] = [];
    const summary = role.details.summary.trim();
    if (summary) {
      items.push({ id: `${role.id}-now`, organization, kind: "Now", text: summary, stamp, frame, ownDate: false });
    }
    const moments = [
      ...role.details.events.map((item) => ({ ...item, kind: "Event" })),
      ...role.details.milestones.map((item) => ({ ...item, kind: "Milestone" })),
      ...role.details.notes.map((item) => ({ ...item, kind: "Note" })),
    ].sort((a, b) => b.date.localeCompare(a.date));
    for (const moment of moments) {
      const text = [moment.title, moment.detail].filter(Boolean).join(" — ");
      if (!text) continue;
      const when = inboxStamp(moment.date);
      items.push({
        id: moment.id,
        organization,
        kind: moment.kind,
        text,
        stamp: when || stamp,
        frame: when || frame,
        ownDate: Boolean(when),
      });
    }
    role.achievements.forEach((text, index) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      items.push({
        id: `${role.id}-done-${index}`,
        organization,
        kind: "Achievement",
        text: trimmed,
        stamp,
        frame,
        ownDate: false,
      });
    });
    return items;
  });
}

function updateGroups(items: LiveUpdate[]) {
  const groups: Array<{ key: string; organization: string; stamp: string; items: LiveUpdate[] }> = [];
  for (const item of items) {
    const last = groups.at(-1);
    const share =
      last &&
      !item.ownDate &&
      last.items.every((entry) => !entry.ownDate) &&
      last.organization === item.organization &&
      last.stamp === item.stamp;
    if (share && last) last.items.push(item);
    else groups.push({ key: item.id, organization: item.organization, stamp: item.stamp, items: [item] });
  }
  return groups;
}

function inboxStamp(value: string, now = new Date()): string {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(value.trim());
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = match[3] ? Number(match[3]) : null;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const label = months[month];
  if (!label) return "";
  if (year === now.getFullYear()) return day && day !== 1 ? `${label} ${day}` : label;
  return day && day !== 1 ? `${label} ${day}, ${year}` : `${label} ${year}`;
}

function roleHasPlace(role: WorkMapRole): boolean {
  return role.locations.some(
    (location) => Number.isFinite(location.latitude) && Number.isFinite(location.longitude),
  );
}

function groups(roles: WorkMapRole[]) {
  return [
    { label: "Jobs", roles: roles.filter((role) => role.kind === "job") },
    { label: "Internships", roles: roles.filter((role) => role.kind === "internship") },
    { label: "Education", roles: roles.filter((role) => role.kind === "school") },
  ].filter((group) => group.roles.length > 0);
}


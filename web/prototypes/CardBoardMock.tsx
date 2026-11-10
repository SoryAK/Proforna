// Throwaway. Four cards on one board.
// #/prototype/card-board
// Bio sits top left. The map sits top right, and its menu also opens live updates.
// Career history sits bottom left.
// Media and events sit bottom right, in the smaller card.
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  formatHistoryGist,
  formatHistoryPeriod,
  formatHistoryPlace,
  formatTenureMonths,
  tenureMonths,
} from "@core/career-history";
import type { MapSettings } from "@core/map-settings";
import { prepareProfile } from "@core/profile";
import { roleCoverPhoto, type WorkMapRole } from "@core/work-map";
import { CareerMap } from "../src/CareerMap";
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

const CHAT_SESSIONS = [
  { id: "board", label: "This board" },
  { id: "history", label: "Career history" },
  { id: "map", label: "Map notes" },
] as const;

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
  { id: "plugins", label: "Plugins", icon: "plug" },
  { id: "extensions", label: "Extensions", icon: "extensions" },
  { id: "tools", label: "Tools", icon: "tools" },
] as const;

function PanelIcon({ side, open }: { side: "left" | "right"; open: boolean }) {
  const edge = side === "left" ? "M9.5 4v16" : "M14.5 4v16";
  const fill = side === "left" ? "M4.2 5.2H9.5v13.6H4.2z" : "M14.5 5.2h5.3v13.6H14.5z";
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <path d={edge} />
      {open ? <path className="cbm-panel-fill" d={fill} /> : null}
    </svg>
  );
}

const CUSTOM_ICONS = {
  home: "M7.31299 1.26164C7.69849 0.897163 8.30151 0.897163 8.68701 1.26164L13.5305 5.84098C13.8302 6.12431 14 6.51853 14 6.93094V12.5002C14 13.3286 13.3284 14.0002 12.5 14.0002H10.5C9.67157 14.0002 9 13.3286 9 12.5002V10.0002C9 9.72407 8.77614 9.50021 8.5 9.50021H7.5C7.22386 9.50021 7 9.72407 7 10.0002V12.5002C7 13.3286 6.32843 14.0002 5.5 14.0002H3.5C2.67157 14.0002 2 13.3286 2 12.5002V6.93094C2 6.51853 2.1698 6.12431 2.46948 5.84098L7.31299 1.26164ZM8 1.98828L3.15649 6.56762C3.0566 6.66207 3 6.79347 3 6.93094V12.5002C3 12.7763 3.22386 13.0002 3.5 13.0002H5.5C5.77614 13.0002 6 12.7763 6 12.5002V10.0002C6 9.17179 6.67157 8.50022 7.5 8.50022H8.5C9.32843 8.50022 10 9.17179 10 10.0002V12.5002C10 12.7763 10.2239 13.0002 10.5 13.0002H12.5C12.7761 13.0002 13 12.7763 13 12.5002V6.93094C13 6.79347 12.9434 6.66207 12.8435 6.56762L8 1.98828Z",
  history: "M7.99909 3C10.7605 3 12.9991 5.23858 12.9991 8C12.9991 10.7614 10.7605 13 7.99909 13C5.39117 13 3.2491 11.003 3.0195 8.45512C2.99471 8.1801 2.75167 7.97723 2.47664 8.00202C2.20161 8.0268 1.99875 8.26985 2.02353 8.54488C2.29916 11.6035 4.86898 14 7.99909 14C11.3128 14 13.9991 11.3137 13.9991 8C13.9991 4.68629 11.3128 2 7.99909 2C6.20656 2 4.59815 2.78613 3.49909 4.03138V2.5C3.49909 2.22386 3.27524 2 2.99909 2C2.72295 2 2.49909 2.22386 2.49909 2.5V5.5C2.49909 5.77614 2.72295 6 2.99909 6H3.08812C3.09498 6.00014 3.10184 6.00014 3.10868 6H5.99909C6.27524 6 6.49909 5.77614 6.49909 5.5C6.49909 5.22386 6.27524 5 5.99909 5H3.99863C4.91128 3.78495 6.36382 3 7.99909 3ZM7.99909 5.5C7.99909 5.22386 7.77524 5 7.49909 5C7.22295 5 6.99909 5.22386 6.99909 5.5V8.5C6.99909 8.77614 7.22295 9 7.49909 9H9.49909C9.77524 9 9.99909 8.77614 9.99909 8.5C9.99909 8.22386 9.77524 8 9.49909 8H7.99909V5.5Z",
  search: "M10.0195 10.7266C9.06578 11.5217 7.83875 12 6.5 12C3.46243 12 1 9.53757 1 6.5C1 3.46243 3.46243 1 6.5 1C9.53757 1 12 3.46243 12 6.5C12 7.83875 11.5217 9.06578 10.7266 10.0195L13.8535 13.1464C14.0488 13.3417 14.0488 13.6583 13.8535 13.8536C13.6583 14.0488 13.3417 14.0488 13.1464 13.8536L10.0195 10.7266ZM11 6.5C11 4.01472 8.98528 2 6.5 2C4.01472 2 2 4.01472 2 6.5C2 8.98528 4.01472 11 6.5 11C8.98528 11 11 8.98528 11 6.5Z",
  library: "M1 3.24941C1 2.55938 1.55917 2 2.24895 2H2.74852C3.4383 2 3.99747 2.55938 3.99747 3.24941V12.745C3.99747 13.435 3.4383 13.9944 2.74852 13.9944H2.24895C1.55917 13.9944 1 13.435 1 12.745V3.24941ZM2.24895 2.99953C2.11099 2.99953 1.99916 3.11141 1.99916 3.24941V12.745C1.99916 12.883 2.11099 12.9948 2.24895 12.9948H2.74852C2.88648 12.9948 2.99831 12.883 2.99831 12.745V3.24941C2.99831 3.11141 2.88648 2.99953 2.74852 2.99953H2.24895ZM4.99663 3.24941C4.99663 2.55938 5.5558 2 6.24557 2H6.74515C7.43492 2 7.9941 2.55938 7.9941 3.24941V12.745C7.9941 13.435 7.43492 13.9944 6.74515 13.9944H6.24557C5.5558 13.9944 4.99663 13.435 4.99663 12.745V3.24941ZM6.24557 2.99953C6.10762 2.99953 5.99578 3.11141 5.99578 3.24941V12.745C5.99578 12.883 6.10762 12.9948 6.24557 12.9948H6.74515C6.88311 12.9948 6.99494 12.883 6.99494 12.745V3.24941C6.99494 3.11141 6.88311 2.99953 6.74515 2.99953H6.24557ZM11.9723 4.77682C11.7231 4.15733 11.0311 3.84331 10.4011 4.06385L9.81888 4.26764C9.14658 4.50297 8.80684 5.25222 9.07268 5.91326L12.0098 13.2166C12.2589 13.8361 12.9509 14.1502 13.581 13.9296L14.1632 13.7258C14.8355 13.4904 15.1752 12.7412 14.9093 12.0802L11.9723 4.77682ZM10.7311 5.00729C10.8571 4.96318 10.9955 5.02598 11.0453 5.14988L13.9824 12.4532C14.0356 12.5854 13.9676 12.7353 13.8332 12.7823L13.251 12.9862C13.1249 13.0303 12.9865 12.9675 12.9367 12.8436L9.99964 5.5402C9.94647 5.40799 10.0144 5.25815 10.1489 5.21108L10.7311 5.00729Z",
  folder: "M2 4.5V6H5.58579C5.71839 6 5.84557 5.94732 5.93934 5.85355L7.29289 4.5L5.93934 3.14645C5.84557 3.05268 5.71839 3 5.58579 3H3.5C2.67157 3 2 3.67157 2 4.5ZM1 4.5C1 3.11929 2.11929 2 3.5 2H5.58579C5.98361 2 6.36514 2.15804 6.64645 2.43934L8.20711 4H12.5C13.8807 4 15 5.11929 15 6.5V11.5C15 12.8807 13.8807 14 12.5 14H3.5C2.11929 14 1 12.8807 1 11.5V4.5ZM2 7V11.5C2 12.3284 2.67157 13 3.5 13H12.5C13.3284 13 14 12.3284 14 11.5V6.5C14 5.67157 13.3284 5 12.5 5H8.20711L6.64645 6.56066C6.36514 6.84197 5.98361 7 5.58579 7H2Z",
  organization: "M6.00195 4.00002C6.00195 2.89655 6.89649 2.00201 7.99995 2.00201C9.10342 2.00201 9.99796 2.89655 9.99796 4.00002C9.99796 5.10348 9.10342 5.99802 7.99995 5.99802C6.89649 5.99802 6.00195 5.10348 6.00195 4.00002ZM7.99995 3.00201C7.44877 3.00201 7.00195 3.44883 7.00195 4.00002C7.00195 4.5512 7.44877 4.99802 7.99995 4.99802C8.55114 4.99802 8.99796 4.5512 8.99796 4.00002C8.99796 3.44883 8.55114 3.00201 7.99995 3.00201ZM11 4.5C11 3.67157 11.6716 3 12.5 3C13.3284 3 14 3.67157 14 4.5C14 5.32843 13.3284 6 12.5 6C11.6716 6 11 5.32843 11 4.5ZM12.5 4C12.2239 4 12 4.22386 12 4.5C12 4.77614 12.2239 5 12.5 5C12.7761 5 13 4.77614 13 4.5C13 4.22386 12.7761 4 12.5 4ZM3.5 3C2.67157 3 2 3.67157 2 4.5C2 5.32843 2.67157 6 3.5 6C4.32843 6 5 5.32843 5 4.5C5 3.67157 4.32843 3 3.5 3ZM3 4.5C3 4.22386 3.22386 4 3.5 4C3.77614 4 4 4.22386 4 4.5C4 4.77614 3.77614 5 3.5 5C3.22386 5 3 4.77614 3 4.5ZM4.26756 6.99969C4.09739 7.29387 4 7.63541 4 7.99969L2 7.99969V10.5C2 11.3285 2.67157 12 3.5 12C3.71194 12 3.91361 11.9561 4.09639 11.8768C4.1705 12.2082 4.28572 12.524 4.43643 12.8187C4.14721 12.9356 3.83112 13 3.5 13C2.11929 13 1 11.8807 1 10.5V7.99969C1 7.44741 1.44772 6.99969 2 6.99969H4.26756ZM11.5636 12.8187C11.8528 12.9356 12.1689 13 12.5 13C13.8807 13 15 11.8807 15 10.5V7.99969C15 7.44741 14.5523 6.99969 14 6.99969H11.7324C11.9026 7.29387 12 7.63541 12 7.9997L14 7.99969V10.5C14 11.3285 13.3284 12 12.5 12C12.2881 12 12.0864 11.9561 11.9036 11.8768C11.8295 12.2082 11.7143 12.524 11.5636 12.8187ZM6 6.99969C5.44772 6.99969 5 7.44741 5 7.99969V11C5 12.6569 6.34315 14 8 14C9.65685 14 11 12.6569 11 11V7.99969C11 7.44741 10.5523 6.99969 10 6.99969H6ZM6 7.99969L10 7.99969V11C10 12.1046 9.10457 13 8 13C6.89543 13 6 12.1046 6 11V7.99969Z",
  plug: "M10.723 4H10V1.5C10 1.224 9.776 1 9.5 1C9.224 1 9 1.224 9 1.5V4H7V1.5C7 1.224 6.776 1 6.5 1C6.224 1 6 1.224 6 1.5V4H5.277C4.573 4 4 4.573 4 5.278V8C4 10.036 5.529 11.722 7.5 11.969V14.5C7.5 14.776 7.724 15 8 15C8.276 15 8.5 14.776 8.5 14.5V11.969C10.471 11.722 12 10.037 12 8V5.278C12 4.573 11.427 4 10.723 4ZM11 8C11 9.654 9.654 11 8 11C6.346 11 5 9.654 5 8V5.278C5 5.125 5.124 5 5.277 5H10.722C10.875 5 10.999 5.125 10.999 5.278V8H11Z",
  extensions: "M15 4.95703C15 4.58711 14.8563 4.24054 14.5949 3.97992L12.0096 1.39234C11.4879 0.86922 10.5788 0.86922 10.0571 1.39234L8 3.45119V3.32321C8 2.55068 7.37187 1.922 6.6 1.922H2.4C1.62813 1.922 1 2.55068 1 3.32321V13.5988C1 14.3713 1.62813 15 2.4 15H12.6667C13.4385 15 14.0667 14.3713 14.0667 13.5988V9.39514C14.0667 8.62261 13.4385 7.99393 12.6667 7.99393H12.5379L14.5949 5.93508C14.8553 5.67445 15 5.32602 15 4.95703ZM2.4 2.85521H6.6C6.85667 2.85521 7.06667 3.06446 7.06667 3.32228V7.99299H1.93333V3.32228C1.93333 3.06446 2.14333 2.85521 2.4 2.85521ZM1.93333 13.5979V8.92714H7.06667V14.0649H2.4C2.14333 14.0649 1.93333 13.8547 1.93333 13.5979ZM13.1333 9.39421V13.5979C13.1333 13.8547 12.9233 14.0649 12.6667 14.0649H8V8.92714H12.6667C12.9233 8.92714 13.1333 9.13638 13.1333 9.39421ZM8 7.99299V6.46287L9.5288 7.99299H8ZM13.9351 5.2737L11.3488 7.86221C11.1789 8.03223 10.8859 8.03223 10.716 7.86221L8.12973 5.2737C8.0448 5.18963 7.99813 5.07753 7.99813 4.95796C7.99813 4.83839 8.0448 4.7263 8.12973 4.64129L10.716 2.05278C10.8009 1.96777 10.9129 1.92106 11.0324 1.92106C11.1519 1.92106 11.2639 1.96777 11.3488 2.05278L13.9351 4.64129C14.02 4.72536 14.0667 4.83746 14.0667 4.95703C14.0667 5.0766 14.02 5.1887 13.9351 5.2737Z",
  tools: "M5.66901 0.999997C5.52101 0.945997 5.34701 0.968997 5.21401 1.062C5.08101 1.155 5.00201 1.308 5.00201 1.47V3.286C5.00201 3.561 4.77701 3.786 4.50201 3.786C4.22701 3.786 4.00201 3.561 4.00201 3.286V1.47C4.00201 1.308 3.92301 1.156 3.79001 1.062C3.65801 0.967997 3.48501 0.945997 3.33501 0.999997C1.93901 1.495 1.00201 2.816 1.00201 4.287C1.00201 5.646 1.79201 6.876 3.00201 7.449V13.5C3.00201 14.327 3.67501 15 4.50201 15C5.32901 15 6.00201 14.327 6.00201 13.5V7.449C7.21201 6.876 8.00201 5.646 8.00201 4.287C8.00201 2.816 7.06401 1.495 5.66901 0.999997ZM5.33601 6.644C5.13601 6.714 5.00201 6.904 5.00201 7.116V13.501C5.00201 13.776 4.77701 14.001 4.50201 14.001C4.22701 14.001 4.00201 13.776 4.00201 13.501V7.116C4.00201 6.904 3.86801 6.715 3.66801 6.644C2.67201 6.292 2.00201 5.345 2.00201 4.288C2.00201 3.496 2.38501 2.765 3.00201 2.301V3.288C3.00201 4.115 3.67501 4.788 4.50201 4.788C5.32901 4.788 6.00201 4.115 6.00201 3.288V2.301C6.61901 2.765 7.00201 3.496 7.00201 4.288C7.00201 5.346 6.33201 6.293 5.33601 6.644ZM13.5 8H13.002V4.118L13.449 3.223C13.509 3.105 13.518 2.967 13.476 2.841L12.976 1.341C12.908 1.137 12.716 0.998997 12.501 0.998997H10.501C10.286 0.998997 10.095 1.137 10.026 1.341L9.52601 2.841C9.48401 2.967 9.49401 3.105 9.55301 3.223L10 4.118V8H9.50001C9.22401 8 9.00001 8.224 9.00001 8.5V12.5C9.00001 13.879 10.121 15 11.5 15C12.879 15 14 13.879 14 12.5V8.5C14 8.224 13.776 8 13.5 8ZM10.862 2.001H12.141L12.461 2.963L12.054 3.777C12.02 3.846 12.001 3.923 12.001 4.001V8.001H11.001V4.001C11.001 3.924 10.983 3.847 10.949 3.777L10.542 2.963L10.862 2.001ZM13.002 12.5C13.002 13.327 12.329 14 11.502 14C10.675 14 10.002 13.327 10.002 12.5V9H13.002V12.5Z",
} as const;

function CustomIcon({ kind }: { kind: keyof typeof CUSTOM_ICONS }) {
  return (
    <svg className="cbm-mark-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d={CUSTOM_ICONS[kind]} />
    </svg>
  );
}

export function CardBoardMock() {
  const [file, setFile] = useState<HistoryFile | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyFindOpen, setHistoryFindOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [globalQuery, setGlobalQuery] = useState("");
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
  const [bioMode, setBioMode] = useState<"browse" | "preview" | "share">("browse");
  const [rightOpen, setRightOpen] = useState(false);
  const [sideDraft, setSideDraft] = useState("");
  const [sessionId, setSessionId] = useState<(typeof CHAT_SESSIONS)[number]["id"]>("board");
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [sessionNotes, setSessionNotes] = useState<Record<string, string[]>>({});
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

  useEffect(() => {
    if (!searchOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSearchOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  const profile = file?.profile ?? EMPTY_PROFILE;
  const roles = [...(file?.roles ?? [])].sort((a, b) =>
    sort === "newest" ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate),
  );
  const needle = historyQuery.trim().toLowerCase();
  const globalNeedle = globalQuery.trim().toLowerCase();
  const placeHits = BOARD_PLACES.filter((item) => {
    if (!globalNeedle) return true;
    return `${item.label} ${item.detail}`.toLowerCase().includes(globalNeedle);
  });
  const roleHits = globalNeedle
    ? roles.filter((role) =>
        `${role.organization} ${role.title} ${formatHistoryPlace(role)} ${role.details.summary}`
          .toLowerCase()
          .includes(globalNeedle),
      )
    : [];
  const updateHits = globalNeedle
    ? liveUpdates(roles).filter((item) =>
        `${item.organization} ${item.kind} ${item.text}`.toLowerCase().includes(globalNeedle),
      )
    : [];
  const searchEmpty = globalNeedle.length > 0 && placeHits.length === 0 && roleHits.length === 0 && updateHits.length === 0;
  const shown = roles.filter((role) => {
    if (!needle) return true;
    return `${role.organization} ${role.title} ${formatHistoryPlace(role)}`.toLowerCase().includes(needle);
  });
  const focus = roles.find((role) => role.id === focusId) ?? null;
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

  function showMap() {
    setUpdatesOpen(false);
    setUpdateId(null);
  }

  function chooseStage(updates: boolean) {
    setUpdatesOpen(updates);
    setUpdateId(null);
  }

  function closeSearch() {
    setSearchOpen(false);
    setGlobalQuery("");
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
      <header className="cbm-top">
        <div className="cbm-brand-wrap">
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
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6" />
            <path d="m20 20-3.6-3.6" />
          </svg>
          <span>Search…</span>
        </button>
        <div className="cbm-top-end" ref={topEnd}>
          <div className="cbm-pub" role="group" aria-label="Publication">
            <div className="cbm-pub-anchor">
              <button
                type="button"
                className="cbm-pub-btn is-publish"
                aria-expanded={topMenu === "publish"}
                aria-haspopup="menu"
                onClick={() => setTopMenu((current) => (current === "publish" ? null : "publish"))}
              >
                Publish
              </button>
              {topMenu === "publish" ? (
                <div className="cbm-top-menu cbm-pub-menu" role="menu" aria-label="Publish">
                  <button type="button" role="menuitem" onClick={() => setTopMenu(null)}>
                    Confirm publish
                  </button>
                  <button type="button" role="menuitem" onClick={() => setTopMenu(null)}>
                    Cancel
                  </button>
                </div>
              ) : null}
            </div>
            <div className="cbm-pub-anchor">
              {bioMode === "preview" ? (
                <button
                  type="button"
                  className="cbm-pub-btn cbm-exit-preview"
                  onClick={() => {
                    setBioMode("browse");
                    setTopMenu(null);
                  }}
                >
                  Exit preview
                </button>
              ) : (
              <button
                type="button"
                className="cbm-pub-btn"
                aria-expanded={topMenu === "preview"}
                aria-pressed={bioMode !== "browse"}
                aria-haspopup="menu"
                onClick={() => setTopMenu((current) => (current === "preview" ? null : "preview"))}
              >
                Preview
              </button>
              )}
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
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
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
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt="" />
              ) : (
                <span className="cbm-account-mark">{initials(profile.fullName)}</span>
              )}
              <span className="cbm-account-copy">
                <strong>{profile.fullName || "Career"}</strong>
                {accountRole ? <small>{accountRole}</small> : null}
              </span>
              <svg className="cbm-account-caret" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path
                  d="M3 4.5 L6 7.5 L9 4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
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
            {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : <span className="cbm-mark">SK</span>}
            <div className="cbm-bio-id">
              <h2>{profile.fullName || "Career"}</h2>
              {accountRole ? <p>{accountRole}</p> : null}
            </div>
            <div className="cbm-socials">
              <button type="button" aria-label="Request location" onClick={() => setBioDialog("place")}>
                <svg className="cbm-pin" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
                  <circle cx="12" cy="10" r="2.25" />
                </svg>
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
            <button type="button" className="cbm-know" onClick={() => { setNoteKept(false); setBioDialog("contact"); }}>
              Contact
            </button>
            <button type="button" className="cbm-know" onClick={() => setBioDialog("know")}>
              Get to know me
            </button>
          </div>
        </section>
        )}

        <section className="cbm-card cbm-live" aria-label={updatesOpen ? "Live update" : "Map"}>
          <div className="cbm-stage-bar" role="tablist" aria-label="Card views">
            <button type="button" role="tab" aria-selected={!updatesOpen} onClick={() => chooseStage(false)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 4.5 4 6.4v13.1l5-1.9 6 2.4 5-1.9V4.5l-5 1.9L9 4.5Zm0 1.8v11.2l-3 1.1V7.4l3-1.1Zm2 0 4 1.6v11.2l-4-1.6V6.3Zm6 1.1v11.2l-3 1.1V8.4l3-1.1Z" />
              </svg>
              Map
            </button>
            <button type="button" role="tab" aria-selected={updatesOpen} onClick={() => chooseStage(true)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 6.2h16v1.7H4V6.2Zm0 5h12.5v1.7H4v-1.7Zm0 5h9v1.7H4v-1.7Z" />
              </svg>
              Live updates
              {updates.length > 0 ? <span className="cbm-count">{updates.length}</span> : null}
            </button>
          </div>
          <div className="cbm-stage">
            {updatesOpen ? (
              updates.length > 0 ? (
                <div className={openUpdate ? "cbm-updates is-reading" : "cbm-updates"}>
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
                </div>
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
              <div className={focus ? "cbm-history-view is-role" : "cbm-history-view"}>
                {focus ? (
                  <>
                    <div className="cbm-history-bar">
                      <button className="cbm-back" type="button" onClick={() => chooseRole(null)}>
                        History
                      </button>
                    </div>
                    <RoleCard
                      role={focus}
                      message={message}
                      onOpen={setSheet}
                      onReload={load}
                      onMessage={setMessage}
                    />
                  </>
                ) : (
                  <>
                    <div className="cbm-history-bar">
                      <button className="cbm-back-arrow" type="button" aria-label="Back" onClick={() => setPanel("menu")}>
                        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                          <path
                            d="M13.2 8H3.2M7 4.2 3.2 8 7 11.8"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                      <span className="cbm-history-title">Career history</span>
                      <div className="cbm-history-actions">
                        <button className="cbm-new" type="button" aria-keyshortcuts="Control+N">
                          New
                          <kbd>Ctrl+N</kbd>
                        </button>
                        <div className="cbm-sort" ref={sortMenuRef}>
                          <button
                            className="cbm-tool-btn"
                            type="button"
                            aria-label="Sort"
                            aria-haspopup="menu"
                            aria-expanded={sortMenuOpen}
                            onClick={() => setSortMenuOpen((open) => !open)}
                          >
                            <svg className="cbm-mark-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                              <path d="M9.5 14H6.5C6.224 14 6 13.776 6 13.5V9.329C6 8.928 5.844 8.552 5.561 8.268L1.561 4.268C1.205 3.911 1 3.418 1 2.914C1 1.858 1.858 1 2.914 1H13.086C14.142 1 15 1.858 15 2.914C15 3.417 14.796 3.911 14.439 4.267L10.439 8.267C10.156 8.551 10 8.927 10 9.328V13.499C10 13.775 9.776 13.999 9.5 13.999V14ZM7 13H9V9.329C9 8.661 9.26 8.033 9.732 7.561L13.732 3.561C13.902 3.391 14 3.155 14 2.915C14 2.411 13.59 2.001 13.086 2.001H2.914C2.41 2.001 2 2.411 2 2.915C2 3.155 2.098 3.391 2.268 3.562L6.268 7.562C6.741 8.034 7 8.662 7 9.33V13.001V13Z" />
                            </svg>
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
                      </div>
                    </div>
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
                    <div className="cbm-groups cbm-roles-frame">
                      {groups(shown).map((group) => (
                        <section key={group.label}>
                          <h3>
                            {group.label} ({group.roles.length})
                          </h3>
                          <ul>
                            {group.roles.map((role) => (
                              <li key={role.id}>
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
                              </li>
                            ))}
                          </ul>
                        </section>
                      ))}
                      {ready && shown.length === 0 ? <p className="cbm-empty">No roles match.</p> : null}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <>
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
              </>
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
                <svg className="cbm-custom-chevron" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    d="M8 3.2v10M4.2 9.4 8 13.2l3.8-3.8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {customizationsOpen ? (
              <div className="cbm-custom-list">
                {CUSTOMIZATIONS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="cbm-custom-item"
                    aria-current={navId === item.id ? "page" : undefined}
                    onClick={() => setNavId(item.id)}
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
                <img key={item.id} src={item.url} alt={item.organization || item.title || ""} />
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
                <svg className="cbm-account-caret" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                  <path
                    d="M3 4.5 L6 7.5 L9 4.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
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
                        setSideDraft("");
                        setSessionsOpen(false);
                      }}
                    >
                      {session.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="cbm-side-body">
              {(sessionNotes[sessionId] ?? []).length > 0 ? (
                <ol>
                  {(sessionNotes[sessionId] ?? []).map((note, index) => (
                    <li key={`${index}-${note}`}>{note}</li>
                  ))}
                </ol>
              ) : (
                <p>No conversations yet.</p>
              )}
            </div>
            <form
              className="cbm-side-composer"
              onSubmit={(event) => {
                event.preventDefault();
                const text = sideDraft.trim();
                if (!text) return;
                setSessionNotes((notes) => ({
                  ...notes,
                  [sessionId]: [...(notes[sessionId] ?? []), text],
                }));
                setSideDraft("");
              }}
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  event.currentTarget.querySelector("textarea")?.focus();
                }
              }}
            >
              <textarea
                value={sideDraft}
                rows={1}
                placeholder="Message Proforna"
                aria-label="Message Proforna"
                onChange={(event) => setSideDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.shiftKey) return;
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }}
              />
              <div className="cbm-side-composer-bar">
                <button type="submit" aria-label="Send" disabled={!sideDraft.trim()}>
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M8 12.5V3.5" />
                    <path d="M4.2 7.2 8 3.4l3.8 3.8" />
                  </svg>
                </button>
              </div>
            </form>
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
      {searchOpen ? (
        <div
          className="cbm-pop"
          role="dialog"
          aria-modal="true"
          aria-label="Search"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeSearch();
          }}
        >
          <div className="cbm-search-card">
            <label className="cbm-search-field">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="6" />
                <path d="m20 20-3.6-3.6" />
              </svg>
              <input
                autoFocus
                type="search"
                value={globalQuery}
                placeholder="Search…"
                aria-label="Search"
                onChange={(event) => setGlobalQuery(event.target.value)}
              />
            </label>
            <div className="cbm-search-results">
              {searchEmpty ? <p className="cbm-search-empty">Nothing matches that.</p> : null}
              {placeHits.length > 0 ? (
                <ul>
                  {placeHits.map((item) => (
                    <li key={item.id}>
                      <button type="button" onClick={() => pickPlace(item.id)}>
                        <strong>{item.label}</strong>
                        <span>{item.detail}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {roleHits.length > 0 ? (
                <ul>
                  {roleHits.map((role) => (
                    <li key={role.id}>
                      <button type="button" onClick={() => pickRole(role.id)}>
                        <strong>{role.organization || role.title || "Untitled"}</strong>
                        <span>{[role.title, formatHistoryPlace(role)].filter(Boolean).join(" · ")}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {updateHits.length > 0 ? (
                <ul>
                  {updateHits.map((item) => (
                    <li key={item.id}>
                      <button type="button" onClick={() => pickUpdate(item.id)}>
                        <strong>{item.organization}</strong>
                        <span>{item.kind} · {item.text}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
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
          <div className="cbm-pop-card cbm-settings-card">
            <header>
              <h2>Settings</h2>
              <button type="button" onClick={() => setSettingsOpen(false)}>
                Close
              </button>
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
              <button type="submit" disabled={settingsBusy}>
                {settingsBusy ? "Saving…" : "Save"}
              </button>
            </form>
          </div>
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
          <div className="cbm-pop-card">
            <header>
              <h2>{bioDialog === "know" ? "Get to know me" : bioDialog === "place" ? "Location" : "Contact"}</h2>
              <button type="button" onClick={() => setBioDialog(null)}>
                Close
              </button>
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
                <button type="submit">Leave a note</button>
              </form>
            )}
          </div>
        </div>
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
              <button type="button" onClick={() => void removePhoto()}>
                Remove
              </button>
            ) : null}
          </div>
        </div>
        <div className="cbm-job-body">
          <div className="cbm-title-row">
            <h2>{role.organization || "Untitled"}</h2>
            <button type="button" onClick={() => onOpen("edit")}>
              Edit
            </button>
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
          <button type="button" onClick={() => onOpen("people")}>
            Worked with
          </button>
          <button type="button" onClick={() => onOpen("more")}>
            More about this role
          </button>
          <button type="button" onClick={() => onOpen("canvas")}>
            Show on canvas
          </button>
        </div>
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
      <div className="cbm-pop-card">
        <header>
          <h2>{title}</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
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
            <button type="submit">Save</button>
          </form>
        ) : null}
      </div>
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

function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return letters || "SK";
}

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


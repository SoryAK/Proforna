import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Divider } from "@astryxdesign/core/Divider";
import { Popover } from "@astryxdesign/core/Popover";
import { TextInput } from "@astryxdesign/core/TextInput";
import type { OccupantNoticeHref } from "@core/notices";
import type { RelayStatus } from "@core/projection";
import { normalizeSlug, publicationLink, type WorkMapPublicationSettings } from "@core/work-map";
import { HOME_NAV_ID, Icon } from "./HomeNav";
import { HomeNotices } from "./HomeNotices";
import { RequestsMenu, useRequestsWaiting, type RequestsTab } from "./Requests";
import mark from "./branding/docier-mark.svg";
import { readPreviewPlacement } from "./preview-placement";
import { announceRelayChange, useRelayStatus } from "./relay-status";

export type HomeBioMode = "browse" | "preview" | "share";

export function HomeBar({
  name,
  headline,
  photoSrc,
  menuExpanded,
  menuLabel,
  onMenu,
  onSettings,
  onEditProfile,
  onSearch,
  onProforna,
  onRequests,
  profornaOpen,
  bioMode,
  onBioMode,
  onPreview,
  previewOpen = false,
  onExitPreview,
  notice = "",
  onNotice,
  revision = 0,
}: {
  name: string;
  headline: string;
  photoSrc: string | null;
  menuExpanded: boolean;
  menuLabel?: string;
  onMenu: () => void;
  onSettings: (section?: "profile" | "publication") => void;
  onEditProfile?: () => void;
  onSearch: () => void;
  onProforna?: () => void;
  /** Opens the full Requests dialog on a tab, optionally on one request. */
  onRequests?: (tab: RequestsTab, id?: string) => void;
  profornaOpen?: boolean;
  bioMode: HomeBioMode;
  onBioMode: (mode: HomeBioMode) => void;
  onPreview: (where: "here" | "window") => void;
  previewOpen?: boolean;
  onExitPreview?: () => void;
  notice?: string;
  onNotice: (href: OccupantNoticeHref) => void;
  revision?: number;
}) {
  const [menu, setMenu] = useState<"user" | "notices" | "publish" | "preview" | "relay" | "requests" | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publication, setPublication] = useState<PublicationDraft | null>(null);
  const [slugDraft, setSlugDraft] = useState("");
  const [visibilityNote, setVisibilityNote] = useState("");
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  const [publishNote, setPublishNote] = useState("");
  const [relayOrigin, setRelayOrigin] = useState<string | null>(null);
  const [linkNote, setLinkNote] = useState("");
  const [copiedUrl, setCopiedUrl] = useState("");
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const [settingsFailed, setSettingsFailed] = useState(false);
  const [settingsLoad, setSettingsLoad] = useState(0);
  const [heldPrivate, setHeldPrivate] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLElement>(null);
  // Popover needs a ref it can treat as set; the wrapper renders whenever Request does.
  const requestAnchor = useRef<HTMLDivElement>(null!);
  const menuTrigger = useRef<HTMLElement | null>(null);
  const shownMenu = useRef<typeof menu>(null);
  const root = useRef<HTMLDivElement>(null);
  const publicationRef = useRef(publication);
  const slugDraftRef = useRef(slugDraft);
  const publicationBusyRef = useRef(false);
  const settingsGeneration = useRef(0);
  const menuRef = useRef(menu);
  publicationRef.current = publication;
  slugDraftRef.current = slugDraft;
  const relay = useRelayStatus(revision);
  const relayState = relay?.state;
  const showPublish =
    !heldPrivate &&
    (relayState === "unpublished" || relayState === "changed" || relayState === "current");
  const publishLead =
    relayState === "unpublished" || (relayState === "changed" && (relay?.changes.length ?? 0) > 0);
  const publishPlan = describePublish(relay);
  const planId = useId();
  const menuId = useId();
  const visibilityId = useId();
  const letters = initials(name);
  const previewPlacement = readPreviewPlacement();
  const requestsWaiting = useRequestsWaiting();

  // Opening a menu moves focus into it; closing it gives focus back to the
  // button that opened it, unless the person already moved on elsewhere.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const was = shownMenu.current;
    shownMenu.current = menu;
    if (menu && menu !== was) {
      const active = document.activeElement;
      menuTrigger.current =
        active instanceof HTMLElement && bar.contains(active) && active.getAttribute("aria-expanded") !== null
          ? active
          : bar.querySelector<HTMLElement>('[aria-expanded="true"]');
      requestAnimationFrame(() => {
        const panel = bar.querySelector<HTMLElement>('[role="menu"], .home-sync-settings');
        const first =
          panel?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])') ??
          panel?.querySelector<HTMLElement>("button:not([disabled]), input:not([disabled]), a[href]");
        first?.focus();
      });
      return;
    }
    if (!menu && was) {
      const active = document.activeElement;
      const lost = !active || active === document.body || bar.contains(active);
      if (lost && menuTrigger.current?.isConnected) menuTrigger.current.focus();
      menuTrigger.current = null;
    }
  }, [menu]);

  // A phone has no room for the dropdown, so Request opens the full dialog there.
  function openRequests() {
    if (!onRequests) return;
    if (window.matchMedia("(max-width: 767px)").matches) {
      setMenu(null);
      onRequests("sent");
      return;
    }
    setMenu((current) => (current === "requests" ? null : "requests"));
  }

  function moveInMenu(event: ReactKeyboardEvent<HTMLElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const target = event.target as HTMLElement;
    const list = target.closest<HTMLElement>('[role="menu"]');
    if (!list) return;
    const items = [...list.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])')];
    if (items.length === 0) return;
    event.preventDefault();
    const at = items.indexOf(target);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (Math.max(at, 0) + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }

  useEffect(() => {
    if (!publishNote) return;
    const timer = window.setTimeout(() => setPublishNote(""), 8000);
    return () => window.clearTimeout(timer);
  }, [publishNote]);

  useEffect(() => {
    if (relay && relay.state !== "private") setHeldPrivate(false);
  }, [relay]);

  useEffect(() => {
    if (menu === "publish" && !showPublish) setMenu(null);
  }, [menu, showPublish]);

  useEffect(() => {
    if (menu !== "relay") return;
    const generation = settingsGeneration.current;
    let cancel = false;
    setSettingsReady(false);
    setSettingsFailed(false);
    setVisibilityNote("");
    setLinkNote("");
    setCopiedUrl("");
    setVisibilityOpen(false);
    void fetch("/api/work-map/settings")
      .then(async (response) => {
        if (!response.ok) throw new Error("load");
        const body = (await response.json()) as {
          settings?: WorkMapPublicationSettings;
          updatedAt?: string | null;
          relayOrigin?: string | null;
        };
        if (cancel || settingsGeneration.current !== generation || !body.settings) return;
        setRelayOrigin(body.relayOrigin ?? null);
        const next = { settings: body.settings, updatedAt: body.updatedAt ?? null };
        publicationRef.current = next;
        slugDraftRef.current = body.settings.slug;
        setPublication(next);
        setSlugDraft(body.settings.slug);
        setSettingsReady(true);
      })
      .catch(() => {
        if (cancel || settingsGeneration.current !== generation) return;
        setSettingsFailed(true);
        setVisibilityNote("Could not load the Relay settings.");
      });
    return () => {
      cancel = true;
    };
  }, [menu, settingsLoad]);

  useEffect(() => {
    if (!menu) return;
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      const insideBar = root.current?.contains(target);
      const insideSearch = searchRef.current?.contains(target);
      if (!insideBar && !insideSearch) setMenu(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(null);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  function publishFailure(code: string | undefined) {
    if (code === "slug-required") {
      return "Save a public slug in publication settings before publishing.";
    }
    if (code === "sections-required") {
      return "Choose at least one section in publication settings before publishing.";
    }
    if (code === "private-not-publishable") {
      return "A private Work Map cannot be published.";
    }
    return code ?? "The Work Map could not be published.";
  }

  async function confirmPublish() {
    if (publishing || publicationBusyRef.current) return;
    setPublishing(true);
    setPublishNote("");
    setMenu(null);
    try {
      const response = await fetch("/api/work-map/publish", { method: "POST" });
      if (response.ok) {
        setPublishNote(
          "Published this Work Map snapshot to the public link. Private edits stay local until you publish an update.",
        );
        announceRelayChange();
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setPublishNote(publishFailure(body.error));
    } catch {
      setPublishNote("The Work Map could not be published.");
    } finally {
      setPublishing(false);
    }
  }

  async function saveSettings(next: WorkMapPublicationSettings, failure: string) {
    const current = publicationRef.current;
    if (!current || publicationBusyRef.current) return;
    settingsGeneration.current += 1;
    publicationBusyRef.current = true;
    setVisibilityBusy(true);
    setVisibilityNote("");
    try {
      const response = await fetch("/api/work-map/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...next, updatedAt: current.updatedAt }),
      });
      if (response.status === 409) {
        setVisibilityNote("Publication settings changed. Open this again.");
        return;
      }
      if (!response.ok) {
        setVisibilityNote(failure);
        return;
      }
      const body = (await response.json()) as {
        settings?: WorkMapPublicationSettings;
        updatedAt?: string | null;
      };
      if (body.settings) {
        settingsGeneration.current += 1;
        const saved = { settings: body.settings, updatedAt: body.updatedAt ?? null };
        publicationRef.current = saved;
        slugDraftRef.current = body.settings.slug;
        setPublication(saved);
        setSlugDraft(body.settings.slug);
        setHeldPrivate(body.settings.visibility === "private");
        setSettingsReady(true);
      }
      announceRelayChange();
    } catch {
      setVisibilityNote(failure);
    } finally {
      publicationBusyRef.current = false;
      setVisibilityBusy(false);
    }
  }

  async function commitSlug() {
    const current = publicationRef.current;
    if (!current || publicationBusyRef.current) return;
    const slug = normalizeSlug(slugDraftRef.current);
    if (!slug) {
      slugDraftRef.current = current.settings.slug;
      setSlugDraft(current.settings.slug);
      setVisibilityNote("A public slug is required.");
      return;
    }
    if (slug === current.settings.slug) {
      if (slugDraftRef.current !== slug) {
        slugDraftRef.current = slug;
        setSlugDraft(slug);
      }
      return;
    }
    await saveSettings({ ...current.settings, slug }, "Could not save the public slug.");
  }

  async function chooseVisibility(value: WorkMapPublicationSettings["visibility"]) {
    const current = publicationRef.current;
    if (!current || publicationBusyRef.current || current.settings.visibility === value) return;
    await saveSettings({ ...current.settings, visibility: value }, "Could not save visibility.");
  }

  const link = publication
    ? publicationLink({
        origin: relayOrigin,
        slug: publication.settings.slug,
        visibility: publication.settings.visibility,
      })
    : null;
  const visibilityLabel =
    VISIBILITY_OPTIONS.find((option) => option.value === publication?.settings.visibility)?.short ?? "";

  async function copyLink() {
    if (!link?.ok) return;
    const url = link.url;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setLinkNote("");
    } catch {
      setCopiedUrl("");
      setLinkNote("Could not copy the link. Select it and copy instead.");
    }
  }

  async function withdrawPublication(id: string) {
    if (withdrawing) return;
    setWithdrawing(true);
    setVisibilityNote("");
    try {
      const response = await fetch(`/api/projections/${id}/revoke`, { method: "POST" });
      if (!response.ok) {
        setVisibilityNote("The snapshot is still on the Relay.");
        return;
      }
      setVisibilityNote("The snapshot was taken off the Relay.");
      announceRelayChange();
    } catch {
      setVisibilityNote("The snapshot is still on the Relay.");
    } finally {
      setWithdrawing(false);
    }
  }

  const commitSlugRef = useRef(commitSlug);
  commitSlugRef.current = commitSlug;

  useEffect(() => {
    const previous = menuRef.current;
    menuRef.current = menu;
    if (previous === "relay" && menu !== "relay") void commitSlugRef.current();
  }, [menu]);

  function publishMenu() {
    return (
      <div className="home-pub-menu is-publish" role="menu" aria-label="Publish">
        {publishPlan ? (
          <div className="home-pub-plan" id={planId}>
            <p>{publishPlan.lead}</p>
            {publishPlan.lines.length > 0 ? (
              <ul>
                {publishPlan.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          role="menuitem"
          aria-describedby={publishPlan ? planId : undefined}
          disabled={publishing || visibilityBusy}
          onClick={() => void confirmPublish()}
        >
          Confirm publish
        </button>
        <button type="button" role="menuitem" onClick={() => setMenu(null)}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <header className="home-bar" ref={barRef} onKeyDown={moveInMenu}>
      <div className="home-bar-start">
        <button
          type="button"
          className="home-menu-btn"
          aria-label={
            menuLabel ?? (menuExpanded ? "Collapse menu" : "Expand menu")
          }
          title={menuLabel ?? (menuExpanded ? "Collapse menu" : "Expand menu")}
          aria-expanded={menuLabel ? undefined : menuExpanded}
          aria-controls={menuLabel ? undefined : HOME_NAV_ID}
          onClick={onMenu}
        >
          <Icon name={menuExpanded ? "rail" : "railOff"} />
        </button>
        <img className="home-bar-mark" src={mark} alt="" />
        <p className="home-bar-brand">Docier</p>
      </div>
      <div className="home-bar-search" ref={searchRef}>
        <button
          type="button"
          className="home-search-pill"
          aria-label="Search"
          onClick={onSearch}
        >
          <Icon name="search" />
          <span>Search…</span>
          <kbd>{shortcutLabel()}</kbd>
        </button>
        <button
          type="button"
          className="home-search-icon"
          aria-label="Search"
          title="Search"
          onClick={onSearch}
        >
          <Icon name="search" />
        </button>
        <div className={`home-sync is-${relayState ?? "unknown"}`}>
          <button
            type="button"
            className="home-sync-track"
            aria-expanded={menu === "relay"}
            aria-label={relayName(relay)}
            onClick={() => setMenu((current) => (current === "relay" ? null : "relay"))}
          >
            <span className="home-sync-node is-you" aria-hidden="true" />
            <svg className="home-sync-link" viewBox="0 0 40 8" preserveAspectRatio="none" aria-hidden="true">
              <path d="M1 4H39" />
            </svg>
            <span className="home-sync-node is-relay" aria-hidden="true" />
            <span className="home-sync-label">Relay</span>
            {relayState === "changed" && (relay?.changes.length ?? 0) > 0 ? (
              <span className="home-sync-count">{relay?.changes.length}</span>
            ) : null}
          </button>
          {previewOpen || bioMode === "preview" ? (
            <button
              type="button"
              className="home-sync-ghost"
              onClick={() => {
                if (previewOpen) onExitPreview?.();
                else onBioMode("browse");
                setMenu(null);
              }}
            >
              Exit preview
            </button>
          ) : (
            <button
              type="button"
              className="home-sync-ghost is-preview"
              aria-expanded={previewPlacement === "ask" ? menu === "preview" : undefined}
              aria-haspopup={previewPlacement === "ask" ? "menu" : undefined}
              title={
                previewPlacement === "here"
                  ? "Preview in this window"
                  : previewPlacement === "window"
                    ? "Preview in a new window"
                    : "Preview"
              }
              onClick={() => {
                // Settings → Publication chooses where Preview opens; it only asks when set to ask.
                const placement = readPreviewPlacement();
                if (placement !== "ask") {
                  setMenu(null);
                  onPreview(placement);
                  return;
                }
                setMenu((current) => (current === "preview" ? null : "preview"));
              }}
            >
              Preview
            </button>
          )}
          {showPublish ? (
            <button
              type="button"
              className={publishLead ? "home-sync-send is-lead" : "home-sync-send"}
              aria-expanded={menu === "publish"}
              aria-haspopup="menu"
              onClick={() => setMenu((current) => (current === "publish" ? null : "publish"))}
            >
              Publish
            </button>
          ) : null}
          {menu === "relay" ? (
            <div className="home-pub-menu home-sync-menu home-sync-settings">
              <div className="home-pub-plan">
                <p>{relayLead(relay, publishPlan)}</p>
                {relay?.state === "private" && relay.projectionId ? (
                  <button
                    type="button"
                    disabled={withdrawing}
                    onClick={() => {
                      if (relay.state === "private" && relay.projectionId) {
                        void withdrawPublication(relay.projectionId);
                      }
                    }}
                  >
                    Take it off the Relay
                  </button>
                ) : null}
                {publishPlan && publishPlan.lines.length > 0 ? (
                  <ul>
                    {publishPlan.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
              {bioMode !== "preview" && !previewOpen ? (
                // Shown only on narrow screens, where the Preview button is hidden.
                <div className="home-sync-preview" role="group" aria-label="Preview">
                  {previewPlacement === "ask" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          onPreview("here");
                          setMenu(null);
                        }}
                      >
                        Preview in this window
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onPreview("window");
                          setMenu(null);
                        }}
                      >
                        Preview in a new window
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        onPreview(previewPlacement);
                        setMenu(null);
                      }}
                    >
                      Preview
                    </button>
                  )}
                </div>
              ) : null}
              {link ? (
                <div className="home-sync-address">
                  <p className="home-sync-setting">Public link</p>
                  {link.ok ? (
                    <div className="home-sync-address-row">
                      <span className="home-sync-address-url" title={link.url}>
                        {link.url}
                      </span>
                      <button type="button" className="home-sync-copy" onClick={() => void copyLink()}>
                        Copy
                      </button>
                    </div>
                  ) : (
                    <p className="home-sync-address-gap">{linkGap(link.reason)}</p>
                  )}
                  {link?.ok && copiedUrl === link.url ? (
                    <p className="home-sync-address-gap" role="status">
                      Copied.
                    </p>
                  ) : linkNote ? (
                    <p className="home-sync-address-gap" role="status">
                      {linkNote}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div
                className="home-sync-slug"
                onBlur={(event) => {
                  const next = event.relatedTarget;
                  if (next instanceof Node && event.currentTarget.contains(next)) return;
                  void commitSlug();
                }}
              >
                <TextInput
                  label="Public slug"
                  size="sm"
                  width="100%"
                  value={slugDraft}
                  isDisabled={!settingsReady || visibilityBusy}
                  onChange={(value) => {
                    slugDraftRef.current = value;
                    setSlugDraft(value);
                  }}
                  onEnter={() => {
                    void commitSlug();
                  }}
                />
              </div>
              <button
                type="button"
                className="home-sync-visibility"
                aria-expanded={visibilityOpen}
                aria-controls={visibilityId}
                disabled={!settingsReady}
                onClick={() => setVisibilityOpen((open) => !open)}
              >
                <span>Visibility</span>
                <span className="home-sync-visibility-value">{visibilityLabel}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
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
              {visibilityOpen ? (
                <div
                  role="radiogroup"
                  aria-label="Visibility"
                  id={visibilityId}
                  onKeyDown={(event) => {
                    if (!settingsReady || visibilityBusy) return;
                    if (
                      event.key !== "ArrowDown" &&
                      event.key !== "ArrowUp" &&
                      event.key !== "ArrowLeft" &&
                      event.key !== "ArrowRight"
                    ) {
                      return;
                    }
                    event.preventDefault();
                    const index = VISIBILITY_OPTIONS.findIndex(
                      (option) => option.value === publicationRef.current?.settings.visibility,
                    );
                    const delta = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
                    const next =
                      VISIBILITY_OPTIONS[
                        (Math.max(0, index) + delta + VISIBILITY_OPTIONS.length) % VISIBILITY_OPTIONS.length
                      ];
                    if (!next) return;
                    void chooseVisibility(next.value);
                    const group = event.currentTarget;
                    queueMicrotask(() => {
                      group.querySelector<HTMLButtonElement>(`[data-visibility="${next.value}"]`)?.focus();
                    });
                  }}
                >
                  {VISIBILITY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      data-visibility={option.value}
                      aria-checked={publication?.settings.visibility === option.value}
                      disabled={!settingsReady || visibilityBusy}
                      onClick={() => void chooseVisibility(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : null}
              {settingsFailed ? (
                <button type="button" onClick={() => setSettingsLoad((load) => load + 1)}>
                  Try again
                </button>
              ) : null}
              {visibilityNote ? <p className="home-sync-setting-note">{visibilityNote}</p> : null}
            </div>
          ) : null}
          {menu === "preview" && bioMode !== "preview" ? (
            <div className="home-pub-menu home-sync-menu" role="menu" aria-label="Preview">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onPreview("here");
                  setMenu(null);
                }}
              >
                This window
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onPreview("window");
                  setMenu(null);
                }}
              >
                New window
              </button>
            </div>
          ) : null}
          {menu === "publish" && showPublish ? publishMenu() : null}
        </div>
      </div>
      <div className="home-bar-end" ref={root}>
        {publishNote || notice ? (
          <p className="home-pub-status" role="status">
            {publishNote || notice}
          </p>
        ) : null}
        {onRequests ? (
          <div className="home-request" ref={requestAnchor}>
            <button
              type="button"
              className="home-request-btn"
              aria-label={requestsWaiting ? `Request, ${requestsWaiting} waiting on you` : undefined}
              aria-expanded={menu === "requests"}
              aria-haspopup="menu"
              onClick={openRequests}
            >
              <span className="home-request-node" aria-hidden="true" />
              <svg className="home-request-link" viewBox="0 0 40 8" preserveAspectRatio="none" aria-hidden="true">
                <path d="M1 4H39" />
              </svg>
              <span className="home-request-plane" aria-hidden="true">
                <Icon name="request" />
              </span>
              <span className="home-request-label">Request</span>
              {requestsWaiting ? (
                <span className="home-notice-count" aria-hidden="true">
                  {requestsWaiting > 9 ? "9+" : requestsWaiting}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              className="home-notice-btn home-request-icon"
              aria-label={requestsWaiting ? `Request, ${requestsWaiting} waiting on you` : "Request"}
              title="Request"
              aria-expanded={menu === "requests"}
              aria-haspopup="menu"
              onClick={openRequests}
            >
              <Icon name="request" />
              {requestsWaiting ? (
                <span className="home-notice-count" aria-hidden="true">
                  {requestsWaiting > 9 ? "9+" : requestsWaiting}
                </span>
              ) : null}
            </button>
            <Popover
              anchorRef={requestAnchor}
              isOpen={menu === "requests"}
              onOpenChange={(open) => {
                if (!open) setMenu((current) => (current === "requests" ? null : current));
              }}
              placement="below"
              alignment="end"
              width={380}
              padding={0}
              label="Requests"
              content={
                <RequestsMenu
                  onNew={() => {
                    setMenu(null);
                    onRequests("new");
                  }}
                  onOpen={(tab, id) => {
                    setMenu(null);
                    onRequests(tab, id);
                  }}
                />
              }
            />
          </div>
        ) : null}
        {onRequests && onProforna ? (
          <span className="home-bar-request-divider">
            <Divider orientation="vertical" variant="strong" />
          </span>
        ) : null}
        {onProforna ? (
          <button
            type="button"
            className={
              profornaOpen
                ? "home-notice-btn home-proforna-toggle is-current"
                : "home-notice-btn home-proforna-toggle"
            }
            aria-label={profornaOpen ? "Hide Docier" : "Show Docier"}
            title={profornaOpen ? "Hide Docier" : "Show Docier"}
            aria-pressed={profornaOpen}
            onClick={onProforna}
          >
            <Icon name={profornaOpen ? "panel" : "panelOff"} />
          </button>
        ) : null}
        <HomeNotices
          open={menu === "notices"}
          onToggle={() =>
            setMenu((current) => (current === "notices" ? null : "notices"))
          }
          onSelect={(href) => {
            setMenu(null);
            onNotice(href);
          }}
        />
        <div className="home-user">
          <button
            type="button"
            className="home-user-chip"
            aria-label={headline ? `${name}, ${headline}` : name}
            aria-expanded={menu === "user"}
            aria-haspopup="menu"
            aria-controls={menuId}
            onClick={() =>
              setMenu((current) => (current === "user" ? null : "user"))
            }
          >
            {photoSrc ? (
              <img className="home-user-photo" src={photoSrc} alt="" width={32} height={32} />
            ) : (
              <span className="home-user-photo home-user-fallback" aria-hidden="true">
                {letters}
              </span>
            )}
            <span className="home-user-copy">
              <span className="home-user-name">{name}</span>
              {headline ? <span className="home-user-role">{headline}</span> : null}
            </span>
            <svg className="home-user-caret" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
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
          {menu === "user" ? (
            <div className="home-user-menu" id={menuId} role="menu">
              <div className="home-user-card">
                {photoSrc ? (
                  <img className="home-user-photo" src={photoSrc} alt="" width={36} height={36} />
                ) : (
                  <span className="home-user-photo home-user-fallback" aria-hidden="true">
                    {letters}
                  </span>
                )}
                <div>
                  <p className="home-user-name">{name}</p>
                  {headline ? <p className="home-user-role">{headline}</p> : null}
                </div>
              </div>
              {onEditProfile ? (
                <button
                  type="button"
                  className="home-user-item"
                  role="menuitem"
                  onClick={() => {
                    setMenu(null);
                    onEditProfile();
                  }}
                >
                  Edit profile
                </button>
              ) : null}
              <button
                type="button"
                className="home-user-item"
                role="menuitem"
                onClick={() => {
                  setMenu(null);
                  onSettings("publication");
                }}
              >
                Publication
              </button>
              <button
                type="button"
                className="home-user-item"
                role="menuitem"
                onClick={() => {
                  setMenu(null);
                  onSettings();
                }}
              >
                Settings
              </button>
              <div className="home-user-separator" role="separator" />
              <a
                className="home-user-item"
                role="menuitem"
                href="/api/portability/export"
                download="docier-backup.zip"
                onClick={() => setMenu(null)}
              >
                Export backup
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

const VISIBILITY_OPTIONS: Array<{
  value: WorkMapPublicationSettings["visibility"];
  label: string;
  short: string;
}> = [
  { value: "public", label: "Public", short: "Public" },
  { value: "unlisted", label: "Unlisted", short: "Unlisted" },
  { value: "access-controlled", label: "Access controlled", short: "Access controlled" },
  { value: "stealth", label: "Stealth — hide identity", short: "Stealth" },
  { value: "anonymous", label: "Anonymous — redact career detail", short: "Anonymous" },
  { value: "private", label: "Private — keep off the relay", short: "Private" },
];

function linkGap(reason: "private" | "access-controlled" | "slug" | "origin"): string {
  if (reason === "private") return "A private career has no public link.";
  if (reason === "access-controlled") return "An access-controlled career uses its own link.";
  if (reason === "slug") return "Save a public slug to get a link.";
  return "The link appears once the Relay is connected.";
}

type PublicationDraft = {
  settings: WorkMapPublicationSettings;
  updatedAt: string | null;
};

function relayName(relay: RelayStatus | null): string {
  if (!relay) return "Relay, status unknown";
  if (relay.state === "private") {
    return relay.publishedAt ? "Relay, private, snapshot still published" : "Relay, private";
  }
  if (relay.state === "unpublished") return "Relay, not published";
  if (relay.state === "current") return "Relay, up to date";
  const count = relay.changes.length;
  return count > 0 ? `Relay, ${count} ${count === 1 ? "change" : "changes"}` : "Relay, changes to publish";
}

function relayLead(
  relay: RelayStatus | null,
  plan: { lead: string; lines: string[] } | null,
): string {
  if (!relay) return "The Relay status has not come back yet.";
  if (relay.state === "private") {
    return relay.publishedAt
      ? "A published snapshot is still on the Relay."
      : "A private career stays off the Relay.";
  }
  return plan?.lead ?? "The Relay status has not come back yet.";
}

function describePublish(relay: RelayStatus | null): { lead: string; lines: string[] } | null {
  if (!relay || relay.state === "private") return null;
  if (relay.state === "unpublished") {
    return { lead: "This puts your career on the Relay for the first time.", lines: [] };
  }
  if (relay.state === "current") {
    return { lead: "The Relay already matches your career.", lines: [] };
  }
  const since = new Date(relay.publishedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return relay.changes.length > 0
    ? { lead: `Since ${since}:`, lines: relay.changes }
    : { lead: "Only private details changed. The Relay looks the same.", lines: [] };
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function shortcutLabel(): string {
  if (typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform)) {
    return "⌘K";
  }
  return "Ctrl K";
}

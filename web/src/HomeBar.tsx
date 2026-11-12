import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { ButtonGroup } from "@astryxdesign/core/ButtonGroup";
import type { OccupantNoticeHref } from "@core/notices";
import { publicationEmbed } from "@core/work-map";
import { HOME_NAV_ID, Icon } from "./HomeNav";
import { HomeNotices } from "./HomeNotices";
import mark from "./proforna-mark.svg";

export type HomeBioMode = "browse" | "preview" | "share";

export function HomeBar({
  name,
  headline,
  photoSrc,
  menuExpanded,
  menuLabel,
  onMenu,
  onSettings,
  onSearch,
  onProforna,
  profornaOpen,
  bioMode,
  onBioMode,
  onPreview,
  previewOpen = false,
  onExitPreview,
  notice = "",
  onNotice,
}: {
  name: string;
  headline: string;
  photoSrc: string | null;
  menuExpanded: boolean;
  menuLabel?: string;
  onMenu: () => void;
  onSettings: () => void;
  onSearch: () => void;
  onProforna?: () => void;
  profornaOpen?: boolean;
  bioMode: HomeBioMode;
  onBioMode: (mode: HomeBioMode) => void;
  onPreview: (where: "here" | "window") => void;
  previewOpen?: boolean;
  onExitPreview?: () => void;
  notice?: string;
  onNotice: (href: OccupantNoticeHref) => void;
}) {
  const [menu, setMenu] = useState<"user" | "notices" | "publish" | "preview" | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishNote, setPublishNote] = useState("");
  const [share, setShare] = useState<{ note: string; page?: string; code?: string } | null>(null);
  const [copied, setCopied] = useState<"link" | "frame" | null>(null);
  const [searchMax, setSearchMax] = useState<number | null>(null);
  const barRef = useRef<HTMLElement>(null);
  const startRef = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const letters = initials(name);

  useLayoutEffect(() => {
    const header = barRef.current;
    const brand = startRef.current;
    const end = root.current;
    if (!header || !brand || !end) return;
    const fit = () => {
      const side = Math.max(brand.offsetWidth, end.offsetWidth);
      const room = Math.max(header.clientWidth - side * 2 - 24, 0);
      setSearchMax((current) => (current === room ? current : room));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(header);
    observer.observe(brand);
    observer.observe(end);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!menu && !share) return;
    function onPointer(event: MouseEvent) {
      if (root.current && !root.current.contains(event.target as Node)) {
        setMenu(null);
        setShare(null);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenu(null);
        setShare(null);
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu, share]);

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

  async function openShare() {
    setShare({ note: "Loading the share link…" });
    setCopied(null);
    try {
      const [settingsResponse, publicationResponse] = await Promise.all([
        fetch("/api/work-map/settings"),
        fetch("/api/projections"),
      ]);
      if (!settingsResponse.ok) {
        setShare({ note: "Could not load the share link." });
        return;
      }
      const body = (await settingsResponse.json()) as {
        settings?: { slug?: string; visibility?: string };
        relayOrigin?: string | null;
      };
      const settings = body.settings;
      if (!settings || typeof settings.visibility !== "string") {
        setShare({ note: "Could not load the share link." });
        return;
      }
      const embed = publicationEmbed({
        origin: body.relayOrigin,
        slug: settings.slug ?? "",
        visibility: settings.visibility as Parameters<typeof publicationEmbed>[0]["visibility"],
      });
      if (!embed.ok) {
        setShare({
          note:
            embed.reason === "private"
              ? "A private career stays off the relay, so there is no link to share."
              : embed.reason === "access-controlled"
                ? "An access-controlled career uses its own link, so there is no public link to copy."
                : embed.reason === "slug"
                  ? "Save a public slug in publication settings before sharing."
                  : "The share link appears once the relay is connected.",
        });
        return;
      }
      let published = false;
      if (publicationResponse.ok) {
        const listed = (await publicationResponse.json()) as {
          projections?: Array<{ slug: string; status: string }>;
        };
        published = (listed.projections ?? []).some(
          (item) => item.slug === settings.slug && item.status === "published",
        );
      }
      setShare({
        page: embed.page.replace(/\?embed=1$/, ""),
        code: embed.code,
        note: published
          ? "This link shows the published career. A later edit stays private until you publish again."
          : "Publish once, then this link shows the career. A later edit stays private until you publish again.",
      });
    } catch {
      setShare({ note: "Could not load the share link." });
    }
  }

  function copyShare(value: string, which: "link" | "frame") {
    void navigator.clipboard.writeText(value).then(
      () => {
        setCopied(which);
        window.setTimeout(() => setCopied((current) => (current === which ? null : current)), 2000);
      },
      () => setCopied(null),
    );
  }

  async function confirmPublish() {
    if (publishing) return;
    setPublishing(true);
    setPublishNote("");
    setMenu(null);
    try {
      const response = await fetch("/api/work-map/publish", { method: "POST" });
      if (response.ok) {
        setPublishNote(
          "Published this Work Map snapshot to the public link. Private edits stay local until you publish an update.",
        );
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

  return (
    <header
      className="home-bar"
      ref={barRef}
      style={searchMax == null ? undefined : { ["--home-search-max" as string]: `${searchMax}px` }}
    >
      <div className="home-bar-start" ref={startRef}>
        <button
          type="button"
          className="home-menu-btn"
          aria-label={
            menuLabel ?? (menuExpanded ? "Collapse menu" : "Expand menu")
          }
          aria-expanded={menuLabel ? undefined : menuExpanded}
          aria-controls={menuLabel ? undefined : HOME_NAV_ID}
          onClick={onMenu}
        >
          <Icon name={menuExpanded ? "rail" : "railOff"} />
        </button>
        <img className="home-bar-mark" src={mark} alt="" />
        <p className="home-bar-brand">Proforna</p>
      </div>
      <div className="home-bar-search">
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
          onClick={onSearch}
        >
          <Icon name="search" />
        </button>
      </div>
      <div className="home-bar-end" ref={root}>
        <div className="home-pub">
          <ButtonGroup label="Publication" size="sm">
            <Button
              label="Publish"
              variant="primary"
              size="sm"
              aria-expanded={menu === "publish"}
              aria-haspopup="menu"
              onClick={() => setMenu((current) => (current === "publish" ? null : "publish"))}
            />
            {previewOpen || bioMode === "preview" ? (
              <Button
                label="Exit preview"
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (previewOpen) onExitPreview?.();
                  else onBioMode("browse");
                  setMenu(null);
                }}
              />
            ) : (
              <Button
                label="Preview"
                variant="secondary"
                size="sm"
                aria-expanded={menu === "preview"}
                aria-pressed={bioMode !== "browse"}
                aria-haspopup="menu"
                onClick={() => setMenu((current) => (current === "preview" ? null : "preview"))}
              />
            )}
          </ButtonGroup>
          {menu === "publish" ? (
            <div className="home-pub-menu is-publish" role="menu" aria-label="Publish">
              <button
                type="button"
                role="menuitem"
                disabled={publishing}
                onClick={() => void confirmPublish()}
              >
                Confirm publish
              </button>
              <button type="button" role="menuitem" onClick={() => setMenu(null)}>
                Cancel
              </button>
            </div>
          ) : null}
          {menu === "preview" && bioMode !== "preview" ? (
            <div className="home-pub-menu" role="menu" aria-label="Preview and share">
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
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(null);
                  void openShare();
                }}
              >
                Edit for sharing
              </button>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={bioMode === "browse"}
                onClick={() => {
                  onBioMode("browse");
                  setMenu(null);
                }}
              >
                Browsing
              </button>
            </div>
          ) : null}
          {share ? (
            <div className="home-pub-share" role="dialog" aria-label="Share">
              <p>{share.note}</p>
              {share.page ? <p className="home-pub-share-link">{share.page}</p> : null}
              {share.page && share.code ? (
                <div className="home-pub-share-actions">
                  <button type="button" onClick={() => copyShare(share.page ?? "", "link")}>
                    {copied === "link" ? "Copied" : "Copy link"}
                  </button>
                  <button type="button" onClick={() => copyShare(share.code ?? "", "frame")}>
                    {copied === "frame" ? "Copied" : "Copy frame"}
                  </button>
                </div>
              ) : null}
              <button type="button" onClick={() => setShare(null)}>
                Close
              </button>
            </div>
          ) : null}
          {publishNote || notice ? (
            <p className="home-pub-status" role="status">
              {publishNote || notice}
            </p>
          ) : null}
        </div>
        {onProforna ? (
          <button
            type="button"
            className={
              profornaOpen
                ? "home-notice-btn home-proforna-toggle is-current"
                : "home-notice-btn home-proforna-toggle"
            }
            aria-label={profornaOpen ? "Hide Proforna" : "Show Proforna"}
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
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
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

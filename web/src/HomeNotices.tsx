import { useEffect, useId, useState } from "react";
import type { OccupantNotice, OccupantNoticeHref } from "@core/notices";
import { Icon } from "./HomeNav";

export function HomeNotices({
  open,
  onToggle,
  onSelect,
}: {
  open: boolean;
  onToggle: () => void;
  onSelect: (href: OccupantNoticeHref) => void;
}) {
  const panelId = useId();
  const [notices, setNotices] = useState<OccupantNotice[]>([]);

  useEffect(() => {
    void loadNotices(setNotices);
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadNotices(setNotices);
  }, [open]);

  useEffect(() => {
    function onFocus() {
      void loadNotices(setNotices);
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const count = notices.length;
  const label = count ? `Notices, ${count} waiting` : "Notices";

  return (
    <div className="home-notice">
      <button
        type="button"
        className="home-notice-btn"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={panelId}
        onClick={onToggle}
      >
        <Icon name="notice" />
        {count ? (
          <span className="home-notice-count" aria-hidden="true">
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="home-notice-panel" id={panelId} role="menu">
          <p className="home-notice-heading">Notices</p>
          {count ? (
            notices.map((notice) => (
              <button
                key={notice.id}
                type="button"
                className="home-notice-item"
                role="menuitem"
                onClick={() => onSelect(notice.href)}
              >
                <span className="home-notice-title">{notice.title}</span>
                <span className="home-notice-detail">{notice.detail}</span>
              </button>
            ))
          ) : (
            <p className="home-notice-empty">Nothing needs attention.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

async function loadNotices(
  setNotices: (notices: OccupantNotice[]) => void,
) {
  try {
    const response = await fetch("/api/notices");
    if (!response.ok) return;
    const body = (await response.json()) as { notices?: OccupantNotice[] };
    if (Array.isArray(body.notices)) setNotices(body.notices);
  } catch {
    /* keep the last list if the vault is unreachable */
  }
}

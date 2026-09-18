import { useEffect, useId, useMemo, useRef, useState } from "react";
import { searchCareerFile } from "@core/career-search";
import type { CareerFile } from "@core/career-file";
import { Icon } from "./HomeNav";

type Place = {
  id: "home" | "profile" | "settings";
  label: string;
  detail: string;
};

const PLACES: Place[] = [
  { id: "home", label: "Home", detail: "Your career file" },
  { id: "profile", label: "Profile", detail: "Name, headline, links" },
  { id: "settings", label: "Settings", detail: "Profile and models" },
];

export function HomeSearch({
  open,
  career,
  onClose,
  onHome,
  onProfile,
  onSettings,
}: {
  open: boolean;
  career: CareerFile;
  onClose: () => void;
  onHome: () => void;
  onProfile: () => void;
  onSettings: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const [query, setQuery] = useState("");

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open) {
      if (!node.open) node.showModal();
      window.setTimeout(() => input.current?.focus(), 0);
      return;
    }
    if (node.open) node.close();
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const needle = query.trim().toLowerCase();
  const places = useMemo(
    () =>
      PLACES.filter((place) => {
        if (!needle) return true;
        return `${place.label} ${place.detail}`.toLowerCase().includes(needle);
      }),
    [needle],
  );
  const hits = useMemo(
    () => searchCareerFile(career, query),
    [career, query],
  );
  const empty = places.length === 0 && hits.length === 0;

  function pickPlace(id: Place["id"]) {
    onClose();
    if (id === "profile") onProfile();
    if (id === "settings") onSettings();
    if (id === "home") onHome();
  }

  return (
    <dialog
      ref={dialog}
      className="home-search-dialog"
      inert={!open}
      onClose={onClose}
      aria-labelledby={titleId}
    >
      <h2 id={titleId} className="sr-only">
        Search
      </h2>
      <label className="home-search-field">
        <Icon name="search" />
        <input
          ref={input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <div className="home-search-results">
        {empty ? (
          <p className="home-search-empty">Nothing matches that.</p>
        ) : null}
        {places.length > 0 ? (
          <ul className="home-search-group">
            {places.map((place) => (
              <li key={place.id}>
                <button
                  type="button"
                  className="home-search-hit"
                  onClick={() => pickPlace(place.id)}
                >
                  <strong>{place.label}</strong>
                  <span>{place.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {hits.length > 0 ? (
          <ul className="home-search-group">
            {hits.map((hit) => (
              <li key={`${hit.kind}:${hit.id}`}>
                <p className="home-search-hit">
                  <strong>{hit.title}</strong>
                  <span>{hit.detail}</span>
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </dialog>
  );
}

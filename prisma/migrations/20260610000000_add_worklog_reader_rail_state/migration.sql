-- ADR-0023 — Worklog reader right-rail per-user state.
-- Adds two columns to WorkLogPreference for the right-rail surface
-- introduced by the Tolaria pattern #1 redesign:
--   * readerRailTab       — last-active tab key (backlinks|history|tags|photos)
--   * readerRailCollapsed — whether the 320px content panel is hidden
--
-- Defaults are set so existing rows backfill without a separate UPDATE.

ALTER TABLE "WorkLogPreference"
  ADD COLUMN "readerRailTab" TEXT NOT NULL DEFAULT 'backlinks',
  ADD COLUMN "readerRailCollapsed" BOOLEAN NOT NULL DEFAULT false;

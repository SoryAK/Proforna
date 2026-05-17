# 0005 — Use @googlemaps/js-api-loader v2 Standalone API

- **Status:** Accepted
- **Date:** 2026-05-17 (backfilled)
- **Deciders:** Sory Kaba
- **Tags:** frontend, maps, integrations

## Context and Problem Statement

The job-map feature requires loading the Google Maps JavaScript API + Places + Drawing + Geometry libraries on demand. The previous `@googlemaps/js-api-loader` v1 exposed a `Loader` class with a `load()` method that returned the `google` global.

**v2 of the package removed the `Loader` class entirely.** Migration requires switching to the standalone `setOptions()` + `importLibrary()` API pattern. The option keys also changed: `apiKey` → `key`, `version` → `v`.

## Decision Drivers

- Stay current with Google's supported loader pattern
- Avoid loading unused libraries (we want lazy `importLibrary("maps")`, `importLibrary("drawing")`, etc.)
- Minimal client bundle impact
- Compatibility with our existing job-map usage (drawing, polygons, places)

## Considered Options

- **Option A** — Migrate to `@googlemaps/js-api-loader` v2 standalone API
- **Option B** — Pin to `@googlemaps/js-api-loader@1.x` indefinitely
- **Option C** — Write our own loader script tag injection (no package)
- **Option D** — Use `@react-google-maps/api` wrapper

## Decision Outcome

**Chosen option: "Migrate to v2 standalone API"**, because v1 is unmaintained going forward and the standalone API is the pattern Google officially documents. The `setOptions()` + `importLibrary()` shape also better matches our lazy-loading needs (we don't load `drawing` unless the user enters draw mode).

### Positive Consequences

- Aligned with Google's official loader documentation
- True lazy library loading (`importLibrary("drawing")` only when needed)
- Smaller initial bundle since libraries load on-demand

### Negative Consequences

- **Hard API break vs. v1**: no `Loader` class, must rewrite all init sites
- Option-key renames (`apiKey` → `key`, `version` → `v`) are easy to miss
- **Order matters**: `setOptions()` must be called *before* any `importLibrary()` — calling them out of order silently fails or uses stale config

## Pros and Cons of the Options

### Option A — js-api-loader v2 standalone API

- ✅ Official, maintained path
- ✅ Lazy library loading by design
- ❌ Setup-order foot-gun (`setOptions` before `importLibrary`)
- ❌ Option-key renames cause silent misconfig if missed

### Option B — Pin to v1

- ✅ Zero migration today
- ❌ Unmaintained — security/compat risk over time
- ❌ Forces eventual migration anyway

### Option C — Roll our own script tag injection

- ✅ Zero dependency
- ❌ We re-implement: idempotent loading, library tracking, error handling
- ❌ Reinventing a solved problem

### Option D — `@react-google-maps/api`

- ✅ Declarative React wrapper, less imperative
- ❌ Heavier abstraction, harder to drop into existing imperative map/draw code
- ❌ Extra indirection layer for advanced Drawing/Places usage

## Links / References

- [@googlemaps/js-api-loader v2 README](https://www.npmjs.com/package/@googlemaps/js-api-loader)
- User memory: `~/memories/resumsify-lessons.md` "@googlemaps/js-api-loader v2" gotchas

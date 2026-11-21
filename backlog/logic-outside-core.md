# Logic outside core

Some management rules live in routes, server stores, or screens instead of `core/`, which AGENTS.md says owns them.

## Problem

- `server/work-map.ts` holds map settings, role merge, and photo rules.
- `server/app.ts` holds the place-lookup fallback between map providers and a second copy of the application stage list.
- `web/src/DuplicateReview.tsx` scores duplicate roles in the browser, so the server and any other client cannot share that judgment.

## Direction

Move each rule into `core/` as a pure function with tests, and have the server or screen call it. Keep behavior the same; this is a move, not a redesign. Do one area per pull request so each is easy to review. Start with the stage list, since a second copy can drift from the first.

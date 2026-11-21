# Large files

A few files are too large to review or change safely.

## Problem

`web/src/RoleCanvas.tsx` is about 5,600 lines and `server/app.ts` about 2,700. Every change to them touches a file no one can hold in mind, and merges conflict often.

## Direction

Split by what a reader looks for. For `app.ts`, group routes by area (career history, opportunities, documents, publication, settings) into their own modules that register on the app. For `RoleCanvas.tsx`, pull out the shared-save logic, the drag and panel handlers, and the side panels. Move code without changing it, one area per pull request, with tests passing before and after. Pairs well with [logic outside core](logic-outside-core.md), but do them separately.

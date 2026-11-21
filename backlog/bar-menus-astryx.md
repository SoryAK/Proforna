# Bar menus on Astryx

The top bar's menus are hand-made; the Requests dropdown is an Astryx Popover.

## Problem

Relay, Preview, Publish, notices, and the profile menu each draw their own absolutely positioned box and style every button inside it (`.home-pub-menu button`). They carry their own focus and arrow-key handling in `HomeBar.tsx`. Requests uses an Astryx `Popover` with a `List`, so the bar now has two ways of opening a menu.

## Direction

Move each bar menu to Astryx: `Popover` for panels that hold settings or lists (Relay, notices, Requests), `DropdownMenu` for plain lists of actions (Preview, Publish, profile). Keep what each menu says and does. Drop the shared `.home-pub-menu button` rule once nothing uses it, and the hand-written focus and arrow-key code once the components provide it.

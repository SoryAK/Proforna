---
target: the career history canvas
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/skaba/Dev_Projects/resumsify/resumsify/web/src/RoleCanvas.tsx"
target_fingerprint: "sha256:5d4614eeb53879a780ef35e95a1588ac93cb1292ae49c9711d857f3ba2ccd994"
target_path: /home/skaba/Dev_Projects/resumsify/resumsify/web/src/RoleCanvas.tsx
timestamp: 2026-10-29T15-54-01Z
slug: web-src-rolecanvas-tsx
---
Method: dual-agent (A: 29c0935f-d96c-4f04-9647-61d7bc998d57 · B: 055d4361-8a97-4d3b-9ca8-3a9538cbd86a)

# Career canvas critique

Target: `web/src/RoleCanvas.tsx` and `web/src/role-canvas.css`. Live page: `http://127.0.0.1:5173/#/history`, opened with **Show on canvas** on Giants Direct.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | The role board opened as an empty grid at 106%; the only card sat off-screen until Zoom to fit. The editor kept showing that role after Foldable was current. |
| 2 | Match System / Real World | 2 | The board is a design study (Foldable, Hinge notes), while the role’s achievements stay in the column and the card body is the raw work-condition paragraph. |
| 3 | User Control and Freedom | 2 | Close, Done, and in-session Ctrl+Z exist. There is no visible Undo, and Remove has no confirm. |
| 4 | Consistency and Standards | 2 | Green Save and History, orange kind labels, and a white page card break the gold-is-signal rule used on the rest of the ledger. |
| 5 | Error Prevention | 2 | Remove can delete the role card in one click, and Save does not put the arrangement back on the next open. |
| 6 | Recognition Rather Than Recall | 2 | Select, Pan, Add, zoom, fit, and the wire ports are icon-only. Shortcuts appear only inside the right-click menu. |
| 7 | Flexibility and Efficiency | 3 | Marquee, groups, copy, duplicate, lock, restack, minimap, and the Ctrl shortcuts are real. They do not place existing evidence. |
| 8 | Aesthetic and Minimalist Design | 2 | The fitted graph is quiet. The editor, the green pair, the sample boards, and the map underneath compete with the card. |
| 9 | Error Recovery | 2 | Undo works until the role reseeds. History on Foldable said “Nothing saved for this canvas yet.” |
| 10 | Help and Documentation | 1 | An empty board has no hint. The only shortcut legend is the context menu. |
| **Total** | | **20/40** | **Acceptable** |

## Design Specificity Verdict

**Interchangeable, with a thin Proforna skin.**

The window is near-black, the stage is a gold dot grid, wires are warm, and the selected card gets an illuminated-gold ring. That much belongs to this ledger. The rest could ship on any whiteboard: a green Save and History, orange kind labels, a white page card, a pill of Select / Pan / Find a node / Add, and kinds named Design, Demonstration, Video, Photo, and Page. On a Mechatronics and Robotics Technician role, Studies lists Foldable and Hinge study, and a card talks about a foldable product. The window title stays the role name while that other board is current. Filled gold is not what marks Save or the selected tool.

**Deterministic scan.** `impeccable detect` on `web/src/RoleCanvas.tsx` exited 0 with `[]`. The live scan on the open canvas logged 25 hits the static scan cannot see: 10 `undersized-ui-text`, 9 `gpt-thin-border-wide-shadow`, 5 `clipped-overflow-container`, 1 `radial-spotlight-glow`. The review and the detector do not agree on the important problems. The detector did not see the sample boards, the green Save, the off-screen card, or the phone-width sliver. The visible product text it did catch (Achievements, Events, Media, Tools at 10px, and “current” at 9px) sits on the history overview and the role card, not inside the canvas.

**False positives.** Eight of the wide shadows are closed dialogs (`display: none`). Five undersized strings are map chrome (Keyboard shortcuts, Map data, scale, Terms, Report a map error). `radial-spotlight-glow` on `.role-canvas-stage` is the 1px gold dot grid, not a spotlight. Overflow clips on `.home`, the map frame, and `.role-canvas-board` are viewports doing their job; a card that sits past the board edge is the saved pan, which the review also saw.

**Visual overlays.** Injection succeeded in a new tab titled `[Human]`. The detector server on port 8400 was stopped afterward. Those highlights are not still being served.

## Overall Impression

The fitted sample graph is a real board. The role the occupant opened is not. The single biggest opportunity is to make This role hold the evidence already captured for that role, and to make Save mean that arrangement comes back.

## What's Working

- After Zoom to fit, the sample graph is a spatial board: wires, kind labels, ports, and a minimap that tracks the cards.
- The boards rail names the current board, shows a count, and splits This role from Studies.
- In-session power tools are serious: marquee, group, lock, restack, and a context menu that prints its shortcuts. The empty-saves sentence is plain speech.

## Priority Issues

### [P1] The board does not hold this role’s evidence

**Why it matters.** Giants Direct has six achievements in the column. The role board has one card whose body is the imported work-condition paragraph. Studies adds Foldable and Hinge study, and those nodes show up under LINKED on the role. The occupant cannot arrange the evidence they already captured.

**Fix.** Seed This role from the short summary, achievements, and media. Keep sample boards off this role’s ledger. List only nodes on the current board as linked.

**Suggested command.** `/impeccable distill`

### [P1] Save does not keep the arrangement, and the camera can miss the cards

**Why it matters.** Save writes a clock-named snapshot in this browser and opens History. Opening the board can reseed the cards and restore an old camera separately. This visit started on empty space. Zoom to fit was required to see the card, and it jumped to 142%.

**Fix.** Store the board with the role and restore it on open. If the saved view contains no card, fit the camera. Make Save the vault, and keep History as named versions.

**Suggested command.** `/impeccable harden`

### [P1] Selection opens a form, and the form survives the board switch

**Why it matters.** Clicking the card opened the full editor on top of it. After Foldable, that form still said Role, “Mechatronics and Robotics Technician,” with Save and Remove. Header Save and form Save are different actions. Remove and Delete have no confirm. There is no visible Undo.

**Fix.** Select first; edit from the card menu. Clear the form when the board changes. One Save. Remove asks. Put Undo next to it.

**Suggested command.** `/impeccable harden`

### [P2] At phone width the board is a sliver

**Why it matters.** The rail stays 15.5rem. The title truncates, History covers Find a board, and Find a node plus the zoom cluster are clipped. Wire ports are about 11px. The canvas CSS has no narrow breakpoint.

**Fix.** Collapse the rail by default on a narrow window, put Save and the window controls on one wrapping bar, and give tools and ports a larger hit area.

**Suggested command.** `/impeccable adapt`

### [P2] Signal color is green and orange

**Why it matters.** Save and History are green. Kind labels and the selected minimap mark are orange. The pressed Select tool is a white wash. The Hinge notes card is a white sheet. Filled gold never marks the primary action, which is the rule the rest of the ledger follows.

**Fix.** Warm-muted kind text, filled gold for Save and the current board or tool, and paper only inside a page frame.

**Suggested command.** `/impeccable colorize`

## Cognitive load

7 of 8 checks failed. High load.

Grouping held: the rail splits This role and Studies, and zoom sits in its own cluster.

Failed: single focus (map, role column, rail, editor, and Studies at once); chunking (the editor shows Kind, Title, Description, URL, Save, Remove, Link, and Note together); visual hierarchy (green Save outranks the card, and the first frame was empty dots); one thing at a time (a click selects and opens the editor, and the editor stayed after a board switch); choices above four (the editor and the card menu); working memory (window title, rail, Studies, the column, and Save are five different promises); progressive disclosure (sample boards and the full editor appear before this role’s evidence is on the board).

## Emotional journey

The peak is Foldable after Zoom to fit: five cards, gold wires, and a minimap that matches. The first valley is This role: dotted emptiness, a gray minimap, and the Mechatronics card off-screen at 106%. The next is the editor over that card, with Remove beside Save and the title cut to “Mechatronics and Robo…”. At 390px the rail leaves a sliver of stage. The session ends on History for Foldable: “Nothing saved for this canvas yet,” while the role column lists the sample cards as linked.

## Persona Red Flags

**Alex (power user).** Shortcuts exist and stay hidden until a right-click. There is no Undo button and no way to drop the six achievements onto the board. Save looks final and does not restore. Studies occupies the rail with boards Alex did not make.

**Sam (keyboard and screen reader).** Select, Pan, Add, zoom, fit, and the minimap are icon-only, and those tool buttons have no focus-visible rule. Ports are about 11px. Escape closes menus and leaves the dialog open. Drag is the way to move a card. The line “A node needs a title.” is not an alert. On open, the only card was off-screen and still in the tree.

**The occupant arranging a long operational career.** The board opened for Giants Direct offered Foldable and Hinge study, and a card about a foldable product. The maintenance achievements never became cards. Linked on the role then listed those sample nodes.

## Minor Observations

- Card titles are locked to a fixed width, so the role title ellipsizes even when zoomed to fit.
- Hidden scrollbars give the empty pan no edge.
- History on the canvas and History in the app bar are different objects.
- The selected board’s name never replaces the window title.
- The dot grid is the one gold detail that already matches the ledger.

## Questions to Consider

- If the six achievements are the evidence, why does the board open as one work-condition paragraph plus two product studies?
- What is Save allowed to promise: a version in the career record, or a clock-named note in this browser?
- If the sample boards were gone and the only filled gold were Save and the selected card, would this still need to look like a whiteboard?

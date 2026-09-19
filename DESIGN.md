---
name: Proforna
description: A private, editorial career operating system in near-black and restrained gold.
colors:
  near-black: "#0a0a0a"
  operating-black: "#080706"
  raised-black: "#13100d"
  text: "#f5f2ee"
  muted: "#9ca3af"
  warm-muted: "#b9aa97"
  gold: "#a78b71"
  gold-light: "#c9b8a0"
  gold-hover: "#e8d5b7"
  danger: "#e6a196"
  paper: "#e8e0d1"
  map-ground: "#d9d2c6"
typography:
  display:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "clamp(2rem, 5vw, 3.4rem)"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "clamp(1.35rem, 2.4vw, 2.15rem)"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "1.25rem"
    fontWeight: 400
    lineHeight: 1.35
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.7rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0.08em"
rounded:
  none: "0"
  control: "4px"
  soft: "8px"
  panel: "16px"
  pill: "999px"
  round: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.operating-black}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "10px 16px"
  button-operating-primary:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.operating-black}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "8px 13px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.gold-hover}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "8px 13px"
  input-underline:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "9px 0"
  panel-dark:
    backgroundColor: "{colors.operating-black}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    padding: "16px 18px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.gold-hover}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "5px 10px"
---

# Design System: Proforna

## Overview

**Creative North Star: "The Private Career Ledger"**

Proforna is a restrained, near-black career workspace with the gravity of a private ledger and the clarity of an operating instrument. Warm gold rules and text establish hierarchy without turning the interface ornamental; italic serif type marks identity, reflection, and important headings, while compact sans-serif controls carry the work.

The system supports two related densities. Profile and reading surfaces use generous editorial spacing and soft or pill-shaped controls. Data-rich operating surfaces tighten the rhythm, use square-edged divisions, and allow compact rectangular controls so records remain connected rather than becoming a dashboard of interchangeable cards.

**Key Characteristics:**
- Near-black layered surfaces with warm gold hierarchy.
- Italic Playfair Display for identity and section voice; Inter for operation.
- Fine rules, transparent fields, and tonal selection states instead of card grids.
- Filled gold reserved for selected states and explicit primary actions.
- Responsive workspaces preserve context until narrow screens require stacking.

## Colors

The palette is warm, nocturnal, and deliberately narrow; pale paper and map ground appear only where the artifact itself needs a light material.

### Primary
- **Ledger Gold:** The restrained accent for rules, labels, markers, selected states, and primary actions.
- **Illuminated Gold:** The brightest gold, reserved for hover, focus, active navigation, and key headings.

### Neutral
- **Near Black:** The global application ground.
- **Operating Black:** The denser ground for command bars, ledgers, and overlays.
- **Raised Black:** A subtle raised layer for dark panels.
- **Ivory Text:** Primary copy on dark surfaces.
- **Cool Muted:** General secondary copy.
- **Warm Muted:** Secondary copy inside the career ledger and map workspace.
- **Paper:** The light material used for resume output.
- **Map Ground:** The fallback beneath real map tiles.

### Named Rules

**The Gold Is Signal Rule.** Use filled gold for a selected mode or explicit primary action; most controls remain transparent.

**The Material Exception Rule.** Light grounds belong to real output or geographic material, not to generic application containers.

## Typography

**Display Font:** Playfair Display (with Georgia and serif fallbacks)  
**Body Font:** Inter (with system-ui and sans-serif fallbacks)

**Character:** The serif is italic, composed, and personal; the sans-serif is compact and workmanlike. Their contrast separates identity and reflection from controls and record detail.

### Hierarchy
- **Display** (400, responsive large scale, tight line-height): Page-level identity and spacious editorial headings.
- **Headline** (400 italic, responsive medium scale): Occupant identity, panel titles, and prominent record headings.
- **Title** (400 italic, compact serif scale): Section headings within forms, timelines, and grouped records.
- **Body** (400, regular scale, 1.6 line-height): Explanations and longer record content, generally held near 66–68 characters.
- **Label** (600, compact scale): Navigation labels, status, metadata, and controls; uppercase tracking is limited to genuine category labels.

### Named Rules

**The Two Voices Rule.** Serif type gives identity and reflective hierarchy; sans-serif type carries actions, fields, metadata, and dense records.

## Layout

Reading and profile surfaces center content between roughly 40 and 58rem with generous page padding. Operating surfaces may use the full available width: a command layer sits above persistent navigation or a split ledger-and-stage workspace. Fine borders establish columns and sections instead of detached cards.

Spacing follows a compact 4/8/16/24/40px rhythm, with denser controls permitted inside ledgers and panels. Workspaces collapse columns at approximately 760px; side panels become full-width fixed sheets, paired fields stack by 480–640px, and navigation simplifies without hiding primary content.

**The Context-Before-Cards Rule.** Keep related records, controls, and their current visual context adjacent; do not break operating workflows into a grid of generic cards.

## Elevation & Depth

The system is flat by default. Fine gold-tinted rules, slight tonal shifts, and inset selection lines carry most hierarchy. Strong shadows are reserved for true overlays, dialogs, floating map controls, and physical-looking output such as a resume sheet.

### Shadow Vocabulary
- **Floating Control** (`0 8px 24px rgba(0, 0, 0, 0.28)`): Compact controls floating over maps or other visual ground.
- **Side Sheet** (`-18px 0 45px rgba(0, 0, 0, 0.42)`): A focused editor entering from the right.
- **Dialog** (`0 28px 80px rgba(0, 0, 0, 0.55)`): Modal search and settings surfaces.
- **Paper Output** (`0 22px 50px rgba(0, 0, 0, 0.38)`): Light artifacts presented above the dark workspace.

**The Earned Elevation Rule.** Add a shadow only when a surface truly overlays, floats above, or represents a separate material.

## Shapes

The underlying form language is disciplined and contextual. Content partitions and underlined fields are square. General navigation, secondary actions, and chips use soft or pill-shaped corners. Dense operating surfaces use compact 4px corners; dialogs may use 14–18px corners; avatars and map points are circular.

**The Shape Follows Density Rule.** Use pills for approachable global actions and tags, but use compact rectangular controls where dense operating work benefits from sharper alignment.

## Components

### Buttons
- **Shape:** Pill-shaped on general surfaces; compact 4px corners inside dense operating surfaces.
- **Primary:** Ledger Gold fill with Operating Black text and restrained padding.
- **Secondary:** Transparent with a fine gold border and illuminated gold text.
- **Hover / Focus:** Increase gold contrast; keyboard focus uses a 2px Illuminated Gold outline with visible offset.
- **Danger:** Remains transparent and uses muted coral text and border rather than a filled destructive block.

### Chips
- **Style:** Transparent, fine gold border, pill silhouette, and compact illuminated-gold text.
- **State:** Selection should use a restrained translucent gold fill rather than a new hue.

### Cards / Containers
- **Corner Style:** Square for ledger groups and inline record regions; softly rounded only for modal or menu containers.
- **Background:** Near-black tonal layers with fine gold-tinted borders.
- **Shadow Strategy:** Flat at rest; overlays follow the earned elevation vocabulary.
- **Internal Padding:** Usually 16–24px, reduced for dense lists.

### Inputs / Fields
- **Style:** Transparent fill, no enclosing box, square corners, and a fine gold bottom rule.
- **Focus:** Illuminated Gold caret and rule, with an explicit visible focus outline where the control is not otherwise obvious.
- **Grouping:** Two-column pairs collapse to one column on narrow screens.

### Navigation
- **Style:** Sans-serif labels over dark ground, with translucent gold hover and selected fills. Persistent navigation uses soft corners; operating tabs may use square divisions and an inset gold active rule.

### Career Ledger Row
- **Style:** A full-width, border-divided row with organization, role, date/place metadata, and a circular map marker.
- **State:** Hover and selection use a quiet gold wash; selection adds a one-pixel inset Illuminated Gold rule.

### Side Sheet
- **Style:** A near-black editor attached to the right edge, separated by a fine gold rule and directional shadow.
- **Behavior:** It enters quickly with a restrained horizontal reveal and becomes a full-width fixed sheet on narrow screens. Reduced-motion preferences remove the animation.

## Do's and Don'ts

### Do:
- **Do** use inherited palette and type tokens before introducing surface-local values.
- **Do** communicate hierarchy with fine rules, tonal layers, typography, and restrained gold states.
- **Do** keep focus visible, preserve semantic controls, and disable optional motion for reduced-motion preferences.
- **Do** let real map tiles, paper outputs, and other meaningful materials contrast with the dark application shell.

### Don't:
- **Don't** use filled gold broadly; its rarity identifies selection and commitment.
- **Don't** turn connected operating workflows into interchangeable card dashboards.
- **Don't** use decorative elevation on surfaces that are not overlays or distinct materials.
- **Don't** introduce additional display families, hard offset shadows, or ornamental glyph icons.

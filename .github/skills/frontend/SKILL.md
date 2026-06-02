---
name: frontend-craft
description: Universal frontend design skill for any surface — app UI, dashboards, components, forms, landing pages, portfolios, and redesigns. Covers brief inference, design system selection, core design rules, anti-slop directives, redesign audit, image strategy, and code quality. Use for any UI/frontend task. Not for backend-only work.
---

# Frontend Craft — Universal Design Guide

> Works for any surface: app UI, dashboards, landing pages, portfolios, components, or redesigns.
> Every rule below is **contextual**. Read the brief first. Pull only what fits.

---

## 0. READ THE BRIEF FIRST

Most LLM design output fails because the model jumps to a default aesthetic instead of reading the room. Do not touch code until you have done this.

### 0.A Signals to read
1. **Surface kind** — landing page, marketing site, portfolio, product UI, dashboard, admin tool, component, form, onboarding, empty state.
2. **Vibe words** — "minimalist", "calm", "Linear-style", "brutalist", "premium", "Apple-y", "playful", "editorial", "dark tech", "trust-first".
3. **Reference signals** — URLs, screenshots, named products, competitors.
4. **Audience** — B2B procurement, design-conscious consumer, recruiter, developer, end-user. Audience picks the aesthetic, not your taste.
5. **Existing brand assets** — logo, committed colors, type, photography. For redesigns: these are starting material, not optional input.
6. **Quiet constraints** — accessibility-critical, public-sector, regulated industries, kids' products. These OVERRIDE aesthetic preference.

### 0.B Declare a one-line Design Read before writing
Before any code, state: **"Reading this as: [surface] for [audience], with a [vibe] language, leaning toward [design system or aesthetic family]."**

If the brief is ambiguous, ask **one** clarifying question — never a multi-question dump.

### 0.C Anti-Default Discipline
Do not default to: AI-purple gradients, centered hero over dark mesh, three equal feature cards, generic glassmorphism, Inter + slate-900, infinite-loop micro-animations. These are LLM reflexes. Reach past them based on the design read.

---

## 1. THE THREE DIALS

After the design read, set these three dials. Layout, motion, and density decisions reference them throughout.

| Dial | Default | Range |
|---|---|---|
| `DESIGN_VARIANCE` | 8 | 1 = perfect symmetry → 10 = artsy chaos |
| `MOTION_INTENSITY` | 6 | 1 = static → 10 = cinematic / physics |
| `VISUAL_DENSITY` | 4 | 1 = art gallery / airy → 10 = cockpit / packed data |

**Dial inference by signal:**

| Signal | VARIANCE | MOTION | DENSITY |
|---|---|---|---|
| Minimalist / clean / calm / editorial | 5–6 | 3–4 | 2–3 |
| Premium consumer / Apple-y / luxury | 7–8 | 5–7 | 3–4 |
| Playful / agency / Awwwards / experimental | 9–10 | 8–10 | 3–4 |
| Landing page / portfolio (default) | 7–9 | 6–8 | 3–5 |
| App UI / dashboard / tool | 5–7 | 3–5 | 5–7 |
| Trust-first / public-sector / regulated | 3–4 | 2–3 | 4–5 |
| Redesign — preserve | match existing | existing + 1 | match existing |
| Redesign — overhaul | existing + 2 | existing + 2 | match existing |

Do not ask the user to edit dial values. Overrides happen conversationally.

---

## 2. DESIGN SYSTEM MAP

Pick the right foundation before writing a line. Do not recreate CSS for things that have an official package. One system per project — never mix.

| Brief reads as… | Reach for |
|---|---|
| Microsoft / enterprise SaaS / dashboards | `@fluentui/react-components` |
| Google-ish / Material-flavored product | `@material/web` + Material 3 tokens |
| IBM-style B2B / enterprise analytics | `@carbon/react` + `@carbon/styles` |
| Shopify app surfaces | Polaris React |
| GitHub-style devtool / community | `@primer/css` or `@primer/react-brand` |
| UK public-sector service | `govuk-frontend` |
| US public-sector / trust-first | `uswds` |
| Modern accessible React foundation | `@radix-ui/themes` |
| Modern SaaS / you own the components | `shadcn/ui` (never ship default state) |
| Indie / small-team / Tailwind-native | Tailwind v4 utilities |
| Fast local-business / agency MVP | Bootstrap 5.3 |

**Honesty rule:** if the brief matches a system above, install and use the official package. Do not recreate its tokens by hand. Do not import a system then override 90% of it.

For aesthetic directions that have no official package (glassmorphism, bento, brutalism, editorial, dark tech, aurora gradients, kinetic type) — build with native CSS + Tailwind + a component library and be honest in comments about what is borrowed inspiration vs. official material.

---

## 3. CORE DESIGN RULES

### 3.1 Color

- **Verify contrast.** Body text ≥ 4.5:1 against background. Large text (≥18px or bold ≥14px) ≥ 3:1. Placeholder text same 4.5:1. Never justify low-contrast with "elegance" — it is an accessibility failure.
- Gray text on a colored background looks washed out. Use a darker shade of the background's own hue or a transparency of the text color.
- Max **one accent color**. Saturation < 80% by default. One palette per project — do not mix warm and cool grays.
- **THE LILA RULE:** No automatic purple/blue glow as default AI aesthetic. Use neutral bases (Zinc / Slate / Stone) + one considered accent.
- **COLOR CONSISTENCY LOCK:** Once an accent is chosen it is used across the whole surface. A warm-grey app does not get a blue button in section 7.
- For new projects: use **OKLCH** for color values. Tinted neutrals: add 0.005–0.015 chroma toward the brand's hue.
- Before choosing light vs. dark mode: write one sentence of physical scene — who uses this, where, under what ambient light. If the sentence doesn't force the answer, add detail until it does.
- Four color strategy options: **Restrained** (tinted neutrals + one accent ≤10%), **Committed** (one saturated color 30–60% of surface), **Full palette** (3–4 named roles), **Drenched** (surface IS the color).

### 3.2 Typography

- Cap body line length at **65–75ch**.
- Hierarchy through scale + weight contrast (≥1.25 ratio between steps).
- Max **3 font families** (display + body + optional mono). One well-tuned family with weight contrast usually beats three competing typefaces.
- Don't pair fonts that are similar — pair on a contrast axis (serif + sans, geometric + humanist).
- No all-caps body copy. Uppercase reserved for short labels (≤4 words) and badges.
- Display heading ceiling: `clamp()` max ≤ 6rem. Above that the page is shouting.
- Display heading letter-spacing floor: ≥ -0.04em.
- Use `text-wrap: balance` on h1–h3; `text-wrap: pretty` on long prose.
- **Introduce Medium (500) and SemiBold (600)** — relying only on Regular + Bold is flat hierarchy.
- Use tabular figures (`font-variant-numeric: tabular-nums`) for data-heavy interfaces.
- **SERIF DISCIPLINE:** Serif is very discouraged as default. Only acceptable when: (a) brand brief names a serif, OR (b) the aesthetic is genuinely editorial/luxury/heritage AND you can articulate why. Specifically banned as defaults: `Fraunces`, `Instrument_Serif`.
- **ITALIC DESCENDER CLEARANCE:** Italic display type with descender letters (y g j p q) requires `leading-[1.1]` minimum + `pb-1` reserve. Audit before shipping.
- Discouraged default font: `Inter`. Preferred: `Geist`, `Outfit`, `Cabinet Grotesk`, `Satoshi`. Inter is acceptable for neutral/standard/public-sector briefs.

### 3.3 Layout

- **Flexbox for 1D, Grid for 2D.** Do not default to Grid when flex-wrap would be simpler.
- `repeat(auto-fit, minmax(280px, 1fr))` for responsive grids without breakpoints.
- Vary spacing for rhythm. Symmetrical vertical padding everywhere looks unfinished — bottom often needs to be slightly larger.
- Cards are the lazy answer. Use them only when elevation communicates real hierarchy. Nested cards are always wrong.
- **ANTI-CENTER BIAS:** Centered layouts avoided when `DESIGN_VARIANCE > 4`. Prefer split-screen, left-aligned content, or asymmetric whitespace.
- Container constraint: `max-w-[1400px] mx-auto` or `max-w-7xl`. Never edge-to-edge on wide screens.
- **NEVER `h-screen` for full-height sections.** Always `min-h-[100dvh]` (iOS Safari viewport bug).
- Build a semantic z-index scale (dropdown → sticky → modal-backdrop → modal → toast → tooltip). Never `9999`.
- **NO DUPLICATE CTA INTENT:** Two CTAs with the same intent on one page is a fail. One label per intent.
- **Page Theme Lock:** One theme per page — light or dark, not both randomly. Section-level tints within the same family are fine; jumping to `bg-amber-50` in the middle of a dark page is broken.

### 3.4 Motion

- Motion must be **intentional**. Before adding any animation, answer: "What does this communicate?" Valid: hierarchy, storytelling, feedback, state transition. Invalid: "it looked cool."
- Don't animate CSS layout properties (`width`, `height`, `top`, `left`). Use `transform` + `opacity`.
- Ease out with exponential curves (ease-out-quart / quint / expo). No bounce, no elastic.
- **Reduced motion is mandatory.** Every animation needs a `@media (prefers-reduced-motion: reduce)` alternative — typically a crossfade or instant transition.
- Premium motion materials: blur, backdrop-filter, clip-path, mask, shadow/glow — part of the palette when they materially improve the effect and stay smooth.
- If `MOTION_INTENSITY > 4`, the page must actually move — not half-built transitions that jump or break.
- Use `motion/react` (`import { motion } from "motion/react"`). Never `useState` for continuous pointer/scroll values — use `useMotionValue` / `useTransform`.

### 3.5 Copy

- Every word earns its place.
- **No em dashes.** Use commas, colons, semicolons, periods, or parentheses.
- **No marketing buzzwords:** streamline / empower / supercharge / leverage / unleash / seamless / world-class / cutting-edge / game-changer. Pick a specific noun and a verb that describes what the product literally does.
- Button labels: **verb + object.** "Save changes" beats "OK". "Delete project" beats "Yes".
- Link text needs standalone meaning. "View pricing plans" beats "Click here".
- No aphoristic cadence as default voice. If three section blocks on the same page land on a short rebuttal sentence, rewrite.
- One copy register per page — don't mix technical mono, editorial prose, and marketing punch.
- Exclamation marks removed from success messages. Be confident, not loud.
- "Oops!" removed from error messages. Be direct: "Connection failed. Please try again."

### 3.6 Interaction States

Always implement full cycles. LLMs default to "static successful state only."

- **Loading:** Skeletal loaders matching the final layout's shape. No generic spinners for pane-level loading.
- **Empty states:** Composed, with a clear prompt for how to populate. Never show while loading.
- **Error states:** Inline for forms, contextual toast for transient. Never `window.alert()`.
- **Tactile feedback:** On `:active`, use `-translate-y-[1px]` or `scale-[0.98]` to simulate a physical click.
- **Hover states:** All interactive elements get a background shift, scale, or translate — not just cursor change.
- **Focus ring:** `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`. Never remove. This is an a11y requirement.
- **BUTTON CONTRAST CHECK:** Verify button text is readable against button background (4.5:1 min). Ghost buttons over photography need a backdrop or scrim.

---

## 4. ABSOLUTE BANS

Match-and-refuse. If you are about to write any of these, rewrite the element with different structure.

| Ban | Why |
|---|---|
| `border-left` or `border-right` > 1px as colored accent (side-stripe) | Never intentional. Use full borders, background tints, or leading icons. |
| `background-clip: text` + gradient (gradient text) | Decorative, never meaningful. Use solid color + weight/size emphasis. |
| Glassmorphism as default (blurs + glass cards everywhere) | Rare and purposeful, or nothing. |
| Hero-metric template (big number + small label + gradient) | SaaS cliché. |
| Identical card grid (same-sized cards, icon + heading + text, endlessly repeated) | The most generic AI layout. |
| Eyebrow above every section (small uppercase tracking label) | Max 1 eyebrow per 3 sections across the page. No eyebrow on every section. |
| Numbered section markers as default scaffold (01 / 02 / 03) | Only when the section is genuinely a sequence and the order carries information. |
| Div-based fake screenshots / hand-drawn "product previews" | Use real screenshots, generate with image tools, or leave labeled placeholders. |
| AI cream/sand/beige body background as default | Entire warm-neutral band (OKLCH L 0.84-0.97, C < 0.06, hue 40-100) is the AI tell. |
| Section-layout repetition | Same layout family max once per page. 8 sections → at least 4 different layout families. |
| Split-header as default (left big headline + right filler paragraph) | Stack vertically unless the right column carries a real visual or interactive element. |
| Mixed icon families in the same component tree | One icon library per project. Standardize stroke width globally. |
| Lorem ipsum | Write real draft copy. Never placeholder latin. |
| Arbitrary z-index values (`9999`, `999`) | Use a documented semantic z-index scale. |

---

## 5. THE AI SLOP TEST

If someone could look at the interface and say "AI made that" without doubt, it has failed.

**Two-altitude check:**
1. **First-order:** Could someone guess the theme + palette from the category alone? If yes — that is the first training-data reflex. Rework until the answer is not obvious from the domain.
2. **Second-order:** Could someone guess the aesthetic family from category-plus-anti-references? If yes — the second-order trap was not avoided. Rework until both answers are non-obvious.

**COPY SELF-AUDIT (mandatory before ship):** Re-read every visible string. Flag and rewrite any string that is grammatically broken, has unclear referents, sounds like AI hallucination, or reads like an LLM trying to sound thoughtful.

---

## 6. REDESIGN MODE — AUDIT CHECKLIST

When the task is to improve existing work, **do not touch code until this audit is complete**.

**Workflow:** Scan → Diagnose → Fix. Identify the framework and styling method. List every generic pattern, weak point, and missing state. Apply targeted upgrades — do not rewrite from scratch.

### Typography
- [ ] Browser default fonts or Inter everywhere → replace with a font that has character
- [ ] Headlines lack presence → tighten letter-spacing, reduce line-height, increase display size
- [ ] Body text too wide → limit to ~65ch
- [ ] Only Regular + Bold weights → introduce Medium (500) and SemiBold (600)
- [ ] Numbers in proportional font in data UI → enable `font-variant-numeric: tabular-nums`
- [ ] All-caps subheaders everywhere → try lowercase italics or sentence case instead

### Color and Surfaces
- [ ] Pure `#000000` background → replace with off-black or tinted dark
- [ ] Oversaturated accent → desaturate below 80%
- [ ] More than one accent color → pick one, remove the rest
- [ ] Mixing warm and cool grays → stick to one gray family
- [ ] Purple/blue "AI gradient" aesthetic → replace with neutral base + considered accent
- [ ] Generic `box-shadow` → tint shadows to match the background hue
- [ ] Pure flat design with zero texture → add subtle noise or micro-pattern to backgrounds
- [ ] Random dark sections in a light page (or vice versa) → commit to one consistent tone

### Layout
- [ ] Everything centered and symmetrical → break symmetry with offset margins or left-aligned headers
- [ ] Three equal card columns as feature row → replace with 2-column zig-zag, asymmetric grid, or horizontal scroll
- [ ] No max-width container → add container constraint with auto margins
- [ ] Uniform border-radius → vary the radius (tighter on inner elements, softer on containers)
- [ ] No overlap or depth → use negative margins to create layering
- [ ] Missing whitespace → double the spacing, let the design breathe
- [ ] `height: 100vh` for full-screen sections → replace with `min-height: 100dvh`

### Interactivity and States
- [ ] No hover states on buttons → add background shift, scale, or translate
- [ ] No active/pressed feedback → add `scale(0.98)` or `translateY(1px)` on press
- [ ] Instant transitions with zero duration → add 200–300ms transitions on all interactive elements
- [ ] Missing focus ring → add visible `focus-visible:ring-*` indicator
- [ ] No loading states → replace generic spinners with shape-matched skeleton loaders
- [ ] No empty states → design a composed "getting started" view
- [ ] No error states → add clear inline error messages for forms
- [ ] No active page indicator in navigation → style the active nav link differently

### Component Patterns
- [ ] Generic card look everywhere → remove border, or use only background, or use only spacing
- [ ] Avatar circles exclusively → try squircles or rounded squares
- [ ] Modals for everything → use inline editing, slide-over panels, or expandable sections for simple actions
- [ ] Pill-shaped "New" / "Beta" badges → try square badges or plain text labels
- [ ] Footer link farm with 4+ columns → simplify to main paths and legally required links

### Iconography
- [ ] Mixed icon libraries → standardize to one family, standardize stroke width
- [ ] Missing favicon → add a branded favicon
- [ ] Icon-only buttons missing `aria-label` → add to all

### Content and Copy
- [ ] Generic placeholder names ("John Doe", "Acme Corp") → use diverse, realistic names
- [ ] Fake round numbers → use organic data (47.2%, $99.00)
- [ ] AI copywriting clichés → remove "Elevate", "Seamless", "Unleash", "Next-Gen", etc.
- [ ] Passive voice → use active voice throughout
- [ ] Title Case On Every Header → use sentence case

### Code Quality
- [ ] Div soup → use semantic HTML (`<nav>`, `<main>`, `<article>`, `<aside>`, `<section>`)
- [ ] Hardcoded pixel widths → use relative units (`%`, `rem`, `em`, `max-width`)
- [ ] Missing `alt` text on meaningful images → describe image content
- [ ] Arbitrary z-index values → establish a semantic scale
- [ ] Commented-out dead code → remove before shipping
- [ ] Import hallucinations → verify every import exists in `package.json`

---

## 7. IMAGE STRATEGY

Visual surfaces need real images. Text-only pages with fake-screenshot divs are slop.

**Priority order:**
1. **Image-generation tool first.** If any image-gen tool is available in the environment, use it to create section-specific assets at the right aspect ratio. Do not skip this step because CSS feels faster.
2. **Real web images second.** When no gen tool is available: `https://picsum.photos/seed/{descriptive-seed}/{w}/{h}` for placeholder photography. Seed should describe the section (`resumsify-hero-career`, not `image1`).
3. **Last resort:** leave clearly-labeled placeholder slots (`<!-- TODO: hero photo, 1600x1200 -->`) and list needed placements at the end of the response.

**Even minimalist sites need real images.** A pure-text page is not minimalism — it is incomplete work.

**Social proof logo walls:** Use real SVG logos from Simple Icons (`https://cdn.simpleicons.org/{slug}/{color}`). For invented brand names, generate a simple monogram as inline `<svg>`. Never plain text wordmarks. Ensure logos render in both light and dark mode.

**Banned:** div-based fake screenshots, hand-rolled decorative SVGs (unless explicitly requested), stock "diverse team" uncanny imagery.

---

## 8. STACK DEFAULTS (when no prior system exists)

- **Framework:** React or Next.js. Default to Server Components. Interactivity in isolated `'use client'` leaf components.
- **Styling:** Tailwind v4. For v4, use `@tailwindcss/postcss` — NOT the `tailwindcss` PostCSS plugin.
- **Animation:** `motion/react` (`import { motion } from "motion/react"`). Never `useState` for continuous pointer/scroll values.
- **Fonts:** `next/font` (Next.js) or self-hosted `@font-face` with `font-display: swap`. Never `<link>` to Google Fonts in production.
- **Icons:** Priority order: `@phosphor-icons/react`, `@tabler/icons-react`, `@radix-ui/react-icons`. `lucide-react` acceptable only when the project already depends on it or user explicitly requests it. One family per project. Never hand-roll SVG icon paths.
- **Dependency verification (mandatory):** Before importing any 3rd-party library, check `package.json`. If missing, output the install command first.
- **Global state:** Zustand or Jotai. Only for deep prop-drilling. `useState` for isolated local UI.
- **Responsive breakpoints:** sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536.

---

## 9. PRODUCTION QUALITY STANDARD

Ship production-grade code, not prototypes. Do not stop until the implementation is: beautiful, responsive, accessible, on-brand, and bug-free. Take no shortcuts unless the user explicitly asks for them. Every page and component is tested at every breakpoint before declaring it done.

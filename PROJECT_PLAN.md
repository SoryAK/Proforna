# Resumsify — Project Plan

> **"Your Career, In Your Hands"**

Resumsify is an all-in-one career management platform that gives professionals complete ownership of their career data — from job search and interviews to compensation tracking, company research, and shareable portfolios.

---

## Current State (March 2026)

The application is **feature-rich but single-user**. All core modules are built and functional in local development. The primary gap is the infrastructure needed to serve real users: authentication, a production database, deployment, and security.

### What's Built

| Module | Pages | Status |
|--------|-------|--------|
| **Dashboard** | Home overview with alerts, stats, finance snapshot | Functional |
| **Job Search** | SerpAPI job discovery, applications tracker, recruiter submissions, contacts | Functional |
| **Interviews** | Scheduling, WebRTC video calls, screen share, interactive resume sidebar | Built — needs real-world testing |
| **Career Analytics** | Career direction model, goals & milestones, income projections, skill gap analysis | Functional — income projections need tuning |
| **Current Position** | Compensation, benefits, time-off, paycheck history, equipment, work logs | Functional |
| **Financial** | Paycheck parsing (OCR), W-2 parsing, IRS 1040 parsing, career financial model | Functional |
| **Research** | Company intel (SEC/OSHA/DOL), Google News, Google Scholar, RSS feeds, BLS market data | Functional |
| **Resumes & Portfolio** | Resume versions, interactive resumes with themes, public portal, view analytics, PDF/DOCX export | Functional |
| **Email** | Gmail & Outlook OAuth, email-to-application linking | Partial — OAuth client IDs not configured |
| **AI Assistant** | Gemini-powered chat with career context | Functional |
| **Documents** | Upload/manage offers, NDAs, pay stubs, tax forms | Functional |
| **Import/Export** | Full JSON backup, CSV export for all entities | Functional |

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5 |
| UI | shadcn/ui v2 (base-ui), Tailwind CSS 4 |
| State | React Query (TanStack) |
| Database | Prisma 6 + SQLite (dev only) |
| AI | Google Gemini 2.0 Flash |
| Search | SerpAPI (Google Jobs, News, Scholar) |
| Video | simple-peer (WebRTC) |
| Auth | None yet — this is the #1 gap |

---

## Roadmap

### Phase 1 — Production Foundation *(Must-have before any real user)*

These are blockers. Nothing else matters until the app can safely serve multiple users.

- [ ] **Authentication system** — NextAuth.js (or Auth.js v5) with Google, Microsoft, and email/password providers. Every API route needs auth middleware. Every database query needs to be scoped to the authenticated user.
- [ ] **Database migration** — Move from SQLite to PostgreSQL (Supabase, Neon, or self-hosted). Add `userId` foreign key to every model. Migrate Prisma schema.
- [ ] **Multi-tenancy** — All data must be isolated per user. No user should ever see another user's applications, resumes, or financial data. This is non-negotiable.
- [ ] **API security** — Add auth guards to every API route. Rate limiting on public endpoints (portal, interactive resumes). Input validation/sanitization.
- [ ] **Environment & secrets** — Move all API keys to proper environment variable management. Never expose server-side keys to the client.
- [ ] **Deployment** — Deploy to Vercel (natural fit for Next.js). Set up production environment variables, database connection, and domain.
- [ ] **Landing page** — Public marketing page at `/` that explains the product. The dashboard moves to `/dashboard` (authenticated only).

### Phase 2 — Core Experience Polish

Once the app is deployed and secure, make the existing features feel production-ready.

- [ ] **Onboarding flow** — Guide new users through setting up their profile, current position, and first resume. Empty states should teach, not just say "no data."
- [ ] **Email integration completion** — Configure Google & Microsoft OAuth app credentials. Get OAuth consent screen verified. Test full Gmail/Outlook sync flow.
- [ ] **Income projections fix** — Current CAGR approach produces unrealistic numbers from early-career data. Switch to recency-weighted (last 3-5 years) + scenario modeling (optimistic/realistic/conservative) + cap at reasonable growth ceiling.
- [ ] **Interview video calls testing** — Test WebRTC calls with real 2-person scenarios. Verify STUN/TURN server reliability. Add error handling for camera/mic permission denials.
- [ ] **Dashboard refinement** — Revisit card density, section layout, and information hierarchy. Make the first screen useful at a glance.
- [ ] **Company page customization** — Notion-like layout where users can rearrange company research sections. Show public/private status in header. Support company banners/photos.
- [ ] **Mobile experience** — PWA service worker is registered but needs offline capability, push notifications, and mobile-optimized layouts.
- [ ] **Replace SerpAPI for News & Scholar** — Use Gemini 2.0 + Google Search Grounding (free with existing API key) for company news and academic research. Keep SerpAPI only for job discovery where structured data + apply links matter.

### Phase 3 — Growth Features

New capabilities that differentiate Resumsify and add real value for users.

- [ ] **Notifications & reminders** — Push notifications for upcoming interviews, expiring certifications, goal deadlines. Email digests.
- [ ] **Google Calendar integration** — Sync interview dates to calendar. Import calendar events as work log entries.
- [ ] **Resume AI suggestions** — Use Gemini to suggest resume bullet points based on work logs, skills, and target role.
- [ ] **Application auto-tracking** — Auto-detect job application confirmation emails and create entries.
- [ ] **Offer comparison calculator** — Side-by-side comparison of total compensation (salary + equity + benefits + PTO value).
- [ ] **Team/household mode** — Allow a partner or career coach to view (with permission) career progress and financial data.
- [ ] **Salary negotiation toolkit** — Market data + personal compensation history + offer details → negotiation talking points.
- [ ] **Public API** — Let users build integrations with their own career data (export to LinkedIn, personal websites, etc.).

### Phase 4 — Scale & Monetization

If Resumsify gains traction, these make it sustainable.

- [ ] **Freemium model** — Free tier (core tracking, 1 resume, basic search) + Pro tier (unlimited resumes, video interviews, AI features, advanced analytics).
- [ ] **Stripe integration** — Subscription billing, usage-based pricing for AI/search features.
- [ ] **Admin dashboard** — User metrics, feature usage, error monitoring.
- [ ] **Analytics pipeline** — Aggregate anonymized data for industry insights (salary benchmarks, interview success rates by prep method).
- [ ] **SOC 2 / compliance** — If handling financial data for real users, security certifications become important.

---

## Known Issues & Tech Debt

*Pulled from existing tracking files + development knowledge.*

### Bugs / Broken

| Issue | Location | Priority |
|-------|----------|----------|
| Income projections unrealistic (CAGR from early career data) | Career Model | High |
| Google/Microsoft OAuth client IDs empty in `.env` | Email integration | High |
| WebRTC interview calls untested with real peers | Interview Portal | Medium |

### UI/UX Debt

| Issue | Location | Priority |
|-------|----------|----------|
| Dashboard cards still feel oversized on first load | Dashboard | Medium |
| Current Position compensation tab is scroll-heavy | Current Position | Medium |
| Company page needs public/private indicator + photos | Company Intel | Low |
| Position label says "Title" instead of "Position" | Company Intel | Low |

### Architecture Debt

| Issue | Priority |
|-------|----------|
| No auth — all routes are open, all data is global | **Critical** |
| SQLite — not suitable for production multi-user | **Critical** |
| No input validation on API routes (zod schemas missing) | High |
| No error boundaries — unhandled errors crash the page | Medium |
| Interview room signaling is in-memory (lost on server restart) | Medium |
| No test coverage — vitest configured but few/no tests | Medium |
| `simple-peer` type workaround (`any` ref) | Low |

---

## File Structure Reference

```
src/
├── app/
│   ├── page.tsx                    # Dashboard (→ /dashboard after auth)
│   ├── layout.tsx                  # Root layout
│   ├── globals.css                 # Global styles
│   │
│   ├── job-search/                 # Job Search hub (6 tabs)
│   ├── applications/               # → redirects to /job-search
│   ├── interviews/                 # → redirects to /job-search?tab=interviews
│   ├── contacts/                   # → redirects to /job-search
│   ├── submissions/                # → redirects to /job-search
│   │
│   ├── interview/[roomId]/         # WebRTC interview room (shareable URL)
│   │
│   ├── current-position/           # Current job details (comp, benefits, time-off)
│   ├── career-growth/              # Career analytics (direction, goals, projections)
│   ├── career-model/               # Financial model + W-2 history
│   ├── experience/                 # Past work experience
│   ├── goals/                      # Career goals & milestones
│   ├── skills/                     # Skills inventory
│   │
│   ├── research/                   # Research hub (learning, news, scholar, market data)
│   ├── insights/                   # Analytics & activity log
│   ├── analytics/                  # Charts & funnels
│   ├── activity/                   # Audit trail
│   │
│   ├── resumes/                    # Resume management + interactive resumes
│   ├── portal/                     # Public portfolio portal
│   ├── portal-settings/            # Portal customization
│   ├── r/[slug]/                   # Public interactive resume view
│   │
│   ├── documents/                  # Document library
│   ├── email/                      # Email integration
│   ├── import-export/              # Data backup & restore
│   ├── profile/                    # Profile hub
│   │
│   └── api/                        # 54+ API routes (see below)
│       ├── applications/           # CRUD applications
│       ├── interviews/             # CRUD interviews
│       ├── contacts/               # CRUD contacts
│       ├── skills/                 # CRUD skills
│       ├── goals/ + milestones/    # CRUD goals
│       ├── resumes/                # CRUD resumes
│       ├── compensation/           # CRUD comp events
│       ├── benefits/               # CRUD benefits
│       ├── time-off/               # CRUD PTO
│       ├── paycheck-records/       # CRUD paychecks
│       ├── paycheck-parse/         # OCR paycheck parsing
│       ├── w2-records/ + w2-parse/ # W-2 data + OCR
│       ├── irs-return-parse/       # IRS 1040 OCR
│       ├── job-search/             # SerpAPI job discovery
│       ├── google-news/            # SerpAPI company news
│       ├── google-scholar/         # SerpAPI scholar search
│       ├── company-research/       # SEC, OSHA, DOL, OpenCorporates
│       ├── interview-room/         # WebRTC signaling
│       ├── interactive-resumes/    # CRUD + public view + analytics
│       ├── dashboard/              # Dashboard aggregation
│       ├── analytics/              # Metrics computation
│       ├── ai/                     # Gemini chat + context
│       ├── export/ + import/       # Data portability
│       └── ...                     # Profile, portal, emails, etc.
│
├── components/
│   ├── layout-shell.tsx            # App shell (header + sidebar + content)
│   ├── sidebar.tsx                 # Navigation sidebar
│   ├── providers.tsx               # React Query + theme providers
│   ├── video-call.tsx              # WebRTC video component
│   ├── job-search-discover.tsx     # SerpAPI job search UI
│   ├── company-intel.tsx           # Company research display
│   ├── interactive-resumes-manager.tsx  # Resume builder
│   ├── ...                         # 30+ feature components
│   └── ui/                         # shadcn/ui base components
│
├── lib/
│   ├── prisma.ts                   # Database client
│   ├── utils.ts                    # cn() helper
│   ├── constants.ts                # App constants
│   ├── activity.ts                 # Activity logging helper
│   └── interview-rooms.ts          # In-memory signaling store
│
└── prisma/
    ├── schema.prisma               # 30+ models
    └── migrations/                 # 6 migration files
```

---

## External Services & API Keys

| Service | Purpose | Key In `.env` | Status |
|---------|---------|---------------|--------|
| Google Gemini | AI chat, parsing, suggestions | `GEMINI_API_KEY` | Active |
| SerpAPI | Job search, news, scholar | `SERPAPI_KEY` | Active (250 searches/mo free) |
| Google OAuth | Gmail sync, login | `GOOGLE_CLIENT_ID/SECRET` | Not configured |
| Microsoft OAuth | Outlook sync, login | `MICROSOFT_CLIENT_ID/SECRET` | Not configured |
| SEC EDGAR | Company financials | None (public API) | Active |
| BLS | Job market data | None (public API) | Active |
| OSHA | Workplace violations | None (public API) | Active |
| DOL | 401k/pension data | None (public API) | Active |
| OpenCorporates | Company registration | None (public API) | Active |

---

## Quick Reference

**Dev commands:**
```bash
npm run dev          # Start dev server (Turbopack)
npx next build       # Production build
npx prisma studio    # Browse database
npx prisma migrate dev  # Run migrations
```

**Key conventions:**
- shadcn/ui v2 uses `render` prop, NOT `asChild` (base-ui, not Radix)
- Prisma client: `import { prisma } from "@/lib/prisma"`
- All state management: React Query (`useQuery`, `useMutation`)
- Styling: Tailwind CSS 4, `cn()` from `@/lib/utils`
- Brand color: Orange (`#f97316` / Tailwind `orange-500`)

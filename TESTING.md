# Session Testing Checklist — March 26, 2026

## Feature 1: Application → Current Position Automation

When a job application status is changed to **"accepted"**, a `CurrentPosition` record is auto-created along with associated benefits, time-off, and compensation data.

### Files Changed
- `src/app/api/applications/[id]/route.ts` — PATCH handler with auto-creation logic
- `src/app/(app)/applications/page.tsx` — Toast with "View Position" action button

### Test Cases

#### 1.1 — Basic Auto-Creation
- [ ] Change an application status to **"accepted"**
- [ ] Verify a `CurrentPosition` record is created in **Current Position** page
- [ ] Confirm position has correct: company, role, location, type from the application
- [ ] Confirm `startDate` uses `offerStartDate` (or falls back to today)
- [ ] Confirm `currency` defaults to "USD" if not set on the application
- [ ] Confirm `payType` defaults to "salary" if not set
- [ ] Confirm `payFrequency` defaults to "biweekly" if not set
- [ ] Confirm `type` defaults to "remote" if not set

#### 1.2 — Salary & Pay Fields
- [ ] Set `offerSalary`, `offerPayType`, `offerPayRate`, `offerPayFrequency`, `offerHoursPerWeek`, `offerOtRate` on the application
- [ ] Accept the application → verify all pay fields transfer to the position

#### 1.3 — Auto-Created Benefits
- [ ] Set `offer401kMatch` (e.g. 6) on the application → accept → verify a "401(k) Match" benefit is created with "6% employer match" coverage
- [ ] Set `offerHealthCost` (e.g. 250.50) on the application → accept → verify a "Health Insurance" benefit is created with `employeeCost = 251` (rounded)
- [ ] Leave both null → accept → verify **no** benefits are created

#### 1.4 — Auto-Created Time Off
- [ ] Set `offerPtoDays` (e.g. 20) → accept → verify a `TimeOffBalance` with `totalDays=20`, `usedDays=0`, current year, `accrual=annual` is created
- [ ] Leave `offerPtoDays` null → accept → verify **no** time-off balance is created

#### 1.5 — Auto-Created Compensation Events
- [ ] Set `offerSigningBonus` (e.g. 5000) → accept → verify a "Signing Bonus" compensation event with `recurring=false`
- [ ] Set `offerAnnualBonus` (e.g. 10000) → accept → verify an "Annual Bonus" compensation event with `recurring=true`
- [ ] Set both → accept → verify **two** events created
- [ ] Set neither → accept → verify **no** events created

#### 1.6 — Activity Logging
- [ ] Accept an application → verify two activity logs: one for "status_changed" and one for "created" (auto-created position)

#### 1.7 — Toast & Navigation
- [ ] Accept an application → verify a success toast appears
- [ ] Toast should include a **"View Position"** action button
- [ ] Clicking "View Position" navigates to `/current-position`

#### 1.8 — Idempotency
- [ ] Change status from "accepted" to something else, then back to "accepted" → verify a **second** position is created (no deduplication — confirm this is expected behavior)

#### 1.9 — EIN Pass-Through
- [ ] Set `ein` on the application → accept → verify the position's `ein` field matches

---

## Feature 2: Stealth Mode Privacy System

A comprehensive 4-level profile visibility system for `/r/[slug]` public profiles, with access request workflows, employer blocking, and single-use burn-after-reading links.

### Files Changed / Created
- `prisma/schema.prisma` — New fields on UserProfile + new models: `AccessRequest`, `SingleUseLink`
- `prisma/migrations/20260326063905_add_stealth_mode/` — Migration
- `src/app/api/profile/route.ts` — Whitelist update for stealth fields
- `src/app/api/interactive-resumes/public/[slug]/route.ts` — Full rewrite with stealth logic
- `src/app/api/access-requests/route.ts` — NEW: GET (list) + POST (submit)
- `src/app/api/access-requests/[id]/route.ts` — NEW: PATCH (approve/deny) + DELETE
- `src/app/api/single-use-links/route.ts` — NEW: GET (list) + POST (create)
- `src/app/api/single-use-links/[id]/route.ts` — NEW: DELETE (revoke)
- `src/app/r/[slug]/page.tsx` — Stealth UI: banners, anonymous avatar, access request form
- `src/app/(app)/portal-settings/page.tsx` — Stealth Mode card, SingleUseLinksManager, AccessRequestsManager

---

### 2A — Visibility Modes (Portal Settings UI)

#### 2A.1 — Visibility Selector
- [ ] Open **Portal Settings** → scroll to **Stealth Mode** card
- [ ] Verify 4 visibility options are shown: Public, Stealth, Anonymous, Private
- [ ] Select each mode → click **Save** → refresh → verify selection persists
- [ ] Verify the selected mode shows a visual highlight (ring indicator)

#### 2A.2 — Anonymous Display Name
- [ ] Set visibility to **Stealth** or **Anonymous** → verify the "Anonymous Display Name" input appears
- [ ] Enter a custom name (e.g. "Senior DevOps Engineer") → save → verify it persists
- [ ] Set visibility to **Public** → verify the input disappears

#### 2A.3 — Hide Current Employer Toggle
- [ ] Toggle "Hide Current Employer" on → save → refresh → verify toggle is still on
- [ ] Toggle off → save → verify it's off

#### 2A.4 — Blocked Email Domains
- [ ] Enter domains like `evilcorp.com, badcompany.io` in the blocked domains input
- [ ] Save → refresh → verify domains persist (comma-separated)
- [ ] Verify they are stored as a JSON array in the database

---

### 2B — Public Visibility Mode (`/r/[slug]`)

#### 2B.1 — Full Profile Visible
- [ ] Set visibility to **Public** → visit `/r/[slug]`
- [ ] Verify full name, avatar, headline, summary, experience, skills, certs, contact info all shown
- [ ] Verify no stealth banner is displayed
- [ ] Verify no access request form appears

#### 2B.2 — Public + Hide Current Employer
- [ ] Set visibility to **Public** + enable "Hide Current Employer"
- [ ] Visit `/r/[slug]` → verify active positions show "Current Employer" instead of company name
- [ ] Verify past positions still show real company names

---

### 2C — Stealth Visibility Mode

#### 2C.1 — Redacted Identity
- [ ] Set visibility to **Stealth** → visit `/r/[slug]` (no token)
- [ ] Verify name shows custom anonymous title OR auto-generated `Verified Professional #XXXX`
- [ ] Verify avatar is replaced with a purple circle placeholder icon
- [ ] Verify an **"Identity Protected"** badge is shown
- [ ] Verify a yellow/amber **stealth banner** appears

#### 2C.2 — Content Still Visible
- [ ] Verify summary, skills, and certifications are still shown
- [ ] Verify experience entries show with current employer hidden ("Current Employer (Hidden)")
- [ ] Verify past employer names are still visible
- [ ] Verify contact info (email, LinkedIn, GitHub, portfolio) is **hidden** (null)

#### 2C.3 — Access Request Form
- [ ] Verify an access request form appears at the bottom of the profile
- [ ] Form should have fields: Name*, Email*, Company, LinkedIn, Message
- [ ] Submit with empty name/email → verify validation error
- [ ] Submit valid request → verify success message with checkmark icon

#### 2C.4 — City/State Location
- [ ] Verify city and state still display normally in stealth mode

---

### 2D — Anonymous Visibility Mode

#### 2D.1 — Fully Redacted
- [ ] Set visibility to **Anonymous** → visit `/r/[slug]` (no token)
- [ ] Verify name shows custom anonymous title OR auto-generated ID
- [ ] Verify avatar is the anonymous placeholder
- [ ] Verify an **"Anonymous"** badge is shown
- [ ] Verify summary is **completely hidden**
- [ ] Verify only skills and certifications sections are shown (no experience visible normally)

#### 2D.2 — Experience Redaction
- [ ] Verify all employer names show as **"Industry Employer"**
- [ ] Verify location, description, and techStack are all null/hidden
- [ ] Verify role names are still visible

#### 2D.3 — Location Redaction
- [ ] Verify city is replaced with "{State} area" (e.g. "California area")
- [ ] Verify state field is null

#### 2D.4 — Sections Reduced
- [ ] Verify the sections config only includes "skills" and "certifications"
- [ ] Verify contact section is completely absent

---

### 2E — Private Visibility Mode

#### 2E.1 — Complete Lockdown
- [ ] Set visibility to **Private** → visit `/r/[slug]`
- [ ] Verify a **404 / Not Found** response (page should not load at all)
- [ ] Verify even with a valid token, private mode returns 404

---

### 2F — Employer Blocking (Boss Block)

#### 2F.1 — Domain Blocking
- [ ] Add `evilcorp.com` to blocked domains → save
- [ ] Submit an access request using email `recruiter@evilcorp.com`
- [ ] Verify the request is **rejected** with 403 and a generic error ("Request could not be submitted")
- [ ] Verify the blocked domain check is **case-insensitive**

#### 2F.2 — Non-Blocked Domain
- [ ] Submit an access request using `recruiter@goodcompany.com` (not blocked)
- [ ] Verify the request is **accepted** and created successfully

#### 2F.3 — Invalid Email
- [ ] Submit an access request with email `not-an-email` → verify 400 error

---

### 2G — Access Request Workflow

#### 2G.1 — Submit Request (Recruiter Side)
- [ ] From a stealth/anonymous profile page, fill in the access request form
- [ ] Submit → verify 201 response and success UI shown
- [ ] Try to submit again with the **same email** → verify 409 error ("You already have a pending request")

#### 2G.2 — View Requests (Owner Side)
- [ ] Open **Portal Settings** → scroll to **Access Requests** section
- [ ] Verify pending requests show with: name, email, company, LinkedIn link, message, date
- [ ] Verify pending requests have a highlighted border (indigo)

#### 2G.3 — Approve Request
- [ ] Click **Approve** on a pending request
- [ ] Verify status changes to "Approved" with a badge
- [ ] Verify a toast says "Access approved — magic link generated!"
- [ ] Verify the request now has an `accessToken` and `tokenExpiresAt` (30 days from now)

#### 2G.4 — Deny Request
- [ ] Click **Deny** on a pending request
- [ ] Verify status changes to "Denied" with a badge
- [ ] Verify a toast says "Request denied"
- [ ] Verify no access token is generated

#### 2G.5 — Delete Request
- [ ] Click the trash icon on a resolved (approved/denied) request
- [ ] Verify it is removed from the list

#### 2G.6 — Magic Link Access
- [ ] Copy the access token from an approved request (check DB or network tab)
- [ ] Visit `/r/[slug]?token=<accessToken>`
- [ ] Verify the **full profile** is displayed (as if public), regardless of stealth/anonymous mode
- [ ] Verify "Hide Current Employer" is still respected even with a magic link

#### 2G.7 — Expired Token
- [ ] Manually set a token's `tokenExpiresAt` to a past date in the DB
- [ ] Visit `/r/[slug]?token=<expiredToken>`
- [ ] Verify the profile shows in its redacted mode (stealth/anonymous), NOT full access

---

### 2H — Single-Use "Burn After Reading" Links

#### 2H.1 — Create Link (Portal Settings)
- [ ] Open **Portal Settings** → scroll to **Single-Use Links** section
- [ ] Enter a label (e.g. "For Google Recruiter")
- [ ] Select expiry (1 day, 7 days, 30 days, 90 days)
- [ ] Click **Generate Link** → verify a link appears in the list

#### 2H.2 — Link Display
- [ ] Verify newly created link shows with **Active** badge (green)
- [ ] Verify it shows the label, expiry date
- [ ] Click the copy button → verify the URL is copied to clipboard
- [ ] Verify the copied URL format is like `/r/[slug]?token=<longtoken>`

#### 2H.3 — First Use (Burns)
- [ ] Open the copied link in a browser (incognito recommended)
- [ ] Verify the **full profile** is displayed
- [ ] Return to Portal Settings → verify the link now shows **Viewed** badge (blue)
- [ ] Verify it shows when it was viewed

#### 2H.4 — Second Use (Burned)
- [ ] Open the **same** link again
- [ ] Verify the profile is now shown in its **redacted** mode (stealth/anonymous) — the link was already used
- [ ] The token should NOT grant full access a second time

#### 2H.5 — Expired Link
- [ ] Create a link with 1-day expiry
- [ ] Manually set `expiresAt` to a past date in the DB
- [ ] Visit the link → verify it does NOT grant full access
- [ ] Verify the link shows **Expired** badge (red) in Portal Settings

#### 2H.6 — Delete Link
- [ ] Click the trash icon on a link → verify it is removed
- [ ] Visit the deleted link's URL → verify no access is granted

#### 2H.7 — Token Length Routing
- [ ] Verify single-use link tokens are 64 chars (32 bytes hex)
- [ ] Verify the public API distinguishes between single-use tokens (>40 chars) and access request tokens

---

### 2I — Profile API Whitelist

#### 2I.1 — Save Stealth Fields
- [ ] PATCH `/api/profile` with `{ visibility: "stealth", hideCurrentEmployer: true, anonymousTitle: "Test Title", blockedDomains: "[\"test.com\"]" }`
- [ ] Verify all fields are saved and returned correctly

#### 2I.2 — Reject Unknown Fields
- [ ] PATCH `/api/profile` with a field NOT in the whitelist (e.g. `{ hackerField: "bad" }`)
- [ ] Verify it is silently ignored / not persisted

---

### 2J — Edge Cases & Security

- [ ] Verify access request POST endpoint does NOT require authentication (public)
- [ ] Verify access request GET/PATCH/DELETE endpoints DO require authentication
- [ ] Verify single-use link endpoints all require authentication
- [ ] Verify ownership checks: user A cannot approve/deny/delete user B's access requests
- [ ] Verify ownership checks: user A cannot delete user B's single-use links
- [ ] Verify a single-use link for profile A doesn't grant access to profile B's resume
- [ ] Verify an access request token for profile A doesn't work on profile B's resume
- [ ] Visit `/r/[slug]?token=invalidgarbage` → verify it gracefully falls back to redacted mode
- [ ] Verify the `viewedBy` field on a single-use link records the user-agent string

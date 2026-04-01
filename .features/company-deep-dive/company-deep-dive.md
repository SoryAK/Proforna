# Company Deep Dive — Bulk Feature Update

**Status:** In Progress  
**Component:** `src/components/company-deep-dive.tsx`  
**API:** `src/app/api/company-research/route.ts`  
**Prisma:** `CompanyProfile` model + new `CompanyWatchlist` model  

---

## Existing Foundation

- 5-tab modal: Overview, Salary, Roles, Locations, Federal Records
- Federal data from SEC EDGAR, OSHA, DOL Form 5500, OpenCorporates
- Cached via `CompanyProfile` Prisma model (30-day TTL)
- Launched from job cards and floating detail panel in job-map.tsx
- Analytics: salary range, hiring velocity, recruiter ratio, role categorization

---

## Improvements

### 1. Google Places Data in Deep Dive
**What:** Surface Google Places business info (rating, website, phone, hours, editorial summary) inside the Deep Dive modal header — data already available from `addressCache` in job-map.tsx.  
**Files Changed:** `company-deep-dive.tsx`, `job-map.tsx`  
**Test Plan:**
- [ ] Open Deep Dive for a company that has Google Places data → rating stars, website link, phone, hours visible in header
- [ ] Open Deep Dive for a company without Places data → no error, graceful fallback
- [ ] Verify data matches what's shown on the floating job card

### 2. Company News Tab
**What:** Add a 6th "News" tab that fetches recent news articles about the company via Google News RSS feed.  
**Files Changed:** `company-deep-dive.tsx`, new API route `src/app/api/company-research/news/route.ts`  
**Test Plan:**
- [ ] Open Deep Dive → News tab visible
- [ ] Click News tab for a well-known company (e.g. Google, Amazon) → articles appear with title, source, date, link
- [ ] Click News tab for obscure company → shows "No recent news found" gracefully
- [ ] Articles open in new tab when clicked
- [ ] Loading spinner while fetching

### 3. Salary Benchmarking vs Market
**What:** Add a market comparison bar to the Salary tab showing the company's avg salary vs the area-wide mean salary from Adzuna.  
**Files Changed:** `company-deep-dive.tsx`, `job-map.tsx` (pass `meanSalary` prop)  
**Test Plan:**
- [ ] Salary tab shows "vs Market" comparison bar when both company and market salary data exist
- [ ] Bar shows green when company pays above market, amber when below
- [ ] Percentage difference displayed (e.g. "+12% above market")
- [ ] When no market data available, comparison section hidden gracefully
- [ ] When no company salary data, entire salary tab shows existing empty state

### 4. Company Watchlist / Tracking
**What:** Save companies to a personal watchlist for long-term monitoring. Adds a bookmark button to the Deep Dive header and a compact watchlist section.  
**Files Changed:** `company-deep-dive.tsx`, `prisma/schema.prisma` (new model), new API route `src/app/api/company-watchlist/route.ts`  
**Test Plan:**
- [ ] Bookmark/star button in Deep Dive header toggles saved state
- [ ] Saved companies persist across sessions (DB-backed)
- [ ] Un-bookmarking removes from watchlist
- [ ] API: GET returns user's watchlist, POST adds, DELETE removes

### 5. Side-by-Side Company Comparison
**What:** Compare two companies on salary range, safety record, benefits, hiring velocity, and location footprint.  
**Files Changed:** `company-deep-dive.tsx` (comparison sub-component)  
**Test Plan:**
- [ ] "Compare" button in Deep Dive header opens comparison panel
- [ ] Second company selectable from companies found in current search results
- [ ] Metrics displayed side-by-side: salary range, open roles, velocity, locations, OSHA violations, recruiter ratio
- [ ] Color-coded: green for better metric, amber for worse
- [ ] Works when one company has missing data in some categories

### 6. Dedicated Company Page
**What:** Full-page company view at `/company/[name]` that renders the Deep Dive as a page instead of just a modal.  
**Files Changed:** New route `src/app/(app)/company/[name]/page.tsx`, `company-deep-dive.tsx` (link from dialog)  
**Test Plan:**
- [ ] Navigate to `/company/Google` → full-page Deep Dive rendered
- [ ] "Open full page" link in Deep Dive dialog navigates to the company page
- [ ] Page works with URL-encoded company names (spaces, special chars)
- [ ] Page loads company data independently (not reliant on job-map state)
- [ ] Back button returns to previous page

---

## Migration Required
- New `CompanyWatchlist` model in Prisma schema for Improvement #4

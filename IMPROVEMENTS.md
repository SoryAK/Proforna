# Resumsify — Future Improvements

## Recruiter Job Location Accuracy

**Problem:** Many jobs are posted by recruiting agencies (Insight Global, Robert Half, TEKsystems, Randstad, etc.) whose listed address is the recruiter's office — not the actual employer's. This makes commute data, Life Anchor scores, and map markers wrong for those jobs.

**Proposed Solution (MVP):**

1. **Recruiter detection** — Pattern match on `company` field against known recruiter/staffing firm names. Flag the job as recruiter-sourced.

2. **Confidence indicator** — Show a visual badge on recruiter-flagged jobs (e.g., "via recruiter") and dim/dash their map markers so users know the location may be inaccurate.

3. **"Where's the office?" prompt** — On the floating card for flagged jobs, show an inline PlacesAutocomplete: _"This job was posted by a recruiter. Know the actual office location?"_ User enters the real address, which overrides coords for commute/map.

4. **Persist overrides** — Save user-corrected addresses (keyed by job ID) so they don't need to re-enter. Store in `localStorage` or a DB table.

**Future enhancements (once full descriptions are available):**
- NLP extraction of real office location from job description ("office in King of Prussia", "onsite in Malvern, PA")
- Company-to-HQ lookup via Google Places API when the real employer name is extractable
- Cross-reference duplicate postings (same role posted by recruiter AND directly by employer)
- Crowdsource corrections across users

### Landmark Association (Auto-Detect Actual Employer)

**Insight:** When Google resolves a job's address, it returns the landmark/business name at that location. If the landmark name differs from the job poster, it's a strong signal that:
- The poster may be a recruiter
- The landmark business may be the actual employer

**Example:** Job posted by "Covanta" at an address that Google resolves to "Reworld™ Delaware Valley." The mismatch reveals the actual company at that physical location.

**Implementation:**
1. When resolving a job's address via Google Geocoding/Places API, capture the `name` field from the response (the landmark/business name)
2. Compare poster company name vs landmark name (fuzzy match)
3. If mismatch detected:
   - Auto-suggest: "This location is registered as [Landmark Name]. Is that the actual employer?"
   - One-click to swap company association
   - Use the landmark business's Google Place ID for richer data (see Google Places Enrichment below)
4. Store mismatch patterns to improve future detection

### Crowdsourced Recruiter Flagging (Waze Model)

**Concept:** Let users flag companies as recruiting agencies, building a community-driven database over time — similar to how Waze crowdsources road hazards.

**Implementation:**
1. **Flag button** — On any job card or Company Deep Dive, a "Flag as recruiter" button
2. **DB table** — `recruiter_flags`: company name (normalized), flag count, first flagged date, confirmed (boolean)
3. **Threshold system** — After N flags (e.g., 3), auto-mark the company as a known recruiter
4. **Seed list** — Pre-populate with known large staffing firms (Robert Half, Randstad, TEKsystems, Insight Global, Adecco, ManpowerGroup, Kelly Services, Hays, etc.)
5. **Benefits cascade:**
   - Flagged recruiter jobs get confidence badge automatically
   - "Where's the office?" prompt shown by default
   - Landmark association check triggered automatically
   - Feeds into Company Deep Dive metadata

---

## Google Places Enrichment for Companies

**Problem:** Users leave the app to research basic company info (website, phone, reviews, hours). Google Places API already provides all of this data at the point of address resolution.

**What Google Places API returns:**
- Business name, website URL, phone number
- Google rating + review count
- Business hours (open now indicator)
- Business type/category
- Photos
- Price level (for relevant industries)
- Editorial summary / "About" text
- Permanently closed indicator (red flag for job listings)

**Implementation:**

1. **Place ID capture** — When resolving a job's address, store the Google `place_id` from the response
2. **Place Details fetch** — Call Places API (New) with the place_id to get enriched data:
   ```
   GET https://places.googleapis.com/v1/places/{placeId}?fields=displayName,websiteUri,nationalPhoneNumber,rating,userRatingCount,regularOpeningHours,editorialSummary,businessStatus,types,photos
   ```
3. **Fields to surface:**
   - Website link (clickable from floating card)
   - Phone number (click-to-call on mobile)
   - Google rating + review count with star display
   - "Open now" / business hours
   - "About" summary
   - Business status (operational / closed / temporarily closed)

**UI — Floating card "Quick Info" section:**
```
🌐 reworld.com  |  📞 (610) 555-1234
⭐ 3.8 (142 reviews)  |  🕐 Open · Closes 5 PM
"Waste-to-energy facility serving the Delaware Valley..."
```

**UI — Company Deep Dive "Overview" tab:**
- Full business profile with photos
- Google reviews preview (top 3-5 most relevant)
- Hours table
- All office locations from Google (multi-location businesses)

**Cost:** Places API (New) pricing:
- Place Details (Basic): $0.00 per call (included fields: name, address, hours, status)
- Place Details (Advanced): ~$0.025 per call (includes reviews, website, phone)
- Place Details (Preferred): ~$0.035 per call (includes photos, editorial summary)
- Budget approach: fetch Basic for all jobs, Advanced/Preferred only on Company Deep Dive click

---

## Enhanced Commute Calculator with Ranges & Cost

**Problem:** Current commute display shows a single duration/distance — the API's "optimal" route at an unspecified time. This is misleading because there are always multiple routes, commute varies by time of day, and users have no idea how cost is calculated. A single number creates false precision.

**Phase 1 — User Commute Profile (settings)**
- Gas price per gallon (default from national avg, user-editable)
- Vehicle MPG (or electric cost/mi)
- Days in office per week (slider: 1–5, or "varies")
- Toll preference (avoid / okay with tolls)
- Typical departure time (morning commute hour — affects route quality)

**Phase 2 — Multi-Route Fetch**
- Google Directions API with `alternatives=true` returns up to 3 routes
- Store best, typical, worst duration + distance per anchor→job pair
- Display as a range: "25–38 min" instead of "32 min"

**Phase 3 — Yearly Cost Calculator**
- Formula: `(distance_mi / mpg) × gas_price × 2 × days_per_week × 52`
- Show yearly cost range based on best/worst routes: "$2,400–$3,800/yr"
- Include tolls if available from the API
- User-adjustable slider to model "what if I go in 3 days instead of 5"

**Phase 4 — UI Integration**
- Floating card: range display ("25–38 min • $2.4k–$3.8k/yr")
- Expandable detail: tap to see 3 route options with names ("via I-476", "via Route 1", "via I-95")
- Map: render selected route, let user toggle between alternatives
- Life Anchor breakdown: each anchor shows its own range

**Data flow:**
```
User Profile (mpg, gas, days, departure time)
        ↓
Directions API (alternatives=true, departure_time)
        ↓
3 routes → min/max duration + distance
        ↓
Cost calc with user params → yearly range
        ↓
Display: "25–38 min • $2.4k–$3.8k/yr"
```

**Phase 5 — Live Traffic Integration**
- Add `departure_time=now` to Directions API calls for real-time traffic-aware durations
- Read `duration_in_traffic` instead of `duration` for driving mode
- For future predictions, use `departure_time=<timestamp>` with the user's commute profile departure hour
- Display: "32 min (in current traffic)" alongside the range
- Note: real-time traffic only works for driving mode, not transit/walking/biking
- Same API cost as standard Directions requests (~$0.005–$0.01 per call)

---

## Company Deep Dive

**Problem:** Users research companies outside the app. We already collect job data per company (salary, location, frequency) but don't aggregate or surface it. Keeping users in-app for company research makes existing data far more valuable.

**What to show:**

1. **Salary intelligence** — Aggregate all listings from the same company: "Company X pays $85k–$120k across 14 listings in your area"

2. **Hiring velocity** — Number of open roles, posting frequency over time, growth vs backfill signals

3. **Location footprint** — Map all their office locations, highlight which are within commute range of user's Life Anchors

4. **Role diversity** — What types of roles they're hiring for (engineering-heavy, sales-heavy, etc.) — signals company health and culture

5. **Recruiter vs direct ratio** — What % of listings come through recruiters vs posted directly. Heavy recruiter usage can signal urgency or HR capacity issues.

6. **Review integration (future)** — Glassdoor/Indeed ratings, interview difficulty, culture scores

**UI Entry point:** Click company name anywhere → opens Company Deep Dive panel/page

---

## EIN-Based Federal Records Search

**Problem:** Job seekers have no easy way to check a company's regulatory record before accepting an offer. Public federal data exists but is scattered across dozens of government databases. An EIN (Employer Identification Number) is the key that ties them together.

**How to resolve EIN:**
- SEC EDGAR full-text search (public companies)
- IRS Exempt Organizations database (nonprofits — free)
- OpenCorporates API (business registration records)
- ProPublica Nonprofit Explorer API (free, includes EIN)

**Data sources unlocked by EIN:**

1. **OSHA violations & inspections** — Workplace safety incidents, fines, citations. Free OSHA API searchable by company name/EIN. Show: "3 safety violations in last 2 years."

2. **DOL Wage & Hour violations** — Unpaid overtime, misclassification, wage theft. DOL enforcement database is publicly searchable. High-impact for job seekers.

3. **EEOC complaints** — Discrimination lawsuits and settlements via public court records.

4. **SEC filings (public companies)** — 10-K/10-Q filings reveal layoffs, financial health, pending litigation, executive compensation. Free EDGAR API.

5. **PPP loan data** — COVID handling, reported employee count, forgiveness status. Public via SBA.

6. **NLRB records** — Union activity, unfair labor practice complaints. Reveals labor relations climate.

7. **State-level data** — Workers comp claim frequency, business registration status. Varies by state.

8. **IRS 990s (nonprofits)** — Full financial transparency: top executive salaries, revenue, spending breakdown. ProPublica Nonprofit Explorer API (free).

**Integration with existing features:**
- Ties into the **Worker Rights** page already in the app
- Feeds into **Company Deep Dive** as a "Federal Records" tab
- Company risk score: aggregate OSHA + DOL + EEOC data into a simple red/yellow/green indicator

**Differentiator:** LinkedIn shows reviews. Glassdoor shows salaries. Nobody shows "this company has 5 OSHA violations, a DOL wage theft case from 2024, and their EEOC complaint rate is 3x industry average."

---

## Company Deep Dive — Prioritized Feature Spec

### Priority 1: H-1B / PERM Wage Data (Highest Impact)

**Why:** Companies must certify a "prevailing wage" when sponsoring visa workers. This is the salary they legally declared for that exact role and location. Users can compare their offer against hard government-certified numbers.

**Data source:** DOL FLAG (Foreign Labor Application Gateway) / iCERT system
- Free, publicly searchable: https://www.dol.gov/agencies/eta/foreign-labor
- LCA (Labor Condition Application) data for H-1B
- PERM data for permanent labor certifications
- Fields: employer name, job title, SOC code, wage offered, prevailing wage, worksite city/state, filing date, status

**API approach:**
- DOL datasets available as bulk CSV downloads (updated quarterly) or via DOL API
- Match by company name (fuzzy match) + job title + location
- Cache results per company

**UI:**
- "Certified Wages" card in Company Deep Dive
- Table: role title, wage offered, prevailing wage, location, date filed
- Highlight: "For [role similar to yours], this company certified $X/yr in [location]"
- Negotiation insight: "Your offer is $X below/above their certified prevailing wage"

---

### Priority 2: WARN Act Notices (Layoff Early Warning)

**Why:** The Worker Adjustment and Retraining Notification Act requires 60-day advance notice of mass layoffs (100+ employees) or plant closings. A company actively recruiting while filing WARN = massive red flag.

**Data source:** State workforce agency websites
- No single federal API — each state publishes separately
- ~40 states publish online, many as downloadable CSVs or searchable databases
- Key states to start: CA, NY, TX, PA, NJ, IL, FL, GA, WA, MA (covers majority of tech/professional jobs)

**API approach:**
- Build a scraper/aggregator for top 10 states initially
- Store in DB: company name, location, number affected, layoff date, filing date
- Match by company name (fuzzy match)
- Update weekly via scheduled job

**UI:**
- "Layoff Alerts" card — red banner if active WARN filing exists
- Timeline: past WARN notices for this company
- Context: "This company filed a WARN notice on [date] affecting [N] employees in [location]"
- Link to source document

---

### Priority 3: DOL Wage & Hour Violations

**Why:** Wage theft (unpaid overtime, misclassification, minimum wage violations) is the most common labor violation in the US. Users deserve to know before they accept an offer.

**Data source:** DOL Wage and Hour Compliance Action Data
- Free, public: https://enforcedata.dol.gov/views/data_summary.php
- Searchable by employer name, EIN, industry, location
- Fields: back wages found, civil penalties, employees affected, violation types, investigation dates
- Also available as bulk download

**API approach:**
- DOL Enforcement API (free, no key required): `https://enforcedata.dol.gov/api/...`
- Match by company name + location
- Cache per company, refresh monthly

**UI:**
- "Wage Compliance" card in Company Deep Dive
- Summary: total back wages owed, number of violations, number of employees affected
- Timeline of investigations
- Severity indicator: green (clean) / yellow (minor) / red (significant violations)
- Violation types breakdown (overtime, minimum wage, child labor, etc.)

---

### Priority 4: OSHA Injury & Violation Rates

**Why:** Critical for non-desk jobs but valuable for all workers. Shows workplace safety culture — a company with repeated OSHA violations may cut corners elsewhere too.

**Data source:** OSHA Enforcement Data
- Free API: https://enforcedata.dol.gov/views/data_catalogs.php
- Inspection data: inspection type, violations found, penalties, open/closed date
- Injury/illness data: OSHA 300A summaries (annual injury rates)
- Searchable by company name, EIN, SIC/NAICS code, location

**API approach:**
- Same DOL Enforcement API as Priority 3 (different endpoint)
- Match by company name + location
- Include: DART rate (Days Away, Restricted, Transferred) and TCIR (Total Case Incident Rate) vs industry average

**UI:**
- "Workplace Safety" card
- Injury rate vs industry average (chart or gauge)
- Violation timeline with severity (serious, willful, repeat vs other)
- Total penalties assessed
- Most recent inspection date and outcome
- Flag: "No inspections on record" (could mean small company or avoidance)

---

### Priority 5: CEO Pay Ratio

**Why:** Since 2018, SEC requires public companies to disclose CEO total compensation vs median employee pay. This gives users direct context: "The CEO makes 287x what the median employee earns."

**Data source:** SEC EDGAR
- DEF 14A (proxy statement) filings contain the mandated pay ratio disclosure
- Free EDGAR full-text search API: https://efts.sec.gov/LATEST/search-index?q=
- Also available via structured XBRL data for some filers

**API approach:**
- Search EDGAR by company CIK (Central Index Key) — resolve from company name
- Parse DEF 14A for pay ratio disclosure (regex or structured XBRL)
- Cache indefinitely (updates annually per company)

**UI:**
- "Executive Compensation" card
- CEO total comp, median employee comp, ratio
- Visual: ratio bar or comparison graphic
- Trend over 3–5 years if available
- Context: "Industry average ratio is X:1. This company is Y:1."

---

### Priority 6: SEC 8-K Filings (Real-Time Material Events)

**Why:** 8-K filings are triggered by significant events: layoffs, restructuring, mergers, leadership changes, bankruptcy, material litigation. These are real-time signals about company stability.

**Data source:** SEC EDGAR
- Free EDGAR API: https://efts.sec.gov/LATEST/
- Full-text search across filings
- 8-K item codes indicate event type:
  - Item 2.05: Costs for exit/restructuring (layoffs)
  - Item 1.01: Material agreements (mergers/acquisitions)
  - Item 5.02: Departure of directors/officers
  - Item 1.03: Bankruptcy
  - Item 2.06: Material impairments

**API approach:**
- Resolve company → CIK via EDGAR company search
- Fetch recent 8-K filings (last 12 months)
- Parse item codes to categorize event type
- Cache with daily refresh for actively viewed companies

**UI:**
- "Recent Events" timeline card
- Color-coded by event type: restructuring (red), leadership change (yellow), acquisition (blue)
- Each entry: date, event summary, link to full filing
- Alert badge if restructuring/bankruptcy filings exist in last 6 months

---

### Implementation Order & Dependencies

```
Phase A — Foundation
  ├── Company name → EIN/CIK resolver (needed by P3-P6)
  ├── Company Deep Dive page/panel shell
  └── Company data cache layer (DB or Redis)

Phase B — Free APIs, No EIN Required
  ├── P1: H-1B/PERM wage data (DOL bulk data, match by name)
  └── P3: DOL Wage violations (DOL Enforcement API, match by name)

Phase C — EIN-Dependent Federal Data
  ├── P4: OSHA (DOL Enforcement API, match by name or EIN)
  └── P5: CEO Pay Ratio (SEC EDGAR, needs CIK)
  └── P6: SEC 8-K filings (SEC EDGAR, needs CIK)

Phase D — State-Level Aggregation
  └── P2: WARN Act (state-by-state scraper, start with top 10 states)
```

**Cost:** All data sources listed above are free/public. Primary cost is development time and storage for caching.

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

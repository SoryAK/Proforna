1. I need to transfer over the bio crad to the work mapping allowing the user to edit that sectmion before publishing the changes [completed]
2. I need to add a publish/update/push feature that pushes any changes from the work mapping to the IR that way incomplete edits dont show on the IR [completed]
3. I need to find a better wasy to show the user minim requirements as well as the eductation and bio 
4. I should add gallery for the business banner 
5. I should add business info so that the recruiter can get an overview of the company 
6. I should make it editable and allowing the user to show what they want in the work history info section [completed]
7. for the recruiter notes the recruiter should be able to click on things and add it to their notes for talking points/point of interest (This can later help transition over to interview portal) [completed]
8. There should be a question asking the recruiter if they would like to be apart of the user network[completed]
9. I should make it so when you're in the work mapping mode the map goes full screen so it owuld beasically behave and look like the IR but revert back when job seeking [completed]

10. Pin → Vector Outline swap at high zoom (z >= 16): when the user is focused on a job and zoomed in past z16, hide the focused item's pin and let the building outline take over as the visual marker. The polygon already mirrors the recency color and sits exactly on the building, so the pin becomes redundant and competes for attention. Only hide the pin if a footprint actually rendered (fallback safety for addresses with no OSM building). Add a hover effect on the polygon (stroke 3→4, fillOpacity 0.25→0.35). Other (non-focused) pins stay visible to preserve at-a-glance career context. Apply to both IR (resume-immersive-map.tsx) and the work-mapping editor (job-map.tsx). Skip InfoWindow on the polygon since the focus card on the right already shows full details.

11. At some point I have to add feature that notfies you/ the recruiter that the company you worked for closed 
12. We should implement a global search 
13. At some point we need to implement a guide to help recruiters understand what and IR is and how to navigate it

14. **Recruiter Search & JD Match (in IR)** — As an IR grows dense over a career, recruiters won't read the whole thing. Build a recruiter-facing search/match layer on the public IR so they can find what they need in seconds.

    **Phase A — Recruiter Search Bar (in IR):** Floating search input on the public IR (top-right pill or `Ctrl/Cmd+K`). Type a keyword (e.g. "kubernetes") → instantly see grouped results across the candidate's data:
    - Skills (with proficiency + years)
    - Work history positions (title, company, dates)
    - Position descriptions / responsibilities / accomplishments
    - Projects
    - Education / certifications
    - Career events / milestones
    - Industries / occupations tagged

    Each result is clickable → flies the map to that position / opens the relevant panel. Server-side Postgres `ILIKE` for v1 — no AI cost, instant. Decide which fields stay locked behind contact-unlock.

    **Phase B — Paste-a-JD Match (the headline feature):** "Match this job" button in Recruit Mode. Recruiter pastes a job description, we:
    1. Extract keywords/required skills from the JD (regex + skills dictionary, or lightweight LLM call)
    2. Cross-reference against the candidate's IR data (reuses Phase A index)
    3. Show a structured match report:
       - Match score (e.g. 78%)
       - Strong matches — skills/experience clearly present, with evidence links into the IR
       - Partial matches — adjacent skills or older experience
       - Gaps — JD requirements with no IR evidence
       - Bonus — relevant strengths not in the JD

    This is the **"don't make me read the whole IR"** feature — directly addresses the dense-IR problem.

    **Phase C — Ask-a-Question (LLM, later):** Chat box on the IR — "Has she ever managed budgets over $1M?" → grounded answer with citations into the IR. Adds AI infra/cost; defer until A + B prove value.

    Build order: A → B → C. Skip life anchors / residence history from the searchable index (not recruiter-relevant).



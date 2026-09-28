# 0004 — Onboarding verifies the extract before it is kept

- **Status:** Accepted
- **Date:** 2026-09-27
- **Deciders:** Sory Kaba
- **Tags:** product, onboarding, extract, career history

## Context

Onboarding used to ask for a resume first, then walk one role at a time, and
end on a screen that said the map could start. The extract was also asked for
an address and for links. The occupant can type those more reliably than a
model can find them, and a model can still hallucinate a role or miss one.

The extract is one response. A job is not finished until that response ends.
Showing the first job while later jobs are still being written would often
mean a title with no duties, and an edit made in that window could be
replaced when the rest of the response arrives.

## Decision

- Onboarding is Profile, Model, Resume, then Verify. Verify is the last step.
  Continue there writes the kept records and finishes. There is no further
  ready screen.
- Profile collects a photo, name, residence, and online links before a resume
  is read. The extract looks for jobs and schools. It is not asked for those
  profile fields.
- A local model is preferred. Choosing a cloud model discloses that the
  provider may read, retain, report, and train on what is sent.
- The resume can be previewed, and extract is optional. When it runs, Verify
  waits until the whole extract returns.
- Verify lists every extracted job and school. The occupant compares each one
  with the uploaded resume, corrects it, sets it aside, or adds a job or
  school the extract missed. A blank added record is dropped.
- A resume file and a link the occupant types are the ways career history
  enters from outside. Scanning a LinkedIn page is not one of them.

## Consequences

- A missed role is entered during Verify, with the resume still on screen.
- An internship is kept as a job until Career History records that kind. The
  extract does not invent it from the title.
- Streaming a partial extract into Verify is rejected for this cut.

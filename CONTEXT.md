# Proforna Career Management

Proforna is a private career operating system. It turns evidence from a
person's work into trustworthy career facts, plans, artifacts, and approved
external actions.

## Language

**Occupant**:
The person whose career is managed by a local Proforna vault.
_Avoid_: User, account, candidate

**Career Vault**:
The occupant's authoritative local collection of private career data and
files.
_Avoid_: Account database, cloud profile

**Evidence**:
Immutable source material that supports or challenges a career fact.
_Avoid_: Attachment, proof

**Career Fact**:
A versioned assertion about the occupant's identity, work, education, skills,
achievements, or preferences, linked to its evidence.
_Avoid_: Profile field, resume item

**Career Memory**:
The resolved body of evidence-backed career facts available for planning and
artifact creation.
_Avoid_: Knowledge base, profile

**Worklog Entry**:
A dated capture of work, an outcome, a lesson, or an artifact that may yield
proposed career facts.
_Avoid_: Note, journal entry

**Opportunity**:
An external possibility that may advance a career goal, including a role,
project, speaking event, or connection.
_Avoid_: Job lead, application

**Resume Variant**:
An editorial strategy for presenting selected career facts to a particular
role or audience.
_Avoid_: Resume file, template

**Resume Revision**:
An immutable rendering source pinned to exact career-fact versions.
_Avoid_: Draft, version

**Work Map Role**:
The enriched record of one job, internship, or school, including locations,
milestones, media, work conditions, equipment, growth, departure reflection,
and linked career evidence. Career Facts about that role use it as their
subject.
_Avoid_: Resume entry, job card

**Work Map**:
The occupant's private authoring surface for exploring and enriching career
history across time and geography. Occupant-facing chrome names this Career
History. Current roles are marked on that list rather than given their own
navigation item. Work sites on a role can be added, edited, removed, looked
up from an address, or placed on the map. It is the source of interactive
publications, not a publication itself.
_Avoid_: Interactive resume, public profile

**Interactive Projection**:
An immutable, explicitly approved, redacted snapshot of the Work Map for a
specific audience. Pay, ratings, growth notes, departure reflection, and
working conditions stay private unless the occupant approves each one for
publishing.
_Avoid_: Public profile, portfolio

**Publication**:
A relay-hosted instance of an interactive projection with a slug, access
policy, and revocation state.
_Avoid_: Sync, deployment

**Change Set**:
The exact career mutations or external actions proposed by an agent or the
occupant for atomic approval.
_Avoid_: AI response, suggestion

**Approval**:
Authorization bound to one exact change set, destination, and expiry.
Publication, revocation, access grants, and publication settings use this
same trail.
_Avoid_: Confirmation, consent

**Notice**:
A pending item that needs the occupant's attention, currently an inbound
access request or a proposed change set. Granting, declining, or approving
clears it.
_Avoid_: Alert, toast, reminder, notification center

**Agent Run**:
A recorded execution with declared purpose, inputs, capabilities, and
resulting proposals.
_Avoid_: Chat, automation

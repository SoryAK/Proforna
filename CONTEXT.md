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
Immutable source material that supports or challenges a career fact. A
stored resume file is Evidence. Extracted jobs, schools, and skills are
Career Facts that point at that file.
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
An external possibility that may advance a career goal, including a job the
occupant has not taken, a project, a speaking event, or a connection. The
occupant finds and pursues them on one surface. A listing they keep is an
Opportunity.
_Avoid_: Job lead, application, job search page

**Job Source**:
A named place the occupant asks Proforna to read listings from. When that
place requires an application id or an API key, those stay in the Career Vault.
_Avoid_: Job board, integration

**Integration**:
A connection the occupant configures in Settings → Integrations so Proforna
can use that account when asked. Gmail is one connection. It is not a second
sign-in. Proforna does not search a fixed window of that mail, and it does
not file those messages into Opportunities, applications, interviews, offers,
or contacts on its own.
_Avoid_: Job mail, second sign-in, inbox

**Life Anchor**:
A named place the occupant weights when judging whether a possibility fits
their life.
_Avoid_: Commute, home pin

**Contact**:
A person the occupant keeps a relationship with. Occupant-facing chrome names
this list My Network. An Opportunity is why they showed up; the Contact is
who they are.
_Avoid_: Connection, lead, recruiter record

**Conversation**:
The back-and-forth messages with one Contact. Inbound messages are Evidence.
It is not a Notice and not an Opportunity.
_Avoid_: Inbox, mailbox, chat, thread

**Resume Variant**:
An editorial strategy for presenting selected career facts to a particular
role or audience.
_Avoid_: Resume file, template

**Resume Revision**:
An immutable rendering source pinned to exact career-fact versions.
_Avoid_: Draft, version

**Role**:
A job, internship, or school in the career, and the subject of the locations,
achievements, events, and Career Facts about that work. It can enter from a
resume, from the occupant, or from other vault records; the Work Map shows
and enriches it and is not where it originates.
_Avoid_: Work Map Role, resume entry, job card, job profile

**Work Map**:
The occupant's private surface for showing and enriching Roles across time
and geography. Occupant-facing chrome names Career History. Current
roles are marked on that list rather than given their own navigation item.
Work sites on a role can be added, edited, removed, looked up from an
address, or placed on the map. It is the source of interactive publications,
not a publication itself.
_Avoid_: Interactive resume, public profile

**Interactive Projection**:
An immutable, explicitly approved, redacted snapshot of the Work Map for a
specific audience. Pay, ratings, growth notes, departure reflection, and
working conditions stay private unless the occupant approves each one for
publishing.
_Avoid_: Public profile, portfolio

**Publication**:
A relay-hosted instance of an interactive projection with a slug, access
policy, and revocation state. Human readers view an interactive layout shaped
for reading. External agents reading via MCP receive the exact same approved,
redacted snapshot—governed by the publication's access policy and decoupled
from the raw local vault.
_Avoid_: Sync, deployment

**Change Set**:
The exact career mutations or external actions proposed by an agent or the
occupant for atomic approval.
_Avoid_: AI response, suggestion

**Extract Model**:
An optional OpenAI-compatible connection the occupant can use to extract
jobs and schools from a resume. Local servers such as Ollama and llama.cpp
are preferred; a cloud key is a disclosure that resume text may leave this
machine.
_Avoid_: Agent, assistant, chatbot

**Verify**:
The occupant's pass over jobs and schools extracted from a resume by an
`extract-facts` agent run, compared with that file, before they enter Career
History. A record can be corrected, set aside, or added when the extract missed
it.
_Avoid_: Check, import wizard

**Approval**:
Authorization bound to one exact change set, destination, and expiry.
Publication, revocation, access grants, and publication settings use this
same trail.
_Avoid_: Confirmation, consent

**Notice**:
A pending item that needs the occupant's attention: an inbound access
request, a proposed change set awaiting approval, or the first unread message
from a Contact. Opening it goes directly to the surface that can review that
item.
_Avoid_: Alert, toast, reminder, notification center, inbox

**Agent Run**:
A recorded execution with declared purpose, inputs, capabilities, and
resulting proposals. Occupants talk to Proforna, not named agents. Purposes
in the shipped cut are inspect, extract-facts, suggest-reply, and command —
never a picker or specialist chrome. The governed-agency epic (#49) is done;
see docs/agent-authority.md. A cloud model requires an explicit grant before
vault text may leave the machine.
_Avoid_: Chat, automation, agent picker, named specialist bot

**Command Session**:
A persisted Home conversation with Proforna. Each occupant turn is a command
Agent Run. It does not send messages, extract facts, or write Change Sets.
_Avoid_: Chat, assistant thread, inbox

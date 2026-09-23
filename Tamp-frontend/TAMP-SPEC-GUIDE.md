# TAMP — UI Specification (Spec-Driven Development)

**Project:** Truck Asset Matchmaking Platform (TAMP)
**Owner:** Industrial Computing Engineering (Pty) Ltd
**Source of truth:** TAMP Business Requirements Specification v1.0; TAMP Commercialisation Assessment Brief v1.0 (24 July 2026)
**Spec version:** 1.0
**Status:** Draft for build

---

## 0. How to use this document

This is the **specification layer** of a spec-driven workflow. Nothing gets built that isn't described here, and nothing described here is left un-built without an explicit deviation note.

```
SPEC (this document)  →  PLAN (stack + architecture)  →  TASKS (§15)  →  BUILD  →  VERIFY (§14)
```

Rules for anyone — human or agent — implementing against this spec:

1. **Every identifier is stable.** `SCR-###` screens, `FLOW-##` journeys, `AC-###` acceptance criteria, `EVT-##` audit events, `CMP-##` components. Reference them in commits, PRs and test names.
2. **Acceptance criteria are the contract.** A screen is "done" when every `AC` under it passes, not when it looks finished.
3. **If the spec is wrong, change the spec first**, then the code. Log the change in §16.
4. **Ambiguity is not licence to invent.** Unresolved questions live in §16 and must be raised, not silently decided.

---

## 1. Constitution — non-negotiable principles

These override any other instruction in this document, and any preference during implementation.

| # | Principle | Enforcement in UI |
|---|---|---|
| C1 | **Sell the MVP truthfully.** The interface must never imply a capability that doesn't exist. | Every roadmap feature renders as a visibly disabled control with a `Roadmap` badge and a tooltip stating "Not in this release." No fake success states. |
| C2 | **Matching is rule-based and explainable.** No black box. | Every suggested match displays its score breakdown and the rules that produced it (§6). The words "AI" and "smart" do not appear in matching UI copy. |
| C3 | **Every decision leaves a trace.** | Accept, reject, confirm, cancel, status change, verification change and dispute action each write an audit event (§10.4) that is visible in the Admin activity log. |
| C4 | **Simulated data is labelled as simulated.** | Mock GPS, mock ETA and seeded demo records carry a `Simulated` chip. Tracking map is watermarked "Simulated positions — telematics is a roadmap item." |
| C5 | **Currency is ZAR, stated explicitly.** | All money renders as `R 12 500.00` with a `excl. VAT` / `incl. VAT` suffix. Never a bare number. |
| C6 | **POPIA-aware by default.** | Contact details (phone, email) are masked until a match reaches `CONFIRMED`. Company registration and ID numbers are never displayed in full outside the Admin verification screen. |
| C7 | **Both sides of the marketplace are first-class.** | No screen treats the Transporter as a secondary user. Feature parity in posting, matching, accepting, tracking and rating. |
| C8 | **Quality floor, unannounced.** | Responsive to 360px, visible keyboard focus on every interactive element, `prefers-reduced-motion` respected, no colour-only status encoding. |

---

## 2. Scope

### 2.1 In scope (MVP — must be demonstrable)

| Capability | Screens |
|---|---|
| Registration, role selection, simulated login | SCR-001 → SCR-003 |
| Freight Owner posts a cargo load | SCR-101 |
| Transporter posts available truck capacity | SCR-201 |
| Rule-based match generation and ranking | SCR-103, SCR-203 |
| Accept / reject a match with status change + audit event | SCR-104, SCR-204 |
| Engagement confirmation and digital receipt | SCR-105 |
| Trip monitoring with mock coordinates and status progression | SCR-106, SCR-205 |
| Two-way ratings and optional feedback | SCR-107, SCR-206 |
| Admin oversight: users, verification, activity, disputes | SCR-301 → SCR-303 |
| Basic marketplace analytics | SCR-300, SCR-304 |
| Audit trail visible end-to-end | SCR-302 |

### 2.2 Out of scope (roadmap — must be visibly labelled, never functional)

| Roadmap item | UI treatment |
|---|---|
| Live telematics / real GPS | Tracking map shows simulated positions with a persistent watermark. "Connect telematics" button disabled + `Roadmap`. |
| In-platform payments / escrow | Receipt shows agreed rate only. "Pay via TAMP" disabled + `Roadmap`. |
| AI / ML matching | Matching panel titled "Rule-based matching". A `Roadmap` note explains that learned ranking is a later release. |
| Production e-signatures | Confirmation is an in-app acknowledgement with timestamp and user, explicitly labelled "Not a qualified electronic signature." |
| Emissions intelligence | Empty analytics tile with `Roadmap` badge and no data. |
| ERP / TMS integration | Settings → Integrations lists targets, all disabled + `Roadmap`. |

### 2.3 Explicitly not built for the MVP

Password reset flows, email/SMS delivery, multi-tenant billing, file virus scanning, real document OCR, offline mode, native mobile apps.

---

## 3. Roles and permissions

Three roles. One account holds exactly one role for the MVP (multi-role accounts are a roadmap item).

| Capability | Freight Owner | Transporter | Administrator |
|---|---|---|---|
| Post cargo load | ✅ | ❌ | ❌ |
| Post truck availability | ❌ | ✅ | ❌ |
| View own postings | ✅ | ✅ | ✅ (all) |
| View suggested matches | ✅ (trucks for own loads) | ✅ (loads for own trucks) | ✅ (read-only) |
| Accept / reject match | ✅ | ✅ | ❌ |
| Confirm engagement | ✅ (initiates) | ✅ (counter-confirms) | ❌ |
| Update trip status | ❌ (read-only) | ✅ | ❌ |
| Rate counterparty | ✅ | ✅ | ❌ |
| Raise a dispute | ✅ | ✅ | ✅ (log entry) |
| Resolve a dispute | ❌ | ❌ | ✅ |
| Approve / reject verification | ❌ | ❌ | ✅ |
| Suspend or reinstate a user | ❌ | ❌ | ✅ |
| View full audit log | ❌ (own records only) | ❌ (own records only) | ✅ |
| View marketplace analytics | ✅ (own KPIs) | ✅ (own KPIs) | ✅ (platform-wide) |

**Enforcement:** role is checked at route level (redirect to that role's dashboard on mismatch) **and** at component level (unauthorised actions are not rendered, not merely disabled). A user who reaches an unauthorised route sees SCR-403, never a blank page.

---

## 4. Information architecture

### 4.1 Route map

```
/                                   SCR-001  Landing / sign in
/register                           SCR-002  Register + role selection
/onboarding                         SCR-003  Profile + verification submission

/owner                              SCR-100  Freight Owner dashboard
/owner/loads                        SCR-102  My loads
/owner/loads/new                    SCR-101  Post a load (3 steps)
/owner/loads/[loadId]               SCR-103  Load detail + suggested trucks
/owner/loads/[loadId]/match/[id]    SCR-104  Match review (Match Ticket)
/owner/loads/[loadId]/receipt       SCR-105  Engagement receipt
/owner/trips/[tripId]               SCR-106  Trip tracking (read-only)
/owner/trips/[tripId]/rate          SCR-107  Rate transporter

/transporter                        SCR-200  Transporter dashboard
/transporter/trucks                 SCR-202  My fleet
/transporter/trucks/new             SCR-201  Post truck availability
/transporter/board                  SCR-203  Load board
/transporter/offers/[id]            SCR-204  Offer review (Match Ticket)
/transporter/trips/[tripId]         SCR-205  Trip status update
/transporter/trips/[tripId]/rate    SCR-206  Rate freight owner

/admin                              SCR-300  Admin overview
/admin/users                        SCR-301  Users + verification queue
/admin/activity                     SCR-302  Activity + audit log
/admin/disputes                     SCR-303  Disputes
/admin/analytics                    SCR-304  Marketplace analytics

/notifications                      SCR-400  Notifications
/settings                           SCR-401  Account settings
/roadmap                            SCR-402  What's coming next
/403                                SCR-403  No access
```

### 4.2 Navigation shell

- **Desktop (≥1024px):** fixed left sidebar, 248px, role-coloured accent stripe. Top bar carries global search, notification bell, account menu.
- **Tablet (768–1023px):** sidebar collapses to 64px icon rail with tooltips.
- **Mobile (<768px):** bottom tab bar, max 4 items + "More" sheet. Top bar reduces to title + bell.
- **Role indicator** is permanent and unmissable — the sidebar header reads `FREIGHT OWNER`, `TRANSPORTER` or `ADMINISTRATOR` in the utility face. Demo audiences must never wonder which role they're seeing.

---

## 5. Domain model and state machines

### 5.1 UI data contracts

These are the shapes the UI binds to. Backend may store more; it must not return less.

```ts
type UUID = string;
type ISODate = string;          // "2026-08-24T06:30:00+02:00"
type Money = { amount: number; currency: "ZAR"; vat: "incl" | "excl" };

type Role = "FREIGHT_OWNER" | "TRANSPORTER" | "ADMIN";
type VerificationStatus = "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";

interface Party {
  id: UUID;
  role: Role;
  companyName: string;
  contactName: string;
  email: string;            // masked until CONFIRMED (C6)
  phone: string;            // masked until CONFIRMED (C6)
  province: string;
  verification: VerificationStatus;
  ratingAvg: number | null; // 1–5, null until 3 ratings received
  ratingCount: number;
  suspended: boolean;
  createdAt: ISODate;
}

type CargoType =
  | "GENERAL_PALLETISED" | "BULK_DRY" | "BULK_LIQUID" | "REFRIGERATED"
  | "ABNORMAL" | "CONTAINERISED" | "LIVESTOCK" | "HAZARDOUS";

type BodyType =
  | "TAUTLINER" | "FLATBED" | "TIPPER" | "TANKER"
  | "REFRIGERATED" | "SIDE_TIPPER" | "LOWBED" | "DROPSIDE";

interface Place { label: string; province: string; lat: number; lng: number; }

interface Load {
  id: UUID;                 // display ref: LD-0142
  ownerId: UUID;
  reference: string;
  cargoType: CargoType;
  weightKg: number;
  volumeM3?: number;
  requiredBodyTypes: BodyType[];
  origin: Place;
  destination: Place;
  distanceKm: number;       // computed, straight-line × 1.25 road factor (mock)
  pickupWindow: { from: ISODate; to: ISODate };
  deliveryBy: ISODate;
  targetRate?: Money;
  specialRequirements?: string;
  status: LoadStatus;
  createdAt: ISODate;
}

interface TruckPosting {
  id: UUID;                 // display ref: TR-0087
  transporterId: UUID;
  registration: string;     // masked to last 3 chars until CONFIRMED
  bodyType: BodyType;
  payloadCapacityKg: number;
  volumeCapacityM3?: number;
  currentLocation: Place;
  availableFrom: ISODate;
  availableTo: ISODate;
  preferredLanes?: { origin: string; destination: string }[];
  status: TruckStatus;
  createdAt: ISODate;
}

interface Match {
  id: UUID;                 // display ref: MT-0311
  loadId: UUID;
  truckPostingId: UUID;
  score: number;                    // 0–100
  breakdown: MatchScoreComponent[]; // required by C2
  hardFilterResults: RuleResult[];
  status: MatchStatus;
  initiatedBy: "FREIGHT_OWNER" | "TRANSPORTER" | "SYSTEM";
  agreedRate?: Money;
  expiresAt: ISODate;
  createdAt: ISODate;
}

interface MatchScoreComponent {
  ruleId: string;      // "R-PROXIMITY"
  label: string;       // "Truck is near the pickup point"
  weight: number;      // 30
  earned: number;      // 24.6
  detail: string;      // "42 km from Bethal — within the 150 km radius"
}

interface RuleResult { ruleId: string; label: string; passed: boolean; detail: string; }

interface Trip {
  id: UUID;                 // display ref: TP-0058
  matchId: UUID;
  status: TripStatus;
  events: TripEvent[];
  simulatedPosition: { lat: number; lng: number; updatedAt: ISODate } | null;
  progressPct: number;
  etaAt: ISODate | null;    // computed from simulation, chipped "Simulated"
}

interface TripEvent { status: TripStatus; at: ISODate; note?: string; byUserId: UUID; }

interface Rating {
  id: UUID; tripId: UUID; raterId: UUID; rateeId: UUID;
  stars: 1|2|3|4|5;
  tags: string[];           // "On time", "Good communication", "Cargo handled well"
  comment?: string;
  createdAt: ISODate;
}

interface AuditEvent {
  id: UUID; eventType: string; actorId: UUID; actorRole: Role;
  subjectType: "LOAD"|"TRUCK"|"MATCH"|"TRIP"|"USER"|"DISPUTE";
  subjectId: UUID; summary: string;
  before?: Record<string, unknown>; after?: Record<string, unknown>;
  at: ISODate;
}

interface Dispute {
  id: UUID; tripId: UUID; raisedById: UUID;
  category: "NON_ARRIVAL" | "DAMAGE" | "RATE_DISAGREEMENT" | "DELAY" | "CONDUCT" | "OTHER";
  description: string;
  status: "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "DISMISSED";
  resolutionNote?: string; createdAt: ISODate; resolvedAt?: ISODate;
}
```

### 5.2 State machines

**Load**

```
DRAFT ──post──► POSTED ──match accepted──► MATCHED ──both confirm──► CONFIRMED
                  │                            │                        │
                  ├──edit──► DRAFT             └──rejected/expired──► POSTED
                  ├──cancel──► CANCELLED                                │
                  └──pickup window passes──► EXPIRED          trip completes
                                                                        ▼
                                                                    COMPLETED ──ratings done──► CLOSED
```

**Truck posting:** `AVAILABLE → RESERVED → ON_TRIP → AVAILABLE` , plus `OFFLINE` (withdrawn by transporter) and `EXPIRED` (availability window passed).

**Match:** `SUGGESTED → OFFERED → ACCEPTED → CONFIRMED` , with `REJECTED`, `WITHDRAWN` and `EXPIRED` as terminal branches from `SUGGESTED` or `OFFERED`.

**Trip:** `SCHEDULED → AT_PICKUP → LOADED → IN_TRANSIT → AT_DROPOFF → DELIVERED → COMPLETED`, plus `CANCELLED` from any pre-`DELIVERED` state (requires a reason) and `DISPUTED` as a flag that coexists with any state.

**UI rules for state:**
- Illegal transitions are never rendered as controls. The Transporter cannot tap "Delivered" before "In transit".
- Every status change asks for confirmation only when it is irreversible or has commercial consequence (accept, reject, confirm, cancel, deliver).
- Status is always shown as **shape + label + colour**, never colour alone (C8).

---

## 6. Matching rules — the UI contract

The matching engine is deterministic. The UI's job is to make that legible.

### 6.1 Hard filters (a truck that fails any of these is not suggested)

| Rule ID | Rule | Failure copy shown in "Why not suggested" |
|---|---|---|
| `R-CAPACITY` | `payloadCapacityKg ≥ weightKg` | "Payload capacity is below the load weight." |
| `R-BODY` | `bodyType ∈ requiredBodyTypes` | "Body type doesn't suit this cargo." |
| `R-WINDOW` | Truck availability overlaps the pickup window | "Not available during the pickup window." |
| `R-RADIUS` | Truck within 150 km of origin | "Outside the 150 km sourcing radius." |
| `R-STATUS` | Truck posting is `AVAILABLE` | "Truck is already committed." |
| `R-ACTIVE` | Neither party suspended | (not shown to counterparty) |

### 6.2 Weighted score (100 points)

| Rule ID | Label shown to user | Weight | Scoring logic |
|---|---|---|---|
| `R-PROXIMITY` | Truck is near the pickup point | 30 | Linear from 30 at 0 km to 0 at 150 km |
| `R-CAPACITY-FIT` | Capacity suits the load size | 25 | Peak score at 80–100% utilisation; penalised below 50% (wasted capacity) and at exactly 100% (no tolerance) |
| `R-TIMING` | Timing works comfortably | 20 | Full marks with ≥6h slack against the pickup window; tapers to 0 at zero slack |
| `R-LANE` | Destination matches a preferred lane | 15 | Full marks on an exact preferred-lane match; half marks on province match; 0 otherwise |
| `R-RATING` | Operator has a good record | 10 | `(ratingAvg / 5) × 10`; unrated operators receive 5 with the note "New to TAMP — no rating yet" |

### 6.3 Display requirements

- Matches are ranked descending by score, ties broken by earliest `createdAt`.
- The list shows the top 10; a "Show all suggestions" control reveals the rest.
- Each match card shows the **score as a number out of 100** with a horizontal segmented bar — one segment per rule, sized by weight, filled by earned points.
- Expanding a match reveals every `MatchScoreComponent` with its `detail` string. This is the C2 obligation and cannot be collapsed away permanently.
- A "Why isn't truck X here?" affordance on the load detail screen opens a panel listing filtered-out trucks with their failing `RuleResult`. This turns the biggest demo objection ("how do I know it's not guessing?") into a feature.
- **No score is ever shown without its breakdown available within one interaction.**

---

## 7. Design system

### 7.1 Direction

TAMP is a dispatch board, not a consumer app. Its users are logistics managers and fleet owners reading dense operational data on a desk monitor, and owner-drivers checking a load board on a phone at a truck stop. The design language borrows from the subject's own artifacts: **waybills, dockets, weighbridge tickets and depot signage** — mono-spaced reference numbers, ruled tables, stamped statuses, high contrast in daylight.

**Signature element — the Match Ticket (CMP-01).** Every match, on every screen, renders as a docket: a perforated-edge card with the load on the left, the truck on the right, the lane rail running between them, and the rule-score rail across the bottom. It is the one place the product spends visual boldness. Everything else stays quiet.

The single risk worth taking: the score rail is **segmented by rule and labelled**, not a smooth progress bar. It looks unusual, it is slightly harder to draw, and it is the entire argument for why a rule-based marketplace beats a phone call.

### 7.2 Tokens

```css
/* Colour — 6 named values, everything else is a tint of these */
--ink:        #14171C;   /* primary text, table rules at 100% */
--steel:      #5A6472;   /* secondary text, labels, icons */
--hairline:   #DCE0E6;   /* borders, dividers, ticket perforations */
--canvas:     #F1F3F6;   /* page background */
--surface:    #FFFFFF;   /* cards, tables, sheets */
--ice-red:    #B51A12;   /* ICE brand. PRIMARY ACTIONS ONLY. */

/* Status — separate scale so brand red never means "error" */
--status-available: #0B6E4F;   /* posted, available, verified, delivered */
--status-moving:    #0B5FA5;   /* in transit, under review */
--status-waiting:   #B26A00;   /* pending, awaiting confirmation, expiring */
--status-blocked:   #8A1010;   /* rejected, cancelled, suspended, disputed */
--status-neutral:   #5A6472;   /* draft, closed, archived */

/* Type */
--font-display: "Archivo Expanded", "Archivo", system-ui, sans-serif;
--font-body:    "Public Sans", system-ui, sans-serif;
--font-mono:    "IBM Plex Mono", ui-monospace, monospace;

/* Scale — 4px base */
--space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
--space-5: 24px; --space-6: 32px; --space-7: 48px; --space-8: 64px;

--radius-sm: 3px;  --radius-md: 6px;  --radius-lg: 10px;
--shadow-card: 0 1px 2px rgba(20,23,28,.06), 0 1px 8px rgba(20,23,28,.04);
--focus-ring: 0 0 0 2px #FFFFFF, 0 0 0 4px var(--ice-red);
```

### 7.3 Typography rules

| Role | Face | Size / weight / tracking |
|---|---|---|
| Page title | Archivo Expanded | 28px / 700 / -0.01em |
| Section header | Archivo Expanded | 18px / 600 |
| Eyebrow + role label | IBM Plex Mono | 11px / 500 / 0.12em / uppercase |
| Body | Public Sans | 15px / 400 / 1.55 line-height |
| Table cell | Public Sans | 14px / 400 |
| **All references, registrations, tonnages, distances, timestamps, money** | IBM Plex Mono | 14px / 500, tabular figures |

The mono treatment for operational data is a functional decision, not a style one: `LD-0142`, `CA 481-042`, `34 000 kg`, `R 18 500.00` are read, compared and typed back into other systems. Column alignment matters more than warmth.

### 7.4 Component inventory

| ID | Component | Notes |
|---|---|---|
| CMP-01 | **Match Ticket** | Signature. Load ⇄ truck docket with lane rail + score rail. Variants: `suggested`, `offered`, `accepted`, `confirmed`, `rejected` (stamped, desaturated). |
| CMP-02 | **Lane Rail** | Origin ● ————— ▲ ————— ● Destination. Fills left-to-right with trip progress. Distance in mono above, truck glyph at the progress point. Used on load cards, tickets and trip screens. |
| CMP-03 | **Score Rail** | Segmented bar, one segment per rule, width ∝ weight, fill ∝ earned. Hover/tap a segment → the rule's `detail` string. |
| CMP-04 | **Status Stamp** | Rounded rect, 1px border in the status colour, mono uppercase label, leading icon. Never colour-only. |
| CMP-05 | **Posting Card** | Load or truck summary. Ref, lane rail, key specs in mono, status stamp, primary action. |
| CMP-06 | **Data Table** | Ruled, zebra-free, sticky header, sortable, right-aligned numerics, row → detail. Mobile: collapses to CMP-05 card list. |
| CMP-07 | **Roadmap Lock** | Disabled control + `ROADMAP` chip + tooltip "Not in this release." Required by C1. |
| CMP-08 | **Simulated Chip** | `SIMULATED` chip in `--status-moving`, on any mock GPS/ETA value. Required by C4. |
| CMP-09 | **Audit Trail** | Vertical timeline: timestamp (mono), actor, role, summary. Read-only. |
| CMP-10 | **Confirm Dialog** | Title states the action, body states the consequence, primary button repeats the verb ("Accept match", not "OK"). |
| CMP-11 | **Empty State** | Icon, one-line explanation of what belongs here, one primary action. Never a shrug. |
| CMP-12 | **Rating Widget** | 5 stars + tag chips + optional comment. Tags differ by direction (rating a transporter vs a freight owner). |
| CMP-13 | **KPI Tile** | Mono figure, label, comparison period, sparkline. Roadmap tiles render empty with CMP-07. |
| CMP-14 | **Filter Bar** | Chips + drawer on mobile. Filter state lives in the URL. |
| CMP-15 | **Verification Badge** | `VERIFIED` / `PENDING` / `UNVERIFIED`. Appears wherever a counterparty is named. |

### 7.5 Copy rules

- Sentence case everywhere except mono eyebrows and status stamps.
- Buttons name the outcome: "Post load", "Accept match", "Confirm engagement", "Mark as delivered". Never "Submit", "OK", "Continue" where a real verb exists.
- The verb survives the flow: "Accept match" → toast "Match accepted" → audit entry "Match accepted".
- Errors state what happened and what to do: "Payload capacity must be at least the load weight (34 000 kg)." Never "Invalid input."
- Empty states invite: "No loads posted yet. Post your first load to start receiving truck suggestions."
- Simulated things say so plainly: "Positions are simulated for this release."

---

## 8. Cross-cutting screen requirements

Every screen specification below inherits these. They are not repeated per screen.

**8.1 Required states.** Every data-bound screen implements: `loading` (skeleton matching final layout, never a spinner over blank), `empty` (CMP-11), `error` (message + retry, preserving any user input), `success`, and `partial` (some data failed — degrade the affected region only).

**8.2 Responsive.** Breakpoints 360 / 768 / 1024 / 1440. Tables become card lists below 768px. No horizontal scroll at 360px. Primary action stays reachable with one thumb on mobile.

**8.3 Accessibility.** Semantic landmarks; one `h1` per screen; all controls keyboard-reachable in DOM order; focus ring per token; live regions announce status changes and toasts; status conveyed by icon + text + colour; form errors bound with `aria-describedby`; contrast ≥ 4.5:1 for text and ≥ 3:1 for boundaries.

**8.4 URL state.** Filters, sort, tab and pagination live in the query string so any view is shareable and demo-reproducible.

**8.5 Time and place.** All times render in SAST with the timezone shown on absolute timestamps. Relative time ("2 hours ago") is allowed in lists, with the absolute value in the title attribute. Distances in km, mass in kg (tonnes above 1 000 kg, e.g. `34 t`), volume in m³.

**8.6 Audit.** Any interaction that changes a domain object emits an audit event (§10.4) before the success toast fires. A UI state change without a persisted audit event is a defect.

---

## 9. Screen specifications

### FLOW-01 — Onboarding

---

#### SCR-001 — Landing / sign in

**Purpose:** get a demo audience into a role in under five seconds.
**Access:** public.

**Layout:** split. Left: product statement in Archivo Expanded — "Loads and trucks, matched by rules you can see." Beneath it, three live counters (loads posted, trucks available, matches accepted) drawn from seed data — the marketplace proving it isn't empty. Right: sign-in card.

**Interactions**
- Email + password fields; authentication is simulated (§13).
- **Demo role switcher**: three buttons — "Sign in as Freight Owner", "Sign in as Transporter", "Sign in as Administrator" — that authenticate as pre-seeded personas. Visible only when `DEMO_MODE=true`.
- "Create an account" → SCR-002.

**Acceptance criteria**
- `AC-001` Given `DEMO_MODE=true`, when I choose a demo role, then I land on that role's dashboard with populated seed data in under 2 seconds.
- `AC-002` Given invalid credentials, when I sign in, then an inline error appears above the form and the email value is preserved.
- `AC-003` The counters reflect actual seed record counts, not hard-coded numbers.

---

#### SCR-002 — Register and select a role

**Purpose:** journey step 1 — register and select a role.

**Layout:** single column, 480px. Role selection first, as two large cards (Freight Owner / Transporter), each stating what that role does in one line. Administrator accounts are created by an existing admin only — not offered here.

**Fields:** company name, contact name, email, mobile, province, password, confirm password, POPIA consent checkbox with a link to the processing notice.

**Validation**
- Email format; email uniqueness checked on blur.
- Mobile: SA format, accepts `0XX XXX XXXX` and `+27`.
- Password: minimum 8 characters. (No complexity theatre for the MVP; state the rule under the field.)
- Consent is required; the submit button stays disabled with a reason shown, not silently inert.

**Acceptance criteria**
- `AC-010` Given a valid form, when I register, then an account is created with `verification: UNVERIFIED` and I am routed to SCR-003.
- `AC-011` Given a duplicate email, when I blur the field, then an inline error names the conflict and offers a sign-in link.
- `AC-012` The role I chose is displayed persistently in the navigation shell after registration.
- `AC-013` `EVT-01 USER_REGISTERED` is written and appears in the admin activity log.

---

#### SCR-003 — Profile and verification

**Purpose:** collect what matching and trust need, and put the user into the admin verification queue.

**Layout:** progress-stepped form, role-conditional.

| Freight Owner | Transporter |
|---|---|
| Company registration number | Company registration number |
| Primary industry (per §3 of the brief's segment list) | Fleet size |
| Typical cargo types | Body types operated |
| Typical lanes (origin → destination, repeatable) | Operating provinces + preferred lanes |
| Monthly load volume band | Goods-in-transit insurer + cover value |
| — | Operating licence number |

Document upload accepts PDF/JPG/PNG up to 5 MB, stored as a filename + mock reference. Copy states plainly: "Documents are stored for this demonstration only and are not verified automatically."

**Acceptance criteria**
- `AC-020` Given I submit the profile, then `verification` becomes `PENDING` and the account appears in SCR-301's queue.
- `AC-021` Until verified, a persistent banner reads "Verification pending — you can post and match, and your counterparties will see your status." Posting is **not** blocked (marketplace liquidity beats gatekeeping at MVP).
- `AC-022` Skipping optional fields is allowed; required fields are marked and enforced.
- `AC-023` `EVT-02 VERIFICATION_SUBMITTED` is written.

---

### FLOW-02 — Freight Owner

---

#### SCR-100 — Freight Owner dashboard

**Purpose:** answer "what needs me right now?"

**Layout**
1. **Action row** (top, unmissable): counts of matches awaiting my decision, engagements awaiting confirmation, trips in progress, ratings outstanding. Each is a link to a filtered list, not a decoration.
2. **Active loads** — CMP-05 cards, each with lane rail, status stamp and the number of new suggestions.
3. **KPI strip** — CMP-13: loads posted (30d), average time from post to accepted match, acceptance rate, average rating given.
4. **Recent activity** — CMP-09, own records only.

**Acceptance criteria**
- `AC-100` Given a load with new suggested matches, when I open the dashboard, then the action row shows the count and links to SCR-103 filtered to that load.
- `AC-101` Given no loads exist, then the empty state offers "Post your first load" as the only primary action.
- `AC-102` "Average time to match" is computed from real timestamps in seed data, never hard-coded.

---

#### SCR-101 — Post a load

**Purpose:** journey step 2 — create a cargo load with the metadata matching depends on.

**Layout:** three steps with a persistent summary rail on the right that updates live (desktop) or a sticky summary bar (mobile).

| Step | Fields |
|---|---|
| 1 — Cargo | Reference (auto `LD-####`, editable), cargo type, weight (kg), volume (m³, optional), required body types (multi-select, pre-filtered by cargo type), special requirements |
| 2 — Route and timing | Origin, destination (both from a seeded SA place list with type-ahead), pickup window from/to, deliver by, computed distance shown in mono as it resolves |
| 3 — Commercials | Target rate (optional, ZAR, incl/excl VAT toggle), notes, visibility (all verified transporters / all transporters) |

**Rules**
- Body-type options are constrained by cargo type (`REFRIGERATED` cargo cannot select `FLATBED`). Show why an option is unavailable rather than hiding it.
- `deliveryBy` must be after `pickupWindow.to`; violation is caught inline.
- Distance is computed and displayed before submission so the user can sanity-check the lane.
- "Save as draft" is available at every step.
- On post, matching runs immediately and the user is routed to SCR-103 with results already present — **the demo must never show an empty match list after posting.**

**Acceptance criteria**
- `AC-110` Given a complete form, when I post the load, then status is `POSTED`, `EVT-10 LOAD_POSTED` is written, and I land on SCR-103 with ranked suggestions.
- `AC-111` Given weight exceeds every seeded truck's capacity, then SCR-103 shows the zero-match empty state with the "Why isn't a truck here?" panel already expanded (§6.3).
- `AC-112` Given I leave mid-flow, when I return, then the draft is restored with all entered values.
- `AC-113` Selecting a cargo type filters body types, and an incompatible previous selection is cleared with an explanation.

---

#### SCR-102 — My loads

**Purpose:** manage the full posting portfolio.

**Layout:** CMP-14 filter bar (status, cargo type, lane, date range) over CMP-06 table.

**Columns:** Ref (mono) · Lane (CMP-02 compact) · Cargo · Weight · Pickup window · Suggestions · Status (CMP-04) · Action.

**Row actions by status:** `DRAFT` → Edit, Delete. `POSTED` → View suggestions, Edit, Cancel. `MATCHED` → Review match. `CONFIRMED` → View receipt. `IN_TRANSIT` → Track. `COMPLETED` → Rate. `CLOSED`/`CANCELLED`/`EXPIRED` → View.

**Acceptance criteria**
- `AC-120` Filters and sort persist in the URL and survive reload.
- `AC-121` Below 768px the table renders as CMP-05 cards with no loss of action availability.
- `AC-122` Cancelling a load requires CMP-10 with a reason, sets `CANCELLED`, releases any reserved truck to `AVAILABLE`, and writes `EVT-13 LOAD_CANCELLED`.

---

#### SCR-103 — Load detail and suggested trucks

**Purpose:** journey step 3 — generate and present rule-based matches. **This is the screen the assessment demo lives on.**

**Layout**
- **Header:** ref, status stamp, lane rail with distance, key specs in mono, actions (Edit, Cancel, Re-run matching).
- **Left column (60%):** ranked list of CMP-01 Match Tickets in `suggested` state.
- **Right column (40%):** map showing origin, destination and the current locations of suggested trucks, pins numbered by rank. Below it, the matching-rules explainer — the weights table from §6.2, stated plainly.
- **Below the list:** "Trucks that didn't qualify (N)" — collapsible panel listing filtered-out trucks with their failing rule (§6.3).

**Interactions**
- Each ticket: expand to see the full score breakdown; "Offer to transporter" as the primary action; "Not suitable" to dismiss with a reason.
- "Re-run matching" recomputes and reports what changed ("2 new suggestions, 1 truck no longer available").
- Sort control: score (default), proximity, rating, capacity fit.

**Acceptance criteria**
- `AC-130` Every ticket displays a score out of 100, and its full breakdown is reachable in exactly one interaction (C2).
- `AC-131` Suggestions are ordered by descending score with `createdAt` as the tie-break.
- `AC-132` No truck failing a §6.1 hard filter appears in the suggested list.
- `AC-133` The "didn't qualify" panel names the specific failing rule per truck.
- `AC-134` Offering a match sets `Match.status = OFFERED`, notifies the transporter (in-app), writes `EVT-20 MATCH_OFFERED`, and the ticket moves to an "Awaiting response" group with its expiry countdown.
- `AC-135` The map contains no live-telematics claim; truck positions carry CMP-08.

---

#### SCR-104 — Match review

**Purpose:** journey step 4 — accept or reject, with a status change and an audit event.

**Layout:** full-width CMP-01 Match Ticket. Load column, truck column, lane rail between, score rail beneath, counterparty panel (company, verification badge, rating, completed trips, **masked contact details** per C6), agreed-rate field, and the audit trail so far (CMP-09).

**Interactions**
- **Accept match** → CMP-10 stating: "This reserves the truck and notifies the transporter. Both parties must confirm before the trip starts."
- **Reject match** → CMP-10 requiring a reason from a fixed list + optional note. Reasons feed SCR-304 analytics.
- **Propose a rate** — editable `agreedRate`, ZAR, incl/excl VAT toggle, defaulting to the load's target rate.
- Roadmap locks (CMP-07): "Sign agreement", "Pay via TAMP".

**Acceptance criteria**
- `AC-140` Accept sets `Match.status = ACCEPTED`, `Load.status = MATCHED`, `TruckPosting.status = RESERVED`, writes `EVT-21 MATCH_ACCEPTED`, and routes to SCR-105.
- `AC-141` Reject sets `REJECTED`, returns the load to `POSTED`, keeps the truck `AVAILABLE`, writes `EVT-22 MATCH_REJECTED` including the reason, and the truck is excluded from re-suggestion for this load.
- `AC-142` Contact details are masked until `CONFIRMED`; the mask states why ("Shown once both parties confirm").
- `AC-143` An expired match (`expiresAt` passed) renders read-only with an "Expired" stamp and a "Request again" action.
- `AC-144` Both audit events appear in SCR-302 within one refresh.

---

#### SCR-105 — Engagement receipt

**Purpose:** journey step 5 — the digital confirmation record.

**Layout:** a document, not a dashboard. Docket-styled, A4-proportioned, print-ready.

**Contents:** receipt number (mono), issue timestamp with timezone, both parties with verification badges, load details, truck details incl. registration and driver, lane + distance, pickup/delivery windows, agreed rate with VAT treatment, the match score at time of acceptance, both confirmation records (who confirmed, when, from which role), and a footer stating: "This is a platform confirmation record, not a qualified electronic signature."

**Interactions:** "Print / save as PDF" (browser print with a dedicated stylesheet). "Copy receipt link". Roadmap lock on "Send to counterparty by email".

**Acceptance criteria**
- `AC-150` The receipt is generated only after **both** parties confirm; before that, the screen shows what's outstanding and who it's waiting on.
- `AC-151` On mutual confirmation: `Match → CONFIRMED`, `Load → CONFIRMED`, `Trip` created with `SCHEDULED`, `EVT-23 ENGAGEMENT_CONFIRMED` written.
- `AC-152` Print output is one page, legible in greyscale, with no navigation chrome.
- `AC-153` The non-signature disclaimer is present and not dismissible (C1).
- `AC-154` Contact details are unmasked from this point for both parties only.

---

#### SCR-106 — Trip tracking (Freight Owner, read-only)

**Purpose:** journey step 6 — monitor the trip.

**Layout:** map with the simulated position and route line (persistent watermark: "Simulated positions — telematics is a roadmap item"), full-width lane rail with the progress marker, status stamp with simulated ETA (CMP-08), CMP-09 event timeline, counterparty contact card (now unmasked), and "Raise a dispute".

**Interactions:** position advances on a fixed simulation tick (§13). Read-only — the Freight Owner cannot change trip status. "Raise a dispute" opens a form (category + description) creating a `Dispute` visible in SCR-303.

**Acceptance criteria**
- `AC-160` Position and progress update without a manual refresh while the trip is active.
- `AC-161` No control on this screen can change `Trip.status`.
- `AC-162` The simulation watermark and CMP-08 chips are present wherever a coordinate or ETA appears (C4).
- `AC-163` Raising a dispute sets the `DISPUTED` flag, writes `EVT-40 DISPUTE_RAISED`, and surfaces the trip in SCR-303 without blocking status progression.
- `AC-164` On `DELIVERED`, a "Rate this transporter" prompt appears within the screen and on the dashboard.

---

#### SCR-107 — Rate the transporter

**Purpose:** journey step 7 — stored rating and optional feedback.

**Layout:** modal or dedicated screen. CMP-12: 5 stars (required), tag chips (multi-select: "On time", "Cargo handled well", "Good communication", "Accurate documentation", "Would use again"), optional comment (500 chars), and a "Report a problem instead" link into the dispute flow.

**Acceptance criteria**
- `AC-170` Rating is available only when `Trip.status = DELIVERED` or `COMPLETED`.
- `AC-171` Submitting stores the `Rating`, recalculates the transporter's `ratingAvg`, writes `EVT-50 RATING_SUBMITTED`, and sets `Trip → COMPLETED`; when both sides have rated, `Load → CLOSED`.
- `AC-172` A party can rate once per trip; the completed state shows what was submitted, read-only.
- `AC-173` Ratings are visible on the counterparty's profile and feed `R-RATING` in the next matching run.

---

### FLOW-03 — Transporter

---

#### SCR-200 — Transporter dashboard

**Purpose:** answer "what can I earn today, and what needs me?"

**Layout**
1. **Action row:** offers awaiting my response (with countdowns), trips to update, ratings outstanding.
2. **My trucks:** CMP-05 cards with status stamps and a quick availability toggle.
3. **Top matching loads:** the three highest-scoring loads for my available trucks, as CMP-01 tickets.
4. **KPI strip:** utilisation rate (days posted vs days on trip), accepted matches (30d), average rating, empty-return legs avoided (count of matches where the load origin sat within 100 km of a previous drop-off — the value story, made concrete).

**Acceptance criteria**
- `AC-200` Offers show a live countdown to `expiresAt`; expiry moves them out of the action row automatically.
- `AC-201` The availability toggle changes `TruckPosting.status` between `AVAILABLE` and `OFFLINE` and writes `EVT-31`.
- `AC-202` "Empty-return legs avoided" states its calculation in a tooltip. No unexplained metrics (C2 spirit).

---

#### SCR-201 — Post truck availability

**Purpose:** journey step 2, supply side.

**Layout:** two steps + live summary rail.

| Step | Fields |
|---|---|
| 1 — Vehicle | Registration, body type, payload capacity (kg), volume capacity (m³, optional), features (tail-lift, straps, tracking unit, temperature control), driver name (optional) |
| 2 — Availability | Current location, available from/to, preferred lanes (repeatable origin → destination), maximum radius from current location, indicative rate per km (optional) |

**Rules:** registration validated against SA plate patterns with a helpful, non-blocking error. Saved vehicles can be re-posted in one action ("Post again" from SCR-202) — repeat posting is the transporter's daily habit and must take under 15 seconds.

**Acceptance criteria**
- `AC-210` Posting sets `AVAILABLE`, writes `EVT-30 TRUCK_POSTED`, runs matching, and routes to SCR-203 with suitable loads already listed.
- `AC-211` "Post again" from a previous vehicle pre-fills everything except the availability window.
- `AC-212` Overlapping availability windows for the same registration are rejected with a message naming the conflicting posting.

---

#### SCR-202 — My fleet

**Layout:** CMP-06 table. Columns: Registration (mono) · Body type · Capacity · Current location · Availability window · Status · Action.
Actions by status: `AVAILABLE` → View matching loads, Edit, Take offline. `RESERVED` → View match. `ON_TRIP` → Update trip. `OFFLINE`/`EXPIRED` → Post again.

- `AC-220` Taking a `RESERVED` truck offline is blocked with an explanation naming the match it is committed to.

---

#### SCR-203 — Load board

**Purpose:** the transporter's discovery surface — journey step 3 from the supply side.

**Layout:** CMP-14 filters (body type, origin province, destination province, weight band, pickup date, minimum rate) over a ranked list of CMP-01 tickets, with an optional map view toggle. Each ticket is scored **for the transporter's selected truck** — a truck selector sits at the top of the board and re-scores the list.

**Interactions:** "Express interest" sets `Match.status = OFFERED` with `initiatedBy: TRANSPORTER`, sending it to the Freight Owner's queue. "Not for me" dismisses with a reason.

**Acceptance criteria**
- `AC-230` Changing the selected truck re-scores and re-ranks the board using §6 rules.
- `AC-231` Loads failing a hard filter for the selected truck are excluded and counted in "N loads don't suit this truck", with reasons on expand.
- `AC-232` Expressing interest writes `EVT-20` with `initiatedBy: TRANSPORTER` and appears in the Freight Owner's action row.
- `AC-233` With no truck posted, the board shows an empty state directing to SCR-201 rather than an unscored list.

---

#### SCR-204 — Offer review

Mirrors SCR-104 with the perspectives reversed: the load is the subject, the freight owner is the counterparty.

- `AC-240` Accept sets `Match → ACCEPTED`, `Truck → RESERVED`, `Load → MATCHED`, writes `EVT-21`, and routes to the shared receipt (SCR-105).
- `AC-241` Reject requires a reason, returns the load to `POSTED`, keeps the truck `AVAILABLE`, writes `EVT-22`.
- `AC-242` The freight owner's rating, verification status and completed-trip count are shown before any decision.
- `AC-243` The offer expiry countdown is visible throughout; on expiry the screen becomes read-only.

---

#### SCR-205 — Trip status update

**Purpose:** journey step 6, supply side — the only place `Trip.status` changes.

**Layout:** mobile-first. Large primary button showing **only the next legal status**, the lane rail with progress, the event timeline, the counterparty card, and secondary actions ("Report a delay", "Cancel trip").

**Progression:** `SCHEDULED → AT_PICKUP → LOADED → IN_TRANSIT → AT_DROPOFF → DELIVERED`.

**Interactions**
- Each advance takes an optional note and writes `EVT-32 TRIP_STATUS_CHANGED`.
- "Report a delay" adds a timeline entry with a reason and an updated ETA, without changing status.
- "Cancel trip" requires CMP-10 + reason, sets `Trip → CANCELLED`, `Load → POSTED`, `Truck → AVAILABLE`, and writes `EVT-33`, flagged for admin attention.
- Proof of delivery: filename capture only, with copy stating that document verification is a roadmap item.

**Acceptance criteria**
- `AC-250` Only the next legal status is offered; skipping states is impossible through the UI.
- `AC-251` Every advance appears on the Freight Owner's SCR-106 without a manual refresh.
- `AC-252` `DELIVERED` triggers the rating prompt for both parties.
- `AC-253` The primary button is reachable with one thumb at 360px width.

---

#### SCR-206 — Rate the freight owner

CMP-12 with direction-appropriate tags: "Accurate load details", "Loaded on time", "Clear instructions", "Paid as agreed", "Would work with again". Same criteria as `AC-170` → `AC-173`, reversed.

---

### FLOW-04 — Administrator

---

#### SCR-300 — Admin overview

**Purpose:** journey step 8 — oversight at a glance.

**Layout**
1. **Marketplace health strip (CMP-13):** active freight owners, active transporters, loads posted (7d), trucks posted (7d), suggested matches, accepted matches, **acceptance rate**, average time from post to acceptance.
2. **Balance indicator:** loads-to-trucks ratio per lane, with an explicit warning when a lane sits outside 0.5–2.0 — the marketplace liquidity problem named in the brief's risk table, made visible.
3. **Needs attention:** pending verifications, open disputes, cancelled trips (7d), users flagged.
4. **Recent activity:** last 20 audit events, linking to SCR-302.

**Acceptance criteria**
- `AC-300` Every tile is computed from seeded records; no static figures.
- `AC-301` Each "needs attention" count links to its filtered queue.
- `AC-302` The emissions tile renders empty with CMP-07 (C1).

---

#### SCR-301 — Users and verification queue

**Layout:** tabs — All users / Verification queue / Suspended. CMP-06 table: Company · Role · Province · Verification (CMP-15) · Rating · Postings · Joined · Action.

**Verification detail drawer:** submitted fields, uploaded document references, and Approve / Reject with a required note.

**Acceptance criteria**
- `AC-310` Approving sets `VERIFIED`, writes `EVT-03 VERIFICATION_APPROVED`, and the badge updates everywhere that user appears.
- `AC-311` Rejecting requires a note, sets `REJECTED`, and the note is shown to the user on their next sign-in.
- `AC-312` Suspending requires a reason, sets `suspended: true`, hides that user's active postings from matching, and writes `EVT-04`.
- `AC-313` Registration and ID numbers are shown in full **only** in this drawer (C6), with an on-screen note that access is logged.

---

#### SCR-302 — Activity and audit log

**Purpose:** prove auditability — a core MVP selling point.

**Layout:** CMP-14 filters (event type, actor, role, subject type, date range, free-text) over a dense CMP-06 table: Timestamp (mono, SAST) · Event · Actor · Role · Subject · Summary. Row expands to show `before` / `after` where applicable.

**Acceptance criteria**
- `AC-320` Every event in §10.4 appears here, without exception.
- `AC-321` Events are immutable — no edit or delete control exists anywhere in the UI.
- `AC-322` Filtering to a single `subjectId` reconstructs that object's full history in order.
- `AC-323` "Export CSV" produces the current filtered view with headers.

---

#### SCR-303 — Disputes

**Layout:** queue by status (Open / Under review / Resolved / Dismissed). Detail view shows the dispute, the full trip audit trail, both parties, and resolution actions: take under review, add an internal note, resolve with an outcome note, or dismiss with a reason.

- `AC-330` Resolving requires an outcome note and writes `EVT-41 DISPUTE_RESOLVED`.
- `AC-331` Both parties see the dispute status and the final outcome note on the trip screen.
- `AC-332` Internal notes are never visible to either party, and the UI says so where they are entered.

---

#### SCR-304 — Marketplace analytics

**Layout:** four sections — **Liquidity** (postings over time, loads:trucks by lane, coverage map), **Conversion** (suggested → offered → accepted → confirmed → completed funnel with drop-off rates), **Quality** (rating distribution, dispute rate, cancellation rate with reason breakdown), **Roadmap** (emissions, payment volume — empty, CMP-07).

- `AC-340` The funnel is computed from actual match records; each stage links to its underlying list.
- `AC-341` Rejection and cancellation reasons are charted, since they are the product's most useful feedback loop.
- `AC-342` Every chart states its date range and has a text-equivalent data table for accessibility.

---

### Shared screens

**SCR-400 Notifications** — chronological in-app list, unread state, deep links to the subject. Types: match suggested, offer received, match accepted, match rejected, engagement confirmed, trip status changed, rating requested, verification outcome, dispute update. Email/SMS delivery is CMP-07 roadmap.
- `AC-400` Every state change affecting a counterparty produces exactly one notification for them.

**SCR-401 Settings** — profile, company details, notification preferences (in-app only), and an Integrations tab where every item is CMP-07 locked.

**SCR-402 Roadmap** — a plain, honest list of what is coming and what is deliberately simulated today. Reachable from every CMP-07 tooltip. This screen is a commercial asset: it is the answer to the brief's "MVP uses simulated services" objection.

**SCR-403 No access** — states the required role and offers a route back to the user's own dashboard.

---

## 10. Cross-cutting behaviours

### 10.1 Validation catalogue

| Field | Rule | Message |
|---|---|---|
| Load weight | > 0 and ≤ 60 000 kg | "Enter a weight between 1 kg and 60 000 kg." |
| Payload capacity | > 0 and ≤ 60 000 kg | "Enter a capacity between 1 kg and 60 000 kg." |
| Pickup window | `from` ≥ now; `to` > `from` | "The pickup window must end after it starts." |
| Deliver by | > `pickupWindow.to` | "Delivery must be after the pickup window closes." |
| Origin ≠ destination | Not equal | "Pick a different destination." |
| Registration | SA plate pattern, warn-don't-block | "That doesn't look like a South African registration. Continue anyway?" |
| Mobile | SA format | "Enter a South African mobile number, e.g. 082 123 4567." |
| Rate | ≥ 0, max 2 decimals, VAT treatment chosen | "Choose whether this rate includes or excludes VAT." |
| Availability window | No overlap for same registration | "TR-0087 is already posted from 24–26 August." |
| Reason fields | Required on reject, cancel, suspend, dispute resolve | "Add a reason — it's recorded in the audit log." |

Validation fires on blur, re-validates on change once errored, and blocks submission with focus moved to the first invalid field.

### 10.2 Notification triggers

| Trigger | Recipient | Copy pattern |
|---|---|---|
| Matches generated | Poster | "6 trucks suit LD-0142." |
| Offer received | Counterparty | "Bokamoso Haulage offered TR-0087 for LD-0142." |
| Match accepted | Counterparty | "Your offer on LD-0142 was accepted. Confirm to start the trip." |
| Match rejected | Counterparty | "LD-0142 went another way. Reason: capacity." |
| Engagement confirmed | Both | "LD-0142 is confirmed. Receipt RC-0091 is ready." |
| Trip status changed | Freight owner | "TP-0058 is in transit." |
| Delivered | Both | "TP-0058 delivered. Rate your counterparty." |
| Verification outcome | User | "Your account is verified." / with the admin's note on rejection |
| Dispute update | Both parties | "Your dispute on TP-0058 is under review." |
| Offer expiring | Holder | "Your offer on LD-0142 expires in 2 hours." |

### 10.3 Error handling

- **Network failure:** inline region-level error with retry; user input never lost.
- **Stale state (counterparty acted first):** blocking dialog — "This match was accepted by another transporter 3 minutes ago." — then refresh into the current state. Never fail silently, never let two accepts land.
- **Validation failure from server:** map to the responsible field; fall back to a form-level banner only when unmappable.
- **Empty match result:** treated as a first-class state, not an error (`AC-111`).

### 10.4 Audit event catalogue

| ID | Event type | Emitted by | Subject |
|---|---|---|---|
| EVT-01 | `USER_REGISTERED` | SCR-002 | USER |
| EVT-02 | `VERIFICATION_SUBMITTED` | SCR-003 | USER |
| EVT-03 | `VERIFICATION_APPROVED` / `_REJECTED` | SCR-301 | USER |
| EVT-04 | `USER_SUSPENDED` / `_REINSTATED` | SCR-301 | USER |
| EVT-10 | `LOAD_POSTED` | SCR-101 | LOAD |
| EVT-11 | `LOAD_EDITED` | SCR-102/103 | LOAD |
| EVT-13 | `LOAD_CANCELLED` | SCR-102 | LOAD |
| EVT-14 | `LOAD_EXPIRED` | system | LOAD |
| EVT-20 | `MATCH_OFFERED` | SCR-103 / SCR-203 | MATCH |
| EVT-21 | `MATCH_ACCEPTED` | SCR-104 / SCR-204 | MATCH |
| EVT-22 | `MATCH_REJECTED` | SCR-104 / SCR-204 | MATCH |
| EVT-23 | `ENGAGEMENT_CONFIRMED` | SCR-105 | MATCH |
| EVT-24 | `MATCH_EXPIRED` | system | MATCH |
| EVT-30 | `TRUCK_POSTED` | SCR-201 | TRUCK |
| EVT-31 | `TRUCK_AVAILABILITY_CHANGED` | SCR-200/202 | TRUCK |
| EVT-32 | `TRIP_STATUS_CHANGED` | SCR-205 | TRIP |
| EVT-33 | `TRIP_CANCELLED` | SCR-205 | TRIP |
| EVT-40 | `DISPUTE_RAISED` | SCR-106/205 | DISPUTE |
| EVT-41 | `DISPUTE_RESOLVED` / `_DISMISSED` | SCR-303 | DISPUTE |
| EVT-50 | `RATING_SUBMITTED` | SCR-107/206 | TRIP |

Every event carries `actorId`, `actorRole`, `subjectId`, a human-readable `summary`, and `before`/`after` where a field changed.

---

## 11. Mock data seed specification

The demo is only as convincing as its data. Seed deliberately.

| Entity | Count | Composition |
|---|---|---|
| Freight owners | 8 | 2 FMCG distributors, 2 agri, 1 mining supply, 1 construction, 1 manufacturer, 1 3PL — mirroring the brief's priority segments |
| Transporters | 14 | 6 owner-drivers (1–2 trucks), 6 small fleets (3–8), 2 mid fleets (15+) |
| Truck postings | 26 | Mixed body types; 18 `AVAILABLE`, 4 `RESERVED`, 3 `ON_TRIP`, 1 `OFFLINE` |
| Loads | 22 | 9 `POSTED`, 4 `MATCHED`, 3 `CONFIRMED`, 3 `COMPLETED`, 2 `CANCELLED`, 1 `EXPIRED` |
| Matches | 40+ | Spread across every status, with realistic score distributions |
| Trips | 6 | 2 `IN_TRANSIT` with live simulation, 1 `AT_PICKUP`, 3 `COMPLETED` |
| Ratings | 18 | Skewed 4–5 with two 2-star outliers, so the rating rule visibly differentiates |
| Disputes | 3 | 1 `OPEN`, 1 `UNDER_REVIEW`, 1 `RESOLVED` |
| Audit events | 200+ | Backdated 60 days so analytics and "average time to match" are real |

**Lanes:** use real SA freight corridors — JHB↔Durban (N3), JHB↔Cape Town (N1), JHB↔Polokwane (N1), Gqeberha↔Cape Town (N2), Rustenburg↔JHB, Bethal↔Richards Bay, Bloemfontein↔JHB. Real corridors make the demo credible to anyone who knows the industry.

**Deliberate demo cases (each exists so a specific point can be made):**

| Case | Purpose |
|---|---|
| A load where one truck scores 91 and the next 62 | Shows the ranking is discriminating, not arbitrary |
| A 34 t load with three near-miss trucks (32 t, 33 t, 33.5 t capacity) | Demonstrates the `R-CAPACITY` hard filter and the "didn't qualify" panel |
| An unrated new transporter ranked 3rd | Shows new entrants aren't locked out |
| A backhaul: a load originating 40 km from a truck's last drop-off | The empty-return value story, live on screen |
| A lane with 6 loads and 1 truck | Triggers the SCR-300 liquidity warning |
| A rejected match with reason "rate too low" | Populates the SCR-304 rejection-reason chart |

**Reset:** a `Reset demo data` control exists in admin settings (visible only when `DEMO_MODE=true`) and restores the seed in under 3 seconds. Rehearsal depends on it.

---

## 12. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | Any screen interactive within 2s on a mid-range laptop; match generation for 26 trucks completes under 500ms; no layout shift after data loads (skeletons match final dimensions) |
| Browsers | Latest Chrome, Edge, Safari, Firefox. Chrome is the demo target. |
| Devices | Demo on 1440×900 projected; must remain usable at 360×640 |
| Offline | Not supported. A lost connection shows a persistent banner and disables mutating actions rather than queuing them. |
| Data volume | UI must not degrade at 10× seed volume; lists paginate at 25 |
| Security posture | Role checks server-side as well as in the UI; no sensitive identifiers in URLs or query strings; simulated auth is clearly labelled as such in the codebase |
| Print | SCR-105 has a dedicated print stylesheet; nothing else needs one |

---

## 13. Simulation and demo mode

| Simulated thing | Behaviour | Label |
|---|---|---|
| Authentication | Session held client-side against seeded personas; no real credential store | Codebase README states this plainly |
| GPS position | Linear interpolation along the lane at a fixed tick (default 5s = 1% progress; configurable) with ±0.01° jitter so it doesn't look robotic | CMP-08 + map watermark |
| ETA | Derived from remaining distance at a constant 65 km/h average | CMP-08 |
| Distance | Straight-line haversine × 1.25 road factor | Tooltip: "Estimated road distance" |
| Documents | Filename and size captured; no storage, parsing or verification | On-screen note |
| Notifications | In-app only, polled or via local event bus | Email/SMS shown as CMP-07 |
| Time | A demo clock control (admin only, `DEMO_MODE`) can advance time to trigger expiries on demand | Visible when active |

`DEMO_MODE` gates: role switcher, data reset, demo clock, and a seeded-record indicator. It must default to `false` in any non-demo build.

---

## 14. Verification

### 14.1 Journey coverage — the assessment's own checklist

The brief lists eight journey steps with required MVP evidence. Each maps to a screen and a criterion, and this table is the pass/fail sheet.

| Step | Required evidence | Screen | Criterion |
|---|---|---|---|
| 1 Register and select role | Account/profile or simulated login | SCR-001/002/003 | AC-010, AC-012 |
| 2 Create load or truck | Saved posting with required metadata | SCR-101, SCR-201 | AC-110, AC-210 |
| 3 Generate suitable matches | Rule-based recommendations | SCR-103, SCR-203 | AC-130 → AC-133 |
| 4 Accept or reject a match | Status change and audit event | SCR-104, SCR-204 | AC-140, AC-141, AC-144 |
| 5 Confirm the engagement | Digital receipt/confirmation record | SCR-105 | AC-150, AC-151 |
| 6 Monitor the trip | Mock coordinates or progress view | SCR-106, SCR-205 | AC-160 → AC-162, AC-250 |
| 7 Complete and rate | Stored rating and optional feedback | SCR-107, SCR-206 | AC-170 → AC-173 |
| 8 Admin oversight | User/activity/dispute and KPI views | SCR-300 → SCR-304 | AC-300, AC-310, AC-320, AC-330 |

### 14.2 Constitution audit (run before any demo)

- [ ] C1 — Every roadmap feature is locked and labelled; nothing fake succeeds.
- [ ] C2 — No score appears anywhere without its breakdown one interaction away.
- [ ] C3 — Every state-changing action produced an audit event visible in SCR-302.
- [ ] C4 — Every simulated value carries a label.
- [ ] C5 — Every money value shows ZAR and VAT treatment.
- [ ] C6 — Contact details masked pre-confirmation; identifiers restricted to SCR-301.
- [ ] C7 — Both roles can post, match, accept, track and rate.
- [ ] C8 — 360px usable; keyboard traversal complete; no colour-only status.

### 14.3 Demo script (12 minutes, the order to present in)

1. **The problem, on screen (0:30)** — SCR-300 liquidity warning: six loads, one truck on the Bethal↔Richards Bay lane. That's the market failure, quantified.
2. **Freight owner posts a load (2:00)** — SCR-101, a 34 t bulk load, JHB → Durban.
3. **Matching, explained (3:00)** — SCR-103. Top truck scores 91. Expand the breakdown. Then open "Trucks that didn't qualify" and show the three near-miss capacities. *This is the moment that wins the rubric's "understanding of TAMP" and "sales strategy" marks — it is the demo's whole argument.*
4. **Offer and accept (2:00)** — SCR-104 accept, switch role, SCR-204 confirm.
5. **Receipt (1:00)** — SCR-105, print preview, read the non-signature disclaimer out loud. Honesty is the differentiator.
6. **Trip (1:30)** — SCR-205 advance to in transit, switch to SCR-106 and watch it move. Name the watermark before anyone asks.
7. **Rate (0:30)** — SCR-107, then show the rating flowing into `R-RATING` on the next match.
8. **Oversight (1:30)** — SCR-302 filtered to the load ref: the entire transaction reconstructed from the audit log.
9. **Roadmap (0:30)** — SCR-402. Close on what's next, stated plainly.

---

## 15. Build plan

Sequenced so that something demonstrable exists from day two, and the highest-risk screen (SCR-103) is built early.

| Phase | Deliverable | Screens | Exit condition |
|---|---|---|---|
| **P0 — Foundation** | Stack, routing, design tokens, nav shell, role guard, seed data loaded | — | A signed-in role sees an empty dashboard with correct navigation |
| **P1 — Postings** | Load and truck creation, list views | SCR-101, 102, 201, 202 | A load and a truck can be created and listed with correct status |
| **P2 — Matching engine + Match Ticket** | Rules from §6, CMP-01/02/03, ranked lists | SCR-103, 203 | AC-130 → AC-133 and AC-230 → AC-231 pass |
| **P3 — Match lifecycle** | Offer, accept, reject, confirm, receipt | SCR-104, 204, 105 | AC-140 → AC-154 pass; audit events land |
| **P4 — Trips and ratings** | Simulation loop, status progression, CMP-12 | SCR-106, 205, 107, 206 | AC-160 → AC-173 and AC-250 → AC-253 pass |
| **P5 — Admin** | Verification, activity log, disputes, analytics | SCR-300 → 304 | AC-300 → AC-342 pass |
| **P6 — Onboarding + shell polish** | Registration, verification submission, notifications, settings, roadmap | SCR-001 → 003, 400 → 403 | Full journey runs end-to-end from registration |
| **P7 — Hardening** | Constitution audit (§14.2), responsive pass, keyboard pass, demo rehearsal, seed tuning | all | Every §14.1 row demonstrated in one unbroken run |

**Deliberate sequencing note:** onboarding is built in P6, not P1. It is the least risky work and the least interesting to a demo audience, so it should not consume the first days. Use `DEMO_MODE` personas until then.

---

## 16. Assumptions, decisions and open questions

### 16.1 Assumptions made in this spec

| # | Assumption | Impact if wrong |
|---|---|---|
| A1 | Web application, desktop-first for owners/admins, mobile-responsive for transporters | Native app would change §7 and §12 substantially |
| A2 | Single-role accounts for the MVP | Multi-role would add a role switcher and re-scope §3 |
| A3 | Matching runs on demand (post, re-run, truck selection change), not continuously | Background matching would add a job runner and notification volume |
| A4 | 150 km sourcing radius and the §6.2 weights are starting values, tunable in configuration | If hard-coded, tuning during pilot becomes a code change |
| A5 | Verification is manual, admin-reviewed; no external register lookups | Automated CIPC/licence checks are a roadmap item |
| A6 | Rates are agreed on-platform but settled off-platform | Payments in scope would require escrow UX and change SCR-105 |
| A7 | English only | Additional languages would change all copy in §7.5 |

### 16.2 Decisions taken (with reasoning)

| # | Decision | Reasoning |
|---|---|---|
| D1 | Unverified users may post and match | Marketplace liquidity beats gatekeeping at MVP; verification status is surfaced instead of enforced |
| D2 | Both parties must confirm before a trip exists | Mutual confirmation is what makes the receipt meaningful and the audit trail defensible |
| D3 | Rejection reasons are mandatory and charted | The rejection reason set is the most valuable product-feedback loop available at pilot stage |
| D4 | The "didn't qualify" panel is a feature, not a debug view | It converts the strongest buyer objection into the strongest proof point |
| D5 | Brand red is reserved for primary actions only | Prevents the interface reading as permanently alarmed, and keeps status semantics clean |

### 16.3 Open questions — resolve before P2

1. Does the BRS define matching weights or a radius already? If so, §6.2 defers to it entirely.
2. Does the BRS specify required load metadata beyond §5.1? Any additional required field changes SCR-101 and the hard filters.
3. Is a rate a required field, or genuinely optional? This affects whether `R-RATE-FIT` should exist as a sixth scoring rule.
4. Should the Administrator be able to intervene in a match (force-assign, unwind)? Currently specified as observe-only.
5. Should ratings be visible before a match is accepted, or only aggregate scores? Currently: aggregate visible, individual comments hidden.
6. What is the expiry period for an offer? Currently assumed 24 hours; it drives the countdown UI throughout.

---

## 17. Traceability — brief to spec

| Brief requirement | Where it is satisfied |
|---|---|
| §1.1 Platform users | §3 roles and permissions |
| §1.2 Simplified end-to-end journey (steps 1–8) | §14.1 coverage table |
| §2.2 "Sell the MVP truthfully" | C1, §2.2 roadmap treatment, SCR-402 |
| §2.2 Label roadmap items | CMP-07, §2.2 table |
| §2.2 ZAR with VAT treatment stated | C5, §10.1 rate validation |
| §2.2 Auditability | C3, §10.4, SCR-302 |
| §4 Buyer roles and pains | §11 seed composition, SCR-100/200 KPI selection |
| §8 "MVP uses simulated services" objection | C4, §13, SCR-402, demo script step 5 |
| §8 Data protection / POPIA | C6, AC-142, AC-313 |
| §8 Trust and unreliable operators | CMP-15, ratings, verification queue, audit trail |
| §8 Insufficient loads or trucks | SCR-300 liquidity indicator, §11 seeded imbalance case |
| Rubric: understanding of TAMP (15%) | §14.1 full journey coverage |
| Rubric: quality of documentation (10%) | This document, §17 traceability |

---

**End of specification.** Changes to this document must increment the spec version and be noted here with a date and a one-line reason.
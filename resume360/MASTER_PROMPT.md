# Manus Master Prompt — Build Resume360 From Scratch

> **Operator:** Pro-ICE Limited · **Public product:** Resume360
>
> This document is the tightly-governed product-and-engineering brief for
> building Resume360. It exists to prevent a repeat of prior mistakes:
> premature payments, platform coupling, unsupported claims, unclear identity
> boundaries, and endless feature expansion.

---

## 0. Manus-specific rule (top priority)

**Manus is the implementation environment, not a required runtime dependency.**

The completed application must run from GitHub on Railway without requiring:

- Manus hosting;
- Manus authentication;
- Manus storage;
- Manus databases;
- Manus AI credentials;
- Manus background services;
- Manus-specific environment variables.

Every generated component must be exportable, reviewable and independently
deployable. This single rule prevents repeating the Replit dependency problem
under a different name.

---

## Role

You are the principal product architect, senior full-stack engineer, security
engineer and delivery lead for a new production-grade application named
**Resume360**.

Build Resume360 from scratch as a clean, independently deployable application.

Do not reuse, copy, migrate or depend on any legacy Replit implementation.

The goal is not to produce a flashy prototype. The goal is to deliver a small,
trustworthy, testable and commercially viable pilot application that a real
professional can use from account creation through résumé assessment.

---

## 1. Product definition

**Product name:** Resume360

**Product description:** Resume360 is a résumé optimisation and
career-readiness application for African professionals applying for local and
international opportunities.

The product helps users:

- upload a résumé;
- extract and structure its content;
- receive a Resume Health Score;
- receive ATS-oriented feedback;
- identify weak sections;
- compare a résumé with a job description;
- receive controlled AI-supported improvement suggestions;
- prepare for interviews;
- export or download an improved résumé/report.

**Resume360 does not guarantee:**

- ATS passage;
- interviews;
- employment;
- recruiter acceptance;
- visa sponsorship;
- a specific job outcome.

**Approved public positioning:**

> "Improve your résumé with structured analysis, ATS-oriented feedback, job
> matching and interview preparation."

Resume360 is operated by **Pro-ICE Limited**.

Do not introduce any Orion endorsement in public copy unless separately
authorised.

**Do not use:**

- "Powered by Orion";
- "An Orion application";
- "Orion Resume360";
- "Guaranteed ATS success";
- "Land your dream job";
- "Get hired faster";
- any unsupported user-count or success-rate claim.

---

## 2. Delivery principle

Optimise for the earliest safe end-to-end pilot.

**First meaningful milestone:** A user can create an account, verify their
email, sign in, upload a résumé, receive a useful structured assessment and
retrieve the result.

Do not make payments, institutional dashboards, recruiters, job boards, team
collaboration, white-labelling or broad analytics part of the critical path.

Build only what is required for the controlled pilot first.

Use phased delivery with a hard review gate after every phase. Do not proceed
to the next phase until the current phase:

- builds cleanly;
- passes its tests;
- has no known critical security defect;
- has documented acceptance evidence;
- is committed separately.

---

## 3. Approved technology stack

**Frontend:** React · TypeScript · Vite · React Query · an accessible
component system · React Hook Form (or equivalent well-maintained form library)
· Zod for runtime validation.

**Backend:** Node.js 22 LTS · Express · TypeScript · PostgreSQL · `pg`
connection pool · Drizzle ORM for application schema and queries · ordered SQL
migrations committed to the repository.

**Authentication:** Better Auth · email/password only for the pilot ·
mandatory verified email · server-side database sessions · secure, HttpOnly,
host-only cookies · SameSite=Lax · no social login initially · no magic links
initially · no passkeys initially · no two-factor authentication initially.

**Storage:** Cloudflare R2 private bucket · S3-compatible API · server-mediated
upload and download initially · no public bucket · no `r2.dev` · no custom
public object domain · no browser-direct presigned upload in the pilot.

**AI:** provider-neutral AI interface · OpenAI as the first configured provider
· no browser-direct AI calls · no Replit AI gateway · bounded tokens · bounded
input size · operation-level cost telemetry · no raw résumé or prompt logging.

**Email:** Twilio SendGrid · provider-neutral application email boundary ·
sender configuration through environment variables · verification and
password-reset email · HTML and plain-text versions · no open or click tracking
for authentication email.

**Hosting:** Railway · separate staging and production environments ·
PostgreSQL on Railway · config-as-code through `railway.json` · pre-deploy
migration command · liveness endpoint at `/healthz` · automatic staging
deployment from `main` initially · production autodeploy disabled.

**Testing:** Vitest · Testing Library and jsdom · real PostgreSQL integration
tests · provider contract tests · concurrency tests where idempotency matters.

**Do not use:** Replit Auth · Replit Object Storage · Replit AI integrations ·
Firebase · Supabase Auth · Clerk · Auth0 · MongoDB · SQLite in production ·
local disk as persistent storage · serverless functions split across multiple
platforms · microservices for the pilot · Redis unless a measured requirement
later justifies it.

---

## 4. Repository and application structure

Create one repository: **`orion-resume360`**. The public product remains
Resume360.

```
client/
  src/
    components/
    pages/
    hooks/
    lib/
    features/
    test/

server/
  auth/
  ai/
  storage/
  email/
  payments/
  middleware/
  routes/
  services/
  repositories/
  tests/

shared/
  schema.ts
  contracts/
  constants/
  validation/

migrations/
  rollback/

scripts/

docs/
  PRODUCT_STRATEGY.md
  ARCHITECTURE.md
  DEPLOYMENT.md
  SECURITY.md
  PRIVACY_DATA_MAP.md
  PILOT_RUNBOOK.md
```

Use explicit domain boundaries. Do not put all backend logic in `routes.ts`.

Routes should: authenticate → validate → call an application service → return a
safe DTO. Business rules belong in services. Database access belongs in
repositories or focused domain services. Provider-specific details must remain
inside adapters.

---

## 5. Core domain model

**Identity:** `users`, `auth_session`, `auth_account`, `auth_verification`,
`auth_rate_limit`.

**Résumé domain:** `resumes`, `resume_files`, `resume_analyses`,
`resume_sections`, `resume_versions`, `job_analyses`, `ai_suggestions`,
`interview_sessions`, `interview_questions`, `interview_answers`.

**Commercial domain (initially inert):** `credit_packages`,
`credit_entitlements`, `credit_ledger`, `payment_transactions`,
`payment_verification_attempts`.

**AI telemetry:** `ai_operations`, `ai_provider_calls`, `model_pricing`,
`fx_rates` (where later needed).

**Operational evidence:** `audit_events`, deployment/migration provenance
(where appropriate).

**Important identity rule:** `users.id` is the permanent application identity
key. Do not use email as the foreign key joining application records. Email is:

- normalised as `lower(trim(email))`;
- unique case-insensitively;
- **not** the application ownership key.

All user-owned records must reference `users.id`.

---

## 6. User roles and authorisation

Initial roles: `user`, `admin`. Authentication and authorisation are separate.

Better Auth establishes: identity, session, email verification. Resume360
establishes: role, resource ownership, permissions.

Do not accept role, user ID or ownership from: request bodies · query strings ·
path metadata not verified against the session · browser storage · Better Auth
custom signup payloads.

Create one canonical server principal:

```ts
{
  userId: string;
  email: string;
  emailVerified: boolean;
  role: "user" | "admin";
  sessionId: string;
}
```

Every protected route must use this principal. Every user-owned query must
include the owner condition **in the database query**, not merely check
ownership after loading the row.

---

## 7. Authentication policy

**Pilot authentication:** email/password · email verification mandatory ·
minimum password length 12 · maximum password length 128 · password hashing
owned by Better Auth · no password stored or logged by Resume360 · no
auto-sign-in after verification · seven-day session lifetime · one-day rolling
update interval · maximum three active sessions · host-only cookie · Secure in
production · HttpOnly · SameSite=Lax · no Domain attribute · no parent-domain
cookie · no wildcard trusted origins.

**Required journeys:** sign up · verification email · verify email · sign in ·
sign out · forgot password · reset password · revoke current session · revoke
all sessions · session expiry · session revocation after password reset.

**Enumeration resistance:**

- unknown email and wrong password use the same response;
- forgot-password responses are indistinguishable for existing and unknown
  accounts;
- do not reveal whether an email is registered.

**Security requirements:** exact trusted origin · no request-header-derived
base URL · no open redirects · safe relative `returnTo` validation · CSRF
protection · rate limiting · no raw auth error shown to users · no auth token in
`localStorage` or `sessionStorage`.

---

## 8. Email policy

Use environment configuration:

```
EMAIL_ENABLED
SENDGRID_API_KEY
SENDGRID_FROM_EMAIL
SENDGRID_FROM_NAME
SENDGRID_REPLY_TO
```

**Approved intended sender:** From name `Resume360` · From email
`hr@pro-ice.com.ng` · Reply-To `hr@pro-ice.com.ng`.

**Legal footer:** "Resume360 is operated by Pro-ICE Limited."

Do not hard-code the sender address into the runtime implementation.

**Verification email:** validity one hour · one action button · plain-text
fallback · no tracking pixel · no click tracking · no résumé details · no credit
claim · no auto-login claim.

**Password-reset email:** validity 30 minutes · single use · revoke all
existing sessions after successful reset · no account-history disclosure.

**With `EMAIL_ENABLED=false`:** no provider call · no false success claiming
that email was delivered · no token or link logged.

---

## 9. Private file storage

Use a provider-neutral storage interface. Required operations: `putObject` ·
`getObject` / `streamObject` · `headObject` · `deleteObject`.

R2 adapter configuration:

```
STORAGE_PROVIDER=unavailable | r2
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
```

Default: `STORAGE_PROVIDER=unavailable`. No fallback to local disk. No fallback
to any legacy provider.

**Bucket:** private · no anonymous reads · no `r2.dev` · no public custom
domain.

Object keys must be opaque and generated server-side. Preferred format:
`resume-objects/<UUID>`. Do not include: email · name · original filename ·
résumé title · user-provided path segments. The database remains the ownership
authority.

**Uploads:** authenticated · PDF and DOCX only initially · macro-enabled files
rejected · MIME and signature validation · bounded size · original filename
stored only as safe display metadata · object persisted successfully before the
upload is represented as complete · database failure after storage success
triggers compensating deletion or a durable cleanup record.

**Downloads:** authenticated · owner-bound query · stream through the server ·
`Content-Disposition: attachment` · `Cache-Control: private, no-store` · no raw
R2 URL · no object key exposed.

**Deletion:** idempotent · owner-bound · provider failure does not falsely
report full completion · no bucket-wide or unsafe prefix deletion.

---

## 10. Résumé workflow

Pilot workflow:

1. Create verified account.
2. Sign in.
3. Upload PDF or DOCX résumé.
4. Extract text and document structure.
5. Store the original file privately.
6. Persist a structured résumé representation.
7. Run deterministic baseline checks.
8. Run bounded AI-assisted analysis.
9. Present: Resume Health Score · score breakdown · issues · suggestions ·
   section-level feedback.
10. Allow one controlled optimisation operation.
11. Allow optional job-description comparison.
12. Allow report export/download.

Do not send AI merely because a page is viewed. AI runs only following an
explicit user operation. Persist completed results so page refresh does not
trigger another model call.

---

## 11. Resume Health Score

Do not present a made-up "ATS score" as an objective industry standard. Use
**Resume Health Score** and explain that it is Resume360's structured
assessment.

Score dimensions may include: contact and structural completeness · section
organisation · clarity and readability · quantified achievements · keyword and
skills alignment · chronology consistency · role relevance · formatting risks ·
job-description alignment where supplied.

The overall score must be calculated server-side. Persist: total score ·
dimension scores · scoring-version identifier · analysis timestamp · model
version where AI contributed · deterministic versus AI contribution ·
provenance.

The client must not calculate or override the total. Document the scoring
methodology before implementation. Avoid claiming recruiter or ATS equivalence.

---

## 12. AI architecture

Define a provider-neutral interface such as `AIProvider`. Operations:
`analyseResume` · `optimiseResume` · `rewriteSection` · `analyseJobDescription`
· `generateSuggestions` · `generateInterviewQuestions` ·
`evaluateInterviewAnswer`.

Use OpenAI first. Do not hard-code the application around one provider response
format.

Every user-facing operation must have: operation ID · user ID · résumé ID where
applicable · model · input token count · output token count · provider latency ·
provider cost estimate · success/failure classification · retry count · result
provenance.

Separate `ai_operations` from `ai_provider_calls`. One user operation may make
more than one provider call.

**Do not store:** raw API keys · full prompts by default · full raw résumé text
in telemetry · full model responses in provider logs · secrets · unnecessary
personal data.

Set: strict input-size limits · output-token limits · request timeout · retry
limits · concurrency limits · per-user operation rate limits · safe provider
error mapping. **No AI request on page load.**

---

## 13. Credit model

Build credit infrastructure but keep it disabled for the initial product pilot.
One credit represents one completed user-facing operation, not one model call.

**Planned one-credit operations:** full résumé optimisation · section rewrite ·
job analysis · interview-session creation.

**Free or included operations may include:** upload · parsing · stored result
retrieval · bounded Resume Health recomputation · persisted suggestions ·
included interview-answer evaluations within one paid session.

**Ledger requirements:** append-only · immutable entries · explicit entry types
· integer quantities · no expiry · idempotency · reversal entries rather than
mutation · per-user transactional locking · no negative balance unless
explicitly approved.

**Signup grant:** five credits · only for a genuinely new user · only after
trusted email verification · one time · suppression against
deletion/recreation abuse · disabled by default.

Do not activate credit enforcement for the first product pilot.

---

## 14. Payments

Payments are not part of the first product pilot. Build only after the complete
résumé journey is proven.

**Future provider:** Flutterwave v3 Standard Checkout. Architecture: hosted
redirect · no PAN · no CVV · no card-encryption code · Resume360 must not
receive card credentials.

**Packages:**

| Package | Price | Credits |
| --- | --- | --- |
| Basic | NGN 15,000 | 50 |
| Premium | NGN 45,000 | 150 |
| Pro | inactive — no price, no unlimited claim | — |

**Payment principles:** persist transaction before provider call · immutable
commercial snapshot · idempotent initiation · amount stored in minor units ·
exact integer conversion to major units at provider edge · redirect is an
untrusted hint · webhook payload is not fulfilment authority · server-to-server
verification required · status, reference, amount and currency must match
exactly · overpayment and underpayment go to manual review · exactly-once
credit grant · no client-provided amount, credits, currency, user ID or provider
reference.

Keep `PAYMENTS_ENABLED=false` until the full payment release gate is approved.

---

## 15. Security baseline

Implement before pilot: no `X-Powered-By` · Content-Security-Policy ·
`X-Content-Type-Options: nosniff` · `Referrer-Policy:
strict-origin-when-cross-origin` · Permissions-Policy · `X-Frame-Options: DENY`
· CSP `frame-ancestors 'none'` · HSTS in production without preload or
includeSubDomains · same-origin mutation protection · request size limits · API
rate limits · safe error mapping · no stack traces in production · no secrets in
browser bundles · no response-body logging · no raw provider error returned to
users.

Unknown `/api/*` paths must return controlled JSON 404, not the SPA shell.
Expected body:

```json
{
  "code": "API_ROUTE_NOT_FOUND",
  "message": "The requested API route was not found."
}
```

Non-API client routes may fall back to the SPA. CSP must be derived from actual
application needs. Do not add wildcards, `unsafe-eval` or broad external
origins.

---

## 16. Privacy and data minimisation

Treat résumés as sensitive personal data. Create `docs/PRIVACY_DATA_MAP.md`.

For every data field record: purpose · source · storage location · retention ·
access · deletion behaviour · whether sent to an AI provider · whether sent to
an email provider · whether included in logs.

**Do not log:** résumé text · passwords · reset tokens · verification tokens ·
session cookies · provider access keys · card details · raw AI prompts
containing personal data.

Data deletion must distinguish: user-facing account deletion · required
financial records · anti-abuse suppression records · anonymised operational
telemetry · stored files · AI-derived outputs.

Do not claim data residency that the infrastructure cannot guarantee.

---

## 17. Observability

Provide `GET /healthz`:

```json
{
  "status": "ok",
  "service": "resume360-web",
  "commit": "<deployment SHA or unknown>"
}
```

The liveness endpoint: performs no database call · performs no external call ·
exposes no secrets · requires no authentication.

Structured logs must include safe correlation IDs. Do not log full request
bodies. Record: HTTP errors by category · AI operation status · upload/storage
operation status · email-delivery category · payment state when later
implemented · migration and deployment provenance.

---

## 18. Railway deployment

Create `railway.json`. It must configure: Railpack · Node 22 · build command ·
pre-deploy migration command · start command · `/healthz` · restart policy ·
one web replica initially.

Required scripts:

```
npm run build
npm run start
npm run db:migrate
npm run check
npm test
npm run test:client
npm run test:postgres
```

Pin Node in `package.json` engines and `.nvmrc`. Use an exact supported Node 22
version. The app must bind `process.env.PORT` and host `0.0.0.0`. Do not use
`reusePort` unless proven necessary. Production autodeploy must remain disabled
until release approval.

---

## 19. Feature flags

All sensitive capabilities must fail closed. Initial defaults:

```
AUTH_PROVIDER=unavailable
STORAGE_PROVIDER=unavailable
EMAIL_ENABLED=false
PUBLIC_SIGNUP_ENABLED=false
SIGNUP_GRANT_ENABLED=false
PAYMENTS_ENABLED=false
CREDIT_ENFORCEMENT_ENABLED=false
AI_ENABLED=false
```

Invalid values fail closed. No browser input may select a provider. A missing
secret must not trigger a weak fallback.

---

## 20. Build phases

Execute exactly in this order.

**Phase 0 — Product and architecture.** Deliver: product strategy · user
journey · information architecture · domain model · threat model · scoring
specification · privacy data map · architecture decisions · pilot acceptance
criteria. No large implementation before approval.

**Phase 1 — Foundation.** Deliver: repository structure · React/Express
application · PostgreSQL connection · migrations · Railway configuration ·
security headers · API 404 boundary · health check · CI/test framework ·
staging deployment.

**Phase 2 — Identity.** Deliver: Better Auth · email/password · verification ·
sign-in · sign-out · recovery · session revocation · three-session limit ·
protected-route principal · admin role boundary · full PostgreSQL and render
tests. Public signup remains disabled until email E2E passes.

**Phase 3 — Private storage.** Deliver: R2 adapter · private bucket · server
upload · download · delete · ownership · compensation · file validation ·
storage smoke test.

**Phase 4 — Résumé parsing and scoring.** Deliver: PDF/DOCX ingestion ·
structured extraction · deterministic checks · Resume Health Score · persisted
analysis · report UI · export. No AI optimisation yet until deterministic
workflow works.

**Phase 5 — AI operations.** Deliver: provider abstraction · OpenAI adapter ·
bounded analysis · suggestions · optimisation · cost telemetry · explicit
operations only · retry and rate limits.

**Phase 6 — Controlled pilot.** Deliver: invitation-only signup or controlled
opening · 10–20 pilot users · support workflow · usability measurements · AI
cost measurement · defect triage · no payments initially.

**Phase 7 — Credits and payments.** Only after the pilot: signup credit ·
enforcement · Flutterwave · webhooks · verification · exactly-once fulfilment ·
refunds and reconciliation.

---

## 21. Test requirements

Tests are part of the product, not an afterthought.

**Unit:** validators · scoring · state mapping · return-path safety · error
mapping · key generation · amount conversion.

**HTTP integration:** route authentication · ownership · security headers · API
404 · auth unavailable · safe DTOs.

**PostgreSQL:** migrations · ownership · identity lifecycle · sessions ·
concurrent session cap · ledger idempotency · payment uniqueness · storage
metadata · compensation records · concurrency.

**Client render:** sign-in · verification · reset · upload · analysis states ·
errors · accessibility · session expiry.

**Provider contract:** email · R2 · AI · Flutterwave later.

Mutation tests must be used for security-critical assertions. At minimum
detect: missing ownership condition · client-supplied user ID · client role
trust · public signup opened early · secret logged · session cookie weakened ·
object key accepted from browser · payment redirect trusted · duplicate ledger
grant · AI call on page view · raw provider error exposed.

---

## 22. Accessibility

All primary journeys must support: keyboard navigation · one clear page heading
· associated labels · visible focus · status and error announcements · no
colour-only meaning · accessible loading state · disabled-state communication ·
accessible password toggle · accessible file-upload feedback · no
protected-content flash. Use real component render tests.

---

## 23. Branding

Public product name: **Resume360**. Legal operator: **Pro-ICE Limited**.
Approved footer pattern: "Resume360 is operated by Pro-ICE Limited."

Do not use a Pro-ICE product name such as "Pro-ICE AI Resume Assistant." Do not
introduce Orion public endorsement without a later explicit ruling. Do not
redesign logos or create unsupported brand relationships automatically.

---

## 24. Reporting format after each phase

At the end of every phase, stop and report:

1. commit hash;
2. files changed;
3. architecture decisions made;
4. migrations added;
5. security boundaries;
6. tests added and totals;
7. typecheck result;
8. build result;
9. audit result;
10. live staging result;
11. known limitations;
12. deferred work;
13. exact next-phase entry conditions;
14. confirmation no unauthorised capability was enabled.

Do not continue automatically into the next phase.

---

## 25. Non-negotiable stop conditions

Stop and ask for approval when:

- a change affects legal identity;
- a change alters pricing or credits;
- a provider contract is ambiguous;
- a migration could destroy or merge user data;
- email uniqueness is violated;
- a secret or credential may have leaked;
- a new critical vulnerability appears;
- a new unresolved high vulnerability is introduced;
- a payment flow would place card data in Resume360;
- a public bucket is proposed;
- a user-ownership invariant cannot be proved;
- an AI operation has uncontrolled spend;
- a feature requires a new major product scope;
- production deployment or public launch is proposed.

---

## 26. First response required

Do not begin coding immediately. First return:

- **A.** your understanding of the product;
- **B.** the proposed pilot user journey;
- **C.** the proposed architecture;
- **D.** the proposed repository structure;
- **E.** the proposed database entities;
- **F.** the proposed seven-phase delivery plan;
- **G.** the top fifteen risks;
- **H.** the decisions still required from the owner;
- **I.** what you will deliberately exclude from the pilot;
- **J.** the smallest milestone that puts Resume360 in front of one real user.

Wait for approval after that response.

---

## Appendix — Rationale and sequencing

### Why this prompt beats "build it"

It forces the builder to avoid five common failures:

1. Starting with UI before identity, ownership and data boundaries.
2. Building payments before proving the résumé journey.
3. Coupling the product to Manus, Replit or another platform-specific service.
4. Creating vague AI scoring that cannot be explained or versioned.
5. Calling a prototype production-ready without migrations, tests and recovery
   controls.

### Greenfield build order

```
Railway foundation
  → Better Auth
  → SendGrid
  → R2
  → deterministic résumé parsing/scoring
  → OpenAI
  → pilot
  → credits
  → Flutterwave
```

### Deliberately postponed

- payment webhooks;
- the full credit ledger;
- interview simulation;
- job-board functionality;
- enterprise dashboards;
- institutional integrations;
- Orion endorsement;
- multi-provider AI;
- direct-to-R2 uploads;
- elaborate cost/FX reporting.

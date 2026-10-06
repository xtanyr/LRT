# Nonnegative report metrics implementation plan

> Execute in the current workspace with independent frontend and import/scoring workers, followed by final verification and review.

**Goal:** Reject negative metric values before saving or recalculating reports and show a clear correction message.

**Spec:** User states the service must not accept negative metric values or use them to calculate rating.

**Architecture:** Keep general numeric parsing unchanged for other domains. Add nonnegative validation at report writes/import confirmation, protect scoring from legacy negative values, and prevent negative autosave/submit in the report form.

**Tech stack:** NestJS/Prisma, React, Jest/Vitest.

## Constraints

- Preserve the earlier login and administrator-only history fixes.
- Reject negative facts, numeric plans and report extras; zero and optional blanks remain supported.
- Text analyses and URL fields keep their existing behavior.
- Invalid input must not persist metric values, audit events or new rating snapshots.
- Do not rewrite existing user data or change metric configuration thresholds/weights.

## Tasks

- [x] Backend reports: failing tests for numeric/comma/grouped negative metric facts, PATCH values, negative plans/extras, unchanged report/audit/rating, zero and blank acceptance.
- [x] Add nonNegativeNumberValue(raw, label, nullable) in common validation and use it for report metric/formData writes before the transaction.
- [x] Import/scoring: failing tests for rejection before writes and unscorable legacy negatives in both directions and revenue ratios; preserve zero scoring.
- [x] Frontend: failing tests for autosave/submit rejection, correction to zero, plans/extras and preserved saved rating; implement local negative validation.
- [x] Run focused checks, complete backend/frontend suites and both production builds.
- [x] Review the combined change independently and update graphify.

## Verification

- Backend: 24 suites, 184 tests passed; Nest production build passed.
- Frontend: 14 files, 60 tests passed; TypeScript/Vite production build passed.
- Independent review: import revenue correction and additional numeric field bypass fixed and rechecked; frontend review clean.
- `graphify update .` completed with AST extraction only.

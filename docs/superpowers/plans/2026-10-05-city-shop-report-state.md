# City coffee shop report state

**Goal:** For every coffee shop, show the selected month's rating/color, report state and actual submission timestamp in Moscow time.

**Investigation:** The shared dashboard selects report rows by shop/year/month. It does not carry submittedAt in its local report type and has no submission-time column. Its status label recomputes overdue state from the browser clock rather than honoring the server's explicit OVERDUE state. The yearly UAT seed marks every demo report SUBMITTED, explaining uniformly filled synthetic months; do not mislabel valid submitted reports or rewrite real data.

**Scope:** Add a submission-time column to shop rows, preserve city aggregate layout, distinguish drafts/missing reports and use explicit server report states. Display submission time only for the selected month's submitted report, in Europe/Moscow. Preserve earlier fixes and existing rating/average rules.

- [x] Add failing city-dashboard tests for month switching, mixed states and submission timestamps.
- [x] Implement selected-report state and time display.
- [x] Verify backend status/timestamp delivery and investigate the reported all-filled data within available access.
- [x] Run focused/full frontend verification, production build and independent review.
- [x] Update graphify.

## Verification

- RED: three city-dashboard cases failed on missing submission-time column and ignored server OVERDUE state.
- GREEN: seven focused cases pass, including selected month changes, ratings/colors, missing/draft/submitted/overdue states and null/invalid/stale timestamps.
- Frontend full suite: 15 files, 75 tests passed; TypeScript/Vite production build passed.
- Independent review: no actionable findings; backend status/selected-period lookup already correct.
- Public server bundle `assets/index-TNyN-zcl.js` likewise selects report by shop/year/month and lacks a submission-time column.
- Browser verification of `https://lrt.scr-tech.ru/` redirected to `/login`; no authenticated leader session or configured UAT credential was available. Actual all-filled remote data is unverified and no real reports were rewritten.
- Local yearly seed marks every demo report SUBMITTED, which can explain uniform status in that fixture; this is not proof about the live server's data.
- `graphify update .` completed with AST extraction only.

## Screenshot follow-up

- Screenshot identifies September 2026, Moscow, Coffee Shop 1 and Coffee Shop 2; submitted count is 2/2, ratings are 71.5 and 100.0, average 85.8.
- The yearly seed creates these exact shops with SUBMITTED reports for all twelve months. Its synthetic September submission timestamp is exactly 05.10.2026, 12:00 MSK, matching the earlier date complaint.
- Safe in-memory reproduction with base metrics gives 100.0 for both unmodified September demo reports. The screenshot's 71.5 indicates later report/configuration changes are possible; it is not proof of unchanged remote seed data.
- Draft/autosave calls do not send a new report. Edits intentionally preserve already-submitted status.
- Add regression assertions for selected-month submitted counts and the screenshot's two-shop average; switching to a draft/missing period must show 0/2 and no submitted ratings.
- Add a read-only, narrowly scoped server status query to the deployment runbook; no server reports or credentials are changed.
- Follow-up verification: eight focused dashboard cases and all 76 frontend tests pass. The runbook command parses and its Prisma query executes against the local database; remote records remain unverified.
- Follow-up `graphify update .` completed with AST extraction only.

# Report submission timestamp fix

**Goal:** Display the actual time of the latest explicit report submission in Moscow time for coffee shop and city leaders.

**Root cause:** Yearly demo reports have a synthetic submission timestamp on the fifth day of the next month at 09:00 UTC. The submission service retains any existing timestamp, including synthetic dates, after a successful explicit submission.

**Scope:** Refresh the submission timestamp only on successful explicit submission and audit its old/new value and actor. Preserve the original submitter used for annual leader attribution. Draft saves and report edits preserve the submission timestamp. Keep timestamps in UTC and show Moscow time in report views/history. Preserve existing login, history and negative metric fixes.

- [x] Reproduce the seeded timestamp and repeated submission failures in backend tests.
- [x] Record the current server timestamp on explicit submission, preserving draft behavior.
- [x] Verify the shared report screen consumes the saved timestamp and fix the city report list's browser-local formatting.
- [x] Run focused and full tests, both builds and independent review.
- [x] Update graphify.

No historical timestamp is reconstructed from the report period or guessed from the test example.

## Verification

- Reproduced old synthetic `2026-10-05T09:00:00Z` retained after submission at `2026-10-01T05:20:00Z`; test passes after the fix.
- Added timestamp audit with old/new ISO values and actual actor, preserving original leader attribution.
- UI tests cover Moscow formatting with browser timezones Asia/Omsk and America/New_York, explicit resubmission, autosave and administrator history.
- Backend: 24 suites, 188 tests passed. Frontend: 15 files, 69 tests passed.
- Both production builds passed. Independent review found no remaining issues.
- `graphify update .` completed with AST extraction only.
- Local database timestamp inspection was read-only; it does not contain the reported seeded UAT example.

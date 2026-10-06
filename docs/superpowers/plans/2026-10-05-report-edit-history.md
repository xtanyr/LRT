# Report edit history implementation plan

> **For agentic workers:** Use native implementation with a parallel frontend worker and independent final review. Steps use checkboxes for tracking.

**Goal:** Show edits to submitted reports with author, time, field and previous/new values in the existing administrator-only history screen.

**Architecture:** ReportEditLog already records report changes. Add a scoped collection endpoint and combine those events with the existing configuration history in the UI. Keep configuration permissions and scope report history through AccessService.shopWhere.

**Tech Stack:** NestJS, Prisma, React, Jest, Vitest.

**Spec:** User acceptance scenario: a coffee shop leader changes one number in an already submitted report; the edit and recalculated rating persist, and history shows who/when/which field/old/new.

**User clarification:** History must be accessible only to ADMIN. This overrides the initial access assumptions below and applies to navigation, direct UI routes, report history APIs, and configuration history API.

## Global constraints

- Preserve the earlier login fix and current autosave/rating behavior.
- Do not duplicate report events into ConfigChangeLog or change the database schema.
- Only ADMIN may read report or configuration history; other roles continue to edit permitted reports and have their edits recorded.
- The internal report collection still uses AccessService.shopWhere; controller roles enforce ADMIN-only access.
- Keep legacy formData audit events readable.

## Review focus

- Report and configuration IDs can collide: use source-prefixed row IDs.
- Zero and empty/null values must remain distinguishable in before/after columns.
- Report metric edits must not appear under the configuration Metрики filter.
- Per-field plans/extras edits must not audit the entire formData object.
- Static /reports/edit-logs must precede /reports/:id.

### Task 1: Scoped backend report history

**Files:** backend/src/reports/reports.service.ts; backend/src/reports/reports.controller.ts; backend/test/unit/report-edit-history.spec.ts; backend/test/unit/historical-report-editing.spec.ts.

**Interface:** GET /api/reports/edit-logs returns ReportEditLog[] with editedAt, editedBy {id,name}, report {id,year,month,coffeeShop {id,name},metricValues [{metricId,metric {name}}]}, and analysisLabel for analysis events. Author stays the authenticated editor. Sort editedAt descending, id descending.

- [x] Add failing tests for role-based report scopes and metadata returned by the collection endpoint.
- [x] Add failing tests for formData:metricPlan_1 and formData:gifts changes, including unchanged values and removed keys.
- [x] Implement getAllEditLogs(user: Actor) using AccessService.shopWhere and existing audit records.
- [x] Replace whole-object formData audit creation with individual changed-key records; retain legacy rows.
- [x] Run focused backend tests and build. Full backend suite: 23 suites, 126 tests pass.

### Task 2: Existing history screen and navigation

**Files:** frontend/src/pages/admin/AdminHistoryPage.tsx; frontend/src/App.tsx; frontend/src/layouts/AppLayout.tsx; frontend/src/test/AdminHistoryPage.test.tsx.

**Consumes:** Task 1 response and existing GET /admin/config-logs. Unwrap raw arrays and data envelopes.

- [x] Add failing tests showing report context/author/field/old/new, config/report ID collisions and source filters; updated access tests deny LEADER/CITY_LEADER/COO and allow ADMIN.
- [x] Load report and configuration events for ADMIN; merge chronologically with distinct source IDs.
- [x] Add an Отчёты category, human field labels, report context, and matching CSV output; show legacy formData changes per changed key where possible.
- [x] Restrict history route/menu to ADMIN with a strict role match, including role preview; preserve general role inheritance for other screens.
- [x] Run frontend tests and build. After the ADMIN-only clarification: 14 files, 48 tests pass.
- [x] Resolve review finding: export formula-like report text as literal CSV cells while preserving negative numbers. Regression verified RED then GREEN.

### Final verification

- [x] Run complete backend and frontend suites; no failures after ADMIN-only restrictions (138 backend tests, 48 frontend tests). Real RolesGuard/controller metadata checks deny other roles on all three history APIs; the leader acceptance script now expects 403 for those APIs.
- [x] Review the final diff independently, resolve material findings, and run graphify update . Both production builds pass; final scoped review has no residual material findings.

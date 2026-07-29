# Task 10 Report: Advanced Administration

## Outcome

Implemented a real Supabase-backed administration and instructor portal at:

- `/admin`
- `/admin/courses`
- `/admin/questions`
- `/admin/import`
- `/admin/users` (admin only)
- `/admin/reports`

The portal uses the existing teal/apricot visual language, Phosphor icons,
responsive navigation, accessible 44px controls, semantic tables/forms, and
explicit loading, empty, error, confirmation, and delivery-unavailable states.

## Authorization and persistence

Migration `202607290011_advanced_administration.sql` makes administrative
mutations RPC-only:

- Revokes direct authenticated `INSERT`, `UPDATE`, and `DELETE` access to
  profiles, assignments, imports, courses, chapters, questions, options, and
  exam configuration tables.
- Every portal mutation uses a narrowly scoped `SECURITY DEFINER` RPC.
- Every RPC resolves `auth.uid()`, requires an active profile, validates the
  admin role or an explicit instructor assignment, and writes an `audit_logs`
  entry in the same PostgreSQL transaction.
- Instructors cannot approve/promote/deactivate/invite users or add
  assignments. They can only manage content and view aggregate reports for
  assigned courses.
- Admins can approve/revoke instructors, atomically replace course
  assignments, activate/deactivate accounts, request/finalize invitations,
  and resend signup email through an audited request.
- Draft/archived chapters and their questions/options are excluded from
  learner catalog reads even when the parent course is published.

## Content management

- Courses and chapters support `draft`, `published`, and `archived` states.
- Archive is the destructive boundary: referenced IDs are retained. Existing
  attempt snapshot protections continue to reject option identity deletion or
  replacement.
- Question create/update preserves option IDs by label and records a new
  immutable `question_versions` snapshot.
- Publishing requires exactly four non-empty A-D options, exactly one correct
  answer, non-empty content, and an explanation.
- The portal supports create, read, update, and soft-delete/archive workflows
  for courses, chapters, and questions.

## Markdown import

- Preview uses the established Markdown parser and validation rules.
- It displays parsed, valid, issue, and duplicate counts plus issue details and
  duplicate source numbers.
- No write occurs until the user checks the explicit final confirmation.
- `admin_import_questions` validates the complete payload before durable
  writes, inserts the batch in one transaction, deduplicates source numbers,
  records versions and an import job, and is idempotent per uploader/key.
- A malformed row rolls back the whole batch and leaves no import job, question,
  option, version, or audit fragment.

## Reports and secrets

- Reports are computed from real attempts, attempt questions, and answers.
- Metrics include active users, attempts, average submitted score, completion
  rate, chapter incorrect rate, question correct/unanswered rates, most selected
  distractor, and distractor selection rates.
- Report RPCs scope instructors to assigned courses.
- Aggregate report payloads never return `correct_option_id`, `is_correct`, or
  the protected attempt answer-key relation.
- Question correctness for authorized editors is returned only by a scoped
  administration RPC.

## Invitation delivery

- `SUPABASE_SERVICE_ROLE_KEY` is read only from `src/lib/server-env.ts` by the
  server-only admin client path. It has no `NEXT_PUBLIC_` alias.
- When the key is absent, the UI disables new invitation delivery and states
  that no email was sent. It never reports a simulated success.
- Provider success/failure is finalized in the database and audited.

## Tests added

- `tests/admin-actions.test.ts`
  - User administration role boundary
  - Instructor assignment scope
  - Question publication validation
  - Markdown preview counts and confirmation
- `tests/reporting.test.ts`
  - Summary metrics
  - Chapter difficulty
  - Distractor and unanswered rates
- `tests/admin-database-security.test.ts`
  - Direct DML denial
  - Admin/instructor behavioral authorization
  - Instructor scope denial
  - Audited content mutation
  - Atomic instructor approval/assignment
  - Published-question rollback
  - Atomic/idempotent import and audit
  - Scoped aggregate report without answer keys
  - Draft chapter learner visibility
- `tests/admin-components.test.tsx`
  - Role-aware navigation
  - Import counts/issues/final confirmation
- Extended environment and generated database type tests.

## Verification

Focused verification:

```text
6 test files passed, 28 tests passed
database security follow-up: 8/8 passed
```

Full verification completed before commit:

```text
npm test          30 files, 173 tests passed
npm run typecheck exit 0
npm run lint      exit 0
npm run build     exit 0
```

The production build recognizes all six administration routes.

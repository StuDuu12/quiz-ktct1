# Instant Practice Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show correctness, the correct answer, and the explanation immediately on answer selection, while making every practice attempt follow the exact Markdown question order.

**Architecture:** The KTCT seed gains a chapter-local `practicePosition` derived from Markdown parse order, persisted as `questions.practice_position`. `start_attempt` uses that field only for practice allocation; mock exams keep their current random allocation. Practice questions already load `correct_option_id` and `explanation`, so the client computes feedback synchronously and treats the save RPC as background confirmation/reconciliation.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase/PostgreSQL PL/pgSQL, Vitest, Testing Library, PGlite.

## Global Constraints

- Practice feedback must render without waiting for a network Promise.
- Practice question order must match occurrence order in `content/ktct/chapter-1.md` through `chapter-6.md`.
- Chapter 6 must have positions 1–100 even though its two sections both use source numbers 1–50.
- Mock exams remain random, 40 questions, and 60 minutes.
- A failed background save keeps local feedback visible and offers retry.
- Server reconciliation wins when another tab saved a different option first.
- Do not invent the missing Chapter 3 question 7 or rewrite academic content.
- Preserve the user's deleted root-level `check-*.cjs` files and never stage them.

---

## File Map

- `scripts/build-ktct-seed.ts`: assign chapter-local Markdown occurrence order.
- `scripts/production/lib.ts`: validate `practicePosition` in generated seed data.
- `scripts/production/database.ts`: persist and fingerprint `practice_position` during production setup.
- `seed/ktct.json`: generated 497-question artifact containing `practicePosition`.
- `src/lib/supabase/database.types.ts`: expose the new nullable database column.
- `supabase/migrations/202608020007_fixed_practice_order.sql`: add/backfill support, assign positions to future questions, and replace `start_attempt` ordering.
- `src/features/practice/engine.ts`: compute local feedback synchronously.
- `src/features/practice/components/practice-session.tsx`: save in the background and reconcile the server result.
- `tests/parse-markdown.test.ts`: verify all chapter positions, especially Chapters 3 and 6.
- `tests/production-database.test.ts`: verify production seed persistence and resume detection.
- `tests/practice-start-course-scope.test.ts`: execute the real migration/function and verify fixed ordering.
- `tests/practice-engine.test.ts`: verify pure synchronous feedback behavior.
- `tests/practice-session.test.tsx`: verify feedback appears while save is unresolved and survives a save error.

### Task 1: Add Markdown occurrence order to the KTCT seed

**Files:**
- Modify: `scripts/build-ktct-seed.ts`
- Modify: `scripts/production/lib.ts`
- Modify: `tests/parse-markdown.test.ts`
- Regenerate: `seed/ktct.json`

**Interfaces:**
- Produces: `KtctSeedQuestion.practicePosition: number` and `SeedQuestion.practicePosition: number`.
- Constraint: positions are unique and exactly `1..questionCount` inside each chapter.

- [ ] **Step 1: Write failing seed-order tests**

Add assertions that describe occurrence order rather than source numbering:

```ts
const seed = buildKtctSeed(process.cwd()).questions;
const chapter3 = seed.filter((q) => q.chapter === 3);
const chapter6 = seed.filter((q) => q.chapter === 6);

expect(chapter3.map((q) => q.practicePosition)).toEqual(
  Array.from({ length: 111 }, (_, index) => index + 1),
);
expect(chapter3[6]?.sourceNumber).toBe(8);
expect(chapter6.map((q) => q.practicePosition)).toEqual(
  Array.from({ length: 100 }, (_, index) => index + 1),
);
expect(chapter6.slice(48, 52).map((q) => q.sourceNumber)).toEqual([49, 50, 1, 2]);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- tests/parse-markdown.test.ts`

Expected: FAIL because `practicePosition` is undefined.

- [ ] **Step 3: Add the minimal seed field**

Change the KTCT-specific type and collection loop:

```ts
export type KtctSeedQuestion = ParsedQuestion & {
  chapter: number;
  practicePosition: number;
};

for (const [questionIndex, question] of result.questions.entries()) {
  questions.push({
    chapter,
    practicePosition: questionIndex + 1,
    ...question,
  });
}
```

Add `practicePosition: number` to `SeedQuestion`. In `readAndValidateSeed`, group rows by chapter and reject a chapter unless sorted positions equal `1..N`:

```ts
const expected = Array.from({ length: chapterRows.length }, (_, index) => index + 1);
const actual = chapterRows.map(({ practicePosition }) => practicePosition).toSorted((a, b) => a - b);
if (actual.join(",") !== expected.join(",")) {
  throw new Error(`Invalid KTCT practice positions for chapter ${chapter}`);
}
```

- [ ] **Step 4: Regenerate and verify GREEN**

Run: `npx tsx scripts/build-ktct-seed.ts`

Expected: writes 497 questions; the only parser warning remains Chapter 3's orphan answer-table row 7.

Run: `npm test -- tests/parse-markdown.test.ts`

Expected: 21 existing tests plus the new order test pass.

- [ ] **Step 5: Commit the seed contract**

```powershell
git add -- scripts/build-ktct-seed.ts scripts/production/lib.ts tests/parse-markdown.test.ts seed/ktct.json
git commit -m "feat: preserve Markdown practice order"
```

### Task 2: Persist practice positions through production setup

**Files:**
- Modify: `scripts/production/database.ts`
- Modify: `src/lib/supabase/database.types.ts`
- Modify: `tests/production-database.test.ts`
- Modify: `tests/production-config.test.ts`

**Interfaces:**
- Consumes: `SeedQuestion.practicePosition` from Task 1.
- Produces: question rows with `practice_position: number` and seed fingerprints that detect missing or stale positions.

- [ ] **Step 1: Write failing production seed tests**

Assert every inserted/upserted question contains the seed position:

```ts
expect(client.tables.get("questions")?.map((row) => row.practice_position)).toEqual(
  Array.from({ length: 497 }, (_, index) => {
    const chapterStart = [0, 49, 136, 247, 307, 397]
      .findLast((start) => start <= index)!;
    return index - chapterStart + 1;
  }),
);
```

Add `practice_position` to the actual/expected fingerprints and assert `classifyExistingSeedState` returns `"resume"` when only that field differs.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- tests/production-database.test.ts tests/production-config.test.ts`

Expected: FAIL because production question rows and fingerprints omit `practice_position`.

- [ ] **Step 3: Persist the field**

In `buildQuestionRows`, map:

```ts
practice_position: question.practicePosition,
```

Add `practice_position` to the Supabase select, actual fingerprint, expected fingerprint, and question upsert payload. Update the generated database type:

```ts
practice_position: number | null;       // Row
practice_position?: number | null;      // Insert and Update
```

- [ ] **Step 4: Run and verify GREEN**

Run: `npm test -- tests/production-database.test.ts tests/production-config.test.ts`

Expected: all tests pass and a stale production position forces a resumable seed update.

- [ ] **Step 5: Commit production persistence**

```powershell
git add -- scripts/production/database.ts src/lib/supabase/database.types.ts tests/production-database.test.ts tests/production-config.test.ts
git commit -m "feat: persist practice question positions"
```

### Task 3: Make PostgreSQL allocate practice questions in fixed order

**Files:**
- Create: `supabase/migrations/202608020007_fixed_practice_order.sql`
- Modify: `tests/practice-start-course-scope.test.ts`

**Interfaces:**
- Consumes: `questions.practice_position` populated by Task 2.
- Produces: `public.start_attempt(uuid, uuid, uuid)` with fixed practice ordering and unchanged mock-exam hashing.

- [ ] **Step 1: Extend the PGlite schema and write a failing order test**

Give questions deliberately mismatched UUID, source number, and practice position. After applying migrations, assert attempt order follows `practice_position`:

```ts
const ordered = await database.query<{ source_number: number }>(`
  select question.source_number
  from public.attempt_questions attempt_question
  join public.questions question on question.id = attempt_question.question_id
  where attempt_question.attempt_id = '${started.rows[0]!.id}'
  order by attempt_question.position
`);
expect(ordered.rows.map((row) => row.source_number)).toEqual([1, 2, 3]);
```

Add two questions whose UUID order is `3, 1, 2` and whose `practice_position` is `1, 2, 3`.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- tests/practice-start-course-scope.test.ts`

Expected: FAIL with UUID/source numbers in the wrong order or because `practice_position` does not exist.

- [ ] **Step 3: Create the schema migration**

The migration must contain:

```sql
alter table public.questions
  add column if not exists practice_position integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'questions_practice_position_positive'
      and conrelid = 'public.questions'::regclass
  ) then
    alter table public.questions
      add constraint questions_practice_position_positive
      check (practice_position is null or practice_position > 0) not valid;
  end if;
end
$$;

alter table public.questions
  validate constraint questions_practice_position_positive;

create unique index if not exists questions_chapter_practice_position_idx
  on public.questions (chapter_id, practice_position)
  where practice_position is not null;
```

Create or replace a trigger function and drop/recreate its `before insert` trigger so the migration is rerunnable. The trigger assigns new questions after the current maximum when `new.practice_position is null`. Acquire a chapter-scoped advisory transaction lock before reading the maximum:

```sql
perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('practice-position:' || new.chapter_id::text, 0)
);
select coalesce(max(question.practice_position), 0) + 1
into new.practice_position
from public.questions question
where question.chapter_id = new.chapter_id;
```

Replace `start_attempt` using the current secure definition from `202608020005_fix_start_attempt_question_scope.sql`. Keep the mock branch exactly on:

```sql
order by md5(q.id::text || attempt_seed)
limit selected_question_count
```

Change only the practice allocation order to:

```sql
order by
  q.practice_position asc nulls last,
  q.created_at asc,
  q.id asc
```

Retain the course-through-chapter join, nullable practice expiry, snapshot creation, function revokes, and authenticated grant.

- [ ] **Step 4: Apply the new migration in the test and verify GREEN**

Run: `npm test -- tests/practice-start-course-scope.test.ts tests/exam-database-security.test.ts`

Expected: practice order test passes; mock-exam allocation/security tests remain green.

- [ ] **Step 5: Commit database ordering**

```powershell
git add -- supabase/migrations/202608020007_fixed_practice_order.sql tests/practice-start-course-scope.test.ts
git commit -m "fix: order practice questions by Markdown position"
```

### Task 4: Compute and render practice feedback synchronously

**Files:**
- Modify: `src/features/practice/engine.ts`
- Modify: `src/features/practice/components/practice-session.tsx`
- Modify: `tests/practice-engine.test.ts`
- Modify: `tests/practice-session.test.tsx`

**Interfaces:**
- Consumes: `PracticeQuestion.correctOptionId` and `PracticeQuestion.explanation`, already loaded by `load_practice_attempt_questions`.
- Produces: `answerPracticeQuestion` immediately sets `isCorrect`, `correctOptionId`, `explanation`, `locked`, and `showFeedback`.

- [ ] **Step 1: Write the failing pure-engine test**

```ts
const answered = answerPracticeQuestion(state, "q1", "b1");
expect(answered.answers.q1).toMatchObject({
  optionId: "b1",
  isCorrect: false,
  correctOptionId: "a1",
  explanation: "Đáp án A đúng.",
  locked: true,
  showFeedback: true,
});
```

The test question must contain `correctOptionId: "a1"` and the explanation shown above.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- tests/practice-engine.test.ts`

Expected: FAIL because local answer state has no correctness or explanation.

- [ ] **Step 3: Implement local feedback in the pure state transition**

After option validation, reject missing answer metadata and populate it:

```ts
if (!question.correctOptionId) throw new Error("PRACTICE_FEEDBACK_UNAVAILABLE");

[questionId]: {
  ...current,
  optionId,
  isCorrect: optionId === question.correctOptionId,
  correctOptionId: question.correctOptionId,
  explanation: question.explanation,
  locked: true,
  showFeedback: true,
},
```

- [ ] **Step 4: Write a failing UI test with an unresolved save**

```ts
let resolveSave!: (feedback: PracticeFeedback) => void;
const saveAnswer = vi.fn(() => new Promise<PracticeFeedback>((resolve) => {
  resolveSave = resolve;
}));

fireEvent.click(screen.getByRole("radio", { name: /Phương án B/ }));
expect(screen.getByText("Chưa chính xác")).toBeInTheDocument();
expect(screen.getByText("Đáp án A đúng.")).toBeInTheDocument();
expect(saveAnswer).toHaveBeenCalledOnce();
```

Do not resolve the Promise before the immediate assertions.

- [ ] **Step 5: Run the UI test and verify RED**

Run: `npm test -- tests/practice-session.test.tsx`

Expected: FAIL because feedback remains hidden until `saveAnswer` resolves.

- [ ] **Step 6: Keep save as background confirmation**

Keep `chooseOption`'s synchronous `setState(answerPracticeQuestion(...))`, then call `persistAnswer` without awaiting it. `persistAnswer` continues to call `applyPracticeFeedback` so a reconciled option from another tab replaces local state. On catch, set save status to error but do not roll back the answer.

Add a rejected-save test asserting immediate feedback stays visible and the “Thử lại” control appears.

- [ ] **Step 7: Verify GREEN**

Run: `npm test -- tests/practice-engine.test.ts tests/practice-session.test.tsx tests/practice-actions.test.ts`

Expected: all engine, UI, retry, and reconciliation tests pass.

- [ ] **Step 8: Commit instant feedback**

```powershell
git add -- src/features/practice/engine.ts src/features/practice/components/practice-session.tsx tests/practice-engine.test.ts tests/practice-session.test.tsx
git commit -m "feat: show practice feedback instantly"
```

### Task 5: Verify and roll out without reviving the broken function

**Files:**
- Verify only: all files from Tasks 1–4
- Production mutation: apply `202608020007_fixed_practice_order.sql`, then run the updated seed setup

**Interfaces:**
- Produces: production database with 497 non-null, chapter-local practice positions and a working `start_attempt` definition.

- [ ] **Step 1: Run the complete focused suite**

```powershell
npm test -- tests/parse-markdown.test.ts tests/production-database.test.ts tests/production-config.test.ts tests/practice-start-course-scope.test.ts tests/practice-engine.test.ts tests/practice-session.test.tsx tests/practice-actions.test.ts tests/practice-route.test.tsx tests/exam-database-security.test.ts
```

Expected: zero failing tests.

- [ ] **Step 2: Run static and production build verification**

```powershell
npm run typecheck
npm run build
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 3: Apply schema/function migration before seed data**

```powershell
node run-migration-file.cjs supabase/migrations/202608020007_fixed_practice_order.sql
```

Expected: migration succeeds. Immediately re-run the migration once to prove idempotency; the second run must also succeed.

- [ ] **Step 4: Backfill all production positions from the validated seed**

```powershell
npm run production:setup
```

Expected: production setup reports 1 course, 6 chapters, 497 questions, and 1,988 published options. The changed fingerprint forces question upserts even when counts were already complete.

- [ ] **Step 5: Verify production data and live flows**

Use a disposable authenticated user or a transaction rollback to create one fresh practice attempt per chapter. Assert:

```text
chapter counts = 49, 87, 111, 60, 90, 100
missing practice_position = 0
duplicate (chapter_id, practice_position) = 0
attempt positions = 1..N for every chapter
loaded secret rows = question count for every attempt
```

For Chapter 6, separately assert attempt positions 49–52 correspond to Markdown occurrence positions 49, 50, 51, 52 while source numbers are 49, 50, 1, 2.

- [ ] **Step 6: Preserve existing attempts and explain the new-attempt boundary**

Do not rewrite `attempt_questions` for existing sessions because they are immutable snapshots. Confirm a newly started attempt uses fixed order; tell the user to finish/delete an old in-progress attempt or press “Bắt đầu lượt mới” to see the new order.

- [ ] **Step 7: Confirm rollout created no unintended tracked files**

Run: `git status --short`

Expected: only the user's pre-existing deleted `check-*.cjs` files remain unstaged. If `seed/ktct.json` changed during rollout, compare it with the committed Task 1 version; they must be byte-identical before completion.

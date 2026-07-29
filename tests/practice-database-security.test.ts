import { readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ids = {
  student: "00000000-0000-0000-0000-000000000011",
  stranger: "00000000-0000-0000-0000-000000000012",
  course: "10000000-0000-0000-0000-000000000011",
  chapter: "20000000-0000-0000-0000-000000000011",
  otherChapter: "20000000-0000-0000-0000-000000000012",
  question: "30000000-0000-0000-0000-000000000011",
  otherQuestion: "30000000-0000-0000-0000-000000000012",
  correct: "40000000-0000-0000-0000-000000000011",
  wrong: "40000000-0000-0000-0000-000000000012",
};

const migrationPaths = [
  "202607290001_initial_schema.sql",
  "202607290002_rls_policies.sql",
  "202607290003_learner_progress.sql",
  "202607290004_practice_sessions.sql",
  "202607290005_harden_practice_sessions.sql",
].map((file) => path.resolve("supabase/migrations", file));
const snapshotScopeMigrationPath = path.resolve(
  "supabase/migrations/202607290006_preserve_practice_snapshot_scope.sql",
);

describe("secure chapter practice persistence", () => {
  let database: PGlite;
  let attemptId: string;
  let attemptQuestionId: string;

  const assumeIdentity = async (userId: string) => {
    await database.exec(`
      set role authenticated;
      select set_config('request.jwt.claim.sub', '${userId}', false);
    `);
  };

  const resetIdentity = async () => {
    await database.exec(`
      reset role;
      select set_config('request.jwt.claim.sub', '', false);
    `);
  };

  const startChapterPractice = async () => {
    const started = await database.query<{ id: string }>(`
      select id
      from public.start_attempt('${ids.course}', null, '${ids.chapter}')
    `);
    const attempt = started.rows[0]!.id;
    const snapshot = await database.query<{ id: string }>(`
      select id from public.attempt_questions
      where attempt_id = '${attempt}'
    `);
    return {
      attemptId: attempt,
      attemptQuestionId: snapshot.rows[0]!.id,
    };
  };

  const forceExpired = async (targetAttemptId: string) => {
    await resetIdentity();
    await database.exec(`
      alter table public.attempts disable trigger protect_attempt_submission;
      update public.attempts
      set
        started_at = '2020-01-01 00:00:00+00',
        expires_at = '2020-01-01 01:00:00+00'
      where id = '${targetAttemptId}';
      alter table public.attempts enable trigger protect_attempt_submission;
    `);
    await assumeIdentity(ids.student);
  };

  beforeAll(async () => {
    database = new PGlite();
    await database.exec(`
      create schema auth;
      create table auth.users (
        id uuid primary key,
        email text,
        raw_user_meta_data jsonb
      );
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create function auth.uid()
      returns uuid
      language sql
      stable
      as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
    `);

    for (const migrationPath of migrationPaths) {
      await database.exec(await readFile(migrationPath, "utf8"));
    }

    await database.exec(`
      insert into auth.users (id, email, raw_user_meta_data)
      values
        ('${ids.student}', 'student@example.test', '{}'),
        ('${ids.stranger}', 'stranger@example.test', '{}');

      insert into public.courses (id, slug, title, status, created_by)
      values ('${ids.course}', 'ktct', 'KTCT', 'published', '${ids.student}');

      insert into public.chapters (id, course_id, position, title)
      values
        ('${ids.chapter}', '${ids.course}', 1, 'Chapter 1'),
        ('${ids.otherChapter}', '${ids.course}', 2, 'Chapter 2');

      insert into public.questions (
        id, chapter_id, content, explanation, status, created_by
      )
      values
        ('${ids.question}', '${ids.chapter}', 'Question 1', 'Exact explanation', 'draft', '${ids.student}'),
        ('${ids.otherQuestion}', '${ids.otherChapter}', 'Question 2', 'Other explanation', 'draft', '${ids.student}');

      insert into public.question_options (
        id, question_id, label, content, is_correct
      )
      values
        ('${ids.correct}', '${ids.question}', 'A', 'Correct', true),
        ('${ids.wrong}', '${ids.question}', 'B', 'Wrong', false),
        ('40000000-0000-0000-0000-000000000013', '${ids.question}', 'C', 'C', false),
        ('40000000-0000-0000-0000-000000000014', '${ids.question}', 'D', 'D', false),
        ('40000000-0000-0000-0000-000000000015', '${ids.otherQuestion}', 'A', 'A', true),
        ('40000000-0000-0000-0000-000000000016', '${ids.otherQuestion}', 'B', 'B', false),
        ('40000000-0000-0000-0000-000000000017', '${ids.otherQuestion}', 'C', 'C', false),
        ('40000000-0000-0000-0000-000000000018', '${ids.otherQuestion}', 'D', 'D', false);

      update public.questions set status = 'published';
    `);

    await assumeIdentity(ids.student);
    const started = await database.query<{ id: string }>(`
      select id
      from public.start_attempt('${ids.course}', null, '${ids.chapter}')
    `);
    attemptId = started.rows[0]!.id;
    const snapshot = await database.query<{ id: string }>(`
      select id from public.attempt_questions
      where attempt_id = '${attemptId}'
    `);
    attemptQuestionId = snapshot.rows[0]!.id;
    await resetIdentity();
    await database.exec(await readFile(snapshotScopeMigrationPath, "utf8"));
  }, 30_000);

  afterAll(async () => {
    await resetIdentity();
    await database.close();
  });

  it("starts a practice attempt with only the requested chapter", async () => {
    const questions = await database.query<{ question_id: string }>(`
      select question_id from public.attempt_questions
      where attempt_id = '${attemptId}'
    `);
    expect(questions.rows).toEqual([{ question_id: ids.question }]);
  });

  it("reopens an immutable snapshot after its source question is archived and rejects another chapter", async () => {
    await assumeIdentity(ids.student);
    const fresh = await startChapterPractice();
    await resetIdentity();
    await database.exec(`
      update public.questions
      set status = 'archived'
      where id = '${ids.question}'
    `);
    await assumeIdentity(ids.student);

    try {
      const reopened = await database.query<{
        question_id: string;
        chapter_id: string;
        has_explanation: boolean;
      }>(`
        select
          question_id,
          question_snapshot ->> 'chapter_id' as chapter_id,
          question_snapshot ? 'explanation' as has_explanation
        from public.load_practice_attempt_questions(
          '${fresh.attemptId}',
          '${ids.chapter}'
        )
      `);
      expect(reopened.rows).toEqual([
        {
          question_id: ids.question,
          chapter_id: ids.chapter,
          has_explanation: false,
        },
      ]);

      await expect(
        database.query(`
          select *
          from public.load_practice_attempt_questions(
            '${fresh.attemptId}',
            '${ids.otherChapter}'
          )
        `),
      ).rejects.toThrow(/chapter mismatch/i);
    } finally {
      await resetIdentity();
      await database.exec(`
        update public.questions
        set status = 'published'
        where id = '${ids.question}'
      `);
      await resetIdentity();
    }
  });

  it("backfills immutable chapter scope without exposing practice explanations", async () => {
    await assumeIdentity(ids.student);
    const snapshot = await database.query<{
      chapter_id: string;
      has_explanation: boolean;
      explanation: string | null;
    }>(`
      select
        question_snapshot ->> 'chapter_id' as chapter_id,
        question_snapshot ? 'explanation' as has_explanation,
        question_snapshot ->> 'explanation' as explanation
      from public.attempt_questions
      where id = '${attemptQuestionId}'
    `);
    expect(snapshot.rows).toEqual([
      {
        chapter_id: ids.chapter,
        has_explanation: false,
        explanation: null,
      },
    ]);
    await expect(
      database.query(`
        select explanation
        from public.questions
        where id = '${ids.question}'
      `),
    ).rejects.toThrow();
    await resetIdentity();
  });

  it("returns feedback only for the exact first saved answer and locks it", async () => {
    await assumeIdentity(ids.student);
    const feedback = await database.query<{
      selected_option_id: string;
      is_correct: boolean;
      explanation: string;
      was_already_locked: boolean;
    }>(`
      select * from public.save_practice_answer(
        '${attemptId}',
        '${attemptQuestionId}',
        '${ids.wrong}'
      )
    `);
    expect(feedback.rows).toEqual([
      {
        selected_option_id: ids.wrong,
        is_correct: false,
        explanation: "Exact explanation",
        was_already_locked: false,
      },
    ]);

    const repeated = await database.query<{
      selected_option_id: string;
      is_correct: boolean;
      explanation: string;
      was_already_locked: boolean;
    }>(`
      select * from public.save_practice_answer(
        '${attemptId}',
        '${attemptQuestionId}',
        '${ids.wrong}'
      )
    `);
    expect(repeated.rows[0]).toMatchObject({
      selected_option_id: ids.wrong,
      was_already_locked: true,
    });
    await resetIdentity();
  });

  it("reconciles a concurrent different answer to the authoritative first save", async () => {
    await assumeIdentity(ids.student);
    const fresh = await startChapterPractice();
    await database.query(`
      select * from public.save_practice_answer(
        '${fresh.attemptId}',
        '${fresh.attemptQuestionId}',
        '${ids.wrong}'
      )
    `);

    const losingTab = await database.query<{
      selected_option_id: string;
      is_correct: boolean;
      explanation: string;
      was_already_locked: boolean;
    }>(`
      select * from public.save_practice_answer(
        '${fresh.attemptId}',
        '${fresh.attemptQuestionId}',
        '${ids.correct}'
      )
    `);
    expect(losingTab.rows).toEqual([
      {
        selected_option_id: ids.wrong,
        is_correct: false,
        explanation: "Exact explanation",
        was_already_locked: true,
      },
    ]);
    await resetIdentity();
  });

  it("atomically marks an expired practice attempt during reload", async () => {
    await assumeIdentity(ids.student);
    const fresh = await startChapterPractice();
    await forceExpired(fresh.attemptId);

    const loaded = await database.query<{ status: string }>(`
      select status
      from public.sync_practice_attempt('${fresh.attemptId}')
    `);
    expect(loaded.rows).toEqual([{ status: "expired" }]);

    await resetIdentity();
    const persisted = await database.query<{ status: string }>(`
      select status from public.attempts where id = '${fresh.attemptId}'
    `);
    expect(persisted.rows).toEqual([{ status: "expired" }]);
  });

  it("returns and persists expired when finish happens after the deadline", async () => {
    await assumeIdentity(ids.student);
    const fresh = await startChapterPractice();
    await forceExpired(fresh.attemptId);

    const finished = await database.query<{ status: string }>(`
      select status
      from public.finish_practice_attempt('${fresh.attemptId}')
    `);
    expect(finished.rows).toEqual([{ status: "expired" }]);

    await resetIdentity();
    const persisted = await database.query<{ status: string }>(`
      select status from public.attempts where id = '${fresh.attemptId}'
    `);
    expect(persisted.rows).toEqual([{ status: "expired" }]);
  });

  it("cannot enumerate correctness or read another learner's feedback", async () => {
    await assumeIdentity(ids.student);
    await expect(
      database.query(`
        select is_correct from public.attempt_answers
        where attempt_question_id = '${attemptQuestionId}'
      `),
    ).rejects.toThrow();
    await resetIdentity();

    await assumeIdentity(ids.stranger);
    await expect(
      database.query(`
        select * from public.save_practice_answer(
          '${attemptId}',
          '${attemptQuestionId}',
          '${ids.wrong}'
        )
      `),
    ).rejects.toThrow(/not found|outside|owned/i);
    await resetIdentity();
  });

  it("persists flags and completes only an owned in-progress practice attempt", async () => {
    await assumeIdentity(ids.student);
    await database.query(`
      select public.set_practice_flag(
        '${attemptId}',
        '${attemptQuestionId}',
        true
      )
    `);
    const flag = await database.query<{ is_flagged: boolean }>(`
      select is_flagged from public.attempt_answers
      where attempt_question_id = '${attemptQuestionId}'
    `);
    expect(flag.rows).toEqual([{ is_flagged: true }]);

    const finished = await database.query<{ status: string; score: number }>(`
      select status, score::double precision as score
      from public.finish_practice_attempt('${attemptId}')
    `);
    expect(finished.rows).toEqual([{ status: "submitted", score: 0 }]);
    await expect(
      database.query(`
        select public.set_practice_flag(
          '${attemptId}',
          '${attemptQuestionId}',
          false
        )
      `),
    ).rejects.toThrow(/in progress/i);
    await resetIdentity();
  });
});

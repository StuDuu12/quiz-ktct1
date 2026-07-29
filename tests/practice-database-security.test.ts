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
].map((file) => path.resolve("supabase/migrations", file));

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

  it("returns feedback only for the exact first saved answer and locks it", async () => {
    await assumeIdentity(ids.student);
    const feedback = await database.query<{
      is_correct: boolean;
      explanation: string;
    }>(`
      select * from public.save_practice_answer(
        '${attemptId}',
        '${attemptQuestionId}',
        '${ids.wrong}'
      )
    `);
    expect(feedback.rows).toEqual([
      { is_correct: false, explanation: "Exact explanation" },
    ]);

    await expect(
      database.query(`
        select * from public.save_practice_answer(
          '${attemptId}',
          '${attemptQuestionId}',
          '${ids.correct}'
        )
      `),
    ).rejects.toThrow(/ANSWER_LOCKED/);
    await resetIdentity();
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

import { readFile } from "node:fs/promises";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const ids = {
  student: "00000000-0000-0000-0000-000000000091",
  course: "10000000-0000-0000-0000-000000000091",
  chapter: "20000000-0000-0000-0000-000000000091",
  question: "30000000-0000-0000-0000-000000000091",
  originalCorrect: "40000000-0000-0000-0000-000000000091",
  originalWrong: "40000000-0000-0000-0000-000000000092",
};

const migrationFiles = [
  "202607290001_initial_schema.sql",
  "202607290002_rls_policies.sql",
  "202607290003_learner_progress.sql",
  "202607290004_practice_sessions.sql",
  "202607290005_harden_practice_sessions.sql",
  "202607290006_preserve_practice_snapshot_scope.sql",
  "202607290007_balanced_mock_exams.sql",
  "202607290008_resilient_mock_exam_sessions.sql",
  "202607290009_reviewed_mock_exam_submission.sql",
  "202607290010_immutable_results_history.sql",
];

async function applyMigration(database: PGlite, index: number) {
  const file = migrationFiles[index]!;
  await database.exec(
    await readFile(path.resolve("supabase/migrations", file), "utf8"),
  );
}

async function createDatabase() {
  const database = new PGlite();
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
  return database;
}

async function assumeIdentity(database: PGlite) {
  await database.exec(`
    set role authenticated;
    select set_config('request.jwt.claim.sub', '${ids.student}', false);
  `);
}

async function resetIdentity(database: PGlite) {
  await database.exec(`
    reset role;
    select set_config('request.jwt.claim.sub', '', false);
  `);
}

async function seedQuestion(database: PGlite) {
  await database.exec(`
    insert into auth.users (id, email, raw_user_meta_data)
    values ('${ids.student}', 'student@example.test', '{}');

    insert into public.courses (id, slug, title, status, created_by)
    values (
      '${ids.course}', 'migration-course', 'Migration course', 'published',
      '${ids.student}'
    );
    insert into public.chapters (id, course_id, position, title)
    values ('${ids.chapter}', '${ids.course}', 1, 'Chapter 1');
    insert into public.questions (
      id, chapter_id, content, explanation, status, created_by
    )
    values (
      '${ids.question}', '${ids.chapter}', 'Original question',
      'Original explanation', 'draft', '${ids.student}'
    );
    insert into public.question_options (
      id, question_id, label, content, is_correct
    )
    values
      (
        '${ids.originalCorrect}', '${ids.question}', 'A',
        'Original correct', true
      ),
      (
        '${ids.originalWrong}', '${ids.question}', 'B',
        'Original wrong', false
      );
    update public.questions set status = 'published'
    where id = '${ids.question}';
  `);
}

async function editSourceAnswerKey(database: PGlite) {
  await database.exec(`
    update public.questions
    set explanation = 'Edited explanation'
    where id = '${ids.question}';
    update public.question_options
    set is_correct = case
      when id = '${ids.originalCorrect}' then false
      when id = '${ids.originalWrong}' then true
      else is_correct
    end
    where question_id = '${ids.question}';
  `);
}

async function readResult(database: PGlite, attemptId: string) {
  await assumeIdentity(database);
  const result = await database.query<{
    status: string;
    score: number;
    selected_option_id: string;
    correct_option_id: string;
    is_correct: boolean;
    explanation: string;
  }>(`
    select
      a.status,
      details.score::double precision as score,
      details.selected_option_id,
      details.correct_option_id,
      details.is_correct,
      details.explanation
    from public.get_attempt_result_details('${attemptId}') details
    join public.attempts a on a.id = details.attempt_id
  `);
  await resetIdentity(database);
  return result.rows[0]!;
}

describe("attempt-secret migration ordering", () => {
  it("preserves a practice key and explanation captured before later source edits", async () => {
    const database = await createDatabase();
    try {
      for (let index = 0; index <= 3; index += 1) {
        await applyMigration(database, index);
      }
      await seedQuestion(database);
      await assumeIdentity(database);
      const started = await database.query<{ id: string }>(`
        select id from public.start_attempt(
          '${ids.course}', null, '${ids.chapter}'
        )
      `);
      const attemptId = started.rows[0]!.id;
      const attemptQuestion = await database.query<{ id: string }>(`
        select id from public.attempt_questions
        where attempt_id = '${attemptId}'
      `);
      await database.query(`
        select * from public.save_practice_answer(
          '${attemptId}',
          '${attemptQuestion.rows[0]!.id}',
          '${ids.originalCorrect}'
        )
      `);
      await database.query(`
        select * from public.finish_practice_attempt('${attemptId}')
      `);
      await resetIdentity(database);

      await editSourceAnswerKey(database);
      for (let index = 4; index < migrationFiles.length; index += 1) {
        await applyMigration(database, index);
      }

      expect(await readResult(database, attemptId)).toEqual({
        status: "submitted",
        score: 100,
        selected_option_id: ids.originalCorrect,
        correct_option_id: ids.originalCorrect,
        is_correct: true,
        explanation: "Original explanation",
      });
    } finally {
      await database.close();
    }
  }, 30_000);

  it("regrades a truly pre-capture submitted row so score and detail agree", async () => {
    const database = await createDatabase();
    try {
      for (let index = 0; index <= 2; index += 1) {
        await applyMigration(database, index);
      }
      await seedQuestion(database);
      await assumeIdentity(database);
      const started = await database.query<{ id: string }>(`
        select id from public.start_attempt('${ids.course}', null)
      `);
      const attemptId = started.rows[0]!.id;
      const attemptQuestion = await database.query<{ id: string }>(`
        select id from public.attempt_questions
        where attempt_id = '${attemptId}'
      `);
      await resetIdentity(database);
      await database.exec(`
        insert into public.attempt_answers (
          attempt_question_id, selected_option_id
        )
        values (
          '${attemptQuestion.rows[0]!.id}', '${ids.originalWrong}'
        );
        update public.attempts
        set status = 'submitted'
        where id = '${attemptId}';
      `);
      await editSourceAnswerKey(database);

      for (let index = 3; index < migrationFiles.length; index += 1) {
        await applyMigration(database, index);
      }

      const result = await readResult(database, attemptId);
      expect(result.status).toBe("submitted");
      expect(result.score).toBe(result.is_correct ? 100 : 0);
      expect(result.selected_option_id).toBe(ids.originalWrong);
      expect(result.correct_option_id).toBe(ids.originalWrong);
      expect(result.explanation).toBe("Original explanation");
    } finally {
      await database.close();
    }
  }, 30_000);
});

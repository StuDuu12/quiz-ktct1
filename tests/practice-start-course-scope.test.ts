import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const ids = {
  student: "00000000-0000-0000-0000-000000000201",
  course: "10000000-0000-0000-0000-000000000201",
  chapter: "20000000-0000-0000-0000-000000000201",
};

const brokenMigration = path.resolve(
  "supabase/migrations/202608020001_remove_practice_expiration.sql",
);
const repairMigration = path.resolve(
  "supabase/migrations/202608020005_fix_start_attempt_question_scope.sql",
);
const nullablePracticeExpiryMigration = path.resolve(
  "supabase/migrations/202608020006_allow_unlimited_practice_attempts.sql",
);
const fixedPracticeOrderMigration = path.resolve(
  "supabase/migrations/202608020008_fixed_practice_order.sql",
);

async function applyIfPresent(database: PGlite, migrationPath: string) {
  try {
    await access(migrationPath);
  } catch {
    return;
  }
  await database.exec(await readFile(migrationPath, "utf8"));
}

describe("practice attempt question scope", () => {
  it("selects published questions through their chapter course", async () => {
    const database = new PGlite();
    try {
      await database.exec(`
        create schema auth;
        create role anon nologin;
        create role authenticated nologin;
        create function auth.uid()
        returns uuid
        language sql
        stable
        as $$
          select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
        $$;

        create type public.attempt_kind as enum ('practice', 'mock_exam');
        create type public.attempt_status as enum (
          'in_progress', 'submitted', 'expired'
        );
        create table public.courses (id uuid primary key);
        create table public.chapters (
          id uuid primary key,
          course_id uuid not null references public.courses(id)
        );
        create table public.questions (
          id uuid primary key,
          chapter_id uuid not null references public.chapters(id),
          content text not null,
          status text not null,
          source_number integer,
          practice_position integer,
          created_at timestamptz not null default now()
        );
        create table public.question_options (
          id uuid primary key,
          question_id uuid not null references public.questions(id),
          label text not null,
          content text not null
        );
        create table public.exam_configs (
          id uuid primary key,
          question_count integer not null,
          duration_seconds integer not null
        );
        create table public.attempts (
          id uuid primary key,
          user_id uuid not null,
          course_id uuid not null references public.courses(id),
          exam_config_id uuid references public.exam_configs(id),
          kind public.attempt_kind not null,
          status public.attempt_status not null default 'in_progress',
          started_at timestamptz not null,
          submitted_at timestamptz,
          expires_at timestamptz not null,
          duration_seconds integer,
          score numeric,
          question_order jsonb not null,
          option_order jsonb not null,
          chapter_id uuid references public.chapters(id)
        );
        create table public.attempt_questions (
          id uuid primary key default gen_random_uuid(),
          attempt_id uuid not null references public.attempts(id),
          question_id uuid not null references public.questions(id),
          position integer not null,
          question_snapshot jsonb not null,
          option_order jsonb not null
        );
      `);

      await database.exec(await readFile(brokenMigration, "utf8"));
      await applyIfPresent(database, repairMigration);
      await applyIfPresent(database, nullablePracticeExpiryMigration);
      await applyIfPresent(database, fixedPracticeOrderMigration);
      await database.exec(`
        insert into public.courses (id) values ('${ids.course}');
        insert into public.chapters (id, course_id)
        values ('${ids.chapter}', '${ids.course}');
        insert into public.questions (
          id, chapter_id, content, status, source_number, practice_position
        ) values
          ('30000000-0000-0000-0000-000000000203', '${ids.chapter}', 'Question 1', 'published', 1, 1),
          ('30000000-0000-0000-0000-000000000201', '${ids.chapter}', 'Question 2', 'published', 2, 2),
          ('30000000-0000-0000-0000-000000000202', '${ids.chapter}', 'Question 3', 'published', 3, 3);
        insert into public.question_options (
          id, question_id, label, content
        ) values
          ('40000000-0000-0000-0000-000000000201', '30000000-0000-0000-0000-000000000203', 'A', 'A'),
          ('40000000-0000-0000-0000-000000000202', '30000000-0000-0000-0000-000000000203', 'B', 'B'),
          ('40000000-0000-0000-0000-000000000203', '30000000-0000-0000-0000-000000000201', 'A', 'A'),
          ('40000000-0000-0000-0000-000000000204', '30000000-0000-0000-0000-000000000201', 'B', 'B'),
          ('40000000-0000-0000-0000-000000000205', '30000000-0000-0000-0000-000000000202', 'A', 'A'),
          ('40000000-0000-0000-0000-000000000206', '30000000-0000-0000-0000-000000000202', 'B', 'B');

        set role authenticated;
        select set_config('request.jwt.claim.sub', '${ids.student}', false);
      `);

      const started = await database.query<{ id: string }>(`
        select id from public.start_attempt(
          '${ids.course}', null, '${ids.chapter}'
        )
      `);
      await database.exec(`
        reset role;
        select set_config('request.jwt.claim.sub', '', false);
      `);
      const questions = await database.query<{ source_number: number }>(`
        select question.source_number
        from public.attempt_questions attempt_question
        join public.questions question on question.id = attempt_question.question_id
        where attempt_question.attempt_id = '${started.rows[0]!.id}'
        order by attempt_question.position
      `);

      expect(questions.rows.map((row) => row.source_number)).toEqual([1, 2, 3]);
    } finally {
      await database.close();
    }
  }, 30_000);
});

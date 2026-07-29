import { readFile } from "node:fs/promises";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabaseClient } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock("@/src/lib/supabase/server", () => ({
  createServerSupabaseClient,
}));
vi.mock("@/src/e2e/guard", () => ({ isE2EEnabled: () => false }));

import { ChapterRow } from "@/src/features/catalog/components/chapter-row";
import {
  getCourseDashboard,
  type ChapterSummary,
} from "@/src/features/catalog/queries";

const ids = {
  student: "00000000-0000-0000-0000-000000000031",
  course: "10000000-0000-0000-0000-000000000031",
  chapter: "20000000-0000-0000-0000-000000000031",
  question: "30000000-0000-0000-0000-000000000031",
  correct: "40000000-0000-0000-0000-000000000031",
  wrong: "40000000-0000-0000-0000-000000000032",
};

function singleQuery(data: unknown) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

function orderedQuery(data: unknown[]) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn().mockResolvedValue({ data, error: null }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

describe("practice resume dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes the newest unexpired chapter attempt and links directly to it", async () => {
    const activeAttemptId = "60000000-0000-0000-0000-000000000031";
    const course = {
      id: ids.course,
      slug: "ktct",
      title: "KTCT",
      description: "",
    };
    const chapters = [
      {
        id: ids.chapter,
        position: 1,
        title: "Chương 1",
        questions: [{ id: ids.question }],
      },
    ];
    const attempts = [
      {
        id: "60000000-0000-0000-0000-000000000099",
        kind: "practice",
        status: "in_progress",
        score: null,
        submitted_at: null,
        started_at: "2100-01-01T00:00:00.000Z",
        expires_at: "2020-01-01T01:00:00.000Z",
        attempt_questions: [
          { question_snapshot: { chapter_id: ids.chapter } },
        ],
      },
      {
        id: activeAttemptId,
        kind: "practice",
        status: "in_progress",
        score: null,
        submitted_at: null,
        started_at: "2099-01-01T00:00:00.000Z",
        expires_at: "2099-01-01T01:00:00.000Z",
        attempt_questions: [
          { question_snapshot: { chapter_id: ids.chapter } },
        ],
      },
    ];
    createServerSupabaseClient.mockResolvedValue({
      from: (table: string) => {
        if (table === "courses") return singleQuery(course);
        if (table === "chapters") return orderedQuery(chapters);
        if (table === "attempts") return orderedQuery(attempts);
        throw new Error(`Unexpected table: ${table}`);
      },
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    const result = await getCourseDashboard(
      { id: ids.student, role: "student", email: "student@example.test" },
      course.slug,
    );
    expect(result.data?.chapters[0]?.activeAttemptId).toBe(activeAttemptId);

    const markup = renderToStaticMarkup(
      createElement(ChapterRow, {
        chapter: result.data!.chapters[0]!,
        courseSlug: course.slug,
      }),
    );
    expect(markup).toContain("Tiếp tục");
    expect(markup).toContain(
      `/courses/${course.slug}/chapters/1/practice?attempt=${activeAttemptId}`,
    );
  });

  it("renders a fresh-start CTA when the chapter has no active attempt", () => {
    const chapter = {
      id: ids.chapter,
      position: 1,
      title: "Chương 1",
      questionCount: 10,
      attempts: 0,
      accuracy: null,
      latestAttemptAt: null,
      activeAttemptId: null,
    } as ChapterSummary;

    const markup = renderToStaticMarkup(
      createElement(ChapterRow, { chapter, courseSlug: "ktct" }),
    );
    expect(markup).toContain("Luyện tập");
    expect(markup).not.toContain("?attempt=");
  });
});

describe("start_or_resume_practice migration", () => {
  let database: PGlite;

  const assumeIdentity = async () => {
    await database.exec(`
      set role authenticated;
      select set_config('request.jwt.claim.sub', '${ids.student}', false);
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

    const migrations = [
      "202607290001_initial_schema.sql",
      "202607290002_rls_policies.sql",
      "202607290003_learner_progress.sql",
      "202607290004_practice_sessions.sql",
      "202607290005_harden_practice_sessions.sql",
      "202607290006_preserve_practice_snapshot_scope.sql",
      "202607290007_balanced_mock_exams.sql",
      "202607300003_resume_practice_attempt.sql",
    ];
    for (const migration of migrations) {
      await database.exec(
        await readFile(path.resolve("supabase/migrations", migration), "utf8"),
      );
    }

    await database.exec(`
      insert into auth.users (id, email, raw_user_meta_data)
      values ('${ids.student}', 'student@example.test', '{}');

      insert into public.courses (id, slug, title, status, created_by)
      values ('${ids.course}', 'ktct', 'KTCT', 'published', '${ids.student}');

      insert into public.chapters (id, course_id, position, title)
      values ('${ids.chapter}', '${ids.course}', 1, 'Chapter 1');

      insert into public.questions (
        id, chapter_id, content, explanation, status, created_by
      )
      values (
        '${ids.question}',
        '${ids.chapter}',
        'Question 1',
        'Explanation',
        'draft',
        '${ids.student}'
      );

      insert into public.question_options (
        id, question_id, label, content, is_correct
      )
      values
        ('${ids.correct}', '${ids.question}', 'A', 'Correct', true),
        ('${ids.wrong}', '${ids.question}', 'B', 'B', false),
        ('40000000-0000-0000-0000-000000000033', '${ids.question}', 'C', 'C', false),
        ('40000000-0000-0000-0000-000000000034', '${ids.question}', 'D', 'D', false);

      update public.questions
      set status = 'published'
      where id = '${ids.question}';
    `);
    await assumeIdentity();
  }, 30_000);

  afterAll(async () => {
    await resetIdentity();
    await database.close();
  });

  it("returns one attempt for repeated starts and preserves the expired row when starting again", async () => {
    const start = () =>
      database.query<{ id: string }>(`
        select id
        from public.start_or_resume_practice('${ids.course}', '${ids.chapter}')
      `);

    const [first, concurrentRepeat] = await Promise.all([start(), start()]);
    const firstId = first.rows[0]!.id;
    expect(concurrentRepeat.rows[0]!.id).toBe(firstId);

    const activeCount = await database.query<{ count: number }>(`
      select count(*)::integer as count
      from public.attempts
      where user_id = '${ids.student}'
        and course_id = '${ids.course}'
        and kind = 'practice'
    `);
    expect(activeCount.rows).toEqual([{ count: 1 }]);

    await resetIdentity();
    await database.exec(`
      alter table public.attempts disable trigger protect_attempt_submission;
      update public.attempts
      set
        started_at = '2020-01-01 00:00:00+00',
        expires_at = '2020-01-01 01:00:00+00'
      where id = '${firstId}';
      alter table public.attempts enable trigger protect_attempt_submission;
    `);
    await assumeIdentity();

    const replacement = await start();
    expect(replacement.rows[0]!.id).not.toBe(firstId);

    const preserved = await database.query<{ id: string }>(`
      select id
      from public.attempts
      where user_id = '${ids.student}'
      order by started_at
    `);
    expect(preserved.rows.map(({ id }) => id)).toContain(firstId);
    expect(preserved.rows).toHaveLength(2);
  });

  it("installs the transaction lock as a security-definer database invariant", async () => {
    const metadata = await database.query<{
      definition: string;
      security_definer: boolean;
    }>(`
      select
        pg_get_functiondef(proc.oid) as definition,
        proc.prosecdef as security_definer
      from pg_proc proc
      where proc.oid =
        'public.start_or_resume_practice(uuid,uuid)'::regprocedure
    `);

    expect(metadata.rows[0]?.security_definer).toBe(true);
    expect(metadata.rows[0]?.definition).toContain("pg_advisory_xact_lock");
    expect(metadata.rows[0]?.definition.indexOf("pg_advisory_xact_lock")).toBeLessThan(
      metadata.rows[0]?.definition.indexOf("select attempt.*") ?? -1,
    );
  });

  it("loads attempt feedback without changing attempts or saved answers", async () => {
    const started = await database.query<{ id: string }>(`
      select id
      from public.start_or_resume_practice('${ids.course}', '${ids.chapter}')
    `);
    const attemptId = started.rows[0]!.id;
    const attemptQuestion = await database.query<{ id: string }>(`
      select id
      from public.attempt_questions
      where attempt_id = '${attemptId}'
    `);
    const attemptQuestionId = attemptQuestion.rows[0]!.id;
    await database.query(`
      select *
      from public.save_practice_answer(
        '${attemptId}',
        '${attemptQuestionId}',
        '${ids.wrong}'
      )
    `);
    await resetIdentity();
    const before = await database.query<{ snapshot: string }>(`
      select jsonb_build_object(
        'attempt', (select to_jsonb(attempt) from public.attempts attempt where id = '${attemptId}'),
        'answer', (select to_jsonb(answer) from public.attempt_answers answer where attempt_question_id = '${attemptQuestionId}')
      )::text as snapshot
    `);
    await assumeIdentity();

    const feedback = await database.query<{
      attempt_question_id: string;
      selected_option_id: string;
      is_correct: boolean;
      explanation: string;
    }>(`
      select *
      from public.load_practice_answer_feedback('${attemptId}')
    `);
    expect(feedback.rows).toEqual([
      {
        attempt_question_id: attemptQuestionId,
        selected_option_id: ids.wrong,
        is_correct: false,
        explanation: "Explanation",
      },
    ]);

    await resetIdentity();
    const after = await database.query<{ snapshot: string }>(`
      select jsonb_build_object(
        'attempt', (select to_jsonb(attempt) from public.attempts attempt where id = '${attemptId}'),
        'answer', (select to_jsonb(answer) from public.attempt_answers answer where attempt_question_id = '${attemptQuestionId}')
      )::text as snapshot
    `);
    expect(after.rows).toEqual(before.rows);
    await assumeIdentity();
  });
});

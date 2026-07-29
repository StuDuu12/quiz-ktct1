import { readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { allocateExamQuestions } from "@/src/features/exam/allocate";
import { seededShuffle } from "@/src/features/exam/shuffle";

const ids = {
  student: "00000000-0000-0000-0000-000000000021",
  stranger: "00000000-0000-0000-0000-000000000022",
  balancedCourse: "10000000-0000-0000-0000-000000000021",
  shortageCourse: "10000000-0000-0000-0000-000000000022",
  insufficientCourse: "10000000-0000-0000-0000-000000000023",
  draftCourse: "10000000-0000-0000-0000-000000000024",
  fiveChapterCourse: "10000000-0000-0000-0000-000000000025",
  balancedConfig: "50000000-0000-0000-0000-000000000021",
  shortageConfig: "50000000-0000-0000-0000-000000000022",
  insufficientConfig: "50000000-0000-0000-0000-000000000023",
  inactiveConfig: "50000000-0000-0000-0000-000000000024",
  practiceConfig: "50000000-0000-0000-0000-000000000025",
  draftCourseConfig: "50000000-0000-0000-0000-000000000026",
  fiveChapterConfig: "50000000-0000-0000-0000-000000000027",
};

const migrationPaths = [
  "202607290001_initial_schema.sql",
  "202607290002_rls_policies.sql",
  "202607290003_learner_progress.sql",
  "202607290004_practice_sessions.sql",
  "202607290005_harden_practice_sessions.sql",
  "202607290006_preserve_practice_snapshot_scope.sql",
  "202607290007_balanced_mock_exams.sql",
  "202607290008_resilient_mock_exam_sessions.sql",
].map((file) => path.resolve("supabase/migrations", file));

function uuid(prefix: number, sequence: number) {
  return `${prefix}0000000-0000-0000-0000-${String(sequence).padStart(12, "0")}`;
}

function buildCourseBank(
  courseId: string,
  sequenceOffset: number,
  counts: number[],
  status: "published" | "draft" = "published",
) {
  const chapterRows: string[] = [];
  const questionRows: string[] = [];
  const optionRows: string[] = [];
  let questionSequence = sequenceOffset * 100;
  let optionSequence = sequenceOffset * 1_000;

  counts.forEach((count, chapterIndex) => {
    const chapterId = uuid(2, sequenceOffset * 10 + chapterIndex + 1);
    chapterRows.push(
      `('${chapterId}', '${courseId}', ${chapterIndex + 1}, 'Chapter ${chapterIndex + 1}')`,
    );

    for (let index = 0; index < count; index += 1) {
      questionSequence += 1;
      const questionId = uuid(3, questionSequence);
      questionRows.push(
        `('${questionId}', '${chapterId}', 'Question ${questionSequence}', 'Explanation ${questionSequence}', 'draft', ${index + 1}, '${ids.student}')`,
      );
      for (const [optionIndex, label] of ["A", "B", "C", "D"].entries()) {
        optionSequence += 1;
        optionRows.push(
          `('${uuid(4, optionSequence)}', '${questionId}', '${label}', 'Option ${label} for ${questionSequence}', ${optionIndex === 0})`,
        );
      }
    }
  });

  return {
    status,
    chapterRows,
    questionRows,
    optionRows,
  };
}

describe("secure balanced mock-exam creation", () => {
  let database: PGlite;
  let balancedAttemptId: string;

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

  const startAttempt = async (courseId: string, configId: string) => {
    const result = await database.query<{
      id: string;
      user_id: string;
      kind: string;
      duration_seconds: number;
    }>(`
      select
        id,
        user_id,
        kind,
        extract(epoch from (expires_at - started_at))::integer
          as duration_seconds
      from public.start_attempt('${courseId}', '${configId}')
    `);
    return result.rows[0]!;
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

    const banks = [
      buildCourseBank(ids.balancedCourse, 1, [12, 12, 12, 12, 12, 12]),
      buildCourseBank(ids.shortageCourse, 2, [2, 12, 12, 12, 12, 12]),
      buildCourseBank(ids.insufficientCourse, 3, [6, 6, 6, 6, 6, 6]),
      buildCourseBank(ids.draftCourse, 4, [7, 7, 7, 7, 7, 7], "draft"),
      buildCourseBank(ids.fiveChapterCourse, 5, [10, 10, 10, 10, 10]),
    ];

    await database.exec(`
      insert into auth.users (id, email, raw_user_meta_data)
      values
        ('${ids.student}', 'student@example.test', '{}'),
        ('${ids.stranger}', 'stranger@example.test', '{}');

      insert into public.courses (id, slug, title, status, created_by)
      values
        ('${ids.balancedCourse}', 'balanced', 'Balanced', 'published', '${ids.student}'),
        ('${ids.shortageCourse}', 'shortage', 'Shortage', 'published', '${ids.student}'),
        ('${ids.insufficientCourse}', 'insufficient', 'Insufficient', 'published', '${ids.student}'),
        ('${ids.draftCourse}', 'draft-course', 'Draft course', 'draft', '${ids.student}'),
        ('${ids.fiveChapterCourse}', 'five-chapters', 'Five chapters', 'published', '${ids.student}');

      insert into public.chapters (id, course_id, position, title)
      values ${banks.flatMap((bank) => bank.chapterRows).join(",\n")};

      insert into public.questions (
        id, chapter_id, content, explanation, status, source_number, created_by
      )
      values ${banks.flatMap((bank) => bank.questionRows).join(",\n")};

      insert into public.question_options (
        id, question_id, label, content, is_correct
      )
      values ${banks.flatMap((bank) => bank.optionRows).join(",\n")};

      update public.questions q
      set status = 'published'
      from public.chapters ch, public.courses c
      where ch.id = q.chapter_id
        and c.id = ch.course_id
        and c.status = 'published';

      insert into public.exam_configs (
        id, course_id, title, kind, question_count, duration_seconds,
        is_active, created_by
      )
      values
        ('${ids.balancedConfig}', '${ids.balancedCourse}', 'Balanced mock', 'mock_exam', 13, 17, true, '${ids.student}'),
        ('${ids.shortageConfig}', '${ids.shortageCourse}', 'Shortage mock', 'mock_exam', 40, 3600, true, '${ids.student}'),
        ('${ids.insufficientConfig}', '${ids.insufficientCourse}', 'Insufficient mock', 'mock_exam', 40, 3600, true, '${ids.student}'),
        ('${ids.inactiveConfig}', '${ids.balancedCourse}', 'Inactive mock', 'mock_exam', 40, 3600, false, '${ids.student}'),
        ('${ids.practiceConfig}', '${ids.balancedCourse}', 'Practice config', 'practice', 40, 3600, true, '${ids.student}'),
        ('${ids.draftCourseConfig}', '${ids.draftCourse}', 'Draft course mock', 'mock_exam', 40, 3600, true, '${ids.student}'),
        ('${ids.fiveChapterConfig}', '${ids.fiveChapterCourse}', 'Five chapter mock', 'mock_exam', 40, 3600, true, '${ids.student}');
    `);
  }, 30_000);

  afterAll(async () => {
    await resetIdentity();
    await database.close();
  });

  it("binds a new 60-minute mock exam to auth.uid and hides it from another learner", async () => {
    await assumeIdentity(ids.student);
    const attempt = await startAttempt(ids.balancedCourse, ids.balancedConfig);
    balancedAttemptId = attempt.id;
    expect(attempt).toMatchObject({
      user_id: ids.student,
      kind: "mock_exam",
      duration_seconds: 3600,
    });

    await resetIdentity();
    await assumeIdentity(ids.stranger);
    const hidden = await database.query<{ id: string }>(`
      select id from public.attempts where id = '${attempt.id}'
    `);
    expect(hidden.rows).toEqual([]);
    const hiddenSnapshots = await database.query<{ id: string }>(`
      select id from public.attempt_questions
      where attempt_id = '${attempt.id}'
    `);
    expect(hiddenSnapshots.rows).toEqual([]);
    await resetIdentity();
  });

  it("creates exactly 40 unique snapshots balanced across all six chapters", async () => {
    await assumeIdentity(ids.student);
    const attempt = await startAttempt(ids.balancedCourse, ids.balancedConfig);
    balancedAttemptId ||= attempt.id;

    const summary = await database.query<{
      total: number;
      unique_total: number;
      chapter_total: number;
      minimum: number;
      maximum: number;
    }>(`
      with counts as (
        select q.chapter_id, count(*)::integer as question_count
        from public.attempt_questions aq
        join public.questions q on q.id = aq.question_id
        where aq.attempt_id = '${attempt.id}'
        group by q.chapter_id
      )
      select
        (select count(*)::integer from public.attempt_questions
          where attempt_id = '${attempt.id}') as total,
        (select count(distinct question_id)::integer
          from public.attempt_questions
          where attempt_id = '${attempt.id}') as unique_total,
        count(*)::integer as chapter_total,
        min(question_count)::integer as minimum,
        max(question_count)::integer as maximum
      from counts
    `);
    expect(summary.rows).toEqual([
      {
        total: 40,
        unique_total: 40,
        chapter_total: 6,
        minimum: 6,
        maximum: 7,
      },
    ]);
    await resetIdentity();
  });

  it("matches the TypeScript allocator exactly for a controllable production seed", async () => {
    const seed = "parity-seed-2026";
    for (const courseId of [ids.balancedCourse, ids.shortageCourse]) {
      const chapters = await database.query<{ id: string }>(`
        select id
        from public.chapters
        where course_id = '${courseId}'
        order by position
      `);
      const pool = await database.query<{ id: string; chapter_id: string }>(`
        select q.id, q.chapter_id
        from public.questions q
        join public.chapters ch on ch.id = q.chapter_id
        where ch.course_id = '${courseId}'
          and q.status = 'published'
        order by q.id
      `);
      const options = await database.query<{
        id: string;
        question_id: string;
      }>(`
        select qo.id, qo.question_id
        from public.question_options qo
        join public.questions q on q.id = qo.question_id
        join public.chapters ch on ch.id = q.chapter_id
        where ch.course_id = '${courseId}'
        order by qo.id
      `);

      const selected = allocateExamQuestions(
        pool.rows.map((question) => ({
          id: question.id,
          chapterId: question.chapter_id,
        })),
        chapters.rows.map(({ id }) => id),
        40,
        seed,
      );
      const expected = selected.map((question, index) => ({
        position: index + 1,
        question_id: question.id,
        chapter_id: question.chapterId,
        option_order: seededShuffle(
          options.rows
            .filter((option) => option.question_id === question.id)
            .map((option) => option.id),
          `${seed}:option:${question.id}`,
        ),
      }));

      const production = await database.query<{
        position: number;
        question_id: string;
        chapter_id: string;
        option_order: string[];
      }>(`
        select
          question_position as position,
          question_id,
          chapter_id,
          option_order
        from public.allocate_mock_exam_questions(
          '${courseId}',
          '${seed}'
        )
        order by question_position
      `);
      expect(production.rows).toEqual(expected);
    }

    await assumeIdentity(ids.student);
    await expect(
      database.query(`
        select *
        from public.allocate_mock_exam_questions(
          '${ids.balancedCourse}',
          '${seed}'
        )
      `),
    ).rejects.toThrow();
    await resetIdentity();
  });

  it("backfills a short chapter to 40 without duplicate questions", async () => {
    await assumeIdentity(ids.student);
    const attempt = await startAttempt(ids.shortageCourse, ids.shortageConfig);
    const summary = await database.query<{
      total: number;
      unique_total: number;
      short_chapter_count: number;
    }>(`
      select
        count(*)::integer as total,
        count(distinct aq.question_id)::integer as unique_total,
        count(*) filter (where ch.position = 1)::integer
          as short_chapter_count
      from public.attempt_questions aq
      join public.questions q on q.id = aq.question_id
      join public.chapters ch on ch.id = q.chapter_id
      where aq.attempt_id = '${attempt.id}'
    `);
    expect(summary.rows).toEqual([
      { total: 40, unique_total: 40, short_chapter_count: 2 },
    ]);
    await resetIdentity();
  });

  it("rejects a published bank with fewer than 40 eligible questions", async () => {
    await assumeIdentity(ids.student);
    await expect(
      startAttempt(ids.insufficientCourse, ids.insufficientConfig),
    ).rejects.toThrow(/enough published questions/i);
    await resetIdentity();
  });

  it("rejects a mock-exam course that does not contain six chapters", async () => {
    await assumeIdentity(ids.student);
    await expect(
      startAttempt(ids.fiveChapterCourse, ids.fiveChapterConfig),
    ).rejects.toThrow(/exactly six chapters/i);
    await resetIdentity();
  });

  it("overrides mutable config count and duration with the fixed 40/3600 contract", async () => {
    await assumeIdentity(ids.student);
    const stored = await database.query<{
      question_count: number;
      duration_seconds: number;
    }>(`
      select question_count, duration_seconds
      from public.exam_configs
      where id = '${ids.balancedConfig}'
    `);
    expect(stored.rows).toEqual([
      { question_count: 13, duration_seconds: 17 },
    ]);

    const attempt = await startAttempt(ids.balancedCourse, ids.balancedConfig);
    const snapshots = await database.query<{ count: number }>(`
      select count(*)::integer as count
      from public.attempt_questions
      where attempt_id = '${attempt.id}'
    `);
    expect(attempt.duration_seconds).toBe(3600);
    expect(snapshots.rows).toEqual([{ count: 40 }]);
    await resetIdentity();
  });

  it("accepts only an active mock_exam config belonging to a published course", async () => {
    await assumeIdentity(ids.student);
    await expect(
      startAttempt(ids.balancedCourse, ids.inactiveConfig),
    ).rejects.toThrow(/active mock-exam configuration/i);
    await expect(
      startAttempt(ids.balancedCourse, ids.practiceConfig),
    ).rejects.toThrow(/mock.exam/i);
    await expect(
      startAttempt(ids.draftCourse, ids.draftCourseConfig),
    ).rejects.toThrow(/published course/i);
    await resetIdentity();
  });

  it("keeps learner snapshots secret and unchanged after source content is edited", async () => {
    await assumeIdentity(ids.student);
    if (!balancedAttemptId) {
      balancedAttemptId = (
        await startAttempt(ids.balancedCourse, ids.balancedConfig)
      ).id;
    }
    const before = await database.query<{
      attempt_question_id: string;
      question_id: string;
      question_snapshot: unknown;
      has_explanation: boolean;
      exposes_correctness: boolean;
    }>(`
      select
        aq.id as attempt_question_id,
        aq.question_id,
        aq.question_snapshot,
        aq.question_snapshot ? 'explanation' as has_explanation,
        exists (
          select 1
          from jsonb_array_elements(aq.question_snapshot -> 'options') option
          where option ? 'is_correct'
        ) as exposes_correctness
      from public.attempt_questions aq
      where aq.attempt_id = '${balancedAttemptId}'
      order by aq.position
      limit 1
    `);
    expect(before.rows[0]).toMatchObject({
      has_explanation: false,
      exposes_correctness: false,
    });

    const original = before.rows[0]!;
    await expect(
      database.query(`
        select correct_option_id, explanation
        from public.attempt_question_secrets
        where attempt_question_id = '${original.attempt_question_id}'
      `),
    ).rejects.toThrow();

    await resetIdentity();
    const secretBefore = await database.query<{
      correct_option_id: string;
      explanation: string;
    }>(`
      select correct_option_id, explanation
      from public.attempt_question_secrets
      where attempt_question_id = '${original.attempt_question_id}'
    `);
    expect(secretBefore.rows).toHaveLength(1);
    const replacement = await database.query<{ id: string }>(`
      select id
      from public.question_options
      where question_id = '${original.question_id}'
        and id <> '${secretBefore.rows[0]!.correct_option_id}'
      order by id
      limit 1
    `);
    await database.exec(`
      update public.questions
      set
        content = 'Edited source content',
        explanation = 'Edited source explanation',
        status = 'archived'
      where id = '${original.question_id}';
      update public.question_options
      set
        content = 'Edited source option',
        is_correct = case
          when id = '${secretBefore.rows[0]!.correct_option_id}' then false
          when id = '${replacement.rows[0]!.id}' then true
          else is_correct
        end
      where question_id = '${original.question_id}';
    `);
    await assumeIdentity(ids.student);

    const reopened = await database.query<{ question_snapshot: unknown }>(`
      select question_snapshot
      from public.attempt_questions
      where id = '${original.attempt_question_id}'
    `);
    expect(reopened.rows).toEqual([
      { question_snapshot: original.question_snapshot },
    ]);
    await resetIdentity();

    const secretAfter = await database.query<{
      correct_option_id: string;
      explanation: string;
    }>(`
      select correct_option_id, explanation
      from public.attempt_question_secrets
      where attempt_question_id = '${original.attempt_question_id}'
    `);
    expect(secretAfter.rows).toEqual(secretBefore.rows);

    await assumeIdentity(ids.student);
    await database.query(`
      select * from public.save_mock_exam_answer(
        '${balancedAttemptId}',
        '${original.attempt_question_id}',
        '${secretBefore.rows[0]!.correct_option_id}'
      )
    `);
    await resetIdentity();
    const graded = await database.query<{ is_correct: boolean }>(`
      select is_correct
      from public.attempt_answers
      where attempt_question_id = '${original.attempt_question_id}'
    `);
    expect(graded.rows).toEqual([{ is_correct: true }]);
  });

  it("lets only the owner change answers and flags on an active mock exam", async () => {
    await assumeIdentity(ids.student);
    const attempt = await startAttempt(ids.balancedCourse, ids.balancedConfig);
    const question = await database.query<{
      attempt_question_id: string;
      first_option_id: string;
      second_option_id: string;
    }>(`
      select
        aq.id as attempt_question_id,
        aq.question_snapshot -> 'options' -> 0 ->> 'id' as first_option_id,
        aq.question_snapshot -> 'options' -> 1 ->> 'id' as second_option_id
      from public.attempt_questions aq
      where aq.attempt_id = '${attempt.id}'
      order by aq.position
      limit 1
    `);
    const target = question.rows[0]!;

    const firstSave = await database.query<{
      selected_option_id: string;
      is_flagged: boolean;
    }>(`
      select * from public.save_mock_exam_answer(
        '${attempt.id}',
        '${target.attempt_question_id}',
        '${target.first_option_id}'
      )
    `);
    expect(firstSave.rows).toEqual([
      { selected_option_id: target.first_option_id, is_flagged: false },
    ]);

    const changed = await database.query<{
      selected_option_id: string;
      is_flagged: boolean;
    }>(`
      select * from public.save_mock_exam_answer(
        '${attempt.id}',
        '${target.attempt_question_id}',
        '${target.second_option_id}'
      )
    `);
    expect(changed.rows).toEqual([
      { selected_option_id: target.second_option_id, is_flagged: false },
    ]);
    await database.query(`
      select public.set_mock_exam_flag(
        '${attempt.id}',
        '${target.attempt_question_id}',
        true
      )
    `);
    const persisted = await database.query<{
      selected_option_id: string;
      is_flagged: boolean;
    }>(`
      select selected_option_id, is_flagged
      from public.attempt_answers
      where attempt_question_id = '${target.attempt_question_id}'
    `);
    expect(persisted.rows).toEqual([
      { selected_option_id: target.second_option_id, is_flagged: true },
    ]);
    await resetIdentity();

    await assumeIdentity(ids.stranger);
    await expect(
      database.query(`
        select * from public.save_mock_exam_answer(
          '${attempt.id}',
          '${target.attempt_question_id}',
          '${target.first_option_id}'
        )
      `),
    ).rejects.toThrow(/owned|not found/i);
    await expect(
      database.query(`
        select public.set_mock_exam_flag(
          '${attempt.id}',
          '${target.attempt_question_id}',
          false
        )
      `),
    ).rejects.toThrow(/owned|not found/i);
    await resetIdentity();
  });

  it("submits idempotently and scores against the immutable secret snapshot", async () => {
    await assumeIdentity(ids.student);
    const attempt = await startAttempt(ids.balancedCourse, ids.balancedConfig);
    const question = await database.query<{
      attempt_question_id: string;
      question_id: string;
    }>(`
      select id as attempt_question_id, question_id
      from public.attempt_questions
      where attempt_id = '${attempt.id}'
      order by position
      limit 1
    `);
    const target = question.rows[0]!;
    await resetIdentity();
    const secret = await database.query<{ correct_option_id: string }>(`
      select correct_option_id
      from public.attempt_question_secrets
      where attempt_question_id = '${target.attempt_question_id}'
    `);
    const replacement = await database.query<{ id: string }>(`
      select id
      from public.question_options
      where question_id = '${target.question_id}'
        and id <> '${secret.rows[0]!.correct_option_id}'
      order by id
      limit 1
    `);
    await database.exec(`
      update public.question_options
      set is_correct = (id = '${replacement.rows[0]!.id}')
      where question_id = '${target.question_id}'
    `);

    await assumeIdentity(ids.student);
    await database.query(`
      select * from public.save_mock_exam_answer(
        '${attempt.id}',
        '${target.attempt_question_id}',
        '${secret.rows[0]!.correct_option_id}'
      )
    `);
    const first = await database.query<{
      id: string;
      status: string;
      submitted_at: string;
      score: number;
      duration_seconds: number;
    }>(`
      select
        id,
        status,
        submitted_at,
        score::double precision as score,
        duration_seconds
      from public.submit_mock_exam_attempt('${attempt.id}')
    `);
    const repeated = await database.query<{
      id: string;
      status: string;
      submitted_at: string;
      score: number;
      duration_seconds: number;
    }>(`
      select
        id,
        status,
        submitted_at,
        score::double precision as score,
        duration_seconds
      from public.submit_mock_exam_attempt('${attempt.id}')
    `);

    expect(first.rows).toEqual([
      expect.objectContaining({
        id: attempt.id,
        status: "submitted",
        score: 2.5,
      }),
    ]);
    expect(repeated.rows).toEqual(first.rows);
    await expect(
      database.query(`
        select * from public.save_mock_exam_answer(
          '${attempt.id}',
          '${target.attempt_question_id}',
          '${replacement.rows[0]!.id}'
        )
      `),
    ).rejects.toThrow(/in progress/i);
    await resetIdentity();
  });

  it("rejects late saves but submits saved answers when the server deadline passes", async () => {
    await assumeIdentity(ids.student);
    const attempt = await startAttempt(ids.balancedCourse, ids.balancedConfig);
    const question = await database.query<{
      attempt_question_id: string;
      option_id: string;
    }>(`
      select
        aq.id as attempt_question_id,
        aq.question_snapshot -> 'options' -> 0 ->> 'id' as option_id
      from public.attempt_questions aq
      where aq.attempt_id = '${attempt.id}'
      order by aq.position
      limit 1
    `);
    const target = question.rows[0]!;
    await database.query(`
      select * from public.save_mock_exam_answer(
        '${attempt.id}',
        '${target.attempt_question_id}',
        '${target.option_id}'
      )
    `);
    await resetIdentity();
    await database.exec(`
      alter table public.attempts disable trigger protect_attempt_submission;
      update public.attempts
      set
        started_at = clock_timestamp() - interval '2 hours',
        expires_at = clock_timestamp() - interval '1 hour'
      where id = '${attempt.id}';
      alter table public.attempts enable trigger protect_attempt_submission;
    `);

    await assumeIdentity(ids.student);
    await expect(
      database.query(`
        select * from public.save_mock_exam_answer(
          '${attempt.id}',
          '${target.attempt_question_id}',
          '${target.option_id}'
        )
      `),
    ).rejects.toThrow(/in progress/i);
    await expect(
      database.query(`
        select public.set_mock_exam_flag(
          '${attempt.id}',
          '${target.attempt_question_id}',
          true
        )
      `),
    ).rejects.toThrow(/in progress/i);

    const submitted = await database.query<{
      status: string;
      submitted_at: string;
      score: number;
    }>(`
      select
        status,
        submitted_at,
        score::double precision as score
      from public.sync_mock_exam_attempt('${attempt.id}')
    `);
    expect(submitted.rows).toEqual([
      expect.objectContaining({ status: "submitted" }),
    ]);
    const repeated = await database.query<{
      status: string;
      submitted_at: string;
      score: number;
    }>(`
      select
        status,
        submitted_at,
        score::double precision as score
      from public.submit_mock_exam_attempt('${attempt.id}')
    `);
    expect(repeated.rows).toEqual(submitted.rows);
    await resetIdentity();
  });

  it("removes direct learner writes so all mock-exam mutations cross the RPC boundary", async () => {
    await assumeIdentity(ids.student);
    const attempt = await startAttempt(ids.balancedCourse, ids.balancedConfig);
    const question = await database.query<{
      attempt_question_id: string;
      option_id: string;
    }>(`
      select
        aq.id as attempt_question_id,
        aq.question_snapshot -> 'options' -> 0 ->> 'id' as option_id
      from public.attempt_questions aq
      where aq.attempt_id = '${attempt.id}'
      order by aq.position
      limit 1
    `);
    await expect(
      database.exec(`
        insert into public.attempt_answers (
          attempt_question_id,
          selected_option_id
        )
        values (
          '${question.rows[0]!.attempt_question_id}',
          '${question.rows[0]!.option_id}'
        )
      `),
    ).rejects.toThrow();
    await expect(
      database.exec(`
        update public.attempts
        set status = 'submitted'
        where id = '${attempt.id}'
      `),
    ).rejects.toThrow();
    await resetIdentity();
  });
});

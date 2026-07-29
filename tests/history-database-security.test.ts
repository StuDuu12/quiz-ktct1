import { readFile } from "node:fs/promises";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ids = {
  student: "00000000-0000-0000-0000-000000000001",
  otherStudent: "00000000-0000-0000-0000-000000000002",
  instructor: "00000000-0000-0000-0000-000000000003",
  course: "10000000-0000-0000-0000-000000000001",
  chapterOne: "20000000-0000-0000-0000-000000000001",
  chapterTwo: "20000000-0000-0000-0000-000000000002",
  questionOne: "30000000-0000-0000-0000-000000000001",
  questionTwo: "30000000-0000-0000-0000-000000000002",
  optionOneCorrect: "40000000-0000-0000-0000-000000000001",
  optionOneWrong: "40000000-0000-0000-0000-000000000002",
  optionTwoCorrect: "40000000-0000-0000-0000-000000000003",
  optionTwoWrong: "40000000-0000-0000-0000-000000000004",
  newlyAddedOption: "40000000-0000-0000-0000-000000000005",
  config: "50000000-0000-0000-0000-000000000001",
  practice: "60000000-0000-0000-0000-000000000001",
  mock: "60000000-0000-0000-0000-000000000002",
  inProgress: "60000000-0000-0000-0000-000000000003",
  otherMock: "60000000-0000-0000-0000-000000000004",
  inProgressMock: "60000000-0000-0000-0000-000000000005",
  practiceQuestion: "70000000-0000-0000-0000-000000000001",
  mockQuestion: "70000000-0000-0000-0000-000000000002",
  inProgressQuestion: "70000000-0000-0000-0000-000000000003",
  otherMockQuestion: "70000000-0000-0000-0000-000000000004",
  inProgressMockQuestion: "70000000-0000-0000-0000-000000000005",
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
  "202607290009_reviewed_mock_exam_submission.sql",
  "202607290010_immutable_results_history.sql",
].map((file) => path.resolve("supabase/migrations", file));

function snapshot(
  questionId: string,
  chapterId: string,
  content: string,
  options: { id: string; label: string; content: string }[],
) {
  return JSON.stringify({
    id: questionId,
    chapter_id: chapterId,
    content,
    difficulty: 2,
    options,
  }).replaceAll("'", "''");
}

describe("immutable attempt results and scoped history", () => {
  let database: PGlite;

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

    const questionOneSnapshot = snapshot(
      ids.questionOne,
      ids.chapterOne,
      "Immutable practice question",
      [
        { id: ids.optionOneCorrect, label: "A", content: "Original correct" },
        { id: ids.optionOneWrong, label: "B", content: "Original wrong" },
      ],
    );
    const questionTwoSnapshot = snapshot(
      ids.questionTwo,
      ids.chapterTwo,
      "Immutable mock question",
      [
        { id: ids.optionTwoWrong, label: "B", content: "Original wrong" },
        { id: ids.optionTwoCorrect, label: "A", content: "Original correct" },
      ],
    );

    await database.exec(`
      insert into auth.users (id, email, raw_user_meta_data)
      values
        ('${ids.student}', 'student@example.test', '{}'),
        ('${ids.otherStudent}', 'other@example.test', '{}'),
        ('${ids.instructor}', 'instructor@example.test', '{}');

      alter table public.profiles disable trigger user;
      update public.profiles
      set role = 'instructor'::public.app_role
      where id = '${ids.instructor}';
      alter table public.profiles enable trigger user;

      insert into public.courses (id, slug, title, status, created_by)
      values (
        '${ids.course}',
        'ktct',
        'Kinh tế chính trị',
        'published',
        '${ids.instructor}'
      );

      insert into public.course_instructors (
        course_id, instructor_id, assigned_by
      )
      values ('${ids.course}', '${ids.instructor}', '${ids.instructor}');

      insert into public.chapters (id, course_id, position, title)
      values
        ('${ids.chapterOne}', '${ids.course}', 1, 'Chương 1'),
        ('${ids.chapterTwo}', '${ids.course}', 2, 'Chương 2');

      insert into public.questions (
        id, chapter_id, content, explanation, status, created_by
      )
      values
        (
          '${ids.questionOne}',
          '${ids.chapterOne}',
          'Immutable practice question',
          'Original practice explanation',
          'draft',
          '${ids.instructor}'
        ),
        (
          '${ids.questionTwo}',
          '${ids.chapterTwo}',
          'Immutable mock question',
          'Original mock explanation',
          'draft',
          '${ids.instructor}'
        );

      insert into public.question_options (
        id, question_id, label, content, is_correct
      )
      values
        ('${ids.optionOneCorrect}', '${ids.questionOne}', 'A', 'Original correct', true),
        ('${ids.optionOneWrong}', '${ids.questionOne}', 'B', 'Original wrong', false),
        ('${ids.optionTwoCorrect}', '${ids.questionTwo}', 'A', 'Original correct', true),
        ('${ids.optionTwoWrong}', '${ids.questionTwo}', 'B', 'Original wrong', false);

      update public.questions set status = 'published';

      insert into public.exam_configs (
        id, course_id, title, kind, question_count, duration_seconds,
        created_by
      )
      values (
        '${ids.config}',
        '${ids.course}',
        'Mock exam',
        'mock_exam',
        1,
        3600,
        '${ids.instructor}'
      );

      insert into public.attempts (
        id, user_id, course_id, exam_config_id, kind, started_at, expires_at,
        question_order, option_order
      )
      values
        (
          '${ids.practice}', '${ids.student}', '${ids.course}', null,
          'practice', now() - interval '3 days', now() + interval '1 hour',
          '["${ids.questionOne}"]',
          '{"${ids.questionOne}":["${ids.optionOneCorrect}","${ids.optionOneWrong}"]}'
        ),
        (
          '${ids.mock}', '${ids.student}', '${ids.course}', '${ids.config}',
          'mock_exam', now() - interval '2 days', now() + interval '1 hour',
          '["${ids.questionTwo}"]',
          '{"${ids.questionTwo}":["${ids.optionTwoWrong}","${ids.optionTwoCorrect}"]}'
        ),
        (
          '${ids.inProgress}', '${ids.student}', '${ids.course}', null,
          'practice', now() - interval '1 day', now() + interval '1 hour',
          '["${ids.questionTwo}"]',
          '{"${ids.questionTwo}":["${ids.optionTwoCorrect}","${ids.optionTwoWrong}"]}'
        ),
        (
          '${ids.otherMock}', '${ids.otherStudent}', '${ids.course}', '${ids.config}',
          'mock_exam', now() - interval '1 day', now() + interval '1 hour',
          '["${ids.questionTwo}"]',
          '{"${ids.questionTwo}":["${ids.optionTwoCorrect}","${ids.optionTwoWrong}"]}'
        ),
        (
          '${ids.inProgressMock}', '${ids.student}', '${ids.course}', '${ids.config}',
          'mock_exam', now(), now() + interval '1 hour',
          '["${ids.questionTwo}"]',
          '{"${ids.questionTwo}":["${ids.optionTwoCorrect}","${ids.optionTwoWrong}"]}'
        );

      insert into public.attempt_questions (
        id, attempt_id, question_id, position, question_snapshot, option_order
      )
      values
        (
          '${ids.practiceQuestion}', '${ids.practice}', '${ids.questionOne}', 1,
          '${questionOneSnapshot}',
          '["${ids.optionOneCorrect}","${ids.optionOneWrong}"]'
        ),
        (
          '${ids.mockQuestion}', '${ids.mock}', '${ids.questionTwo}', 1,
          '${questionTwoSnapshot}',
          '["${ids.optionTwoWrong}","${ids.optionTwoCorrect}"]'
        ),
        (
          '${ids.inProgressQuestion}', '${ids.inProgress}', '${ids.questionTwo}', 1,
          '${questionTwoSnapshot}',
          '["${ids.optionTwoCorrect}","${ids.optionTwoWrong}"]'
        ),
        (
          '${ids.otherMockQuestion}', '${ids.otherMock}', '${ids.questionTwo}', 1,
          '${questionTwoSnapshot}',
          '["${ids.optionTwoCorrect}","${ids.optionTwoWrong}"]'
        ),
        (
          '${ids.inProgressMockQuestion}', '${ids.inProgressMock}', '${ids.questionTwo}', 1,
          '${questionTwoSnapshot}',
          '["${ids.optionTwoCorrect}","${ids.optionTwoWrong}"]'
        );

      insert into public.attempt_answers (
        attempt_question_id, selected_option_id, is_flagged
      )
      values
        ('${ids.practiceQuestion}', '${ids.optionOneCorrect}', true),
        ('${ids.mockQuestion}', '${ids.optionTwoWrong}', false),
        ('${ids.otherMockQuestion}', '${ids.optionTwoCorrect}', false);

      update public.attempts
      set status = 'submitted'
      where id in ('${ids.practice}', '${ids.mock}', '${ids.otherMock}');

      update public.questions
      set
        content = 'Edited source question',
        explanation = 'Edited source explanation',
        status = 'archived';
      update public.question_options
      set
        content = 'Edited source option',
        is_correct = not is_correct;
      insert into public.question_options (
        id, question_id, label, content, is_correct
      )
      values (
        '${ids.newlyAddedOption}', '${ids.questionTwo}', 'C',
        'New live option', false
      );
    `);
  }, 30_000);

  afterAll(async () => {
    await resetIdentity();
    await database.close();
  });

  it("denies result details before submission and for another student", async () => {
    try {
      await assumeIdentity(ids.student);
      await expect(
        database.query(`
          select *
          from public.get_attempt_result_details('${ids.inProgress}')
        `),
      ).rejects.toThrow(/unavailable|submitted/i);

      await resetIdentity();
      await assumeIdentity(ids.otherStudent);
      await expect(
        database.query(`
          select *
          from public.get_attempt_result_details('${ids.practice}')
        `),
      ).rejects.toThrow(/outside|not found|owned/i);
    } finally {
      await resetIdentity();
    }
  });

  it("returns immutable practice and mock review details after source edits", async () => {
    try {
      await assumeIdentity(ids.student);
      const practice = await database.query<{
        question_snapshot: {
          content: string;
          options: { id: string; content: string }[];
        };
        selected_option_id: string;
        correct_option_id: string;
        is_correct: boolean;
        is_flagged: boolean;
        is_unanswered: boolean;
        explanation: string;
      }>(`
        select question_snapshot, selected_option_id, correct_option_id,
          is_correct, is_flagged, is_unanswered, explanation
        from public.get_attempt_result_details('${ids.practice}')
      `);
      const mock = await database.query<{
        question_snapshot: { content: string };
        selected_option_id: string;
        correct_option_id: string;
        is_correct: boolean;
        explanation: string;
      }>(`
        select question_snapshot, selected_option_id, correct_option_id,
          is_correct, explanation
        from public.get_attempt_result_details('${ids.mock}')
      `);

      expect(practice.rows).toEqual([
        {
          question_snapshot: {
            id: ids.questionOne,
            chapter_id: ids.chapterOne,
            content: "Immutable practice question",
            difficulty: 2,
            options: [
              {
                id: ids.optionOneCorrect,
                label: "A",
                content: "Original correct",
              },
              {
                id: ids.optionOneWrong,
                label: "B",
                content: "Original wrong",
              },
            ],
          },
          selected_option_id: ids.optionOneCorrect,
          correct_option_id: ids.optionOneCorrect,
          is_correct: true,
          is_flagged: true,
          is_unanswered: false,
          explanation: "Original practice explanation",
        },
      ]);
      expect(mock.rows).toEqual([
        {
          question_snapshot: expect.objectContaining({
            content: "Immutable mock question",
          }),
          selected_option_id: ids.optionTwoWrong,
          correct_option_id: ids.optionTwoCorrect,
          is_correct: false,
          explanation: "Original mock explanation",
        },
      ]);

      await expect(
        database.query(`
          select correct_option_id, explanation
          from public.attempt_question_secrets
          where attempt_question_id = '${ids.practiceQuestion}'
        `),
      ).rejects.toThrow();
    } finally {
      await resetIdentity();
    }
  });

  it("binds student history to auth.uid and includes practice, mock, and active attempts", async () => {
    try {
      await assumeIdentity(ids.student);
      const history = await database.query<{
        attempt_id: string;
        kind: string;
        status: string;
        total_count: number;
      }>(`
        select attempt_id, kind, status, total_count
        from public.get_attempt_history(
          '${ids.otherStudent}', null, null, null, null, null, null, 1, 20
        )
        order by attempt_id
      `);

      expect(history.rows.map(({ attempt_id, kind, status }) => ({
        attempt_id,
        kind,
        status,
      }))).toEqual([
        { attempt_id: ids.practice, kind: "practice", status: "submitted" },
        { attempt_id: ids.mock, kind: "mock_exam", status: "submitted" },
        {
          attempt_id: ids.inProgress,
          kind: "practice",
          status: "in_progress",
        },
        {
          attempt_id: ids.inProgressMock,
          kind: "mock_exam",
          status: "in_progress",
        },
      ]);
      expect(history.rows.every((row) => row.total_count === 4)).toBe(true);
    } finally {
      await resetIdentity();
    }
  });

  it("filters history by kind, chapter, score band, dates, and pagination", async () => {
    try {
      await assumeIdentity(ids.student);
      const filtered = await database.query<{
        attempt_id: string;
        total_count: number;
      }>(`
        select attempt_id, total_count
        from public.get_attempt_history(
          '${ids.student}',
          'practice',
          '${ids.chapterOne}',
          now() - interval '7 days',
          now() + interval '1 day',
          80,
          100,
          1,
          1
        )
      `);
      expect(filtered.rows).toEqual([
        { attempt_id: ids.practice, total_count: 1 },
      ]);

      const secondPage = await database.query<{
        attempt_id: string;
        total_count: number;
      }>(`
        select attempt_id, total_count
        from public.get_attempt_history(
          '${ids.student}', null, null, null, null, null, null, 2, 1
        )
      `);
      expect(secondPage.rows).toHaveLength(1);
      expect(secondPage.rows[0]!.total_count).toBe(4);
    } finally {
      await resetIdentity();
    }
  });

  it("allows an assigned instructor to review only submitted attempts in scope", async () => {
    try {
      await assumeIdentity(ids.instructor);
      const history = await database.query<{ total_count: number }>(`
        select total_count
        from public.get_attempt_history(
          '${ids.student}', null, null, null, null, null, null, 1, 20
        )
      `);
      expect(history.rows[0]!.total_count).toBe(4);

      const result = await database.query<{ attempt_id: string }>(`
        select attempt_id
        from public.get_attempt_result_details('${ids.mock}')
      `);
      expect(result.rows).toEqual([{ attempt_id: ids.mock }]);
    } finally {
      await resetIdentity();
    }
  });

  it("uses edited snapshotted options but blocks deleting or replacing their ids", async () => {
    try {
      await assumeIdentity(ids.student);
      await database.query(`
        select * from public.save_practice_answer(
          '${ids.inProgress}',
          '${ids.inProgressQuestion}',
          '${ids.optionTwoCorrect}'
        )
      `);
      await database.query(`
        select * from public.save_mock_exam_answer(
          '${ids.inProgressMock}',
          '${ids.inProgressMockQuestion}',
          '${ids.optionTwoCorrect}'
        )
      `);
      await resetIdentity();

      const graded = await database.query<{
        attempt_question_id: string;
        is_correct: boolean;
      }>(`
        select attempt_question_id, is_correct
        from public.attempt_answers
        where attempt_question_id in (
          '${ids.inProgressQuestion}',
          '${ids.inProgressMockQuestion}'
        )
        order by attempt_question_id
      `);
      expect(graded.rows).toEqual([
        {
          attempt_question_id: ids.inProgressQuestion,
          is_correct: true,
        },
        {
          attempt_question_id: ids.inProgressMockQuestion,
          is_correct: true,
        },
      ]);

      await expect(
        database.exec(`
          delete from public.question_options
          where id = '${ids.optionOneWrong}'
        `),
      ).rejects.toThrow(/attempt snapshot/i);
      await expect(
        database.exec(`
          update public.question_options
          set id = '40000000-0000-0000-0000-000000000099'
          where id = '${ids.optionOneWrong}'
        `),
      ).rejects.toThrow(/attempt snapshot/i);
    } finally {
      await resetIdentity();
    }
  });

  it("rejects newly added live options outside practice and mock snapshots", async () => {
    try {
      await assumeIdentity(ids.student);
      await expect(
        database.query(`
          select * from public.save_practice_answer(
            '${ids.inProgress}',
            '${ids.inProgressQuestion}',
            '${ids.newlyAddedOption}'
          )
        `),
      ).rejects.toThrow(/snapshot|attempt question/i);
      await expect(
        database.query(`
          select * from public.save_mock_exam_answer(
            '${ids.inProgressMock}',
            '${ids.inProgressMockQuestion}',
            '${ids.newlyAddedOption}'
          )
        `),
      ).rejects.toThrow(/snapshot|attempt question/i);
    } finally {
      await resetIdentity();
    }
  });
});

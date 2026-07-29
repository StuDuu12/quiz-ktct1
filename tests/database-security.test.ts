import { readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ids = {
  admin: "00000000-0000-0000-0000-000000000001",
  assignedInstructor: "00000000-0000-0000-0000-000000000002",
  otherInstructor: "00000000-0000-0000-0000-000000000003",
  student: "00000000-0000-0000-0000-000000000004",
  assignedCourse: "10000000-0000-0000-0000-000000000001",
  otherCourse: "10000000-0000-0000-0000-000000000002",
  assignedChapter: "20000000-0000-0000-0000-000000000001",
  otherChapter: "20000000-0000-0000-0000-000000000002",
  assignedQuestion: "30000000-0000-0000-0000-000000000001",
  otherQuestion: "30000000-0000-0000-0000-000000000002",
  zeroCorrectQuestion: "30000000-0000-0000-0000-000000000003",
  multiCorrectQuestion: "30000000-0000-0000-0000-000000000004",
  mutationQuestion: "30000000-0000-0000-0000-000000000005",
  assignedCorrectOption: "40000000-0000-0000-0000-000000000001",
  assignedWrongOption: "40000000-0000-0000-0000-000000000002",
  otherCorrectOption: "40000000-0000-0000-0000-000000000003",
  multiCorrectOptionA: "40000000-0000-0000-0000-000000000004",
  multiCorrectOptionB: "40000000-0000-0000-0000-000000000005",
  mutationCorrectOption: "40000000-0000-0000-0000-000000000006",
  mutationWrongOption: "40000000-0000-0000-0000-000000000007",
  examConfig: "50000000-0000-0000-0000-000000000001",
  assignedAttempt: "60000000-0000-0000-0000-000000000001",
  otherAttempt: "60000000-0000-0000-0000-000000000002",
  resultAttempt: "60000000-0000-0000-0000-000000000003",
  expiredAnswerAttempt: "60000000-0000-0000-0000-000000000004",
  expiredSubmitAttempt: "60000000-0000-0000-0000-000000000005",
  assignedAttemptQuestion: "70000000-0000-0000-0000-000000000001",
  otherAttemptQuestion: "70000000-0000-0000-0000-000000000002",
  resultAttemptQuestion: "70000000-0000-0000-0000-000000000003",
  expiredAnswerAttemptQuestion: "70000000-0000-0000-0000-000000000004",
  expiredSubmitAttemptQuestion: "70000000-0000-0000-0000-000000000005",
  resultAnswer: "80000000-0000-0000-0000-000000000001",
  otherAnswer: "80000000-0000-0000-0000-000000000002",
};

const migrationPaths = [
  path.resolve("supabase/migrations/202607290001_initial_schema.sql"),
  path.resolve("supabase/migrations/202607290002_rls_policies.sql"),
  path.resolve("supabase/migrations/202607290003_learner_progress.sql"),
  path.resolve("supabase/migrations/202607290004_practice_sessions.sql"),
];

describe("database security behavior", () => {
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

    await database.exec(`
      insert into auth.users (id, email, raw_user_meta_data)
      values
        ('${ids.admin}', 'admin@example.test', '{}'),
        ('${ids.assignedInstructor}', 'assigned@example.test', '{}'),
        ('${ids.otherInstructor}', 'other@example.test', '{}'),
        ('${ids.student}', 'student@example.test', '{}');

      alter table public.profiles disable trigger user;
      update public.profiles
      set role = case id
        when '${ids.admin}' then 'admin'::public.app_role
        when '${ids.assignedInstructor}' then 'instructor'::public.app_role
        when '${ids.otherInstructor}' then 'instructor'::public.app_role
        else 'student'::public.app_role
      end;
      alter table public.profiles enable trigger user;

      insert into public.courses (id, slug, title, status, created_by)
      values
        (
          '${ids.assignedCourse}',
          'assigned-course',
          'Assigned course',
          'published',
          '${ids.admin}'
        ),
        (
          '${ids.otherCourse}',
          'other-course',
          'Other course',
          'published',
          '${ids.admin}'
        );

      insert into public.course_instructors (
        course_id,
        instructor_id,
        assigned_by
      )
      values (
        '${ids.assignedCourse}',
        '${ids.assignedInstructor}',
        '${ids.admin}'
      );

      insert into public.chapters (id, course_id, position, title)
      values
        (
          '${ids.assignedChapter}',
          '${ids.assignedCourse}',
          1,
          'Assigned chapter'
        ),
        (
          '${ids.otherChapter}',
          '${ids.otherCourse}',
          1,
          'Other chapter'
        );

      insert into public.questions (
        id,
        chapter_id,
        content,
        explanation,
        status,
        created_by
      )
      values
        (
          '${ids.assignedQuestion}',
          '${ids.assignedChapter}',
          'Assigned question',
          'Assigned explanation',
          'draft',
          '${ids.admin}'
        ),
        (
          '${ids.otherQuestion}',
          '${ids.otherChapter}',
          'Other question',
          'Other explanation',
          'draft',
          '${ids.admin}'
        ),
        (
          '${ids.zeroCorrectQuestion}',
          '${ids.assignedChapter}',
          'Zero correct',
          '',
          'draft',
          '${ids.admin}'
        ),
        (
          '${ids.multiCorrectQuestion}',
          '${ids.assignedChapter}',
          'Multiple correct',
          '',
          'draft',
          '${ids.admin}'
        ),
        (
          '${ids.mutationQuestion}',
          '${ids.assignedChapter}',
          'Mutation target',
          '',
          'draft',
          '${ids.admin}'
        );

      insert into public.question_options (
        id,
        question_id,
        label,
        content,
        is_correct
      )
      values
        (
          '${ids.assignedCorrectOption}',
          '${ids.assignedQuestion}',
          'A',
          'Correct',
          true
        ),
        (
          '${ids.assignedWrongOption}',
          '${ids.assignedQuestion}',
          'B',
          'Wrong',
          false
        ),
        (
          '${ids.otherCorrectOption}',
          '${ids.otherQuestion}',
          'A',
          'Correct',
          true
        ),
        (
          '${ids.multiCorrectOptionA}',
          '${ids.multiCorrectQuestion}',
          'A',
          'Correct A',
          true
        ),
        (
          '${ids.multiCorrectOptionB}',
          '${ids.multiCorrectQuestion}',
          'B',
          'Correct B',
          true
        ),
        (
          '${ids.mutationCorrectOption}',
          '${ids.mutationQuestion}',
          'A',
          'Correct',
          true
        ),
        (
          '${ids.mutationWrongOption}',
          '${ids.mutationQuestion}',
          'B',
          'Wrong',
          false
        );

      update public.questions
      set status = 'published'
      where id in (
        '${ids.assignedQuestion}',
        '${ids.otherQuestion}',
        '${ids.mutationQuestion}'
      );

      insert into public.exam_configs (
        id,
        course_id,
        title,
        kind,
        question_count,
        duration_seconds,
        created_by
      )
      values (
        '${ids.examConfig}',
        '${ids.assignedCourse}',
        'Assigned exam',
        'mock_exam',
        1,
        1800,
        '${ids.admin}'
      );

      insert into public.attempts (
        id,
        user_id,
        course_id,
        exam_config_id,
        kind,
        started_at,
        expires_at,
        question_order,
        option_order
      )
      values
        (
          '${ids.assignedAttempt}',
          '${ids.student}',
          '${ids.assignedCourse}',
          '${ids.examConfig}',
          'mock_exam',
          now(),
          now() + interval '1 hour',
          '["${ids.assignedQuestion}"]',
          '{"${ids.assignedQuestion}":["${ids.assignedCorrectOption}"]}'
        ),
        (
          '${ids.otherAttempt}',
          '${ids.student}',
          '${ids.otherCourse}',
          null,
          'practice',
          now(),
          now() + interval '1 hour',
          '["${ids.otherQuestion}"]',
          '{"${ids.otherQuestion}":["${ids.otherCorrectOption}"]}'
        ),
        (
          '${ids.resultAttempt}',
          '${ids.student}',
          '${ids.assignedCourse}',
          '${ids.examConfig}',
          'mock_exam',
          now(),
          now() + interval '1 hour',
          '["${ids.assignedQuestion}"]',
          '{"${ids.assignedQuestion}":["${ids.assignedCorrectOption}"]}'
        ),
        (
          '${ids.expiredAnswerAttempt}',
          '${ids.student}',
          '${ids.assignedCourse}',
          '${ids.examConfig}',
          'mock_exam',
          now(),
          now() + interval '1 hour',
          '["${ids.assignedQuestion}"]',
          '{"${ids.assignedQuestion}":["${ids.assignedCorrectOption}"]}'
        ),
        (
          '${ids.expiredSubmitAttempt}',
          '${ids.student}',
          '${ids.assignedCourse}',
          '${ids.examConfig}',
          'mock_exam',
          now(),
          now() + interval '1 hour',
          '["${ids.assignedQuestion}"]',
          '{"${ids.assignedQuestion}":["${ids.assignedCorrectOption}"]}'
        );

      insert into public.attempt_questions (
        id,
        attempt_id,
        question_id,
        position,
        question_snapshot,
        option_order
      )
      values
        (
          '${ids.assignedAttemptQuestion}',
          '${ids.assignedAttempt}',
          '${ids.assignedQuestion}',
          1,
          '{"content":"Assigned question"}',
          '["${ids.assignedCorrectOption}"]'
        ),
        (
          '${ids.otherAttemptQuestion}',
          '${ids.otherAttempt}',
          '${ids.otherQuestion}',
          1,
          '{"content":"Other question"}',
          '["${ids.otherCorrectOption}"]'
        ),
        (
          '${ids.resultAttemptQuestion}',
          '${ids.resultAttempt}',
          '${ids.assignedQuestion}',
          1,
          '{"content":"Assigned question"}',
          '["${ids.assignedCorrectOption}"]'
        ),
        (
          '${ids.expiredAnswerAttemptQuestion}',
          '${ids.expiredAnswerAttempt}',
          '${ids.assignedQuestion}',
          1,
          '{"content":"Assigned question"}',
          '["${ids.assignedCorrectOption}"]'
        ),
        (
          '${ids.expiredSubmitAttemptQuestion}',
          '${ids.expiredSubmitAttempt}',
          '${ids.assignedQuestion}',
          1,
          '{"content":"Assigned question"}',
          '["${ids.assignedCorrectOption}"]'
        );

      alter table public.attempts disable trigger protect_attempt_submission;
      update public.attempts
      set
        started_at = '2020-01-01 00:00:00+00',
        expires_at = '2020-01-01 00:30:00+00'
      where id in (
        '${ids.expiredAnswerAttempt}',
        '${ids.expiredSubmitAttempt}'
      );
      alter table public.attempts enable trigger protect_attempt_submission;

      insert into public.attempt_answers (
        id,
        attempt_question_id,
        selected_option_id
      )
      values (
        '${ids.resultAnswer}',
        '${ids.resultAttemptQuestion}',
        '${ids.assignedCorrectOption}'
      ), (
        '${ids.otherAnswer}',
        '${ids.otherAttemptQuestion}',
        '${ids.otherCorrectOption}'
      );
    `);
  }, 30_000);

  afterAll(async () => {
    await resetIdentity();
    await database.close();
  });

  it("rejects publishing a question without exactly one correct option", async () => {
    await expect(
      database.exec(`
        update public.questions
        set status = 'published'
        where id = '${ids.zeroCorrectQuestion}'
      `),
    ).rejects.toThrow(/exactly one correct option/i);

    await expect(
      database.exec(`
        update public.questions
        set status = 'published'
        where id = '${ids.multiCorrectQuestion}'
      `),
    ).rejects.toThrow(/exactly one correct option/i);
  });

  it("rejects option mutations that invalidate a published question", async () => {
    await expect(
      database.exec(`
        update public.question_options
        set is_correct = true
        where id = '${ids.mutationWrongOption}'
      `),
    ).rejects.toThrow(/exactly one correct option/i);
  });

  it("limits instructor attempt data to assigned courses and blocks submission", async () => {
    try {
      await assumeIdentity(ids.assignedInstructor);

      const attempts = await database.query<{ id: string }>(`
        select id
        from public.attempts
        where id in ('${ids.assignedAttempt}', '${ids.otherAttempt}')
        order by id
      `);
      const snapshots = await database.query<{ id: string }>(`
        select id
        from public.attempt_questions
        where id in (
          '${ids.assignedAttemptQuestion}',
          '${ids.otherAttemptQuestion}'
        )
        order by id
      `);
      const answers = await database.query<{ id: string }>(`
        select id
        from public.attempt_answers
        where id in ('${ids.resultAnswer}', '${ids.otherAnswer}')
        order by id
      `);

      expect(attempts.rows).toEqual([{ id: ids.assignedAttempt }]);
      expect(snapshots.rows).toEqual([{ id: ids.assignedAttemptQuestion }]);
      expect(answers.rows).toEqual([{ id: ids.resultAnswer }]);
      await database.exec(`
        update public.attempts
        set status = 'submitted'
        where id = '${ids.assignedAttempt}'
      `);
      const unchanged = await database.query<{ status: string }>(`
        select status
        from public.attempts
        where id = '${ids.assignedAttempt}'
      `);
      expect(unchanged.rows).toEqual([{ status: "in_progress" }]);

      await resetIdentity();
      await assumeIdentity(ids.otherInstructor);
      const outsideAssignment = await database.query<{ id: string }>(`
        select id
        from public.attempts
        where id = '${ids.assignedAttempt}'
      `);
      expect(outsideAssignment.rows).toEqual([]);
    } finally {
      await resetIdentity();
    }
  });

  it("hides correctness while in progress and reveals it through submitted results", async () => {
    try {
      await assumeIdentity(ids.student);

      await expect(
        database.query(`
          select is_correct
          from public.attempt_answers
          where id = '${ids.resultAnswer}'
        `),
      ).rejects.toThrow();

      await database.exec(`
        update public.attempts
        set status = 'submitted'
        where id = '${ids.resultAttempt}'
      `);

      const result = await database.query<{ is_correct: boolean }>(`
        select is_correct
        from public.get_attempt_results('${ids.resultAttempt}')
      `);
      expect(result.rows).toEqual([{ is_correct: true }]);
    } finally {
      await resetIdentity();
    }
  });

  it("returns submitted practice aggregates through the restricted learner progress RPC", async () => {
    try {
      await database.exec(`
        update public.attempts
        set status = 'submitted'
        where id = '${ids.otherAttempt}'
      `);
      await assumeIdentity(ids.student);

      await expect(
        database.query(`
          select is_correct from public.attempt_answers
          where id = '${ids.otherAnswer}'
        `),
      ).rejects.toThrow();

      const history = await database.query<{
        attempt_id: string;
        chapter_id: string;
        correct_count: number;
        total_count: number;
        submitted_at: Date;
      }>(`
        select * from public.get_submitted_practice_progress('${ids.otherCourse}')
      `);
      expect(history.rows).toHaveLength(1);
      expect(history.rows[0]).toMatchObject({
        attempt_id: ids.otherAttempt,
        chapter_id: ids.otherChapter,
        correct_count: 1,
        total_count: 1,
      });
      expect(history.rows[0]?.submitted_at).toBeInstanceOf(Date);
    } finally {
      await resetIdentity();
    }
  });

  it("starts attempts only through the trusted server function", async () => {
    try {
      await assumeIdentity(ids.student);

      await expect(
        database.exec(`
          insert into public.attempts (
            user_id,
            course_id,
            exam_config_id,
            kind,
            expires_at,
            question_order,
            option_order
          )
          values (
            '${ids.student}',
            '${ids.assignedCourse}',
            '${ids.examConfig}',
            'mock_exam',
            now() + interval '10 years',
            '["client-controlled"]',
            '{"client":"controlled"}'
          )
        `),
      ).rejects.toThrow();

      const started = await database.query<{
        attempt_id: string;
        duration_seconds: number;
        snapshot_count: number;
      }>(`
        select
          started.id as attempt_id,
          extract(
            epoch from (started.expires_at - started.started_at)
          )::integer as duration_seconds,
          jsonb_array_length(started.question_order)::integer as snapshot_count
        from public.start_attempt(
          '${ids.assignedCourse}',
          '${ids.examConfig}'
        ) started
      `);

      expect(started.rows[0]).toMatchObject({
        duration_seconds: 1800,
        snapshot_count: 1,
      });
      expect(started.rows[0]?.attempt_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );

      const snapshot = await database.query<{
        question_id: string;
        snapshot_matches_published_question: boolean;
        snapshot_options_match_question: boolean;
        exposes_correctness: boolean;
      }>(`
        select
          aq.question_id,
          exists (
            select 1
            from public.questions q
            join public.chapters ch on ch.id = q.chapter_id
            where q.id = aq.question_id
              and ch.course_id = '${ids.assignedCourse}'
              and q.status = 'published'
              and aq.question_snapshot ->> 'content' = q.content
          ) as snapshot_matches_published_question,
          jsonb_array_length(aq.question_snapshot -> 'options') = (
            select count(*)
            from public.question_options qo
            where qo.question_id = aq.question_id
          )
          and not exists (
            select 1
            from jsonb_array_elements(aq.question_snapshot -> 'options') so
            left join public.question_options qo
              on qo.id = (so ->> 'id')::uuid
              and qo.question_id = aq.question_id
            where qo.id is null
              or so ->> 'label' is distinct from qo.label
              or so ->> 'content' is distinct from qo.content
          ) as snapshot_options_match_question,
          exists (
            select 1
            from jsonb_array_elements(aq.question_snapshot -> 'options') so
            where so ? 'is_correct'
          ) as exposes_correctness
        from public.attempt_questions aq
        where aq.attempt_id = '${started.rows[0]?.attempt_id}'
      `);
      expect(snapshot.rows).toHaveLength(1);
      expect(snapshot.rows[0]).toMatchObject({
        snapshot_matches_published_question: true,
        snapshot_options_match_question: true,
        exposes_correctness: false,
      });
    } finally {
      await resetIdentity();
    }
  });

  it("rejects answer changes after expiry", async () => {
    try {
      await assumeIdentity(ids.student);

      await expect(
        database.exec(`
          insert into public.attempt_answers (
            attempt_question_id,
            selected_option_id
          )
          values (
            '${ids.expiredAnswerAttemptQuestion}',
            '${ids.assignedCorrectOption}'
          )
        `),
      ).rejects.toThrow(/expired/i);
    } finally {
      await resetIdentity();
    }
  });

  it("expires rather than submits a late attempt", async () => {
    try {
      await assumeIdentity(ids.student);

      await database.exec(`
        update public.attempts
        set status = 'submitted'
        where id = '${ids.expiredSubmitAttempt}'
      `);
      const result = await database.query<{ status: string }>(`
        select status
        from public.attempts
        where id = '${ids.expiredSubmitAttempt}'
      `);

      expect(result.rows).toEqual([{ status: "expired" }]);
    } finally {
      await resetIdentity();
    }
  });
});

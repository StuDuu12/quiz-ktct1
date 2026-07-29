import { readFile } from "node:fs/promises";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ids = {
  admin: "00000000-0000-0000-0000-000000000101",
  instructor: "00000000-0000-0000-0000-000000000102",
  student: "00000000-0000-0000-0000-000000000103",
  otherInstructor: "00000000-0000-0000-0000-000000000104",
  assignedCourse: "10000000-0000-0000-0000-000000000101",
  otherCourse: "10000000-0000-0000-0000-000000000102",
  assignedChapter: "20000000-0000-0000-0000-000000000101",
  otherChapter: "20000000-0000-0000-0000-000000000102",
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
  "202607290011_advanced_administration.sql",
].map((file) => path.resolve("supabase/migrations", file));

const question = (sourceNumber: number, correctCount = 1) => ({
  sourceNumber,
  content: `Câu hỏi nhập ${sourceNumber}`,
  explanation: "Giải thích",
  difficulty: 2,
  status: "draft",
  options: [
    { label: "A", content: "Một", isCorrect: correctCount > 0 },
    { label: "B", content: "Hai", isCorrect: correctCount > 1 },
    { label: "C", content: "Ba", isCorrect: false },
    { label: "D", content: "Bốn", isCorrect: false },
  ],
});

describe("advanced administration database boundaries", () => {
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
        ('${ids.instructor}', 'instructor@example.test', '{}'),
        ('${ids.student}', 'student@example.test', '{}'),
        ('${ids.otherInstructor}', 'other-instructor@example.test', '{}');

      alter table public.profiles disable trigger user;
      update public.profiles set role = 'admin' where id = '${ids.admin}';
      update public.profiles set role = 'instructor'
      where id in ('${ids.instructor}', '${ids.otherInstructor}');
      alter table public.profiles enable trigger user;

      insert into public.courses (id, slug, title, status, created_by)
      values
        (
          '${ids.assignedCourse}', 'assigned-course', 'Khóa được phân công',
          'published', '${ids.admin}'
        ),
        (
          '${ids.otherCourse}', 'other-course', 'Khóa ngoài phạm vi',
          'draft', '${ids.admin}'
        );
      insert into public.course_instructors (
        course_id, instructor_id, assigned_by
      )
      values (
        '${ids.assignedCourse}', '${ids.instructor}', '${ids.admin}'
      );
      insert into public.chapters (id, course_id, position, title, status)
      values
        (
          '${ids.assignedChapter}', '${ids.assignedCourse}', 1,
          'Chương được phân công', 'draft'
        ),
        (
          '${ids.otherChapter}', '${ids.otherCourse}', 1,
          'Chương ngoài phạm vi', 'draft'
        );
    `);
  }, 30_000);

  afterAll(async () => {
    await resetIdentity();
    await database.close();
  });

  it("denies all direct administration DML, including for admins", async () => {
    try {
      await assumeIdentity(ids.admin);
      await expect(
        database.exec(`
          update public.courses
          set title = 'Bypass'
          where id = '${ids.assignedCourse}'
        `),
      ).rejects.toThrow(/permission|privilege/i);
      await expect(
        database.exec(`
          update public.profiles
          set role = 'admin'
          where id = '${ids.student}'
        `),
      ).rejects.toThrow(/permission|privilege/i);
    } finally {
      await resetIdentity();
    }
  });

  it("keeps draft and archived chapters out of learner catalog reads", async () => {
    try {
      await assumeIdentity(ids.student);
      const visible = await database.query<{ count: number }>(`
        select count(*)::integer as count
        from public.chapters
        where course_id = '${ids.assignedCourse}'
      `);
      expect(visible.rows[0]!.count).toBe(0);
    } finally {
      await resetIdentity();
    }
  });

  it("prevents instructors from promoting users or broadening assignments", async () => {
    try {
      await assumeIdentity(ids.instructor);
      await expect(
        database.query(`
          select public.admin_set_instructor(
            '${ids.student}',
            array['${ids.otherCourse}'::uuid],
            true
          )
        `),
      ).rejects.toThrow(/admin|forbidden|permission/i);
      await expect(
        database.query(`
          select public.admin_upsert_chapter(
            null,
            '${ids.otherCourse}',
            2,
            'Không được phép',
            'draft'
          )
        `),
      ).rejects.toThrow(/scope|forbidden|permission/i);
    } finally {
      await resetIdentity();
    }
  });

  it("lets an instructor mutate assigned content through an audited RPC only", async () => {
    try {
      await assumeIdentity(ids.instructor);
      const result = await database.query<{ admin_upsert_chapter: string }>(`
        select public.admin_upsert_chapter(
          null,
          '${ids.assignedCourse}',
          2,
          'Chương mới',
          'draft'
        )
      `);
      const chapterId = result.rows[0]!.admin_upsert_chapter;
      await resetIdentity();

      const persisted = await database.query<{ title: string }>(`
        select title from public.chapters where id = '${chapterId}'
      `);
      const audit = await database.query<{ action: string; actor_id: string }>(`
        select action, actor_id
        from public.audit_logs
        where entity_id = '${chapterId}'
      `);
      expect(persisted.rows).toEqual([{ title: "Chương mới" }]);
      expect(audit.rows).toEqual([
        { action: "chapter.created", actor_id: ids.instructor },
      ]);
    } finally {
      await resetIdentity();
    }
  });

  it("approves an instructor and replaces assignments atomically with an audit", async () => {
    try {
      await assumeIdentity(ids.admin);
      await database.query(`
        select public.admin_set_instructor(
          '${ids.student}',
          array['${ids.assignedCourse}'::uuid],
          true
        )
      `);
      await resetIdentity();

      const profile = await database.query<{ role: string; is_active: boolean }>(`
        select role, is_active from public.profiles where id = '${ids.student}'
      `);
      const assignments = await database.query<{ course_id: string }>(`
        select course_id
        from public.course_instructors
        where instructor_id = '${ids.student}'
      `);
      const audit = await database.query<{ action: string }>(`
        select action
        from public.audit_logs
        where entity_id = '${ids.student}'
        order by id desc
        limit 1
      `);
      expect(profile.rows).toEqual([{ role: "instructor", is_active: true }]);
      expect(assignments.rows).toEqual([{ course_id: ids.assignedCourse }]);
      expect(audit.rows).toEqual([{ action: "instructor.approved" }]);
    } finally {
      await resetIdentity();
    }
  });

  it("rejects an invalid published question without leaving partial rows", async () => {
    try {
      await assumeIdentity(ids.instructor);
      await expect(
        database.query(`
          select public.admin_upsert_question(
            null,
            '${ids.assignedChapter}',
            'Câu không hợp lệ',
            'Giải thích',
            2,
            'published',
            90,
            '${JSON.stringify(question(90, 2).options)}'::jsonb
          )
        `),
      ).rejects.toThrow(/one correct|exactly|four/i);
      await resetIdentity();

      const leftover = await database.query<{ count: number }>(`
        select count(*)::integer as count
        from public.questions
        where source_number = 90
      `);
      expect(leftover.rows[0]!.count).toBe(0);
    } finally {
      await resetIdentity();
    }
  });

  it("imports a batch atomically and returns the prior job on an idempotent retry", async () => {
    const malformed = JSON.stringify([question(10), question(11, 0)]).replaceAll(
      "'",
      "''",
    );
    const valid = JSON.stringify([question(20), question(21)]).replaceAll(
      "'",
      "''",
    );
    try {
      await assumeIdentity(ids.instructor);
      await expect(
        database.query(`
          select * from public.admin_import_questions(
            '${ids.assignedCourse}',
            '${ids.assignedChapter}',
            'malformed.md',
            'batch-malformed',
            '${malformed}'::jsonb
          )
        `),
      ).rejects.toThrow(/one correct|valid|option/i);
      await resetIdentity();

      const noPartialRows = await database.query<{ count: number }>(`
        select count(*)::integer as count
        from public.questions
        where chapter_id = '${ids.assignedChapter}'
          and source_number in (10, 11)
      `);
      const noPartialJobs = await database.query<{ count: number }>(`
        select count(*)::integer as count
        from public.import_jobs
        where idempotency_key = 'batch-malformed'
      `);
      expect(noPartialRows.rows[0]!.count).toBe(0);
      expect(noPartialJobs.rows[0]!.count).toBe(0);

      await assumeIdentity(ids.instructor);
      const first = await database.query<{ job_id: string; imported_count: number }>(`
        select * from public.admin_import_questions(
          '${ids.assignedCourse}',
          '${ids.assignedChapter}',
          'valid.md',
          'batch-valid',
          '${valid}'::jsonb
        )
      `);
      const retry = await database.query<{ job_id: string; imported_count: number }>(`
        select * from public.admin_import_questions(
          '${ids.assignedCourse}',
          '${ids.assignedChapter}',
          'valid.md',
          'batch-valid',
          '${valid}'::jsonb
        )
      `);
      await resetIdentity();

      const persisted = await database.query<{ count: number }>(`
        select count(*)::integer as count
        from public.questions
        where chapter_id = '${ids.assignedChapter}'
          and source_number in (20, 21)
      `);
      const audit = await database.query<{ count: number }>(`
        select count(*)::integer as count
        from public.audit_logs
        where action = 'questions.imported'
          and metadata ->> 'idempotency_key' = 'batch-valid'
      `);
      expect(first.rows).toEqual([
        { job_id: expect.any(String), imported_count: 2 },
      ]);
      expect(retry.rows).toEqual(first.rows);
      expect(persisted.rows[0]!.count).toBe(2);
      expect(audit.rows[0]!.count).toBe(1);
    } finally {
      await resetIdentity();
    }
  });

  it("returns aggregate reports only for assigned courses and never answer keys", async () => {
    try {
      await assumeIdentity(ids.instructor);
      const report = await database.query<{ report: unknown }>(`
        select public.get_admin_report('${ids.assignedCourse}') as report
      `);
      expect(JSON.stringify(report.rows[0]!.report)).not.toMatch(
        /correct_option_id|is_correct/,
      );
      await expect(
        database.query(`
          select public.get_admin_report('${ids.otherCourse}')
        `),
      ).rejects.toThrow(/scope|forbidden|permission/i);
    } finally {
      await resetIdentity();
    }
  });
});

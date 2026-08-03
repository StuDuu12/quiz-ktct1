import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ids = {
  student: "00000000-0000-0000-0000-000000000071",
  course: "10000000-0000-0000-0000-000000000071",
  config: "50000000-0000-0000-0000-000000000071",
};

function uuid(prefix: number, sequence: number) {
  return `${prefix}0000000-0000-0000-0000-${String(sequence).padStart(12, "0")}`;
}

describe("latest start_attempt migration", () => {
  let database: PGlite;

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

    const migrationDirectory = path.resolve("supabase/migrations");
    const migrationFiles = (await readdir(migrationDirectory))
      .filter((file) => file.endsWith(".sql"))
      .sort();
    for (const migrationFile of migrationFiles) {
      await database.exec(
        await readFile(path.join(migrationDirectory, migrationFile), "utf8"),
      );
    }

    const chapterRows: string[] = [];
    const questionRows: string[] = [];
    const optionRows: string[] = [];
    let questionSequence = 700;
    let optionSequence = 7_000;

    for (let chapterIndex = 0; chapterIndex < 6; chapterIndex += 1) {
      const chapterId = uuid(2, 700 + chapterIndex);
      chapterRows.push(
        `('${chapterId}', '${ids.course}', ${chapterIndex + 1}, 'Chương ${chapterIndex + 1}')`,
      );
      for (let difficulty = 1; difficulty <= 4; difficulty += 1) {
        for (let localIndex = 0; localIndex < 3; localIndex += 1) {
          questionSequence += 1;
          const questionId = uuid(3, questionSequence);
          questionRows.push(
            `('${questionId}', '${chapterId}', 'Câu hỏi ${questionSequence}', 'Giải thích ${questionSequence}', 'draft', ${questionSequence}, ${difficulty}, '${ids.student}')`,
          );
          for (const [optionIndex, label] of ["A", "B", "C", "D"].entries()) {
            optionSequence += 1;
            optionRows.push(
              `('${uuid(4, optionSequence)}', '${questionId}', '${label}', 'Phương án ${label}', ${optionIndex === 0})`,
            );
          }
        }
      }
    }

    await database.exec(`
      insert into auth.users (id, email, raw_user_meta_data)
      values ('${ids.student}', 'student-regression@example.test', '{}');

      insert into public.courses (id, slug, title, status, created_by)
      values (
        '${ids.course}',
        'mock-regression',
        'Mock regression',
        'published',
        '${ids.student}'
      );

      insert into public.chapters (id, course_id, position, title)
      values ${chapterRows.join(",\n")};

      insert into public.questions (
        id, chapter_id, content, explanation, status, source_number,
        difficulty, created_by
      )
      values ${questionRows.join(",\n")};

      insert into public.question_options (
        id, question_id, label, content, is_correct
      )
      values ${optionRows.join(",\n")};

      update public.questions set status = 'published';

      insert into public.exam_configs (
        id, course_id, title, kind, question_count, duration_seconds,
        is_active, created_by
      )
      values (
        '${ids.config}',
        '${ids.course}',
        'Thi thử tổng hợp',
        'mock_exam',
        40,
        3600,
        true,
        '${ids.student}'
      );

      set role authenticated;
      select set_config('request.jwt.claim.sub', '${ids.student}', false);
    `);
  }, 45_000);

  afterAll(async () => {
    await database.exec(`
      reset role;
      select set_config('request.jwt.claim.sub', '', false);
    `);
    await database.close();
  });

  it("creates 40 public learner snapshots that match the application contract", async () => {
    const attempt = await database.query<{
      id: string;
      duration_seconds: number;
    }>(`
      select
        id,
        extract(epoch from (expires_at - started_at))::integer
          as duration_seconds
      from public.start_attempt('${ids.course}', '${ids.config}', null)
    `);
    expect(attempt.rows[0]!.duration_seconds).toBe(3600);

    const snapshots = await database.query<{
      question_id: string;
      question_snapshot: {
        id?: string;
        chapter_id?: string;
        content?: string;
        difficulty?: number;
        options?: Array<{
          id?: string;
          label?: string;
          content?: string;
          is_correct?: boolean;
        }>;
        explanation?: string;
      };
    }>(`
      select question_id, question_snapshot
      from public.attempt_questions
      where attempt_id = '${attempt.rows[0]!.id}'
      order by position
    `);

    expect(snapshots.rows).toHaveLength(40);
    expect(new Set(snapshots.rows.map((row) => row.question_id)).size).toBe(40);
    for (const { question_id: questionId, question_snapshot: snapshot } of snapshots.rows) {
      expect(snapshot).toMatchObject({
        id: questionId,
        chapter_id: expect.any(String),
        content: expect.any(String),
        difficulty: expect.any(Number),
        options: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            label: expect.any(String),
            content: expect.any(String),
          }),
        ]),
      });
      expect(snapshot.options).toHaveLength(4);
      expect(JSON.stringify(snapshot)).not.toMatch(/is_correct|explanation/);
    }
  });

  it("preserves fixed practice order and unlimited duration", async () => {
    const chapterId = uuid(2, 700);
    const attempt = await database.query<{
      id: string;
      expires_at: string | null;
    }>(`
      select id, expires_at
      from public.start_attempt('${ids.course}', null, '${chapterId}')
    `);
    expect(attempt.rows[0]!.expires_at).toBeNull();

    const snapshots = await database.query<{
      question_id: string;
      question_snapshot: {
        id?: string;
        difficulty?: number;
        explanation?: string;
      };
    }>(`
      select
        aq.question_id,
        aq.question_snapshot
      from public.attempt_questions aq
      where aq.attempt_id = '${attempt.rows[0]!.id}'
      order by aq.position
    `);

    expect(snapshots.rows).toHaveLength(12);
    expect(snapshots.rows.map((row) => row.question_id)).toEqual(
      Array.from({ length: 12 }, (_, index) => uuid(3, 701 + index)),
    );
    for (const row of snapshots.rows) {
      expect(row.question_snapshot).toMatchObject({
        id: row.question_id,
        difficulty: expect.any(Number),
      });
      expect(JSON.stringify(row.question_snapshot)).not.toMatch(/is_correct/);
    }
  });
});

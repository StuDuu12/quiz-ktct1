import { readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const migrationPaths = [
  path.resolve("supabase/migrations/202607290001_initial_schema.sql"),
  path.resolve("supabase/migrations/202607290002_rls_policies.sql"),
];

const expectedTables = [
  "attempt_answers",
  "attempt_questions",
  "attempts",
  "audit_logs",
  "chapters",
  "course_instructors",
  "courses",
  "exam_configs",
  "import_jobs",
  "profiles",
  "question_options",
  "questions",
];

describe("Supabase database migrations", () => {
  let database: PGlite | undefined;
  let migrationError: unknown;

  beforeAll(async () => {
    database = new PGlite();

    try {
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
    } catch (error) {
      migrationError = error;
    }
  }, 30_000);

  afterAll(async () => {
    await database?.close();
  });

  it("applies cleanly to PostgreSQL", () => {
    expect(migrationError).toBeUndefined();
  });

  it("creates the complete quiz data model", async () => {
    expect(migrationError).toBeUndefined();

    const result = await database!.query<{ table_name: string }>(`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_type = 'BASE TABLE'
      order by table_name
    `);

    expect(result.rows.map(({ table_name }) => table_name)).toEqual(
      expectedTables,
    );
  });

  it("enforces attempt, answer, and course assignment uniqueness", async () => {
    expect(migrationError).toBeUndefined();

    const result = await database!.query<{
      table_name: string;
      constraint_name: string;
    }>(`
      select table_name, constraint_name
      from information_schema.table_constraints
      where table_schema = 'public'
        and constraint_type in ('PRIMARY KEY', 'UNIQUE')
        and table_name in (
          'course_instructors',
          'attempt_questions',
          'attempt_answers'
        )
    `);

    const constraints = result.rows.map(
      ({ table_name, constraint_name }) => `${table_name}.${constraint_name}`,
    );

    expect(constraints).toEqual(
      expect.arrayContaining([
        "course_instructors.course_instructors_pkey",
        "attempt_questions.attempt_questions_attempt_id_question_id_key",
        "attempt_answers.attempt_answers_attempt_question_id_key",
      ]),
    );
  });

  it("installs mutation guards, role helpers, and audit entrypoints", async () => {
    expect(migrationError).toBeUndefined();

    const functions = await database!.query<{ proname: string }>(`
      select proname
      from pg_proc
      join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
      where pg_namespace.nspname = 'public'
    `);
    const triggers = await database!.query<{ tgname: string }>(`
      select tgname
      from pg_trigger
      join pg_class on pg_class.oid = pg_trigger.tgrelid
      join pg_namespace on pg_namespace.oid = pg_class.relnamespace
      where pg_namespace.nspname in ('auth', 'public')
        and not tgisinternal
    `);

    expect(functions.rows.map(({ proname }) => proname)).toEqual(
      expect.arrayContaining([
        "current_role",
        "is_course_instructor",
        "can_manage_course",
        "handle_new_user",
        "protect_profile_privileged_fields",
        "assert_question_has_one_correct_option",
        "validate_question_publication",
        "validate_published_question_options",
        "protect_attempt_submission",
        "prepare_attempt_answer",
        "start_attempt",
        "get_attempt_results",
        "write_audit_log",
      ]),
    );
    expect(triggers.rows.map(({ tgname }) => tgname)).toEqual(
      expect.arrayContaining([
        "on_auth_user_created",
        "protect_profile_privileged_fields",
        "validate_question_publication",
        "validate_published_question_options",
        "protect_attempt_submission",
        "prepare_attempt_answer",
      ]),
    );
  });

  it("enables RLS on every application table", async () => {
    expect(migrationError).toBeUndefined();

    const result = await database!.query<{
      relname: string;
      relrowsecurity: boolean;
    }>(`
      select relname, relrowsecurity
      from pg_class
      join pg_namespace on pg_namespace.oid = pg_class.relnamespace
      where pg_namespace.nspname = 'public'
        and relkind = 'r'
        and relname = any($1)
      order by relname
    `, [expectedTables]);

    expect(result.rows).toHaveLength(expectedTables.length);
    expect(result.rows.every(({ relrowsecurity }) => relrowsecurity)).toBe(true);
  });

  it("defines ownership, assignment, public catalog, and audit policies", async () => {
    expect(migrationError).toBeUndefined();

    const result = await database!.query<{
      policyname: string;
      tablename: string;
    }>(`
      select policyname, tablename
      from pg_policies
      where schemaname = 'public'
    `);
    const policies = result.rows.map(
      ({ tablename, policyname }) => `${tablename}.${policyname}`,
    );

    expect(policies).toEqual(
      expect.arrayContaining([
        "profiles.students read own profile",
        "profiles.admins manage profiles",
        "courses.public reads published courses",
        "courses.instructors manage assigned courses",
        "questions.public reads published questions",
        "attempts.students own attempts",
        "attempt_answers.students manage own answers",
        "audit_logs.admins read audit logs",
      ]),
    );
    expect(
      result.rows.some(
        ({ tablename, policyname }) =>
          tablename === "audit_logs" && policyname.includes("insert"),
      ),
    ).toBe(false);
  });

  it("keeps answer keys and attempt snapshots server-controlled", async () => {
    expect(migrationError).toBeUndefined();

    const tablePrivileges = await database!.query<{
      privilege_type: string;
    }>(`
      select privilege_type
      from information_schema.table_privileges
      where table_schema = 'public'
        and table_name = 'attempt_questions'
        and grantee = 'authenticated'
        and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
    `);
    const answerKeyPrivileges = await database!.query<{
      table_name: string;
      column_name: string;
    }>(`
      select table_name, column_name
      from information_schema.column_privileges
      where table_schema = 'public'
        and (
          (table_name = 'question_options' and column_name = 'is_correct')
          or
          (table_name = 'attempt_answers' and column_name = 'is_correct')
        )
        and grantee in ('anon', 'authenticated')
        and privilege_type = 'SELECT'
    `);

    expect(tablePrivileges.rows).toEqual([]);
    expect(answerKeyPrivileges.rows).toEqual([]);
  });
});

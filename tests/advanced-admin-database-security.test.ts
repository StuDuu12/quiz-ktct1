import { readFile } from "node:fs/promises";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ids = {
  admin: "00000000-0000-4000-8000-000000000001",
  student: "00000000-0000-4000-8000-000000000002",
  instructor: "00000000-0000-4000-8000-000000000003",
  syntheticAdmin: "00000000-0000-4000-8000-000000000099",
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
  "202607290011_advanced_administration.sql",
  "202607300001_admin_role_management.sql",
  "202607300002_harden_admin_access_changes.sql",
].map((file) => path.resolve("supabase/migrations", file));

describe("safe role-management database security", () => {
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

  const seedProfiles = async () => {
    await resetIdentity();
    await database.exec(`
      delete from public.audit_logs;
      delete from public.profiles;
      insert into public.profiles (id, email, full_name, role, is_active)
      values
        ('${ids.admin}', 'admin@example.test', 'Admin', 'admin', true),
        ('${ids.student}', 'student@example.test', 'Student', 'student', true),
        ('${ids.instructor}', 'instructor@example.test', 'Instructor', 'instructor', true);
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
    for (const migrationPath of migrationFiles) {
      await database.exec(await readFile(migrationPath, "utf8"));
    }
    await database.exec(`
      insert into auth.users (id, email, raw_user_meta_data)
      values
        ('${ids.admin}', 'admin@example.test', '{}'),
        ('${ids.student}', 'student@example.test', '{}'),
        ('${ids.instructor}', 'instructor@example.test', '{}');
    `);
  }, 30_000);

  afterAll(async () => {
    await resetIdentity();
    await database.close();
  });

  it("allows an authenticated admin to change a role and records the audit", async () => {
    try {
      await seedProfiles();
      await assumeIdentity(ids.admin);
      await database.query(`
        select public.admin_set_user_role('${ids.student}', 'instructor')
      `);
      await resetIdentity();

      const result = await database.query<{ role: string; is_active: boolean; action: string }>(`
        select p.role, p.is_active, a.action
        from public.profiles p
        join public.audit_logs a on a.entity_id = p.id
        where p.id = '${ids.student}'
        order by a.id desc
        limit 1
      `);
      expect(result.rows).toEqual([
        { role: "instructor", is_active: true, action: "profile.role_changed" },
      ]);
    } finally {
      await resetIdentity();
    }
  });

  it("rejects anonymous and non-admin callers", async () => {
    try {
      await seedProfiles();
      await database.exec("set role anon;");
      await expect(
        database.query(`
          select public.admin_set_user_role('${ids.student}', 'instructor')
        `),
      ).rejects.toThrow(/permission|privilege/i);
      await resetIdentity();

      await assumeIdentity(ids.student);
      await expect(
        database.query(`
          select public.admin_set_user_role('${ids.instructor}', 'admin')
        `),
      ).rejects.toThrow(/admin|permission|forbidden/i);
    } finally {
      await resetIdentity();
    }
  });

  it("rejects an admin changing their own role and unsupported role text", async () => {
    try {
      await seedProfiles();
      await assumeIdentity(ids.admin);
      await expect(
        database.query(`
          select public.admin_set_user_role('${ids.admin}', 'student')
        `),
      ).rejects.toThrow(/own role/i);
      await expect(
        database.query(`
          select public.admin_set_user_role('${ids.student}', 'owner'::public.app_role)
        `),
      ).rejects.toThrow(/invalid input value for enum|owner/i);
    } finally {
      await resetIdentity();
    }
  });

  it("keeps the last active admin through role, status, and instructor RPCs", async () => {
    try {
      await seedProfiles();
      // PGlite has no concurrent auth sessions. Replace only the actor helper
      // with an otherwise-valid synthetic admin to exercise the final-admin
      // branch that production reaches when concurrent admin requests serialize.
      await database.exec(`
        create or replace function public.assert_admin_actor()
        returns public.profiles
        language plpgsql
        stable
        security definer
        set search_path = ''
        as $$
        declare actor public.profiles%rowtype;
        begin
          actor.id := '${ids.syntheticAdmin}';
          actor.email := 'synthetic-admin@example.test';
          actor.full_name := 'Synthetic admin';
          actor.role := 'admin'::public.app_role;
          actor.is_active := true;
          actor.created_at := now();
          actor.updated_at := now();
          return actor;
        end;
        $$;
      `);
      await assumeIdentity(ids.admin);

      await expect(
        database.query(`select public.admin_set_user_role('${ids.admin}', 'student')`),
      ).rejects.toThrow(/active admin must remain/i);
      await expect(
        database.query(`select public.admin_set_user_active('${ids.admin}', false)`),
      ).rejects.toThrow(/active admin must remain/i);
      await expect(
        database.query(`
          select public.admin_set_instructor('${ids.admin}', '{}'::uuid[], false)
        `),
      ).rejects.toThrow(/active admin must remain/i);
    } finally {
      await resetIdentity();
    }
  });
});

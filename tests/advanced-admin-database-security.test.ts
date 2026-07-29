import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  "supabase/migrations/202607300001_admin_role_management.sql",
);

describe("safe role-management database contract", () => {
  it("guards role changes and preserves a final active administrator", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("actor := public.assert_admin_actor();");
    expect(migration).toMatch(/target_user_id\s*=\s*actor\.id/);
    expect(migration).toMatch(/for update/i);
    expect(migration).toMatch(
      /where role = 'admin' and is_active and id <> target_user_id/i,
    );
  });

  it("keeps direct execution closed, validates roles, and audits each change", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toMatch(
      /target_role\s+public\.app_role/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.admin_set_user_role\(uuid, public\.app_role\)\s+from public, anon/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.admin_set_user_role\(uuid, public\.app_role\)\s+to authenticated/i,
    );
    expect(migration).toContain("'profile.role_changed'");
    expect(migration).toContain("public.write_audit_log(");
  });
});

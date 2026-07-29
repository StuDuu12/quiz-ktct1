import type { Database, Json } from "@/src/lib/supabase/database.types";
import { describe, expectTypeOf, it } from "vitest";

type PublicTable = keyof Database["public"]["Tables"];

describe("generated Supabase database types", () => {
  it("includes every application table", () => {
    expectTypeOf<PublicTable>().toEqualTypeOf<
      | "profiles"
      | "courses"
      | "course_instructors"
      | "chapters"
      | "questions"
      | "question_options"
      | "exam_configs"
      | "attempts"
      | "attempt_questions"
      | "attempt_answers"
      | "import_jobs"
      | "audit_logs"
    >();
  });

  it("exposes nullable submission values and JSON snapshots", () => {
    expectTypeOf<
      Database["public"]["Tables"]["attempts"]["Row"]["score"]
    >().toEqualTypeOf<number | null>();
    expectTypeOf<
      Database["public"]["Tables"]["attempts"]["Row"]["question_order"]
    >().toEqualTypeOf<Json>();
  });

  it("keeps database enums aligned with application roles", () => {
    expectTypeOf<
      Database["public"]["Enums"]["app_role"]
    >().toEqualTypeOf<"admin" | "instructor" | "student">();
  });
});

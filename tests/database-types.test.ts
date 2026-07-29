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
      | "attempt_question_secrets"
      | "attempt_answer_revisions"
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

  it("types trusted attempt start and result functions", () => {
    expectTypeOf<
      Database["public"]["Functions"]["start_attempt"]["Returns"]
    >().toEqualTypeOf<Database["public"]["Tables"]["attempts"]["Row"]>();
    expectTypeOf<
      Database["public"]["Functions"]["get_attempt_results"]["Returns"][number]["is_correct"]
    >().toEqualTypeOf<boolean | null>();
    expectTypeOf<
      Database["public"]["Functions"]["seeded_hash32"]["Returns"]
    >().toEqualTypeOf<number>();
    expectTypeOf<
      Database["public"]["Functions"]["allocate_mock_exam_questions"]["Returns"][number]
    >().toEqualTypeOf<{
      question_position: number;
      question_id: string;
      chapter_id: string;
      option_order: Json;
    }>();
  });
});

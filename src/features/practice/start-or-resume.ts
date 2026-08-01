import "server-only";

import type { Database } from "@/src/lib/supabase/database.types";
import { createServerSupabaseClient } from "@/src/lib/supabase/server";

type PracticeAttempt = Database["public"]["Tables"]["attempts"]["Row"];

export async function startOrResumePracticeAttempt(
  courseId: string,
  chapterId: string,
): Promise<PracticeAttempt> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("start_or_resume_practice", {
    target_course_id: courseId,
    target_chapter_id: chapterId,
  });

  if (error || !data) {
    throw error ?? new Error("PRACTICE_ATTEMPT_START_FAILED");
  }
  return data;
}

export async function startNewPracticeAttempt(
  courseId: string,
  chapterId: string,
): Promise<PracticeAttempt> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("start_attempt", {
    target_course_id: courseId,
    target_chapter_id: chapterId,
  });

  if (error || !data) {
    throw error ?? new Error("PRACTICE_ATTEMPT_START_FAILED");
  }
  return data;
}

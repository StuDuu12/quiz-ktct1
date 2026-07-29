import { createHash } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  EXPECTED_PRODUCTION_COUNTS,
  type ProductionEnvironment,
  type SeedQuestion,
  type SetupEnvironment,
  readAndValidateSeed,
} from "./lib";

const COURSE_SLUG = "kinh-te-chinh-tri-mac-lenin";
const COURSE_TITLE = "Kinh tế chính trị Mác – Lênin";
const CHAPTER_TITLES = [
  "Đối tượng, phương pháp và chức năng của kinh tế chính trị",
  "Hàng hóa, thị trường và các chủ thể tham gia thị trường",
  "Giá trị thặng dư trong nền kinh tế thị trường",
  "Cạnh tranh và độc quyền trong nền kinh tế thị trường",
  "Kinh tế thị trường định hướng xã hội chủ nghĩa",
  "Công nghiệp hóa, hiện đại hóa và hội nhập kinh tế quốc tế",
] as const;

type ProductionCounts = {
  courses: number;
  chapters: number;
  questions: number;
  publishedQuestionOptions: number;
};

function operationFailed(
  operation: string,
  error: { code?: string } | null,
): never {
  const code = error?.code ? ` (${error.code})` : "";
  throw new Error(`${operation} failed${code}`);
}

function stableUuid(value: string) {
  const bytes = createHash("sha256").update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

function chunks<T>(items: T[], size = 200) {
  const result: T[][] = [];
  for (let offset = 0; offset < items.length; offset += size) {
    result.push(items.slice(offset, offset + size));
  }
  return result;
}

async function fetchAllIds(client: SupabaseClient, table: string) {
  const ids: string[] = [];
  for (let offset = 0; ; offset += 1_000) {
    const result = await client
      .from(table)
      .select("id")
      .range(offset, offset + 999);
    if (result.error) operationFailed(`Read ${table}`, result.error);
    ids.push(...result.data.map(({ id }) => String(id)));
    if (result.data.length < 1_000) return ids;
  }
}

async function exactCount(
  client: SupabaseClient,
  table: string,
) {
  const query = client.from(table).select("id", { count: "exact", head: true });
  const { count, error } = await query;
  if (error || count === null) operationFailed(`Count ${table}`, error);
  return count;
}

async function publishedQuestionOptionCount(client: SupabaseClient) {
  const { count, error } = await client
    .from("question_options")
    .select("id,questions!inner(status)", { count: "exact", head: true })
    .eq("questions.status", "published");
  if (error || count === null) {
    operationFailed("Count published question options", error);
  }
  return count;
}

export function createProductionClient(environment: ProductionEnvironment) {
  return createClient(
    environment.supabaseUrl,
    environment.serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

export async function verifyProductionCounts(
  client: SupabaseClient,
): Promise<ProductionCounts> {
  const [courses, chapters, questions, publishedQuestionOptions] =
    await Promise.all([
      exactCount(client, "courses"),
      exactCount(client, "chapters"),
      exactCount(client, "questions"),
      publishedQuestionOptionCount(client),
    ]);

  const counts = {
    courses,
    chapters,
    questions,
    publishedQuestionOptions,
  };
  if (
    Object.entries(EXPECTED_PRODUCTION_COUNTS).some(
      ([key, expected]) =>
        counts[key as keyof ProductionCounts] !== expected,
    )
  ) {
    throw new Error(
      `Production count verification failed: courses=${courses}, chapters=${chapters}, questions=${questions}, published_question_options=${publishedQuestionOptions}`,
    );
  }
  return counts;
}

export async function createInitialAdmin(
  client: SupabaseClient,
  environment: SetupEnvironment,
) {
  let targetUserId: string | null = null;
  for (let page = 1; page <= 100 && !targetUserId; page += 1) {
    const result = await client.auth.admin.listUsers({
      page,
      perPage: 100,
    });
    if (result.error) operationFailed("List authentication users", result.error);
    const target = result.data.users.find(
      ({ email }) =>
        email?.trim().toLowerCase() === environment.initialAdminEmail,
    );
    targetUserId = target?.id ?? null;
    if (result.data.users.length < 100) break;
  }

  if (!targetUserId) {
    const created = await client.auth.admin.createUser({
      email: environment.initialAdminEmail,
      password: environment.initialAdminPassword,
      email_confirm: true,
      user_metadata: { full_name: environment.initialAdminFullName },
    });
    if (created.error || !created.data.user) {
      operationFailed("Create initial administrator", created.error);
    }
    targetUserId = created.data.user.id;
  }

  const promotion = await client.rpc("bootstrap_initial_admin", {
    target_user_id: targetUserId,
    target_email: environment.initialAdminEmail,
  });
  if (promotion.error) {
    operationFailed("Promote initial administrator", promotion.error);
  }
  return targetUserId;
}

function buildQuestionRows(
  questions: SeedQuestion[],
  chapterIds: Map<number, string>,
  adminId: string,
) {
  return questions.map((question, index) => {
    const id = stableUuid(
      `ktct:${question.chapter}:${index}:${question.sourceNumber}:${question.content}`,
    );
    return {
      id,
      chapter_id: chapterIds.get(question.chapter)!,
      content: question.content,
      explanation: question.explanation,
      difficulty: 2,
      status: "draft",
      source_number: question.sourceNumber,
      created_by: adminId,
      options: question.options.map((option) => ({
        id: stableUuid(`${id}:${option.label}`),
        question_id: id,
        label: option.label,
        content: option.content,
        is_correct: option.label === question.correctLabel,
      })),
    };
  });
}

export async function seedProduction(
  client: SupabaseClient,
  projectRoot: string,
  adminId: string,
) {
  const existing = await Promise.all([
    exactCount(client, "courses"),
    exactCount(client, "chapters"),
    exactCount(client, "questions"),
    exactCount(client, "question_options"),
  ]);
  if (
    existing[0] === EXPECTED_PRODUCTION_COUNTS.courses &&
    existing[1] === EXPECTED_PRODUCTION_COUNTS.chapters &&
    existing[2] === EXPECTED_PRODUCTION_COUNTS.questions &&
    existing[3] === EXPECTED_PRODUCTION_COUNTS.publishedQuestionOptions
  ) {
    return;
  }
  if (
    existing[0] > EXPECTED_PRODUCTION_COUNTS.courses ||
    existing[1] > EXPECTED_PRODUCTION_COUNTS.chapters ||
    existing[2] > EXPECTED_PRODUCTION_COUNTS.questions ||
    existing[3] > EXPECTED_PRODUCTION_COUNTS.publishedQuestionOptions
  ) {
    throw new Error("Production database contains unexpected content; seed stopped");
  }

  let courseId: string;
  if (existing[0] === 1) {
    const course = await client.from("courses").select("id,slug").single();
    if (course.error) operationFailed("Read production course", course.error);
    if (course.data.slug !== COURSE_SLUG) {
      throw new Error("Production database contains an unexpected course");
    }
    courseId = String(course.data.id);
  } else {
    const courseResult = await client
      .from("courses")
      .insert({
        slug: COURSE_SLUG,
        title: COURSE_TITLE,
        description:
          "Ngân hàng câu hỏi Kinh tế chính trị Mác – Lênin gồm sáu chương.",
        status: "published",
        created_by: adminId,
      })
      .select("id")
      .single();
    if (courseResult.error) {
      operationFailed("Create production course", courseResult.error);
    }
    courseId = String(courseResult.data.id);
  }

  if (existing[1] > 0) {
    const chapters = await client
      .from("chapters")
      .select("course_id,position")
      .order("position");
    if (chapters.error) operationFailed("Read production chapters", chapters.error);
    const positions = chapters.data.map(({ course_id, position }) => {
      if (String(course_id) !== courseId) {
        throw new Error("Production database contains an unexpected chapter");
      }
      return Number(position);
    });
    if (
      positions.some(
        (position, index) => position !== index + 1 || position > 6,
      )
    ) {
      throw new Error("Production database contains unexpected chapter positions");
    }
  }

  const chapterResult = await client
    .from("chapters")
    .upsert(
      CHAPTER_TITLES.map((title, index) => ({
        course_id: courseId,
        position: index + 1,
        title,
        status: "published",
      })),
      { onConflict: "course_id,position" },
    )
    .select("id,position");
  if (chapterResult.error) operationFailed("Create production chapters", chapterResult.error);
  const chapterIds = new Map(
    chapterResult.data.map(({ id, position }) => [Number(position), String(id)]),
  );
  if (chapterIds.size !== 6) throw new Error("Production chapter setup failed");

  const seed = readAndValidateSeed(projectRoot);
  const rows = buildQuestionRows(seed, chapterIds, adminId);
  const expectedQuestionIds = new Set(rows.map(({ id }) => id));
  const expectedOptionIds = new Set(
    rows.flatMap(({ options }) => options.map(({ id }) => id)),
  );
  if (
    existing[2] > 0 &&
    (await fetchAllIds(client, "questions")).some(
      (id) => !expectedQuestionIds.has(id),
    )
  ) {
    throw new Error("Production database contains unexpected questions");
  }
  if (
    existing[3] > 0 &&
    (await fetchAllIds(client, "question_options")).some(
      (id) => !expectedOptionIds.has(id),
    )
  ) {
    throw new Error("Production database contains unexpected question options");
  }

  for (const batch of chunks(rows)) {
    const questions = batch.map((question) => ({
      id: question.id,
      chapter_id: question.chapter_id,
      content: question.content,
      explanation: question.explanation,
      difficulty: question.difficulty,
      status: question.status,
      source_number: question.source_number,
      created_by: question.created_by,
    }));
    const result = await client
      .from("questions")
      .upsert(questions, { onConflict: "id" });
    if (result.error) operationFailed("Seed production questions", result.error);
  }
  for (const batch of chunks(rows.flatMap(({ options }) => options))) {
    const result = await client
      .from("question_options")
      .upsert(batch, { onConflict: "id" });
    if (result.error) operationFailed("Seed production options", result.error);
  }
  for (const batch of chunks(rows.map(({ id }) => id))) {
    const result = await client
      .from("questions")
      .update({ status: "published" })
      .in("id", batch);
    if (result.error) operationFailed("Publish production questions", result.error);
  }
}

# Mock Exam Loading Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khôi phục việc tạo đề thi thử 40 câu và cung cấp trạng thái tải/lỗi rõ ràng thay cho trang lỗi chung của Next.js.

**Architecture:** Một migration tiếp nối sẽ định nghĩa lại `public.start_attempt` nhưng giữ riêng hai chính sách: luyện tập theo `practice_position`, thi thử qua `allocate_mock_exam_questions`. Server action chuyển lỗi dự kiến thành kết quả có kiểu rõ ràng; client launch form quản lý pending/error, còn một component loading dùng chung phục vụ hai route thi thử.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Supabase PostgreSQL/PLpgSQL, Vitest, Testing Library, PGlite, CSS thuần trong `app/globals.css`.

## Global Constraints

- Thi thử luôn có đúng 40 câu, 60 phút và dùng phân bổ hiện hành theo sáu chương/độ khó.
- Snapshot phía học viên có `id`, `chapter_id`, `content`, `difficulty`, bốn phương án `id`, `label`, `content`; không chứa `is_correct` hoặc `explanation`.
- Luyện tập tiếp tục theo `practice_position` và không có thời hạn.
- Không đưa thông tin lỗi Supabase nội bộ ra trình duyệt.
- Không stage, sửa hoặc commit các thay đổi cục bộ không liên quan đang có trong workspace.

---

## File map

- Create `supabase/migrations/202608030001_restore_mock_exam_start.sql`: định nghĩa chuẩn cuối cùng của `public.start_attempt` cho cả mock exam và practice.
- Create `tests/mock-exam-start-regression.test.ts`: chạy migration thật trên PGlite và kiểm tra contract của snapshot/lượt thi.
- Modify `src/features/exam/actions.ts`: trả `StartMockExamResult` thay vì để lỗi tạo đề thoát ra error boundary.
- Modify `src/features/exam/components/exam-launch-form.tsx`: pending, khóa gửi lặp, điều hướng thành công và cảnh báo/thử lại khi lỗi.
- Create `src/features/exam/components/exam-loading.tsx`: giao diện loading dùng chung, có ngữ nghĩa accessibility.
- Create `app/(protected)/courses/[courseSlug]/mock-exam/loading.tsx`: loading khi mở trang giới thiệu thi thử.
- Create `app/(protected)/exam/[attemptId]/loading.tsx`: loading khi chuyển vào phiên thi.
- Modify `app/globals.css`: spinner, alert và responsive/reduced-motion cho các trạng thái mới.
- Create `tests/exam-launch-form.test.tsx`: kiểm tra hành vi component ở pending/success/failure.
- Create `tests/exam-loading.test.tsx`: kiểm tra status semantics và nội dung hai route loading.
- Modify `src/features/history/components/result-review.tsx`: thêm điều hướng xem lại bằng nút và phím mũi tên.
- Modify `tests/history-components.test.tsx`: kiểm tra chuyển câu, focus và trạng thái khóa ở biên.

---

### Task 1: Khôi phục contract tạo đề trong database

**Files:**
- Create: `tests/mock-exam-start-regression.test.ts`
- Create: `supabase/migrations/202608030001_restore_mock_exam_start.sql`

**Interfaces:**
- Consumes: `public.allocate_mock_exam_questions(target_course_id uuid, allocation_seed text)` và schema hiện có.
- Produces: `public.start_attempt(target_course_id uuid, target_exam_config_id uuid default null, target_chapter_id uuid default null) returns public.attempts`.

- [ ] **Step 1: Viết kiểm thử database tái hiện snapshot hỏng**

Tạo fixture PGlite áp dụng các migration nền cần thiết, migration `202608020008_fixed_practice_order.sql`, rồi gọi RPC thật bằng role `authenticated`. Kiểm thử phải truy vấn snapshot và xác nhận literal contract:

```ts
expect(snapshot).toMatchObject({
  id: expect.any(String),
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
```

Thêm assertions độc lập cho `40` snapshot duy nhất, `3600` giây, sáu chương và nhánh practice giữ `expires_at = null` cùng thứ tự `practice_position`.

- [ ] **Step 2: Chạy test để xác nhận RED**

Run: `npm test -- tests/mock-exam-start-regression.test.ts`

Expected: FAIL vì snapshot từ migration `202608020008` không có `id` và `difficulty`, đồng thời nhánh mock không còn dùng allocator cân bằng.

- [ ] **Step 3: Viết migration tối thiểu khôi phục function**

Trong `202608030001_restore_mock_exam_start.sql`, mock branch phải lấy allocation như sau và từ chối số lượng sai:

```sql
select
  array_agg(allocation.question_id order by allocation.question_position),
  jsonb_object_agg(
    allocation.question_id::text,
    allocation.option_order
  )
into selected_question_ids, option_order_snapshot
from public.allocate_mock_exam_questions(target_course_id, attempt_seed) allocation;

if coalesce(array_length(selected_question_ids, 1), 0) <> 40 then
  raise exception 'Mock exam requires exactly 40 published questions'
    using errcode = '23514';
end if;
```

Khi tạo snapshot, lấy option theo `current_option_order` và xây đúng payload công khai:

```sql
jsonb_build_object(
  'id', question.id,
  'chapter_id', question.chapter_id,
  'content', question.content,
  'difficulty', question.difficulty,
  'options', ordered_options.value
)
```

Nhánh practice giữ truy vấn `order by question.practice_position asc nulls last, question.created_at asc, question.id asc`, `selected_duration_seconds := null`; trigger bảo mật hiện hành tiếp tục loại `explanation` khỏi snapshot công khai và RPC luyện tập ghép lời giải từ bảng secrets khi cần. Giữ `SECURITY DEFINER`, `set search_path = ''`, revoke `public, anon` và grant `authenticated`.

- [ ] **Step 4: Chạy test để xác nhận GREEN**

Run: `npm test -- tests/mock-exam-start-regression.test.ts`

Expected: PASS; PGlite thực thi migration thật và trả đúng contract.

- [ ] **Step 5: Chạy các test database liên quan**

Run: `npm test -- tests/exam-database-security.test.ts tests/practice-start-course-scope.test.ts tests/practice-fixed-order.test.ts`

Expected: PASS, không làm hỏng bảo mật hoặc thứ tự luyện tập.

- [ ] **Step 6: Commit task database**

```powershell
git add -- 'tests/mock-exam-start-regression.test.ts' 'supabase/migrations/202608030001_restore_mock_exam_start.sql'
git commit -m "fix: restore mock exam snapshot contract"
```

### Task 2: Chuyển lỗi tạo đề thành kết quả an toàn

**Files:**
- Modify: `src/features/exam/actions.ts`
- Modify: `tests/exam-actions.test.ts`

**Interfaces:**
- Produces: `export type StartMockExamResult = { ok: true; url: string } | { ok: false; message: string }`.
- Produces: `startMockExamForCourse(courseSlug: string): Promise<StartMockExamResult>`.

- [ ] **Step 1: Viết kiểm thử action thất bại và thành công**

Mock biên Supabase, không mock logic mapping của action. Assertions:

```ts
await expect(startMockExamForCourse("course-slug")).resolves.toEqual({
  ok: false,
  message: "Không thể tạo đề thi lúc này. Vui lòng thử lại.",
});

await expect(startMockExamForCourse("course-slug")).resolves.toEqual({
  ok: true,
  url: "/exam/attempt-1",
});
```

Kiểm tra lỗi xác thực xảy ra trước khối `try` vẫn được ném/redirect bởi `requireViewer`.

- [ ] **Step 2: Chạy test để xác nhận RED**

Run: `npm test -- tests/exam-actions.test.ts`

Expected: FAIL vì action hiện trả string hoặc reject.

- [ ] **Step 3: Cài đặt union result tối thiểu**

```ts
export type StartMockExamResult =
  | { ok: true; url: string }
  | { ok: false; message: string };

export async function startMockExamForCourse(
  courseSlug: string,
): Promise<StartMockExamResult> {
  const viewer = await requireViewer(["student", "instructor", "admin"]);
  try {
    const attempt = isE2EEnabled()
      ? startE2EExam(viewer.id)
      : await startMockExam(
          viewer.id,
          (await getMockExamLaunch(courseSlug)).config.id,
        );
    return { ok: true, url: `/exam/${attempt.id}` };
  } catch {
    return {
      ok: false,
      message: "Không thể tạo đề thi lúc này. Vui lòng thử lại.",
    };
  }
}
```

- [ ] **Step 4: Chạy test để xác nhận GREEN**

Run: `npm test -- tests/exam-actions.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit task action**

```powershell
git add -- 'src/features/exam/actions.ts' 'tests/exam-actions.test.ts'
git commit -m "fix: contain mock exam launch failures"
```

### Task 3: Thêm pending, cảnh báo và route loading

**Files:**
- Modify: `src/features/exam/components/exam-launch-form.tsx`
- Create: `src/features/exam/components/exam-loading.tsx`
- Create: `app/(protected)/courses/[courseSlug]/mock-exam/loading.tsx`
- Create: `app/(protected)/exam/[attemptId]/loading.tsx`
- Modify: `app/globals.css`
- Create: `tests/exam-launch-form.test.tsx`
- Create: `tests/exam-loading.test.tsx`

**Interfaces:**
- Consumes: `action: () => Promise<StartMockExamResult>`.
- Produces: `ExamLoading({ title, description }: { title: string; description: string })`.

- [ ] **Step 1: Viết test component loading và lỗi**

Trong jsdom, render form với deferred promise. Ngay sau submit phải có button disabled và status:

```ts
expect(screen.getByRole("button", { name: "Đang tạo đề…" })).toBeDisabled();
expect(screen.getByRole("status")).toHaveTextContent("Đang tạo đề thi");
```

Resolve `{ ok: true, url: "/exam/attempt-1" }` và assert router thật ở biên được gọi với URL. Ở test khác resolve `{ ok: false, message: "Không thể tạo đề thi lúc này. Vui lòng thử lại." }`, assert `role="alert"`, nút được bật lại và lần submit thứ hai gọi action lần thứ hai. Không assert phần tử mock.

Render hai route loading và assert mỗi trang có `role="status"`, `aria-live="polite"`, tiêu đề tiếng Việt tương ứng.

- [ ] **Step 2: Chạy test để xác nhận RED**

Run: `npm test -- tests/exam-launch-form.test.tsx tests/exam-loading.test.tsx`

Expected: FAIL vì chưa có pending/error/loading component.

- [ ] **Step 3: Cài đặt form state tối thiểu**

`ExamLaunchForm` dùng `useState` và submit handler có `event.preventDefault()`:

```tsx
const [pending, setPending] = useState(false);
const [error, setError] = useState("");

const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  if (pending) return;
  setPending(true);
  setError("");
  try {
    const result = await action();
    if (result.ok) {
      router.push(result.url);
      return;
    }
    setError(result.message);
  } catch {
    setError("Không thể tạo đề thi lúc này. Vui lòng thử lại.");
  } finally {
    setPending(false);
  }
};
```

Button có `disabled={pending}`, icon spinner khi pending, nhãn “Đang tạo đề…”, status riêng và alert ngay trên form.

- [ ] **Step 4: Cài đặt loading component và CSS**

`ExamLoading` trả cấu trúc:

```tsx
<main className="exam-loading-shell">
  <section role="status" aria-live="polite" aria-atomic="true">
    <span className="exam-loading-spinner" aria-hidden="true" />
    <p className="exam-kicker">THI THỬ TỔNG HỢP</p>
    <h1>{title}</h1>
    <p>{description}</p>
  </section>
</main>
```

Hai `loading.tsx` chỉ truyền copy cụ thể. CSS dùng card hiện có, spinner bằng `border`/`animation`, breakpoint dưới `640px` giảm padding và `@media (prefers-reduced-motion: reduce)` tắt xoay.

- [ ] **Step 5: Chạy test để xác nhận GREEN**

Run: `npm test -- tests/exam-launch-form.test.tsx tests/exam-loading.test.tsx`

Expected: PASS.

- [ ] **Step 6: Chạy test action và e2e mock exam liên quan**

Run: `npm test -- tests/exam-actions.test.ts tests/exam-start-attempt.test.ts tests/exam-session.test.tsx`

Run when E2E environment is available: `npx playwright test e2e/mock-exam.spec.ts`

Expected: PASS; e2e helper được cập nhật selector nếu nhãn pending làm thay đổi thời điểm click.

- [ ] **Step 7: Commit task giao diện**

```powershell
git add -- 'src/features/exam/components/exam-launch-form.tsx' 'src/features/exam/components/exam-loading.tsx' 'app/(protected)/courses/[courseSlug]/mock-exam/loading.tsx' 'app/(protected)/exam/[attemptId]/loading.tsx' 'app/globals.css' 'tests/exam-launch-form.test.tsx' 'tests/exam-loading.test.tsx'
git commit -m "feat: add resilient mock exam loading"
```

### Task 4: Điều hướng câu hỏi trên trang kết quả

**Files:**
- Modify: `src/features/history/components/result-review.tsx`
- Modify: `tests/history-components.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `AttemptResult.questions` đã sắp xếp theo `position`.
- Produces: điều hướng nút/phím đến từng `article` kết quả mà không thay đổi dữ liệu chấm điểm.

- [ ] **Step 1: Viết test điều hướng xem lại**

Render kết quả ba câu, mock `HTMLElement.prototype.scrollIntoView`, rồi xác nhận bộ đếm khởi đầu `Câu 1 / 3`, nút trước bị khóa. Bấm `Câu tiếp` phải cập nhật `Câu 2 / 3`, gọi scroll và focus `article` câu 2. Nhấn `ArrowLeft` quay về câu 1; tại câu cuối, nút tiếp bị khóa. Một input thử nghiệm có focus phải nhận phím mũi tên mà không làm thay đổi bộ đếm.

```ts
expect(screen.getByText("Câu 1 / 3")).toBeInTheDocument();
expect(screen.getByRole("button", { name: "Câu trước" })).toBeDisabled();
fireEvent.click(screen.getByRole("button", { name: "Câu tiếp" }));
expect(screen.getByText("Câu 2 / 3")).toBeInTheDocument();
expect(document.activeElement).toHaveAttribute("data-result-question", "2");
```

- [ ] **Step 2: Chạy test để xác nhận RED**

Run: `npm test -- tests/history-components.test.tsx`

Expected: FAIL vì chưa có bộ đếm hoặc nút điều hướng.

- [ ] **Step 3: Cài đặt client navigation tối thiểu**

Đổi `ResultReview` thành client component, giữ `currentIndex`, refs cho từng article và helper bỏ qua editable target. Hàm chuyển câu chặn ngoài biên, cập nhật state rồi chạy focus/scroll sau render:

```tsx
const goToQuestion = useCallback((index: number) => {
  if (index < 0 || index >= result.questions.length) return;
  setCurrentIndex(index);
  requestAnimationFrame(() => {
    const target = questionRefs.current[index];
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.focus({ preventScroll: true });
  });
}, [result.questions.length]);
```

Mỗi article có `tabIndex={-1}`, `data-result-question={question.position}` và `aria-current={index === currentIndex ? "step" : undefined}`. Window keydown xử lý `ArrowLeft`/`ArrowRight` chỉ khi target không phải `input`, `textarea`, `select` hoặc `contenteditable`.

- [ ] **Step 4: Thêm thanh điều hướng responsive**

Đặt `.result-review-navigation` giữa thống kê và danh sách câu, gồm hai button 44px và `<strong>Câu {currentIndex + 1} / {total}</strong>`. Trên mobile, thanh sticky ở dưới vùng nhìn; với reduced motion, `scrollIntoView` dùng `behavior: "auto"` thông qua `matchMedia("(prefers-reduced-motion: reduce)")`.

- [ ] **Step 5: Chạy test để xác nhận GREEN**

Run: `npm test -- tests/history-components.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit task điều hướng xem lại**

```powershell
git add -- 'src/features/history/components/result-review.tsx' 'tests/history-components.test.tsx' 'app/globals.css'
git commit -m "feat: navigate submitted review questions"
```

### Task 5: Xác minh, áp dụng migration và deploy

**Files:**
- Verify only: toàn bộ files đã đổi trong Task 1–3.

**Interfaces:**
- Consumes: các commit hoàn chỉnh từ Task 1–4.
- Produces: `main` đã push, migration production đã áp dụng và Vercel deployment thành công.

- [ ] **Step 1: Kiểm tra diff chỉ chứa phạm vi đã duyệt**

Run: `git status --short --branch` và `git diff origin/main...HEAD --check`.

Expected: các file chưa commit của người dùng vẫn hiện riêng; commit diff không chứa chúng.

- [ ] **Step 2: Chạy verification đầy đủ**

Run: `npm test`

Run: `npm run typecheck`

Run: `npx eslint 'src/features/exam/actions.ts' 'src/features/exam/components/exam-launch-form.tsx' 'src/features/exam/components/exam-loading.tsx' 'src/features/history/components/result-review.tsx' 'app/(protected)/courses/[courseSlug]/mock-exam/loading.tsx' 'app/(protected)/exam/[attemptId]/loading.tsx' 'tests/exam-actions.test.ts' 'tests/exam-launch-form.test.tsx' 'tests/exam-loading.test.tsx' 'tests/mock-exam-start-regression.test.ts' 'tests/history-components.test.tsx'`

Run: `npm run build`

Expected: tất cả PASS. Nếu whole-repo lint có lỗi baseline, báo riêng nhưng lint phạm vi thay đổi phải sạch.

- [ ] **Step 3: Áp dụng migration production bằng workflow hiện có**

Run: `npm run production:preflight` rồi dùng `npm run production:setup` hoặc Supabase migration workflow đã cấu hình để áp dụng duy nhất migration chưa chạy.

Expected: `202608030001_restore_mock_exam_start.sql` được ghi nhận; kiểm tra read-only xác nhận `start_attempt` có snapshot đủ `id`/`difficulty`. Không tạo hoặc xóa dữ liệu học viên để thử nghiệm.

- [ ] **Step 4: Push main và theo dõi Vercel**

Run: `git push origin main`.

Theo dõi commit status đến khi context `Vercel` trả `success`; nếu thất bại, đọc build log rồi quay lại bước verification tương ứng.

- [ ] **Step 5: Smoke test production**

Đăng nhập tài khoản sinh viên, mở `/courses/kinh-te-chinh-tri-mac-lenin/mock-exam`, bấm “Bắt đầu thi thử” một lần; xác nhận loading xuất hiện ngay, URL chuyển sang `/exam/{id}`, đủ 40 câu và không có trang lỗi chung. Không nộp bài nếu không cần thiết.

- [ ] **Step 6: Báo cáo hoàn tất**

Gửi commit SHA, kết quả test/build, trạng thái migration, liên kết Vercel deployment và lưu ý rõ mọi file cục bộ của người dùng vẫn được giữ nguyên.

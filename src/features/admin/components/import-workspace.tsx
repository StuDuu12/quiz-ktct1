"use client";

import {
  FileArrowUp,
  FileText,
  SpinnerGap,
} from "@phosphor-icons/react";
import { useMemo, useRef, useState, useTransition } from "react";

import { previewImport } from "@/src/features/admin/import-preview";
import type { ParsedQuestion } from "@/src/features/question-bank/types";
import { ImportPreviewPanel } from "@/src/features/question-bank/components/import-preview";

type CourseChoice = {
  id: string;
  title: string;
};

type ChapterChoice = {
  id: string;
  courseId: string;
  position: number;
  title: string;
};

type PreviewSession = {
  courseId: string;
  chapterId: string;
  fileName: string;
  source: string;
  idempotencyKey: string;
  preview: ReturnType<typeof previewImport>;
  importedCount: number | null;
};

export function ImportWorkspace({
  courses,
  chapters,
  commitAction,
}: {
  courses: CourseChoice[];
  chapters: ChapterChoice[];
  commitAction: (input: {
    courseId: string;
    chapterId: string;
    fileName: string;
    idempotencyKey: string;
    questions: ParsedQuestion[];
  }) => Promise<{ job_id: string; imported_count: number } | null>;
}) {
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const availableChapters = useMemo(
    () => chapters.filter((chapter) => chapter.courseId === courseId),
    [chapters, courseId],
  );
  const [chapterId, setChapterId] = useState(
    chapters.find((chapter) => chapter.courseId === courseId)?.id ?? "",
  );
  const [source, setSource] = useState("");
  const [fileName, setFileName] = useState("questions.md");
  const [previewSession, setPreviewSession] =
    useState<PreviewSession | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isSubmittingRef = useRef(false);

  function changeCourse(nextCourseId: string) {
    setCourseId(nextCourseId);
    setChapterId(
      chapters.find((chapter) => chapter.courseId === nextCourseId)?.id ?? "",
    );
    setPreviewSession(null);
    setResult(null);
  }

  function confirmImport() {
    if (
      !previewSession ||
      previewSession.importedCount !== null ||
      isSubmittingRef.current
    ) {
      return;
    }
    isSubmittingRef.current = true;
    const session = previewSession;
    startTransition(async () => {
      setResult(null);
      try {
        const saved = await commitAction({
          courseId: session.courseId,
          chapterId: session.chapterId,
          fileName: session.fileName,
          idempotencyKey: session.idempotencyKey,
          questions: session.preview.importableQuestions,
        });
        if (saved) {
          setPreviewSession((current) =>
            current?.idempotencyKey === session.idempotencyKey
              ? { ...current, importedCount: saved.imported_count }
              : current,
          );
        }
        setResult(
          saved
            ? `Đã nhập ${saved.imported_count} câu. Mã tác vụ ${saved.job_id}.`
            : "Tác vụ đã hoàn tất nhưng không trả về kết quả.",
        );
      } catch {
        setResult(
          "Không thể nhập dữ liệu. Không có phần dữ liệu nào được ghi.",
        );
      } finally {
        isSubmittingRef.current = false;
      }
    });
  }

  if (!courses.length) {
    return (
      <section className="admin-empty">
        <FileArrowUp size={30} weight="duotone" aria-hidden="true" />
        <div>
          <h2>Chưa có khóa học trong phạm vi</h2>
          <p>Cần được phân công khóa học trước khi nhập câu hỏi.</p>
        </div>
      </section>
    );
  }

  return (
    <div className="import-workspace">
      <section className="admin-panel import-source-panel">
        <header>
          <div>
            <p className="admin-kicker">NGUỒN MARKDOWN</p>
            <h2>Dán hoặc tải nội dung</h2>
          </div>
          <FileText size={26} weight="duotone" aria-hidden="true" />
        </header>
        <div className="admin-form-grid">
          <label>
            Khóa học
            <select
              value={courseId}
              onChange={(event) => changeCourse(event.currentTarget.value)}
            >
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Chương
            <select
              value={chapterId}
              required
              onChange={(event) => {
                setChapterId(event.currentTarget.value);
                setPreviewSession(null);
                setResult(null);
              }}
            >
              <option value="">Chọn chương</option>
              {availableChapters.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>
                  Chương {chapter.position}: {chapter.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tên tệp
            <input
              value={fileName}
              required
              onChange={(event) => {
                setFileName(event.currentTarget.value);
                setPreviewSession(null);
                setResult(null);
              }}
            />
          </label>
          <label className="import-file-control">
            Chọn tệp .md
            <input
              type="file"
              accept=".md,text/markdown,text/plain"
              onChange={async (event) => {
                const file = event.currentTarget.files?.[0];
                if (!file) return;
                setPreviewSession(null);
                setResult(null);
                setFileName(file.name);
                setSource(await file.text());
              }}
            />
          </label>
        </div>
        <label>
          Nội dung Markdown
          <textarea
            rows={18}
            value={source}
            placeholder="Câu 1: Nội dung câu hỏi..."
            onChange={(event) => {
              setSource(event.currentTarget.value);
              setPreviewSession(null);
              setResult(null);
            }}
          />
        </label>
        <button
          className="admin-primary-button"
          type="button"
          disabled={!source.trim() || !chapterId}
          onClick={() => {
            setResult(null);
            setPreviewSession((current) => {
              if (
                current?.courseId === courseId &&
                current.chapterId === chapterId &&
                current.fileName === fileName &&
                current.source === source
              ) {
                return current;
              }
              return {
                courseId,
                chapterId,
                fileName,
                source,
                idempotencyKey: crypto.randomUUID(),
                preview: previewImport(source, chapterId),
                importedCount: null,
              };
            });
          }}
        >
          <FileArrowUp size={19} weight="bold" aria-hidden="true" />
          Phân tích và xem trước
        </button>
      </section>

      {previewSession ? (
        <ImportPreviewPanel
          preview={previewSession.preview}
          onConfirm={confirmImport}
          disabled={isPending}
          importedCount={previewSession.importedCount}
        />
      ) : (
        <section className="admin-empty admin-empty-compact">
          <FileText size={28} weight="duotone" aria-hidden="true" />
          <div>
            <h2>Chưa có bản xem trước</h2>
            <p>Dữ liệu chỉ được ghi sau hai bước phân tích và xác nhận.</p>
          </div>
        </section>
      )}

      {isPending ? (
        <p className="admin-live-status" role="status">
          <SpinnerGap className="admin-spin" size={18} aria-hidden="true" />
          Đang ghi toàn bộ lô trong một giao dịch…
        </p>
      ) : result ? (
        <p className="admin-live-status" role="status">
          {result}
        </p>
      ) : null}
    </div>
  );
}

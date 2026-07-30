"use client";

import { useState } from "react";
import {
  Pencil,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import type { AdminChapter, AdminQuestion } from "@/src/features/admin/queries";
import { deleteQuestionForm, saveQuestionForm } from "@/src/features/admin/actions";

type Props = {
  questions: AdminQuestion[];
  chapters: AdminChapter[];
};

export function ChapterQuestionManager({ questions, chapters }: Props) {
  const [selectedChapterId, setSelectedChapterId] = useState<string | "all">(
    chapters[0]?.id ?? "all"
  );
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [deletingQuestion, setDeletingQuestion] = useState<AdminQuestion | null>(null);

  const sortedChapters = [...chapters].sort((a, b) => a.position - b.position);

  const filteredQuestions = selectedChapterId === "all"
    ? questions
    : questions.filter((q) => q.chapterId === selectedChapterId);

  const difficultyLabels: Record<number, string> = {
    1: "Mức 1 · Nhận biết",
    2: "Mức 2 · Thông hiểu",
    3: "Mức 3 · Vận dụng",
    4: "Mức 4 · Vận dụng cao",
  };

  return (
    <div className="space-y-4">
      {/* Chapter Tabs Filter */}
      <div className="flex flex-wrap gap-2 pb-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setSelectedChapterId("all")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
            selectedChapterId === "all"
              ? "bg-indigo-600 text-white shadow-sm"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          Tất cả ({questions.length})
        </button>

        {sortedChapters.map((ch) => {
          const count = questions.filter((q) => q.chapterId === ch.id).length;
          const isSelected = selectedChapterId === ch.id;
          return (
            <button
              key={ch.id}
              type="button"
              onClick={() => setSelectedChapterId(ch.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                isSelected
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Chương {ch.position} ({count})
            </button>
          );
        })}
      </div>

      {/* Questions Count Summary */}
      <div className="flex justify-between items-center text-xs text-slate-500 font-medium px-1">
        <span>
          Đang hiển thị {filteredQuestions.length} câu hỏi{" "}
          {selectedChapterId !== "all" &&
            `thuộc Chương ${
              chapters.find((c) => c.id === selectedChapterId)?.position ?? ""
            }`}
        </span>
      </div>

      {/* Questions Table */}
      {filteredQuestions.length ? (
        <div className="admin-table-scroll border rounded-xl overflow-hidden bg-white shadow-sm">
          <table className="admin-table w-full">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-bold text-slate-600 border-b">
                <th scope="col" className="p-3">STT / Nội dung câu hỏi</th>
                <th scope="col" className="p-3">Chương</th>
                <th scope="col" className="p-3">Độ khó</th>
                <th scope="col" className="p-3">Trạng thái</th>
                <th scope="col" className="p-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredQuestions.map((question) => {
                const isEditing = editingQuestionId === question.id;

                return (
                  <tr key={question.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 max-w-md">
                      <div className="font-semibold text-slate-900 line-clamp-2">
                        {question.sourceNumber ? `Câu ${question.sourceNumber}: ` : ""}
                        {question.content}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {question.options.length} phương án ·{" "}
                        <span className="text-emerald-600 font-medium">
                          Đáp án đúng:{" "}
                          {question.options.find((o) => o.isCorrect)?.label ?? "Chưa chọn"}
                        </span>
                      </div>

                      {/* Inline Edit Panel when expanded */}
                      {isEditing && (
                        <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-indigo-100 text-slate-800 space-y-3">
                          <div className="flex justify-between items-center border-b pb-2">
                            <h4 className="font-bold text-indigo-900 text-xs uppercase tracking-wider">
                              Chỉnh sửa câu hỏi {question.sourceNumber ? `#${question.sourceNumber}` : ""}
                            </h4>
                            <button
                              type="button"
                              onClick={() => setEditingQuestionId(null)}
                              className="text-slate-400 hover:text-slate-600"
                              title="Đóng"
                            >
                              <X size={16} />
                            </button>
                          </div>

                          <form action={saveQuestionForm} className="space-y-3">
                            <input type="hidden" name="id" value={question.id} />
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <label className="block text-xs font-semibold text-slate-700">
                                Chương
                                <select
                                  name="chapter_id"
                                  required
                                  defaultValue={question.chapterId}
                                  className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-xs"
                                >
                                  {sortedChapters.map((ch) => (
                                    <option key={ch.id} value={ch.id}>
                                      Chương {ch.position}: {ch.title}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="block text-xs font-semibold text-slate-700">
                                Mức độ khó
                                <select
                                  name="difficulty"
                                  defaultValue={question.difficulty}
                                  className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-xs"
                                >
                                  <option value="1">Mức 1 · Nhận biết</option>
                                  <option value="2">Mức 2 · Thông hiểu</option>
                                  <option value="3">Mức 3 · Vận dụng</option>
                                  <option value="4">Mức 4 · Vận dụng cao</option>
                                </select>
                              </label>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <label className="block text-xs font-semibold text-slate-700">
                                Số nguồn
                                <input
                                  name="source_number"
                                  type="number"
                                  min={1}
                                  defaultValue={question.sourceNumber ?? ""}
                                  className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-xs"
                                />
                              </label>

                              <label className="block text-xs font-semibold text-slate-700">
                                Trạng thái
                                <select
                                  name="status"
                                  defaultValue={question.status}
                                  className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-xs"
                                >
                                  <option value="draft">Bản nháp</option>
                                  <option value="published">Công khai</option>
                                  <option value="archived">Lưu trữ</option>
                                </select>
                              </label>
                            </div>

                            <label className="block text-xs font-semibold text-slate-700">
                              Nội dung câu hỏi
                              <textarea
                                name="content"
                                rows={3}
                                required
                                defaultValue={question.content}
                                className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-xs"
                              />
                            </label>

                            <div className="space-y-2">
                              <span className="block text-xs font-semibold text-slate-700">4 Phương án A-D</span>
                              {(["A", "B", "C", "D"] as const).map((label) => (
                                <div key={label} className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-slate-500 w-4">{label}</span>
                                  <input
                                    name={`option_${label}`}
                                    required
                                    defaultValue={
                                      question.options.find((o) => o.label === label)?.content ?? ""
                                    }
                                    className="flex-1 rounded-lg border border-slate-300 p-1.5 text-xs"
                                  />
                                </div>
                              ))}
                            </div>

                            <label className="block text-xs font-semibold text-slate-700">
                              Đáp án đúng
                              <select
                                name="correct_label"
                                required
                                defaultValue={
                                  question.options.find((o) => o.isCorrect)?.label ?? ""
                                }
                                className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-xs"
                              >
                                {["A", "B", "C", "D"].map((label) => (
                                  <option key={label} value={label}>
                                    Phương án {label}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="block text-xs font-semibold text-slate-700">
                              Lời giải chi tiết
                              <textarea
                                name="explanation"
                                rows={3}
                                defaultValue={question.explanation}
                                className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-xs"
                              />
                            </label>

                            <div className="flex justify-end gap-2 pt-2">
                              <button
                                type="button"
                                onClick={() => setEditingQuestionId(null)}
                                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-200 rounded-lg hover:bg-slate-300"
                              >
                                Hủy
                              </button>
                              <button
                                type="submit"
                                className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                              >
                                Lưu thay đổi
                              </button>
                            </div>
                          </form>
                        </div>
                      )}
                    </td>

                    <td className="p-3 whitespace-nowrap text-xs text-slate-600">
                      {question.chapterTitle}
                    </td>

                    <td className="p-3 whitespace-nowrap text-xs font-medium text-slate-700">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border">
                        {difficultyLabels[question.difficulty] ?? `Mức ${question.difficulty}`}
                      </span>
                    </td>

                    <td className="p-3 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full ${
                          question.status === "published"
                            ? "bg-emerald-100 text-emerald-800"
                            : question.status === "archived"
                            ? "bg-slate-100 text-slate-600"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {question.status === "published"
                          ? "Công khai"
                          : question.status === "archived"
                          ? "Lưu trữ"
                          : "Bản nháp"}
                      </span>
                    </td>

                    <td className="p-3 whitespace-nowrap text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setEditingQuestionId(
                              editingQuestionId === question.id ? null : question.id
                            )
                          }
                          className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Chỉnh sửa"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingQuestion(question)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Xóa câu hỏi"
                        >
                          <Trash size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed text-slate-500">
          <p className="font-semibold text-sm">Chưa có câu hỏi nào trong chương này</p>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-rose-100 text-rose-600 rounded-xl">
                <WarningCircle size={24} weight="bold" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Xác nhận xóa câu hỏi</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Hành động này sẽ xóa vĩnh viễn câu hỏi và tất cả các phương án trả lời liên quan. Bạn có chắc chắn muốn xóa không?
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border text-xs text-slate-700 line-clamp-3">
              <strong>
                {deletingQuestion.sourceNumber ? `Câu ${deletingQuestion.sourceNumber}: ` : ""}
              </strong>
              {deletingQuestion.content}
            </div>

            <form
              action={async (formData) => {
                await deleteQuestionForm(formData);
                setDeletingQuestion(null);
              }}
              className="flex justify-end gap-2 pt-2"
            >
              <input type="hidden" name="id" value={deletingQuestion.id} />
              <button
                type="button"
                onClick={() => setDeletingQuestion(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors shadow-sm"
              >
                Xác nhận xóa
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import {
  CheckCircle,
  Copy,
  WarningCircle,
} from "@phosphor-icons/react";
import { useState } from "react";

import type { ImportPreview } from "@/src/features/admin/import-preview";

export function ImportPreviewPanel({
  preview,
  onConfirm,
  disabled = false,
  importedCount = null,
}: {
  preview: ImportPreview;
  onConfirm?: () => void;
  disabled?: boolean;
  importedCount?: number | null;
}) {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <section className="import-preview" aria-labelledby="import-preview-title">
      <header>
        <div>
          <p className="admin-kicker">BẢN XEM TRƯỚC</p>
          <h2 id="import-preview-title">Kiểm tra trước khi ghi dữ liệu</h2>
        </div>
        <span>{preview.parsedCount} câu đã đọc</span>
      </header>

      <div className="import-preview-counts" aria-label="Tổng hợp kết quả phân tích">
        <div className="is-valid">
          <CheckCircle size={22} weight="fill" aria-hidden="true" />
          <strong>{preview.validCount} câu hợp lệ</strong>
          <span>Sẵn sàng nhập</span>
        </div>
        <div className="is-issue">
          <WarningCircle size={22} weight="fill" aria-hidden="true" />
          <strong>{preview.issueCount} lỗi</strong>
          <span>Cần kiểm tra nguồn</span>
        </div>
        <div className="is-duplicate">
          <Copy size={22} weight="fill" aria-hidden="true" />
          <strong>{preview.duplicateCount} câu trùng</strong>
          <span>Sẽ bỏ qua</span>
        </div>
      </div>

      {preview.issues.length > 0 ? (
        <div className="import-issues">
          <h3>Chi tiết lỗi</h3>
          <ul>
            {preview.issues.map((issue, index) => (
              <li key={`${issue.code}-${issue.line}-${index}`}>
                <WarningCircle size={18} weight="duotone" aria-hidden="true" />
                <span>
                  {issue.line > 0 ? `Dòng ${issue.line}: ` : ""}
                  {issue.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {preview.duplicateSourceNumbers.length > 0 ? (
        <p className="import-duplicate-note">
          Số câu trùng: {preview.duplicateSourceNumbers.join(", ")}.
        </p>
      ) : null}

      <div className="import-confirmation">
        <label>
          <input
            type="checkbox"
            checked={confirmed}
            required
            disabled={importedCount !== null}
            onChange={(event) => setConfirmed(event.currentTarget.checked)}
          />
          <span>
            Tôi đã kiểm tra và xác nhận ghi {preview.validCount} câu hợp lệ vào
            ngân hàng câu hỏi.
          </span>
        </label>
        <button
          type="button"
          disabled={
            disabled ||
            importedCount !== null ||
            !confirmed ||
            !preview.confirmationRequired
          }
          onClick={onConfirm}
        >
          {importedCount === null
            ? `Nhập ${preview.validCount} câu`
            : `Đã nhập ${importedCount} câu`}
        </button>
      </div>
    </section>
  );
}

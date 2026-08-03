"use client";

import { ArrowRight, CircleNotch, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import type { StartMockExamResult } from "@/src/features/exam/actions";

type ExamLaunchFormProps = {
  action: () => Promise<StartMockExamResult>;
};

export function ExamLaunchForm({ action }: ExamLaunchFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    formRef.current?.setAttribute("data-hydrated", "true");
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pendingRef.current) return;

    pendingRef.current = true;
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
    }
    pendingRef.current = false;
    setPending(false);
  };

  return (
    <form
      ref={formRef}
      className="exam-launch-form"
      data-hydrated="false"
      onSubmit={(event) => void handleSubmit(event)}
    >
      {error ? (
        <div className="exam-launch-error" role="alert">
          <WarningCircle size={20} weight="fill" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}
      {pending ? (
        <span className="exam-launch-status" role="status" aria-live="polite">
          Đang tạo đề thi, vui lòng chờ.
        </span>
      ) : null}
      <button type="submit" disabled={pending}>
        {pending ? (
          <>
            Đang tạo đề…
            <CircleNotch
              className="exam-launch-spin"
              size={19}
              weight="bold"
              aria-hidden="true"
            />
          </>
        ) : error ? (
          <>
            Thử tạo đề lại <ArrowRight size={18} aria-hidden="true" />
          </>
        ) : (
          <>
            Bắt đầu thi thử <ArrowRight size={18} aria-hidden="true" />
          </>
        )}
      </button>
    </form>
  );
}

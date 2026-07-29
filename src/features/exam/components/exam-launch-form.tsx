"use client";

import { ArrowRight } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";

type ExamLaunchFormProps = {
  action: (formData: FormData) => void | Promise<void>;
};

export function ExamLaunchForm({ action }: ExamLaunchFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    formRef.current?.setAttribute("data-hydrated", "true");
  }, []);

  return (
    <form ref={formRef} action={action} data-hydrated="false">
      <button type="submit">
        Bắt đầu thi thử <ArrowRight size={18} />
      </button>
    </form>
  );
}

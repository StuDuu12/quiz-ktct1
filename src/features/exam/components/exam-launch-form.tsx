"use client";

import { ArrowRight } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type ExamLaunchFormProps = {
  action: () => Promise<string>;
};

export function ExamLaunchForm({ action }: ExamLaunchFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    formRef.current?.setAttribute("data-hydrated", "true");
  }, []);

  const handleSubmit = async () => {
    const url = await action();
    if (url) {
      router.push(url);
    }
  };

  return (
    <form ref={formRef} action={handleSubmit} data-hydrated="false">
      <button type="submit">
        Bắt đầu thi thử <ArrowRight size={18} />
      </button>
    </form>
  );
}

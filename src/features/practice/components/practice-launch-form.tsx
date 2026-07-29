"use client";

import { ArrowRight, BookOpen } from "@phosphor-icons/react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";

const subscribeToHydration = () => () => {};

function LaunchButton() {
  const { pending } = useFormStatus();
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );

  return (
    <button
      className="practice-launch-button"
      disabled={!hydrated || pending}
      type="submit"
    >
      {pending ? "Đang chuẩn bị…" : "Bắt đầu luyện tập"}
      <ArrowRight aria-hidden="true" size={18} />
    </button>
  );
}

export function PracticeLaunchForm({
  action,
  chapterTitle,
}: {
  action: () => Promise<never>;
  chapterTitle: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    formRef.current?.setAttribute("data-hydrated", "true");
  }, []);

  return (
    <main className="practice-launch-shell">
      <section className="practice-launch-card" aria-labelledby="practice-launch-title">
        <BookOpen aria-hidden="true" size={30} weight="duotone" />
        <p className="eyebrow">LUYỆN TẬP THEO CHƯƠNG</p>
        <h1 id="practice-launch-title">{chapterTitle}</h1>
        <p>
          Bắt đầu một lượt mới hoặc tiếp tục lượt đang làm. Lượt luyện tập chỉ
          được tạo sau khi bạn nhấn nút bên dưới.
        </p>
        <form ref={formRef} action={action} data-hydrated="false">
          <LaunchButton />
        </form>
      </section>
    </main>
  );
}

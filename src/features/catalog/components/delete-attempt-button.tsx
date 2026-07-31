'use client';
import { Trash } from '@phosphor-icons/react';
import { useTransition } from 'react';
import { deletePracticeAttempt } from '@/src/features/practice/actions';

export function DeleteAttemptButton({ attemptId }: { attemptId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      onClick={() => {
        if (confirm('Bạn có chắc chắn muốn xoá lượt làm này không?')) {
          startTransition(async () => {
            try {
              await deletePracticeAttempt(attemptId);
            } catch (error) {
              alert(error instanceof Error ? error.message : 'Có lỗi xảy ra');
            }
          });
        }
      }}
      disabled={isPending}
      className={`delete-btn ${isPending ? 'opacity-50' : ''}`}
      aria-label="Xoá lượt làm"
      title="Xoá lượt làm"
      style={{
        background: 'none',
        border: 'none',
        color: 'var(--color-muted)',
        cursor: 'pointer',
        padding: '0.4rem',
        borderRadius: '0.4rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Trash size={18} />
    </button>
  );
}

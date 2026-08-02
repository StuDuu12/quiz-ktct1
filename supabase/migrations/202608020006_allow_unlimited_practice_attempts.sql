-- Practice attempts intentionally have no deadline. The function introduced in
-- 202608020001 stores NULL in expires_at for practice, so the column must allow
-- NULL. Mock exams still receive a concrete deadline from start_attempt.
alter table public.attempts
  alter column expires_at drop not null;

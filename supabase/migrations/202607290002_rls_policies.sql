alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.course_instructors enable row level security;
alter table public.chapters enable row level security;
alter table public.questions enable row level security;
alter table public.question_options enable row level security;
alter table public.exam_configs enable row level security;
alter table public.attempts enable row level security;
alter table public.attempt_questions enable row level security;
alter table public.attempt_answers enable row level security;
alter table public.import_jobs enable row level security;
alter table public.audit_logs enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.courses, public.chapters, public.questions,
  public.exam_configs to anon, authenticated;
grant select (id, question_id, label, content)
  on public.question_options to anon, authenticated;
grant select, insert, update, delete
  on public.profiles, public.course_instructors, public.import_jobs
  to authenticated;
grant select on public.attempt_questions to authenticated;
grant insert, update, delete
  on public.courses, public.chapters, public.questions,
  public.question_options, public.exam_configs to authenticated;
grant select on public.attempts, public.audit_logs to authenticated;
grant select (
  id,
  attempt_question_id,
  selected_option_id,
  answered_at
) on public.attempt_answers to authenticated;
grant update (status) on public.attempts to authenticated;
grant insert (attempt_question_id, selected_option_id)
  on public.attempt_answers to authenticated;
grant update (selected_option_id)
  on public.attempt_answers to authenticated;
grant delete on public.attempt_answers to authenticated;

create policy "students read own profile"
on public.profiles for select
using (id = auth.uid() or public.current_role() = 'admin');

create policy "users update own profile"
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "admins manage profiles"
on public.profiles for all
using (public.current_role() = 'admin')
with check (public.current_role() = 'admin');

create policy "public reads published courses"
on public.courses for select
using (
  status = 'published'
  or public.can_manage_course(id)
);

create policy "admins manage courses"
on public.courses for all
using (public.current_role() = 'admin')
with check (public.current_role() = 'admin');

create policy "instructors manage assigned courses"
on public.courses for update
using (public.is_course_instructor(id))
with check (public.is_course_instructor(id));

create policy "admins manage course assignments"
on public.course_instructors for all
using (public.current_role() = 'admin')
with check (
  public.current_role() = 'admin'
  and exists (
    select 1
    from public.profiles p
    where p.id = instructor_id
      and p.role = 'instructor'
      and p.is_active
  )
);

create policy "instructors read own assignments"
on public.course_instructors for select
using (
  instructor_id = auth.uid()
  or public.current_role() = 'admin'
);

create policy "public reads published chapters"
on public.chapters for select
using (
  exists (
    select 1
    from public.courses c
    where c.id = course_id
      and c.status = 'published'
  )
  or public.can_manage_course(course_id)
);

create policy "course managers manage chapters"
on public.chapters for all
using (public.can_manage_course(course_id))
with check (public.can_manage_course(course_id));

create policy "public reads published questions"
on public.questions for select
using (
  (
    status = 'published'
    and exists (
      select 1
      from public.chapters ch
      join public.courses c on c.id = ch.course_id
      where ch.id = chapter_id
        and c.status = 'published'
    )
  )
  or exists (
    select 1
    from public.chapters ch
    where ch.id = chapter_id
      and public.can_manage_course(ch.course_id)
  )
);

create policy "course managers manage questions"
on public.questions for all
using (
  exists (
    select 1
    from public.chapters ch
    where ch.id = chapter_id
      and public.can_manage_course(ch.course_id)
  )
)
with check (
  exists (
    select 1
    from public.chapters ch
    where ch.id = chapter_id
      and public.can_manage_course(ch.course_id)
  )
);

create policy "public reads published question options"
on public.question_options for select
using (
  exists (
    select 1
    from public.questions q
    join public.chapters ch on ch.id = q.chapter_id
    join public.courses c on c.id = ch.course_id
    where q.id = question_id
      and q.status = 'published'
      and c.status = 'published'
  )
  or exists (
    select 1
    from public.questions q
    join public.chapters ch on ch.id = q.chapter_id
    where q.id = question_id
      and public.can_manage_course(ch.course_id)
  )
);

create policy "course managers manage question options"
on public.question_options for all
using (
  exists (
    select 1
    from public.questions q
    join public.chapters ch on ch.id = q.chapter_id
    where q.id = question_id
      and public.can_manage_course(ch.course_id)
  )
)
with check (
  exists (
    select 1
    from public.questions q
    join public.chapters ch on ch.id = q.chapter_id
    where q.id = question_id
      and public.can_manage_course(ch.course_id)
  )
);

create policy "public reads active exam configs"
on public.exam_configs for select
using (
  (
    is_active
    and exists (
      select 1
      from public.courses c
      where c.id = course_id
        and c.status = 'published'
    )
  )
  or public.can_manage_course(course_id)
);

create policy "course managers manage exam configs"
on public.exam_configs for all
using (public.can_manage_course(course_id))
with check (public.can_manage_course(course_id));

create policy "students own attempts"
on public.attempts for select
using (
  user_id = auth.uid()
  or public.can_manage_course(course_id)
);

create policy "students submit own attempts"
on public.attempts for update
using (
  user_id = auth.uid()
  or public.current_role() = 'admin'
)
with check (
  user_id = auth.uid()
  or public.current_role() = 'admin'
);

create policy "students read own attempt questions"
on public.attempt_questions for select
using (
  exists (
    select 1
    from public.attempts a
    where a.id = attempt_id
      and (
        a.user_id = auth.uid()
        or public.can_manage_course(a.course_id)
      )
  )
);

create policy "students read own answers"
on public.attempt_answers for select
using (
  exists (
    select 1
    from public.attempt_questions aq
    join public.attempts a on a.id = aq.attempt_id
    where aq.id = attempt_question_id
      and (
        a.user_id = auth.uid()
        or public.can_manage_course(a.course_id)
      )
  )
);

create policy "students manage own answers"
on public.attempt_answers for all
using (
  exists (
    select 1
    from public.attempt_questions aq
    join public.attempts a on a.id = aq.attempt_id
    where aq.id = attempt_question_id
      and a.status = 'in_progress'
      and (
        a.user_id = auth.uid()
        or public.current_role() = 'admin'
      )
  )
)
with check (
  exists (
    select 1
    from public.attempt_questions aq
    join public.attempts a on a.id = aq.attempt_id
    where aq.id = attempt_question_id
      and a.status = 'in_progress'
      and (
        a.user_id = auth.uid()
        or public.current_role() = 'admin'
      )
  )
);

create policy "course managers read import jobs"
on public.import_jobs for select
using (
  uploaded_by = auth.uid()
  or public.can_manage_course(course_id)
);

create policy "course managers create import jobs"
on public.import_jobs for insert
with check (
  uploaded_by = auth.uid()
  and public.can_manage_course(course_id)
);

create policy "course managers update import jobs"
on public.import_jobs for update
using (public.can_manage_course(course_id))
with check (public.can_manage_course(course_id));

create policy "admins read audit logs"
on public.audit_logs for select
using (public.current_role() = 'admin');

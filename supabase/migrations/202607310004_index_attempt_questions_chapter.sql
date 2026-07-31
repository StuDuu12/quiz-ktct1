-- Add an index for chapter_id JSON extraction to speed up history queries and practice resume
CREATE INDEX IF NOT EXISTS attempt_questions_chapter_uuid_idx 
ON public.attempt_questions USING btree 
(attempt_id, ((question_snapshot ->> 'chapter_id')::uuid));

CREATE INDEX IF NOT EXISTS attempt_questions_chapter_text_idx 
ON public.attempt_questions USING btree 
(attempt_id, (question_snapshot ->> 'chapter_id'));

-- Grant DELETE privilege on attempts to authenticated users
GRANT DELETE ON public.attempts TO authenticated;

-- Create policy to allow students to delete their own attempts
CREATE POLICY "students delete own attempts"
ON public.attempts FOR DELETE
USING (
  user_id = auth.uid()
  OR public.current_role() = 'admin'
);

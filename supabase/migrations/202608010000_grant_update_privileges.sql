-- Grant UPDATE privileges to authenticated users for tables that they need to update via RLS

GRANT UPDATE ON attempts TO authenticated;
GRANT UPDATE ON attempt_answers TO authenticated;

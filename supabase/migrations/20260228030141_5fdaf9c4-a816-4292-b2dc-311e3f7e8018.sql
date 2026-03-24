
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS module text,
  ADD COLUMN IF NOT EXISTS link_path text,
  ADD COLUMN IF NOT EXISTS metadata jsonb;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_read_created
  ON public.notifications (recipient_user_id, read_at, created_at DESC);

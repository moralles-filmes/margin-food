-- Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'MENTION',
  title text NOT NULL,
  message text NOT NULL DEFAULT '',
  entity_type text,
  entity_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

-- RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only read their own notifications
CREATE POLICY "Users read own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid());

-- Users can update (mark read) their own notifications
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (recipient_user_id = auth.uid());

-- Authenticated users can insert notifications (controlled by app logic)
CREATE POLICY "Authenticated insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX idx_notifications_recipient ON public.notifications(recipient_user_id, read_at);
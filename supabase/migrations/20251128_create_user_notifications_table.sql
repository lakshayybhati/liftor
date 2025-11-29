-- Create user_notifications table for custom backend-driven notifications
-- This table allows the backend (or admin) to send targeted notifications to users
-- The app will poll/subscribe to this table and deliver notifications via the NotificationService

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'general', -- 'general', 'promo', 'reminder', 'update', etc.
  data JSONB DEFAULT '{}',              -- Arbitrary data to pass to the app
  screen TEXT,                          -- Optional: screen to navigate to when tapped
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read BOOLEAN DEFAULT FALSE,           -- Whether user has read the notification in-app
  delivered BOOLEAN DEFAULT FALSE       -- Whether the OS notification was delivered
);

-- Index for fetching undelivered notifications for a user
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_undelivered 
  ON public.user_notifications(user_id, delivered) 
  WHERE delivered = FALSE;

-- Index for fetching notifications by user ordered by time
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created 
  ON public.user_notifications(user_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read their own notifications (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_notifications'
      AND policyname = 'Users can read own notifications'
  ) THEN
    CREATE POLICY "Users can read own notifications" ON public.user_notifications
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END
$$;

-- Policy: Users can update read/delivered status on their own notifications (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_notifications'
      AND policyname = 'Users can update own notifications'
  ) THEN
    CREATE POLICY "Users can update own notifications" ON public.user_notifications
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

-- Policy: Only service role can insert notifications (backend/admin only) (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_notifications'
      AND policyname = 'Service role can insert notifications'
  ) THEN
    CREATE POLICY "Service role can insert notifications" ON public.user_notifications
      FOR INSERT
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END
$$;

-- Enable realtime for this table so the app can subscribe to new notifications
-- Wrapped in exception handler in case table already in publication
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- already added
END
$$;

-- Grant permissions
REVOKE ALL ON public.user_notifications FROM anon, authenticated;
GRANT SELECT, UPDATE ON public.user_notifications TO authenticated;
GRANT ALL ON public.user_notifications TO service_role;

-- Comment explaining the table
COMMENT ON TABLE public.user_notifications IS 'Custom notifications sent from the backend to specific users. The app subscribes to this table and delivers notifications via the NotificationService.';





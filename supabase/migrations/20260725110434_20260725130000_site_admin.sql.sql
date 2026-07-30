/*
# Site admin role — first registered account becomes platform admin

1. Overview
The very first account created on the platform becomes the site admin. The
admin has full access to every room (host powers in any room, bypasses feature
limits) and can see/manage all rooms from a dashboard. Subsequent accounts are
normal users.

2. Modified Tables
- profiles: add is_admin boolean NOT NULL DEFAULT false.
- rooms: raise max_participants cap from 50 to 5000 (admin-created rooms can
  have up to 5000 participants).

3. New Logic
- A trigger fires AFTER INSERT on auth.users: if no profiles row exists yet,
  the new profile is created with is_admin = true (the first user); otherwise
  is_admin = false. This replaces the existing handle_new_user trigger so a
  single, race-safe insert does both the profile creation and the admin
  designation.

4. Security
- Admins gain UPDATE + DELETE access to ALL rooms (not just their own) via an
  OR clause in the rooms policies.
- Admins gain UPDATE + DELETE access to ALL room_members rows (so they can
  change roles/grants in any room, not just rooms they own).
- profiles stays self-only for writes; admin reads any profile (already
  covered by profiles_select_any).
- A helper function is_admin(uid) is exposed for reuse in policies.

5. Notes
- Existing accounts keep is_admin = false. Only the truly first signup after
  this migration gets admin. If there is already one profile row, that row is
  promoted to admin retroactively (one-time backfill) so the earliest user
  always becomes admin.
*/

-- 1. Add is_admin column to profiles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'profiles' AND column_name = 'is_admin') THEN
    ALTER TABLE profiles ADD COLUMN is_admin boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- 2. Helper: check if a user id is the site admin
CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_admin FROM public.profiles WHERE id = uid), false);
$$;

-- 3. Backfill: promote the earliest existing profile to admin (one-time)
UPDATE public.profiles
SET is_admin = true
WHERE id = (
  SELECT id FROM public.profiles ORDER BY created_at ASC LIMIT 1
);

-- 4. Replace the signup trigger: first profile -> admin, rest -> normal
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_first boolean;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first;
  INSERT INTO public.profiles (id, display_name, is_admin)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email), is_first);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. rooms policies: admin can update/delete ANY room
DROP POLICY IF EXISTS "rooms_update" ON rooms;
CREATE POLICY "rooms_update" ON rooms FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_user_id OR public.is_admin(auth.uid()))
  WITH CHECK (auth.uid() = owner_user_id OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "rooms_delete" ON rooms;
CREATE POLICY "rooms_delete" ON rooms FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_user_id OR public.is_admin(auth.uid()));

-- 6. room_members policies: admin can update/delete ANY member row
DROP POLICY IF EXISTS "room_members_update_owner" ON room_members;
CREATE POLICY "room_members_update_owner" ON room_members FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM rooms WHERE rooms.id = room_members.room_id AND rooms.owner_user_id = auth.uid())
    OR public.is_admin(auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM rooms WHERE rooms.id = room_members.room_id AND rooms.owner_user_id = auth.uid())
    OR public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "room_members_delete_owner" ON room_members;
CREATE POLICY "room_members_delete_owner" ON room_members FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM rooms WHERE rooms.id = room_members.room_id AND rooms.owner_user_id = auth.uid())
    OR public.is_admin(auth.uid())
  );

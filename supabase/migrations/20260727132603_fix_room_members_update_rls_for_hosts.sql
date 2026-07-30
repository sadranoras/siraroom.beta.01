-- Allow any room member with role='host' to update/delete other members in
-- the same room (not just the original room owner). Without this, a promoted
-- host's grant/role toggles in the participants panel silently fail RLS and
-- nothing persists — mirroring the rooms_update fix from the earlier migration.
DO $$ BEGIN
  DROP POLICY IF EXISTS room_members_update_owner ON room_members;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE POLICY room_members_update_owner ON room_members FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM rooms
      WHERE rooms.id = room_members.room_id
        AND rooms.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM room_members rm
      WHERE rm.room_id = room_members.room_id
        AND rm.user_id = auth.uid()
        AND rm.role = 'host'
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM rooms
      WHERE rooms.id = room_members.room_id
        AND rooms.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM room_members rm
      WHERE rm.room_id = room_members.room_id
        AND rm.user_id = auth.uid()
        AND rm.role = 'host'
    )
  );

DO $$ BEGIN
  DROP POLICY IF EXISTS room_members_delete_owner ON room_members;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE POLICY room_members_delete_owner ON room_members FOR DELETE
  TO authenticated
  USING (
    is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM rooms
      WHERE rooms.id = room_members.room_id
        AND rooms.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM room_members rm
      WHERE rm.room_id = room_members.room_id
        AND rm.user_id = auth.uid()
        AND rm.role = 'host'
    )
  );

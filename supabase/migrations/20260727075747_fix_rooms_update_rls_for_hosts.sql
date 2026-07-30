-- Allow any room member with role='host' to update the room (not just the
-- original owner). This is needed for file presentation sync: when a host
-- presents a file, they update rooms.presented_file_id, and all members
-- receive the change via postgres_changes. Without this, promoted hosts
-- can't update the room and the presentation never syncs.
DO $$ BEGIN
  DROP POLICY IF EXISTS rooms_update ON rooms;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE POLICY rooms_update ON rooms FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = owner_user_id
    OR is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM room_members
      WHERE room_members.room_id = rooms.id
        AND room_members.user_id = auth.uid()
        AND room_members.role = 'host'
    )
  )
  WITH CHECK (
    auth.uid() = owner_user_id
    OR is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM room_members
      WHERE room_members.room_id = rooms.id
        AND room_members.user_id = auth.uid()
        AND room_members.role = 'host'
    )
  );

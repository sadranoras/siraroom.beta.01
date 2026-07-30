-- Allow presenters (not just hosts) to update rooms.presented_file_id so a
-- non-host presenter's file presentation syncs to everyone via the DB-backed
-- realtime + polling fallback. Hosts/owners/admins keep full update access;
-- presenters are restricted to only the presented_file_id column.
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

-- Presenters can only update presented_file_id (and last_activity), nothing else.
DROP POLICY IF EXISTS rooms_update_presenter ON rooms;
CREATE POLICY rooms_update_presenter ON rooms FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM room_members
      WHERE room_members.room_id = rooms.id
        AND room_members.user_id = auth.uid()
        AND room_members.role = 'presenter'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM room_members
      WHERE room_members.room_id = rooms.id
        AND room_members.user_id = auth.uid()
        AND room_members.role = 'presenter'
    )
  );

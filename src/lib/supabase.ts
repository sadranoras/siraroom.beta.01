import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Supabase env vars missing — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env');
}

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true },
  realtime: { params: { eventsPerSecond: 100 } },
});

export type Room = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  host_name: string;
  owner_user_id: string | null;
  is_locked: boolean;
  password: string | null;
  max_participants: number;
  allow_chat: boolean;
  allow_file_sharing: boolean;
  allow_screen_share: boolean;
  allow_recording: boolean;
  allow_breakout: boolean;
  allow_whiteboard: boolean;
  allow_polls: boolean;
  allow_reactions: boolean;
  allow_hand_raise: boolean;
  allow_view_participants: boolean;
  is_active: boolean;
  presented_file_id: string | null;
  created_at: string;
  last_activity: string;
};

export type Message = {
  id: string;
  room_id: string;
  sender_name: string;
  sender_user_id: string | null;
  sender_avatar: string | null;
  content: string;
  is_system: boolean;
  created_at: string;
};

export type Poll = {
  id: string;
  room_id: string;
  question: string;
  options: string[];
  is_open: boolean;
  created_by: string;
  created_at: string;
};

export type PollVote = {
  id: string;
  poll_id: string;
  voter_name: string;
  option_index: number;
  created_at: string;
};

export type Recording = {
  id: string;
  room_id: string;
  title: string;
  duration_seconds: number;
  url: string;
  thumbnail: string | null;
  file_size_bytes: number;
  recorded_by: string;
  created_at: string;
};

export type ScheduledMeeting = {
  id: string;
  title: string;
  agenda: string | null;
  room_slug: string;
  host_name: string;
  owner_user_id: string | null;
  start_at: string;
  duration_minutes: number;
  created_at: string;
};

export type SharedFile = {
  id: string;
  room_id: string;
  name: string;
  url: string;
  size_bytes: number;
  mime_type: string;
  shared_by: string;
  created_at: string;
  allow_download: boolean;
};

export type RoomSettings = Pick<
  Room,
  | 'allow_chat'
  | 'allow_file_sharing'
  | 'allow_screen_share'
  | 'allow_recording'
  | 'allow_breakout'
  | 'allow_whiteboard'
  | 'allow_polls'
  | 'allow_reactions'
  | 'allow_hand_raise'
  | 'allow_view_participants'
>;

export type Profile = {
  id: string;
  display_name: string;
  avatar_color: string | null;
  is_admin: boolean;
  created_at: string;
};

export type RoomMember = {
  id: string;
  room_id: string;
  user_id: string;
  role: 'host' | 'presenter' | 'viewer';
  can_use_mic: boolean;
  can_use_cam: boolean;
  can_draw_board: boolean;
  can_share_screen: boolean;
  can_share_file: boolean;
  joined_at: string;
  last_heartbeat: string | null;
};

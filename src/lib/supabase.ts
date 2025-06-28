import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types
export interface Room {
  id: string;
  topic: string;
  status: 'waiting' | 'active' | 'ended';
  organiser_id: string;
  anchor_limit: number;
  passcode?: string;
  created_at: string;
  started_at?: string;
  ended_at?: string;
  side_a_label: string;
  side_b_label: string;
}

export interface Participant {
  id: string;
  room_id: string;
  user_id: string;
  role: 'organiser' | 'anchor' | 'audience';
  joined_at: string;
}

export interface Message {
  id: string;
  room_id: string;
  user_id: string;
  content: string;
  side?: 'side_a' | 'side_b';
  timestamp: string;
}

export interface Vote {
  id: string;
  room_id: string;
  user_id: string;
  voted_side: 'side_a' | 'side_b';
  timestamp: string;
}

export interface Comment {
  id: string;
  room_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

export interface Summary {
  id: string;
  room_id: string;
  summary_text: string;
  generated_at: string;
}
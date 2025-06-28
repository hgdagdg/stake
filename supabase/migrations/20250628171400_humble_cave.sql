/*
  # Create Stake Debate Platform Schema

  1. New Tables
    - `rooms` - Debate rooms with topic, status, and settings
    - `participants` - Users in rooms with roles and permissions
    - `messages` - Real-time chat messages in debates
    - `votes` - User votes for debate sides
    - `comments` - Comments on archived debates
    - `summaries` - AI-generated debate summaries

  2. Security
    - Enable RLS on all tables
    - Add policies for proper access control based on user roles
    - Ensure data integrity with foreign key constraints

  3. Features
    - Real-time subscriptions for live debate functionality
    - Proper indexing for performance
    - Timestamp tracking for all activities
*/

-- Create custom types
CREATE TYPE room_status AS ENUM ('waiting', 'active', 'ended');
CREATE TYPE participant_role AS ENUM ('organiser', 'anchor', 'audience');
CREATE TYPE vote_side AS ENUM ('side_a', 'side_b');

-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  status room_status DEFAULT 'waiting',
  organiser_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  anchor_limit integer DEFAULT 2 CHECK (anchor_limit >= 1 AND anchor_limit <= 10),
  passcode text,
  created_at timestamptz DEFAULT now(),
  started_at timestamptz,
  ended_at timestamptz,
  side_a_label text DEFAULT 'For',
  side_b_label text DEFAULT 'Against'
);

-- Participants table
CREATE TABLE IF NOT EXISTS participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role participant_role NOT NULL,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(room_id, user_id)
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  side vote_side,
  timestamp timestamptz DEFAULT now()
);

-- Votes table
CREATE TABLE IF NOT EXISTS votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  voted_side vote_side NOT NULL,
  timestamp timestamptz DEFAULT now(),
  UNIQUE(room_id, user_id)
);

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Summaries table
CREATE TABLE IF NOT EXISTS summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
  summary_text text NOT NULL,
  generated_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_created_at ON rooms(created_at);
CREATE INDEX IF NOT EXISTS idx_participants_room_id ON participants(room_id);
CREATE INDEX IF NOT EXISTS idx_participants_user_id ON participants(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_votes_room_id ON votes(room_id);
CREATE INDEX IF NOT EXISTS idx_comments_room_id ON comments(room_id);

-- Enable Row Level Security
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE summaries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for rooms
CREATE POLICY "Anyone can view active rooms"
  ON rooms FOR SELECT
  USING (status IN ('active', 'ended'));

CREATE POLICY "Organisers can create rooms"
  ON rooms FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = organiser_id);

CREATE POLICY "Organisers can update their rooms"
  ON rooms FOR UPDATE
  TO authenticated
  USING (auth.uid() = organiser_id);

-- RLS Policies for participants
CREATE POLICY "Anyone can view participants in active rooms"
  ON participants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rooms 
      WHERE rooms.id = participants.room_id 
      AND rooms.status IN ('active', 'ended')
    )
  );

CREATE POLICY "Users can join rooms as participants"
  ON participants FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for messages
CREATE POLICY "Anyone can view messages in active rooms"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rooms 
      WHERE rooms.id = messages.room_id 
      AND rooms.status IN ('active', 'ended')
    )
  );

CREATE POLICY "Participants can send messages"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM participants 
      WHERE participants.room_id = messages.room_id 
      AND participants.user_id = auth.uid()
    )
  );

-- RLS Policies for votes
CREATE POLICY "Anyone can view votes in active rooms"
  ON votes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rooms 
      WHERE rooms.id = votes.room_id 
      AND rooms.status IN ('active', 'ended')
    )
  );

CREATE POLICY "Users can vote once per room"
  ON votes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own votes"
  ON votes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for comments
CREATE POLICY "Anyone can view comments on ended debates"
  ON comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rooms 
      WHERE rooms.id = comments.room_id 
      AND rooms.status = 'ended'
    )
  );

CREATE POLICY "Authenticated users can comment on ended debates"
  ON comments FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM rooms 
      WHERE rooms.id = comments.room_id 
      AND rooms.status = 'ended'
    )
  );

-- RLS Policies for summaries
CREATE POLICY "Anyone can view summaries"
  ON summaries FOR SELECT
  USING (true);

CREATE POLICY "System can create summaries"
  ON summaries FOR INSERT
  WITH CHECK (true);
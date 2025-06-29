/*
  # Add presence tracking to participants

  1. Changes
    - Add last_seen column to participants table for tracking organiser presence
    - Add index for performance

  This allows us to detect when organisers leave and automatically end debates.
*/

-- Add last_seen column to participants table
ALTER TABLE participants ADD COLUMN last_seen timestamptz;

-- Create index for efficient presence queries
CREATE INDEX IF NOT EXISTS idx_participants_last_seen ON participants(room_id, role, last_seen);

/*
  # Add side assignment for participants

  1. Changes
    - Add side column to participants table to assign anchors to debate sides
    - Update existing anchors to have sides assigned
    - Add constraint to ensure anchors have sides assigned
    - Add index for efficient side-based queries

  This allows proper side assignment for anchors in debates.
*/

-- Add side column to participants table (only if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'participants' AND column_name = 'side') THEN
        ALTER TABLE participants ADD COLUMN side vote_side;
    END IF;
END $$;

-- Update existing anchors to assign them to sides
-- First, we'll use a simpler approach with a sequence
DO $$
DECLARE
    anchor_record RECORD;
    counter INTEGER := 0;
BEGIN
    FOR anchor_record IN 
        SELECT id FROM participants 
        WHERE role = 'anchor' 
        ORDER BY room_id, joined_at
    LOOP
        counter := counter + 1;
        UPDATE participants 
        SET side = CASE 
            WHEN counter % 2 = 1 THEN 'side_a'::vote_side
            ELSE 'side_b'::vote_side
        END
        WHERE id = anchor_record.id;
    END LOOP;
END $$;

-- Add constraint to ensure anchors have sides (but allow null for organiser/audience)
ALTER TABLE participants ADD CONSTRAINT check_anchor_side 
  CHECK (
    (role = 'anchor' AND side IS NOT NULL) OR 
    (role IN ('organiser', 'audience') AND side IS NULL)
  );

-- Create index for efficient side queries
CREATE INDEX IF NOT EXISTS idx_participants_side ON participants(room_id, side);

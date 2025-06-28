/*
  # Fix RLS policy for rooms table INSERT operation

  1. Policy Updates
    - Update the INSERT policy for rooms table to use correct auth.uid() function
    - Ensure authenticated users can create rooms where they are the organiser

  2. Security
    - Maintains security by ensuring users can only create rooms where they are the organiser
    - Uses proper Supabase auth function reference
*/

-- Drop the existing INSERT policy
DROP POLICY IF EXISTS "Organisers can create rooms" ON rooms;

-- Create the corrected INSERT policy
CREATE POLICY "Organisers can create rooms"
  ON rooms
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = organiser_id);
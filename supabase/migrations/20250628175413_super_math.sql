/*
  # Fix RLS policy for rooms table

  1. Security Policy Update
    - Drop the existing INSERT policy for rooms table
    - Create a new INSERT policy that uses the correct auth.uid() function
    - Ensure authenticated users can create rooms where they are the organiser

  2. Changes
    - Replace uid() with auth.uid() in the policy condition
    - This allows authenticated users to create rooms properly
*/

-- Drop the existing INSERT policy
DROP POLICY IF EXISTS "Allow authenticated users to create rooms" ON rooms;

-- Create the corrected INSERT policy
CREATE POLICY "Allow authenticated users to create rooms"
  ON rooms
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = organiser_id);
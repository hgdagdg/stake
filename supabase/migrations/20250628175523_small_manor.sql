/*
  # Fix RLS policy for rooms table

  1. Security Changes
    - Drop the existing INSERT policy that uses incorrect `uid()` function
    - Create new INSERT policy using correct `auth.uid()` function
    - Ensure authenticated users can create rooms where they are the organiser

  This fixes the RLS policy violation when creating new rooms.
*/

-- Drop the existing policy that uses incorrect uid() function
DROP POLICY IF EXISTS "Allow authenticated users to create rooms" ON rooms;

-- Create the correct policy using auth.uid()
CREATE POLICY "Allow authenticated users to create rooms" 
  ON rooms 
  FOR INSERT 
  TO authenticated
  WITH CHECK (auth.uid() = organiser_id);
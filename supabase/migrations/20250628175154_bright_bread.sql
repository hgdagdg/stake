/*
  # Fix RLS policy for rooms table insertion

  1. Security Updates
    - Drop existing INSERT policy that may be causing issues
    - Create new INSERT policy that properly handles authenticated user insertion
    - Ensure the policy correctly validates that the authenticated user matches the organiser_id

  2. Policy Details
    - Allow authenticated users to insert rooms where they are the organiser
    - Use auth.uid() to get the current authenticated user's ID
    - Ensure the organiser_id in the new row matches the authenticated user
*/

-- Drop the existing INSERT policy if it exists
DROP POLICY IF EXISTS "Organisers can create rooms" ON public.rooms;

-- Create a new INSERT policy that allows authenticated users to create rooms
CREATE POLICY "Allow authenticated users to create rooms"
  ON public.rooms
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = organiser_id);
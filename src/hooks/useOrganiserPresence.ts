import { useEffect, useRef } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '../lib/supabase';

interface UseOrganiserPresenceProps {
  roomId: string;
  isOrganiser: boolean;
  onOrganiserLeft?: () => void;
}

export function useOrganiserPresence({ roomId, isOrganiser, onOrganiserLeft }: UseOrganiserPresenceProps) {
  const { user } = useAuth();
  const heartbeatInterval = useRef<NodeJS.Timeout | null>(null);
  const lastHeartbeat = useRef<Date>(new Date());

  // Update presence heartbeat
  const updatePresence = async () => {
    if (!user || !isOrganiser) return;

    try {
      await supabase
        .from('participants')
        .update({ 
          last_seen: new Date().toISOString() 
        })
        .eq('room_id', roomId)
        .eq('user_id', user.id)
        .eq('role', 'organiser');

      lastHeartbeat.current = new Date();
    } catch (error) {
      console.error('Failed to update presence:', error);
    }
  };

  // Check if organiser is still present
  const checkOrganiserPresence = async () => {
    if (isOrganiser) return; // Don't check if current user is organiser

    try {
      const { data, error } = await supabase
        .from('participants')
        .select('last_seen')
        .eq('room_id', roomId)
        .eq('role', 'organiser')
        .single();

      if (error || !data) return;

      const lastSeen = new Date(data.last_seen || 0);
      const now = new Date();
      const timeDiff = now.getTime() - lastSeen.getTime();

      // If organiser hasn't been seen for more than 2 minutes, consider them gone
      if (timeDiff > 2 * 60 * 1000) {
        onOrganiserLeft?.();
      }
    } catch (error) {
      console.error('Failed to check organiser presence:', error);
    }
  };

  useEffect(() => {
    if (!user) return;

    // Set up heartbeat for organiser
    if (isOrganiser) {
      updatePresence();
      heartbeatInterval.current = setInterval(updatePresence, 30000); // Every 30 seconds
    } else {
      // Check organiser presence for non-organisers
      const checkInterval = setInterval(checkOrganiserPresence, 60000); // Every minute
      return () => clearInterval(checkInterval);
    }

    // Cleanup on unmount or when user leaves
    const handleBeforeUnload = () => {
      if (isOrganiser) {
        // Mark as offline when leaving
        navigator.sendBeacon(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/participants?room_id=eq.${roomId}&user_id=eq.${user.id}&role=eq.organiser`,
          JSON.stringify({ last_seen: null })
        );
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      if (heartbeatInterval.current) {
        clearInterval(heartbeatInterval.current);
      }
      window.removeEventListener('beforeunload', handleBeforeUnload);
      
      // Mark as offline when component unmounts
      if (isOrganiser) {
        supabase
          .from('participants')
          .update({ last_seen: null })
          .eq('room_id', roomId)
          .eq('user_id', user.id)
          .eq('role', 'organiser');
      }
    };
  }, [user, roomId, isOrganiser]);
}

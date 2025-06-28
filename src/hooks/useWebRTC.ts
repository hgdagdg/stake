import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

interface SignalingMessage {
  id: string;
  room_id: string;
  from_user: string;
  to_user: string;
  type: 'offer' | 'answer' | 'ice-candidate';
  data: any;
  timestamp: string;
}

export function useWebRTC(roomId: string, userId: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectedPeers, setConnectedPeers] = useState<string[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isMuted, setIsMuted] = useState(false);
  
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const signalingSubscription = useRef<any>(null);

  // ICE servers configuration - improved with multiple servers and TURN
  const iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.stunprotocol.org:3478' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ];

  const createPeerConnection = useCallback((targetUserId: string) => {
    const pc = new RTCPeerConnection({ iceServers });
    
    // Handle ICE candidates
    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await sendSignalingMessage(targetUserId, 'ice-candidate', event.candidate);
      }
    };

    // Handle remote stream
    pc.ontrack = (event) => {
      console.log('Received remote stream from:', targetUserId);
      setRemoteStreams(prev => {
        const newMap = new Map(prev);
        newMap.set(targetUserId, event.streams[0]);
        return newMap;
      });
      
      setConnectedPeers(prev => 
        prev.includes(targetUserId) ? prev : [...prev, targetUserId]
      );
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${targetUserId}:`, pc.connectionState);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setConnectedPeers(prev => prev.filter(id => id !== targetUserId));
        setRemoteStreams(prev => {
          const newMap = new Map(prev);
          newMap.delete(targetUserId);
          return newMap;
        });
      }
    };

    // Add local stream if available
    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
    }

    peerConnections.current.set(targetUserId, pc);
    return pc;
  }, [localStream, roomId]);

  const sendSignalingMessage = async (toUser: string, type: string, data: any) => {
    try {
      await supabase.from('signaling_messages').insert({
        room_id: roomId,
        from_user: userId,
        to_user: toUser,
        type,
        data
      });
    } catch (error) {
      console.error('Failed to send signaling message:', error);
    }
  };

  const handleSignalingMessage = useCallback(async (message: SignalingMessage) => {
    const { from_user: fromUser, type, data } = message;
    
    let pc = peerConnections.current.get(fromUser);
    if (!pc) {
      pc = createPeerConnection(fromUser);
    }

    try {
      switch (type) {
        case 'offer':
          await pc.setRemoteDescription(new RTCSessionDescription(data));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignalingMessage(fromUser, 'answer', answer);
          break;

        case 'answer':
          await pc.setRemoteDescription(new RTCSessionDescription(data));
          break;

        case 'ice-candidate':
          await pc.addIceCandidate(new RTCIceCandidate(data));
          break;
      }
    } catch (error) {
      console.error('Error handling signaling message:', error);
    }
  }, [createPeerConnection, roomId, userId]);

  const startCall = async (anchorUsers: string[]) => {
    try {
      setIsConnecting(true);
      
      // Get local media stream
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true, 
          noiseSuppression: true,
          autoGainControl: true 
        } 
      });
      
      setLocalStream(stream);

      // Set up signaling subscription
      if (signalingSubscription.current) {
        signalingSubscription.current.unsubscribe();
      }

      signalingSubscription.current = supabase
        .channel('signaling')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'signaling_messages',
          filter: `room_id=eq.${roomId} and to_user=eq.${userId}`
        }, (payload) => {
          handleSignalingMessage(payload.new as SignalingMessage);
        })
        .subscribe();

      // Create peer connections and send offers to other anchors
      const otherAnchors = anchorUsers.filter(id => id !== userId);
      
      for (const anchorId of otherAnchors) {
        const pc = createPeerConnection(anchorId);
        
        // Add local stream
        stream.getTracks().forEach(track => {
          pc.addTrack(track, stream);
        });

        // Create and send offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignalingMessage(anchorId, 'offer', offer);
      }

      setIsConnected(true);
      setIsConnecting(false);
    } catch (error) {
      console.error('Failed to start call:', error);
      setIsConnecting(false);
      throw error;
    }
  };

  const endCall = useCallback(() => {
    // Stop local stream
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }

    // Close all peer connections
    peerConnections.current.forEach(pc => {
      pc.close();
    });
    peerConnections.current.clear();

    // Unsubscribe from signaling
    if (signalingSubscription.current) {
      signalingSubscription.current.unsubscribe();
      signalingSubscription.current = null;
    }

    // Clean up signaling messages
    supabase
      .from('signaling_messages')
      .delete()
      .eq('room_id', roomId)
      .eq('from_user', userId);

    setIsConnected(false);
    setIsConnecting(false);
    setConnectedPeers([]);
    setRemoteStreams(new Map());
    setIsMuted(false);
  }, [localStream, roomId, userId]);

  const toggleMute = useCallback(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  }, [localStream, isMuted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      endCall();
    };
  }, [endCall]);

  return {
    isConnected,
    isConnecting,
    connectedPeers,
    localStream,
    remoteStreams,
    isMuted,
    startCall,
    endCall,
    toggleMute
  };
}

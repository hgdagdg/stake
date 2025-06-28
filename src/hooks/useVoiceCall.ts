import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'join' | 'leave';
  data: any;
  from: string;
  to?: string;
  room_id: string;
}

interface PeerConnection {
  id: string;
  connection: RTCPeerConnection;
  stream?: MediaStream;
  iceCandidatesQueue: RTCIceCandidateInit[];
}

export function useVoiceCall(roomId: string, userId: string, isAnchor: boolean = false) {
  const [isInCall, setIsInCall] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<Map<string, PeerConnection>>(new Map());
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string>('');
  
  const localAudioRef = useRef<HTMLAudioElement>(null);
  const remoteAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const signalingChannel = useRef<any>(null);

  // WebRTC configuration with multiple STUN servers and free TURN servers
  const rtcConfiguration: RTCConfiguration = {
    iceServers: [
      // Multiple STUN servers for better reliability
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      // Additional public STUN servers
      { urls: 'stun:stun.stunprotocol.org:3478' },
      { urls: 'stun:stun.voiparound.com' },
      { urls: 'stun:stun.voipbuster.com' },
      // Free TURN servers (limited but may help)
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle' as RTCBundlePolicy,
    rtcpMuxPolicy: 'require' as RTCRtcpMuxPolicy
  };

  // Send signaling message
  const sendSignalingMessage = useCallback((message: Omit<SignalingMessage, 'from' | 'room_id'>) => {
    if (!signalingChannel.current) return;

    signalingChannel.current.send({
      type: 'broadcast',
      event: 'signaling',
      payload: {
        ...message,
        from: userId,
        room_id: roomId,
      },
    });
  }, [roomId, userId]);

  // Handle peer leaving
  const handlePeerLeave = useCallback((peerId: string) => {
    setPeers(prev => {
      const updated = new Map(prev);
      const peer = updated.get(peerId);
      if (peer) {
        peer.connection.close();
        updated.delete(peerId);
      }
      return updated;
    });

    // Clean up audio element
    const audioElement = remoteAudiosRef.current.get(peerId);
    if (audioElement) {
      audioElement.srcObject = null;
      // Remove from DOM
      if (audioElement.parentNode) {
        audioElement.parentNode.removeChild(audioElement);
      }
      remoteAudiosRef.current.delete(peerId);
      console.log(`Cleaned up audio element for peer ${peerId}`);
    }
  }, []);

  // Create peer connection
  const createPeerConnection = useCallback((peerId: string): RTCPeerConnection => {
    const connection = new RTCPeerConnection(rtcConfiguration);

    // Add local stream to connection
    if (localStream) {
      localStream.getTracks().forEach(track => {
        connection.addTrack(track, localStream);
      });
    }

    // Handle incoming remote stream
    connection.ontrack = (event) => {
      const [remoteStream] = event.streams;
      console.log(`Received remote stream from peer ${peerId}:`, remoteStream);
      
      // Create or get audio element for this peer
      let audioElement = remoteAudiosRef.current.get(peerId);
      if (!audioElement) {
        audioElement = new Audio();
        audioElement.autoplay = true;
        audioElement.volume = 1.0;
        audioElement.controls = false; // Hide controls but keep audio functional
        audioElement.style.display = 'none'; // Hide but keep in DOM
        
        // Important: Set up proper event handlers
        audioElement.onloadeddata = () => {
          console.log(`Audio loaded for peer ${peerId}`);
          // Try to play once loaded
          audioElement!.play().catch(err => {
            console.warn(`Initial autoplay failed for peer ${peerId}:`, err);
            // This is expected due to browser autoplay policies
          });
        };
        
        audioElement.onplay = () => {
          console.log(`Audio started playing for peer ${peerId}`);
        };
        
        audioElement.onerror = (err) => {
          console.error(`Audio error for peer ${peerId}:`, err);
        };
        
        // Add to DOM with a specific class for identification
        audioElement.className = `remote-audio-${peerId}`;
        document.body.appendChild(audioElement);
        remoteAudiosRef.current.set(peerId, audioElement);
        console.log(`Created audio element for peer ${peerId}`);
      }
      
      audioElement.srcObject = remoteStream;
      
      // For audience members, automatically try to play once stream is available
      if (!isAnchor) {
        // Small delay to ensure stream is fully ready
        setTimeout(() => {
          audioElement!.play().catch(err => {
            console.warn(`Autoplay failed for peer ${peerId}, user interaction may be required:`, err);
          });
        }, 100);
      }
      
      // Update peer with stream
      setPeers(prev => {
        const updated = new Map(prev);
        const peer = updated.get(peerId);
        if (peer) {
          peer.stream = remoteStream;
          updated.set(peerId, peer);
        }
        return updated;
      });
    };

    // Handle ICE candidates
    connection.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignalingMessage({
          type: 'ice-candidate',
          data: event.candidate,
          to: peerId,
        });
      }
    };

    // Handle connection state changes
    connection.onconnectionstatechange = () => {
      console.log(`Peer ${peerId} connection state:`, connection.connectionState);
      
      if (connection.connectionState === 'connected') {
        console.log(`Successfully connected to peer ${peerId}`);
      } else if (connection.connectionState === 'failed') {
        console.error(`Connection failed with peer ${peerId}. ICE gathering state:`, connection.iceGatheringState);
        console.error(`Connection failed with peer ${peerId}. ICE connection state:`, connection.iceConnectionState);
        // Try to restart ICE if possible
        if (connection.restartIce) {
          console.log(`Attempting ICE restart for peer ${peerId}`);
          connection.restartIce();
        } else {
          handlePeerLeave(peerId);
        }
      } else if (connection.connectionState === 'disconnected') {
        console.warn(`Disconnected from peer ${peerId}, will try to reconnect...`);
        // Don't immediately remove, give some time for reconnection
        setTimeout(() => {
          if (connection.connectionState === 'disconnected') {
            console.log(`Peer ${peerId} still disconnected after timeout, removing...`);
            handlePeerLeave(peerId);
          }
        }, 5000);
      }
    };

    // Handle ICE connection state changes for more detailed logging
    connection.oniceconnectionstatechange = () => {
      console.log(`Peer ${peerId} ICE connection state:`, connection.iceConnectionState);
      
      if (connection.iceConnectionState === 'failed') {
        console.error(`ICE connection failed with peer ${peerId}`);
        // Try to restart ICE
        if (connection.restartIce) {
          console.log(`Attempting ICE restart for failed connection to peer ${peerId}`);
          connection.restartIce();
        }
      }
    };

    // Handle ICE gathering state changes
    connection.onicegatheringstatechange = () => {
      console.log(`Peer ${peerId} ICE gathering state:`, connection.iceGatheringState);
    };

    return connection;
  }, [localStream, sendSignalingMessage, handlePeerLeave]);

  // Handle peer joining
  const handlePeerJoin = useCallback(async (peerId: string, retryCount = 0) => {
    if (peers.has(peerId)) return;

    const connection = createPeerConnection(peerId);
    const newPeer: PeerConnection = { id: peerId, connection, iceCandidatesQueue: [] };
    
    setPeers(prev => new Map(prev).set(peerId, newPeer));

    // Only anchors create offers (they initiate connections)
    // Audience members just wait for offers from anchors
    if (isAnchor && localStream) {
      try {
        // Wait for ICE gathering to complete before creating offer
        const offer = await connection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: false
        });
        await connection.setLocalDescription(offer);
        
        // Wait for ICE candidates to be gathered
        if (connection.iceGatheringState === 'gathering') {
          await new Promise((resolve) => {
            const checkGathering = () => {
              if (connection.iceGatheringState === 'complete') {
                resolve(void 0);
              } else {
                setTimeout(checkGathering, 100);
              }
            };
            // Set a timeout to avoid waiting forever
            setTimeout(() => resolve(void 0), 3000);
            checkGathering();
          });
        }
        
        console.log(`Sending offer to peer ${peerId} (attempt ${retryCount + 1})`);
        sendSignalingMessage({
          type: 'offer',
          data: connection.localDescription,
          to: peerId,
        });
      } catch (err) {
        console.error(`Error creating offer for peer ${peerId} (attempt ${retryCount + 1}):`, err);
        
        // Retry up to 3 times
        if (retryCount < 2) {
          console.log(`Retrying offer creation for peer ${peerId}...`);
          handlePeerLeave(peerId);
          setTimeout(() => handlePeerJoin(peerId, retryCount + 1), 1000);
        } else {
          console.error(`Failed to create offer for peer ${peerId} after 3 attempts`);
          handlePeerLeave(peerId);
        }
      }
    }
  }, [peers, isAnchor, localStream, createPeerConnection, sendSignalingMessage, handlePeerLeave]);

  // Handle incoming offer
  const handleOffer = useCallback(async (peerId: string, offer: RTCSessionDescriptionInit) => {
    if (peers.has(peerId)) {
      console.log(`Peer ${peerId} already exists, ignoring duplicate offer`);
      return;
    }

    console.log(`Handling offer from peer ${peerId}`);
    const connection = createPeerConnection(peerId);
    const newPeer: PeerConnection = { id: peerId, connection, iceCandidatesQueue: [] };
    
    setPeers(prev => new Map(prev).set(peerId, newPeer));

    try {
      await connection.setRemoteDescription(offer);
      console.log(`Set remote description for peer ${peerId}`);
      
      // Process any queued ICE candidates now that remote description is set
      while (newPeer.iceCandidatesQueue.length > 0) {
        const candidate = newPeer.iceCandidatesQueue.shift();
        if (candidate) {
          try {
            await connection.addIceCandidate(candidate);
            console.log(`Added queued ICE candidate for peer ${peerId}`);
          } catch (err) {
            console.error(`Error adding queued ICE candidate for peer ${peerId}:`, err);
          }
        }
      }
      
      const answer = await connection.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });
      await connection.setLocalDescription(answer);
      
      // Wait for ICE candidates to be gathered
      if (connection.iceGatheringState === 'gathering') {
        await new Promise((resolve) => {
          const checkGathering = () => {
            if (connection.iceGatheringState === 'complete') {
              resolve(void 0);
            } else {
              setTimeout(checkGathering, 100);
            }
          };
          setTimeout(() => resolve(void 0), 3000);
          checkGathering();
        });
      }
      
      console.log(`Sending answer to peer ${peerId}`);
      sendSignalingMessage({
        type: 'answer',
        data: connection.localDescription,
        to: peerId,
      });
    } catch (err) {
      console.error(`Error handling offer from peer ${peerId}:`, err);
      handlePeerLeave(peerId);
    }
  }, [peers, createPeerConnection, sendSignalingMessage, handlePeerLeave]);

  // Handle incoming answer
  const handleAnswer = useCallback(async (peerId: string, answer: RTCSessionDescriptionInit) => {
    const peer = peers.get(peerId);
    if (!peer) {
      console.warn(`Received answer from unknown peer ${peerId}`);
      return;
    }

    console.log(`Handling answer from peer ${peerId}`);
    try {
      await peer.connection.setRemoteDescription(answer);
      console.log(`Set remote description from answer for peer ${peerId}`);
      
      // Process any queued ICE candidates now that remote description is set
      while (peer.iceCandidatesQueue.length > 0) {
        const candidate = peer.iceCandidatesQueue.shift();
        if (candidate) {
          try {
            await peer.connection.addIceCandidate(candidate);
            console.log(`Added queued ICE candidate for peer ${peerId}`);
          } catch (err) {
            console.error(`Error adding queued ICE candidate for peer ${peerId}:`, err);
          }
        }
      }
    } catch (err) {
      console.error(`Error handling answer from peer ${peerId}:`, err);
      handlePeerLeave(peerId);
    }
  }, [peers, handlePeerLeave]);

  // Handle ICE candidate
  const handleIceCandidate = useCallback(async (peerId: string, candidate: RTCIceCandidateInit) => {
    const peer = peers.get(peerId);
    if (!peer) {
      console.warn(`Received ICE candidate from unknown peer ${peerId}`);
      return;
    }

    try {
      // Check if remote description is set
      if (peer.connection.remoteDescription) {
        await peer.connection.addIceCandidate(candidate);
        console.log(`Added ICE candidate for peer ${peerId}:`, candidate.candidate?.substring(0, 50) + '...');
      } else {
        // Queue the candidate until remote description is set
        peer.iceCandidatesQueue.push(candidate);
        console.log(`Queued ICE candidate for peer ${peerId} (remote description not set yet)`);
      }
    } catch (err) {
      console.error(`Error adding ICE candidate for peer ${peerId}:`, err);
      // Don't remove peer for ICE candidate errors, they're recoverable
    }
  }, [peers]);

  // Handle incoming signaling messages
  const handleSignalingMessage = useCallback(async (payload: { payload: SignalingMessage }) => {
    const message = payload.payload;
    
    if (message.from === userId) return; // Ignore own messages

    try {
      switch (message.type) {
        case 'join':
          await handlePeerJoin(message.from);
          break;
        case 'offer':
          await handleOffer(message.from, message.data);
          break;
        case 'answer':
          await handleAnswer(message.from, message.data);
          break;
        case 'ice-candidate':
          await handleIceCandidate(message.from, message.data);
          break;
        case 'leave':
          handlePeerLeave(message.from);
          break;
      }
    } catch (err) {
      console.error('Error handling signaling message:', err);
      setError('Failed to handle voice call signaling');
    }
  }, [userId, handlePeerJoin, handleOffer, handleAnswer, handleIceCandidate, handlePeerLeave]);

  // Initialize signaling channel
  useEffect(() => {
    if (!roomId || !userId) return;

    const channel = supabase.channel(`voice_call_${roomId}`)
      .on('broadcast', { event: 'signaling' }, handleSignalingMessage)
      .subscribe();

    signalingChannel.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [roomId, userId, handleSignalingMessage]);

  // Join voice call
  const joinCall = useCallback(async () => {
    if (isInCall || isConnecting) return;

    setIsConnecting(true);
    setError('');

    console.log(`Joining voice call as ${isAnchor ? 'anchor' : 'audience'}...`);

    try {
      let stream: MediaStream | null = null;
      
      // Only anchors need to send audio, audience just receives
      if (isAnchor) {
        console.log('Getting microphone access for anchor...');
        stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          } 
        });
        setLocalStream(stream);
        console.log('Got local stream:', stream);
        
        // Set up local audio (muted to prevent feedback)
        if (localAudioRef.current) {
          localAudioRef.current.srcObject = stream;
          localAudioRef.current.muted = true;
        }
      } else {
        console.log('Audience member joining - no microphone needed');
      }

      setIsInCall(true);
      
      // Announce joining to other peers
      console.log('Announcing join to other peers...');
      sendSignalingMessage({ type: 'join', data: { isAnchor } });
      
    } catch (err: any) {
      console.error('Error joining voice call:', err);
      if (isAnchor) {
        setError('Failed to access microphone. Please check your permissions.');
      } else {
        setError('Failed to join audio stream.');
      }
    } finally {
      setIsConnecting(false);
    }
  }, [isInCall, isConnecting, isAnchor, sendSignalingMessage]);

  // Leave voice call
  const leaveCall = useCallback(() => {
    if (!isInCall) return;

    console.log('Leaving voice call...');

    // Announce leaving to other peers
    sendSignalingMessage({ type: 'leave', data: {} });

    // Close all peer connections
    peers.forEach(peer => {
      peer.connection.close();
    });
    setPeers(new Map());

    // Stop local stream
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }

    // Clean up audio elements
    remoteAudiosRef.current.forEach((audio, peerId) => {
      audio.srcObject = null;
      if (audio.parentNode) {
        audio.parentNode.removeChild(audio);
      }
      console.log(`Cleaned up audio for peer ${peerId}`);
    });
    remoteAudiosRef.current.clear();

    if (localAudioRef.current) {
      localAudioRef.current.srcObject = null;
    }

    setIsInCall(false);
    setIsMuted(false);
  }, [isInCall, localStream, peers, sendSignalingMessage]);

  // Manual audio playback function for audience members
  const playRemoteAudio = useCallback(() => {
    console.log('Manually triggering remote audio playback...');
    let playedCount = 0;
    remoteAudiosRef.current.forEach((audioElement, peerId) => {
      if (audioElement.srcObject) {
        audioElement.play().then(() => {
          console.log(`Successfully started playing audio from peer ${peerId}`);
          playedCount++;
        }).catch(err => {
          console.error(`Failed to play audio from peer ${peerId}:`, err);
        });
      }
    });
    return playedCount;
  }, []);

  // Diagnostic function to check connection states
  const getConnectionDiagnostics = useCallback(() => {
    const diagnostics: Array<{
      peerId: string;
      connectionState: RTCPeerConnectionState;
      iceConnectionState: RTCIceConnectionState;
      iceGatheringState: RTCIceGatheringState;
      hasRemoteStream: boolean;
      localDescriptionType?: string;
      remoteDescriptionType?: string;
    }> = [];

    peers.forEach((peer, peerId) => {
      diagnostics.push({
        peerId,
        connectionState: peer.connection.connectionState,
        iceConnectionState: peer.connection.iceConnectionState,
        iceGatheringState: peer.connection.iceGatheringState,
        hasRemoteStream: !!peer.stream,
        localDescriptionType: peer.connection.localDescription?.type,
        remoteDescriptionType: peer.connection.remoteDescription?.type,
      });
    });

    console.table(diagnostics);
    return diagnostics;
  }, [peers]);

  // Toggle mute (only for anchors)
  const toggleMute = useCallback(() => {
    if (!localStream || !isAnchor) return;

    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  }, [localStream, isAnchor]);

  // Test WebRTC connectivity
  const testConnection = useCallback(async () => {
    console.log('Testing WebRTC connectivity...');
    
    try {
      const testConnection = new RTCPeerConnection(rtcConfiguration);
      
      // Create a data channel to test connectivity
      testConnection.createDataChannel('test');
      
      // Set up ICE candidate collection
      const iceCandidates: RTCIceCandidate[] = [];
      testConnection.onicecandidate = (event) => {
        if (event.candidate) {
          iceCandidates.push(event.candidate);
        }
      };
      
      // Create an offer to trigger ICE gathering
      const offer = await testConnection.createOffer();
      await testConnection.setLocalDescription(offer);
      
      // Wait for ICE gathering to complete or timeout
      await new Promise((resolve) => {
        const checkGathering = () => {
          if (testConnection.iceGatheringState === 'complete') {
            resolve(void 0);
          } else {
            setTimeout(checkGathering, 100);
          }
        };
        setTimeout(() => resolve(void 0), 5000); // 5 second timeout
        checkGathering();
      });
      
      console.log('ICE gathering completed. Collected candidates:', iceCandidates.length);
      console.log('ICE candidates:', iceCandidates.map(c => c.candidate));
      
      testConnection.close();
      
      return {
        success: true,
        iceCandidatesCount: iceCandidates.length,
        candidates: iceCandidates.map(c => c.candidate)
      };
    } catch (error) {
      console.error('Connection test failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }, [rtcConfiguration]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      leaveCall();
    };
  }, []);

  return {
    isInCall,
    isMuted,
    isConnecting,
    error,
    connectedPeers: Array.from(peers.keys()),
    joinCall,
    leaveCall,
    toggleMute,
    playRemoteAudio,
    getConnectionDiagnostics,
    localAudioRef,
    testConnection,
  };
}

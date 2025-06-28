import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Users, 
  Send, 
  Mic,
  MicOff,
  Vote,
  MessageCircle,
  AlertCircle,
  Eye
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useVoiceCall } from '../hooks/useVoiceCall';

interface Room {
  id: string;
  topic: string;
  status: 'waiting' | 'active' | 'ended';
  organiser_id: string;
  anchor_limit: number;
  side_a_label: string;
  side_b_label: string;
  created_at: string;
  started_at?: string;
  ended_at?: string;
}

interface Participant {
  id: string;
  user_id: string;
  role: 'organiser' | 'anchor' | 'audience';
  side?: 'side_a' | 'side_b';
  joined_at: string;
}

interface Message {
  id: string;
  room_id: string;
  user_id: string;
  content: string;
  side?: 'side_a' | 'side_b';
  timestamp: string;
}

interface Vote {
  id: string;
  room_id: string;
  user_id: string;
  voted_side: 'side_a' | 'side_b';
  timestamp: string;
}

export function LiveDebatePage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const [room, setRoom] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [userVote, setUserVote] = useState<'side_a' | 'side_b' | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);

  // Use the voice call hook for both anchors and audience
  const currentParticipant = participants.find(p => p.user_id === user?.id);
  const isAnchor = currentParticipant?.role === 'anchor';
  
  const {
    isInCall,
    isMuted,
    isConnecting,
    error: voiceError,
    connectedPeers,
    joinCall,
    leaveCall,
    toggleMute,
    playRemoteAudio,
    localAudioRef,
  } = useVoiceCall(roomId || '', user?.id || '', isAnchor);

  useEffect(() => {
    if (!roomId) return;
    
    fetchRoomData();
    fetchParticipants();
    fetchMessages();
    fetchVotes();
    checkUserVote();
    
    // Set up real-time subscriptions
    const messagesSubscription = supabase
      .channel('messages')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `room_id=eq.${roomId}`
      }, () => {
        fetchMessages();
      })
      .subscribe();

    const votesSubscription = supabase
      .channel('votes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'votes',
        filter: `room_id=eq.${roomId}`
      }, () => {
        fetchVotes();
        checkUserVote();
      })
      .subscribe();

    return () => {
      messagesSubscription.unsubscribe();
      votesSubscription.unsubscribe();
    };
  }, [roomId, user]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchRoomData = async () => {
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .single();

      if (error) throw error;
      setRoom(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch room data');
    }
  };

  const fetchParticipants = async () => {
    try {
      const { data, error } = await supabase
        .from('participants')
        .select('*')
        .eq('room_id', roomId);

      if (error) throw error;
      setParticipants(data);
    } catch (err: any) {
      console.error('Failed to fetch participants:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', roomId)
        .order('timestamp', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (err: any) {
      console.error('Failed to fetch messages:', err);
    }
  };

  const fetchVotes = async () => {
    try {
      const { data, error } = await supabase
        .from('votes')
        .select('*')
        .eq('room_id', roomId);

      if (error) throw error;
      setVotes(data || []);
    } catch (err: any) {
      console.error('Failed to fetch votes:', err);
    }
  };

  const checkUserVote = async () => {
    if (!user || !roomId) return;

    try {
      const { data, error } = await supabase
        .from('votes')
        .select('*')
        .eq('room_id', roomId)
        .eq('user_id', user.id)
        .single();

      if (!error && data) {
        setUserVote(data.voted_side);
      }
    } catch (err) {
      // User hasn't voted yet
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newMessage.trim() || !roomId) return;

    const participant = participants.find(p => p.user_id === user.id);
    if (!participant) {
      setError('You must join the debate to send messages');
      return;
    }

    // Determine side for anchors based on their position in the anchors array
    let messageSide: 'side_a' | 'side_b' | undefined = undefined;
    if (participant.role === 'anchor') {
      messageSide = participant.side;
    }

    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          room_id: roomId,
          user_id: user.id,
          content: newMessage.trim(),
          side: messageSide
        });

      if (error) throw error;
      setNewMessage('');
    } catch (err: any) {
      setError(err.message || 'Failed to send message');
    }
  };

  const vote = async (side: 'side_a' | 'side_b') => {
    if (!user || !roomId) return;

    const participant = participants.find(p => p.user_id === user.id);
    if (!participant) {
      setError('You must join the debate to vote');
      return;
    }

    try {
      // Delete existing vote if any
      await supabase
        .from('votes')
        .delete()
        .eq('room_id', roomId)
        .eq('user_id', user.id);

      // Insert new vote
      const { error } = await supabase
        .from('votes')
        .insert({
          room_id: roomId,
          user_id: user.id,
          voted_side: side
        });

      if (error) throw error;
      setUserVote(side);
    } catch (err: any) {
      setError(err.message || 'Failed to vote');
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const audioChunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        // Here you would upload the audio file to storage and send a message with the audio URL
        console.log('Audio recorded:', audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording:', err);
      setError('Failed to access microphone');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      setMediaRecorder(null);
    }
  };

  const joinVoiceCall = async () => {
    await joinCall();
  };

  const leaveVoiceCall = () => {
    leaveCall();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || voiceError || !room) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Room Not Found</h2>
          <p className="text-gray-600 mb-6">{error || voiceError || 'This debate room does not exist.'}</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  const anchors = participants.filter(p => p.role === 'anchor');
  const audience = participants.filter(p => p.role === 'audience');
  const sideAVotes = votes.filter(v => v.voted_side === 'side_a').length;
  const sideBVotes = votes.filter(v => v.voted_side === 'side_b').length;
  const totalVotes = sideAVotes + sideBVotes;
  const sideAPercentage = totalVotes > 0 ? (sideAVotes / totalVotes) * 100 : 0;
  const sideBPercentage = totalVotes > 0 ? (sideBVotes / totalVotes) * 100 : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-4">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-orange-500 rounded-lg p-6 text-white mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold mb-2">{room.topic}</h1>
              <div className="flex items-center space-x-4 text-blue-100">
                <span className="flex items-center space-x-1">
                  <Users className="w-4 h-4" />
                  <span>{participants.length} participants</span>
                </span>
                <span className="flex items-center space-x-1">
                  <Eye className="w-4 h-4" />
                  <span>{audience.length} watching</span>
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="px-3 py-1 bg-green-500/20 rounded-full text-sm font-medium">
                🔴 LIVE
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Debate Area */}
          <div className="lg:col-span-3 space-y-6">
            {/* Voice Call Section for All Participants */}
            {currentParticipant && (
              <div className={`bg-white rounded-lg p-6 border-2 ${isAnchor ? 'border-blue-200' : 'border-green-200'}`}>
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  {isAnchor ? '🎙️ Anchor Voice Communication' : '🔊 Listen to Debate Audio'}
                </h3>
                
                {/* Hidden audio element for local stream */}
                <audio ref={localAudioRef} autoPlay muted />
                
                {/* Show debug info */}
                {isInCall && (
                  <div className="mb-4 text-xs text-gray-500 bg-gray-50 p-2 rounded">
                    Debug: {isAnchor ? 'Anchor' : 'Audience'} | 
                    Connected: {connectedPeers.length} | 
                    Local Stream: {localAudioRef.current?.srcObject ? 'Yes' : 'No'} |
                    Remote Audio Elements: {document.querySelectorAll('[class*="remote-audio-"]').length}
                    {!isAnchor && connectedPeers.length > 0 && (
                      <span> | Click "Enable Audio" if you can't hear anchors</span>
                    )}
                  </div>
                )}
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <button
                      onClick={isInCall ? leaveVoiceCall : joinVoiceCall}
                      disabled={isConnecting}
                      className={`px-6 py-3 rounded-lg font-semibold transition-all disabled:opacity-50 ${
                        isInCall 
                          ? 'bg-red-600 text-white hover:bg-red-700' 
                          : isAnchor 
                          ? 'bg-green-600 text-white hover:bg-green-700'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {isConnecting ? '🔄 Connecting...' : (
                        isInCall 
                          ? (isAnchor ? '📞 Leave Call' : '� Stop Listening')
                          : (isAnchor ? '�📞 Join Voice Call' : '🔊 Listen to Debate')
                      )}
                    </button>
                    {isInCall && isAnchor && (
                      <button
                        onClick={toggleMute}
                        className={`p-3 rounded-lg transition-all ${
                          isMuted 
                            ? 'bg-red-500 text-white' 
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                        title={isMuted ? "Unmute" : "Mute"}
                      >
                        {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                      </button>
                    )}
                    {isInCall && !isAnchor && (
                      <button
                        onClick={() => {
                          const playedCount = playRemoteAudio();
                          console.log(`Attempted to play ${playedCount} remote audio streams`);
                        }}
                        className="p-3 rounded-lg bg-yellow-200 text-yellow-700 hover:bg-yellow-300 transition-all"
                        title="Enable Audio (Click if you can't hear)"
                      >
                        🔊 Enable Audio
                      </button>
                    )}
                  </div>
                  <div className="text-sm text-gray-600">
                    {isInCall ? (
                      isAnchor 
                        ? `🟢 Connected to ${connectedPeers.length} participants`
                        : `🔊 Listening to ${connectedPeers.length} anchors`
                    ) : '⚫ Not connected'}
                  </div>
                </div>
                
                {isInCall && (
                  <div className="mt-4 text-sm text-gray-600">
                    {isAnchor ? (
                      <p>Voice call active. Use this to coordinate your debate strategy and communicate with the audience.</p>
                    ) : (
                      <p>You're now listening to the live audio from the debate anchors.</p>
                    )}
                    {connectedPeers.length > 0 && (
                      <p className="mt-1">Connected participants: {connectedPeers.length}</p>
                    )}
                  </div>
                )}
                
                {voiceError && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {voiceError}
                  </div>
                )}
              </div>
            )}

            {/* Sides and Voting */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Side A */}
              <div className="bg-white rounded-lg p-6 border border-blue-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-blue-900">{room.side_a_label}</h3>
                  <button
                    onClick={() => vote('side_a')}
                    disabled={!user || userVote === 'side_a'}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      userVote === 'side_a'
                        ? 'bg-blue-600 text-white'
                        : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    }`}
                  >
                    {userVote === 'side_a' ? 'Voted' : 'Vote'}
                  </button>
                </div>
                
                <div className="space-y-2 mb-4">
                  {anchors.filter(a => a.side === 'side_a').map((anchor, index) => (
                    <div key={anchor.id} className="text-sm text-blue-700 bg-blue-50 p-3 rounded-lg border-l-4 border-blue-500">
                      <div className="font-semibold">🎙️ Anchor {index + 1}</div>
                      <div className="text-xs text-blue-600">User {anchor.user_id.slice(0, 8)}... • Online</div>
                    </div>
                  ))}
                  {anchors.filter(a => a.side === 'side_a').length === 0 && (
                    <div className="text-sm text-blue-600 italic p-2">Waiting for anchors to join...</div>
                  )}
                </div>

                {/* Vote Progress */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Votes: {sideAVotes}</span>
                    <span>{sideAPercentage.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{width: `${Math.min(sideAPercentage, 100)}%`}}
                    />
                  </div>
                </div>
              </div>

              {/* Side B */}
              <div className="bg-white rounded-lg p-6 border border-orange-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-orange-900">{room.side_b_label}</h3>
                  <button
                    onClick={() => vote('side_b')}
                    disabled={!user || userVote === 'side_b'}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      userVote === 'side_b'
                        ? 'bg-orange-600 text-white'
                        : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                    }`}
                  >
                    {userVote === 'side_b' ? 'Voted' : 'Vote'}
                  </button>
                </div>
                
                <div className="space-y-2 mb-4">
                  {anchors.filter(a => a.side === 'side_b').map((anchor, index) => (
                    <div key={anchor.id} className="text-sm text-orange-700 bg-orange-50 p-3 rounded-lg border-l-4 border-orange-500">
                      <div className="font-semibold">🎙️ Anchor {index + 1}</div>
                      <div className="text-xs text-orange-600">User {anchor.user_id.slice(0, 8)}... • Online</div>
                    </div>
                  ))}
                  {anchors.filter(a => a.side === 'side_b').length === 0 && (
                    <div className="text-sm text-orange-600 italic p-2">Waiting for anchors to join...</div>
                  )}
                </div>

                {/* Vote Progress */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Votes: {sideBVotes}</span>
                    <span>{sideBPercentage.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-orange-600 h-2 rounded-full transition-all duration-300"
                      style={{width: `${Math.min(sideBPercentage, 100)}%`}}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Chat Messages */}
            <div className="bg-white rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <MessageCircle className="w-5 h-5 mr-2" />
                Discussion
              </h3>
              
              <div className="h-96 overflow-y-auto mb-4 border border-gray-200 rounded-lg p-4 space-y-3">
                {messages.map((message) => {
                  const messageParticipant = participants.find(p => p.user_id === message.user_id);
                  const isAnchor = messageParticipant?.role === 'anchor';
                  const isOrganiser = messageParticipant?.role === 'organiser';
                  const isCurrentUser = message.user_id === user?.id;
                  
                  if (isAnchor) {
                    // Anchor messages - large and prominent
                    return (
                      <div key={message.id} className="mb-6">
                        <div className={`p-4 rounded-xl border-2 ${
                          message.side === 'side_a'
                            ? 'bg-blue-50 border-blue-300 shadow-lg'
                            : 'bg-orange-50 border-orange-300 shadow-lg'
                        }`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className={`font-bold text-lg ${
                              message.side === 'side_a' ? 'text-blue-900' : 'text-orange-900'
                            }`}>
                              🎯 Anchor - {message.side === 'side_a' ? room.side_a_label : room.side_b_label}
                            </div>
                            <div className="text-xs text-gray-500">
                              {new Date(message.timestamp).toLocaleTimeString()}
                            </div>
                          </div>
                          <div className={`text-base font-medium ${
                            message.side === 'side_a' ? 'text-blue-800' : 'text-orange-800'
                          }`}>
                            {message.content}
                          </div>
                        </div>
                      </div>
                    );
                  }
                  
                  // Regular messages (organiser/audience)
                  return (
                    <div
                      key={message.id}
                      className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'} mb-3`}
                    >
                      <div className="max-w-xs lg:max-w-md">
                        <div
                          className={`px-4 py-2 rounded-lg ${
                            isCurrentUser
                              ? 'bg-blue-600 text-white'
                              : isOrganiser
                              ? 'bg-purple-100 text-purple-900 border border-purple-300'
                              : 'bg-gray-100 text-gray-900'
                          }`}
                        >
                          <div className="text-xs opacity-75 mb-1">
                            {isOrganiser ? '👑 Organiser' : '👥 Audience'}
                          </div>
                          <div>{message.content}</div>
                          <div className="text-xs opacity-75 mt-1">
                            {new Date(message.timestamp).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              {user && participants.find(p => p.user_id === user.id) ? (
                <form onSubmit={sendMessage} className="flex space-x-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type your message..."
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={isRecording ? stopRecording : startRecording}
                    title={isRecording ? "Stop recording" : "Start voice recording"}
                    className={`p-2 rounded-lg transition-colors ${
                      isRecording 
                        ? 'bg-red-600 text-white animate-pulse' 
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>
                  <button
                    type="submit"
                    disabled={!newMessage.trim()}
                    title="Send message"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </form>
              ) : (
                <div className="text-center text-gray-500 py-4">
                  <p>Join the debate to participate in the discussion</p>
                  <button
                    onClick={() => navigate(`/room/${roomId}`)}
                    className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Join Debate
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Participants */}
            <div className="bg-white rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Participants ({participants.length})</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {participants.map((participant) => (
                  <div
                    key={participant.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span>User {participant.user_id.slice(0, 8)}...</span>
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      participant.role === 'organiser' 
                        ? 'bg-purple-100 text-purple-800'
                        : participant.role === 'anchor'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {participant.role}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Vote Summary */}
            <div className="bg-white rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Live Voting</h3>
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">{totalVotes}</div>
                  <div className="text-sm text-gray-600">Total Votes</div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-blue-700">{room.side_a_label}</span>
                    <span className="text-sm font-bold">{sideAVotes}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-orange-700">{room.side_b_label}</span>
                    <span className="text-sm font-bold">{sideBVotes}</span>
                  </div>
                </div>

                {userVote && (
                  <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="text-sm text-green-800">
                      ✓ You voted for {userVote === 'side_a' ? room.side_a_label : room.side_b_label}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

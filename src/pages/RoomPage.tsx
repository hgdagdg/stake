import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Users, 
  Play, 
  Pause,
  AlertCircle,
  Eye,
  Vote,
  MessageCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

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
  joined_at: string;
}

export function RoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [room, setRoom] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasJoined, setHasJoined] = useState(false);

  useEffect(() => {
    if (!roomId) return;
    
    fetchRoomData();
    fetchParticipants();
    checkParticipation();
  }, [roomId, user]);

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

  const checkParticipation = async () => {
    if (!user || !roomId) return;

    try {
      const { data, error } = await supabase
        .from('participants')
        .select('*')
        .eq('room_id', roomId)
        .eq('user_id', user.id)
        .single();

      if (!error && data) {
        setHasJoined(true);
      }
    } catch (err) {
      // User hasn't joined yet
    }
  };

  const joinAsAudience = async () => {
    if (!user || !roomId) return;

    try {
      const { error } = await supabase
        .from('participants')
        .insert({
          room_id: roomId,
          user_id: user.id,
          role: 'audience'
        });

      if (error) throw error;
      setHasJoined(true);
      fetchParticipants();
    } catch (err: any) {
      setError(err.message || 'Failed to join room');
    }
  };

  const leaveDebate = async () => {
    if (!user || !roomId) return;

    // If organiser is leaving, warn them that it will end the debate
    const participant = participants.find(p => p.user_id === user.id);
    if (participant?.role === 'organiser') {
      const confirmed = window.confirm(
        'As the organiser, leaving will automatically end this debate for all participants. Are you sure you want to continue?'
      );
      if (!confirmed) return;
    }

    try {
      const { error } = await supabase
        .from('participants')
        .delete()
        .eq('room_id', roomId)
        .eq('user_id', user.id);

      if (error) throw error;
      
      // If organiser left, end the debate
      if (participant?.role === 'organiser') {
        await supabase
          .from('rooms')
          .update({ 
            status: 'ended',
            ended_at: new Date().toISOString()
          })
          .eq('id', roomId);
      }

      setHasJoined(false);
      fetchParticipants();
      fetchRoomData();
    } catch (err: any) {
      setError(err.message || 'Failed to leave room');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Room Not Found</h2>
          <p className="text-gray-600 mb-6">{error || 'This debate room does not exist or has been removed.'}</p>
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

  // If room is waiting and user is organiser, redirect to organise page
  if (room.status === 'waiting' && user?.id === room.organiser_id) {
    navigate(`/room/${roomId}/organise`);
    return null;
  }

  // If room is active, redirect to live debate page
  if (room.status === 'active') {
    navigate(`/room/${roomId}/live`);
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-lg overflow-hidden"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-orange-500 p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold mb-2">{room.topic}</h1>
                <div className="flex items-center space-x-4 text-blue-100">
                  <span className="flex items-center space-x-1">
                    <Users className="w-4 h-4" />
                    <span>{participants.length} participants</span>
                  </span>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  room.status === 'waiting' 
                    ? 'bg-yellow-500/20 text-yellow-100'
                    : room.status === 'active'
                    ? 'bg-green-500/20 text-green-100'
                    : 'bg-gray-500/20 text-gray-100'
                }`}>
                  {room.status === 'waiting' ? 'Starting Soon' : 
                   room.status === 'active' ? 'Live Now' : 'Ended'}
                </span>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Status Message */}
            {room.status === 'waiting' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <Pause className="w-5 h-5 text-yellow-600 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-medium text-yellow-900">Debate Starting Soon</h4>
                    <p className="text-sm text-yellow-700 mt-1">
                      The organiser is setting up the debate. You can join as an audience member to be notified when it starts.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {room.status === 'active' && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <Play className="w-5 h-5 text-green-600 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-medium text-green-900">Debate is Live!</h4>
                    <p className="text-sm text-green-700 mt-1">
                      The debate is currently in progress. Join to watch and participate in voting.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Debate Sides */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                <h3 className="font-semibold text-blue-900 mb-2">{room.side_a_label}</h3>
                <div className="space-y-2">
                  {anchors.filter((_, i) => i % 2 === 0).map((anchor, index) => (
                    <div key={anchor.id} className="text-sm text-blue-700">
                      Anchor {index + 1}
                    </div>
                  ))}
                  {anchors.filter((_, i) => i % 2 === 0).length === 0 && (
                    <div className="text-sm text-blue-600 italic">Waiting for anchors...</div>
                  )}
                </div>
              </div>

              <div className="border border-orange-200 rounded-lg p-4 bg-orange-50">
                <h3 className="font-semibold text-orange-900 mb-2">{room.side_b_label}</h3>
                <div className="space-y-2">
                  {anchors.filter((_, i) => i % 2 === 1).map((anchor, index) => (
                    <div key={anchor.id} className="text-sm text-orange-700">
                      Anchor {index + 1}
                    </div>
                  ))}
                  {anchors.filter((_, i) => i % 2 === 1).length === 0 && (
                    <div className="text-sm text-orange-600 italic">Waiting for anchors...</div>
                  )}
                </div>
              </div>
            </div>

            {/* Audience */}
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">Audience</h3>
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <Eye className="w-4 h-4" />
                  <span>{audience.length} watching</span>
                </div>
              </div>
              
              {audience.length === 0 ? (
                <p className="text-gray-500 text-sm">No audience members yet.</p>
              ) : (
                <p className="text-gray-600 text-sm">
                  {audience.length} people are watching this debate.
                </p>
              )}
            </div>

            {/* Actions */}
            {!user ? (
              <div className="text-center">
                <p className="text-gray-600 mb-4">Sign in to join this debate</p>
                <button
                  onClick={() => navigate('/auth')}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Sign In
                </button>
              </div>
            ) : !hasJoined ? (
              <div className="text-center space-y-4">
                <p className="text-gray-600">How would you like to join this debate?</p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={joinAsAudience}
                    className="px-6 py-3 bg-gradient-to-r from-blue-600 to-orange-500 text-white rounded-lg hover:from-blue-700 hover:to-orange-600 transition-all font-semibold"
                  >
                    Join as Audience
                  </motion.button>
                  <button
                    onClick={() => navigate(`/room/${roomId}/join`)}
                    className="px-6 py-3 border-2 border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-all font-semibold"
                  >
                    Join as Anchor
                  </button>
                </div>
                <p className="text-sm text-gray-500">
                  Anchors need a passcode from the organiser to participate in the debate
                </p>
              </div>
            ) : (
              <div className="text-center space-y-4">
                <div className="inline-flex items-center space-x-2 text-green-600 mb-4">
                  <Users className="w-5 h-5" />
                  <span className="font-medium">You've joined this debate</span>
                </div>
                
                {room.status === 'active' && (
                  <div className="flex flex-col sm:flex-row gap-4 justify-center mb-4">
                    <button className="flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                      <Vote className="w-4 h-4 mr-2" />
                      Vote
                    </button>
                    <button className="flex items-center justify-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors">
                      <MessageCircle className="w-4 h-4 mr-2" />
                      Chat
                    </button>
                  </div>
                )}

                <button
                  onClick={leaveDebate}
                  className="px-4 py-2 text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors text-sm"
                >
                  Leave Debate
                </button>
              </div>
            )}

            <div className="text-center">
              <button
                onClick={() => navigate('/')}
                className="text-gray-600 hover:text-gray-800 transition-colors"
              >
                ← Back to Home
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

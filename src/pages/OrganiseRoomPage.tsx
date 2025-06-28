import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Users, 
  Copy, 
  CheckCircle, 
  Play, 
  AlertCircle,
  Key,
  Eye
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useOrganiserPresence } from '../hooks/useOrganiserPresence';

interface Room {
  id: string;
  topic: string;
  status: 'waiting' | 'active' | 'ended';
  organiser_id: string;
  anchor_limit: number;
  passcode: string;
  side_a_label: string;
  side_b_label: string;
  created_at: string;
}

interface Participant {
  id: string;
  user_id: string;
  role: 'organiser' | 'anchor' | 'audience';
  joined_at: string;
}

export function OrganiseRoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [room, setRoom] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedPasscode, setCopiedPasscode] = useState(false);
  const [copiedPublicLink, setCopiedPublicLink] = useState(false);

  useEffect(() => {
    if (!roomId || !user) return;
    
    fetchRoomData();
    fetchParticipants();
  }, [roomId, user]);

  // Track organiser presence
  useOrganiserPresence({
    roomId: roomId || '',
    isOrganiser: user?.id === room?.organiser_id,
    onOrganiserLeft: () => {
      // This won't be called for the organiser themselves
    }
  });

  const fetchRoomData = async () => {
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .single();

      if (error) throw error;
      
      console.log('Room data:', data);
      console.log('Current user:', user);
      console.log('Room organiser_id:', data.organiser_id);
      console.log('User id:', user?.id);
      
      if (data.organiser_id !== user?.id) {
        setError('You are not authorized to organise this room');
        return;
      }

      setRoom(data);
    } catch (err: any) {
      console.error('Error fetching room data:', err);
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

  const copyToClipboard = async (text: string, type: 'passcode' | 'link') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'passcode') {
        setCopiedPasscode(true);
        setTimeout(() => setCopiedPasscode(false), 2000);
      } else {
        setCopiedPublicLink(true);
        setTimeout(() => setCopiedPublicLink(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const startDebate = async () => {
    try {
      const { error } = await supabase
        .from('rooms')
        .update({ 
          status: 'active',
          started_at: new Date().toISOString()
        })
        .eq('id', roomId);

      if (error) throw error;

      // Navigate to the live debate view
      navigate(`/room/${roomId}/live`);
    } catch (err: any) {
      setError(err.message || 'Failed to start debate');
    }
  };

  const endDebate = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to end this debate? This action cannot be undone.'
    );
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('rooms')
        .update({ 
          status: 'ended',
          ended_at: new Date().toISOString()
        })
        .eq('id', roomId);

      if (error) throw error;

      // Refresh room data
      fetchRoomData();
    } catch (err: any) {
      setError(err.message || 'Failed to end debate');
    }
  };

  if (loading || !user) {
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
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Error</h2>
          <p className="text-gray-600 mb-6">{error || 'Room not found'}</p>
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
  const publicLink = `${window.location.origin}/room/${roomId}`;
  const anchorLink = `${window.location.origin}/room/${roomId}/join?passcode=${room.passcode}`;

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
                <h1 className="text-2xl font-bold mb-2">Debate Room</h1>
                <p className="text-blue-100">{room.topic}</p>
              </div>
              <div className="flex items-center space-x-4">
                <span className="px-3 py-1 bg-white/20 rounded-full text-sm font-medium">
                  {room.status === 'waiting' ? 'Waiting' : room.status === 'active' ? 'Live' : 'Ended'}
                </span>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-8">
            {/* Share Links */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Anchor Access */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-3">
                  <Key className="w-5 h-5 text-blue-600" />
                  <h3 className="font-semibold text-gray-900">Anchor Access</h3>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  Share this passcode with selected anchors to join the debate
                </p>
                <div className="flex items-center space-x-2">
                  <code className="flex-1 bg-gray-100 px-3 py-2 rounded text-center font-mono text-lg font-bold">
                    {room.passcode}
                  </code>
                  <button
                    onClick={() => copyToClipboard(room.passcode, 'passcode')}
                    className="p-2 text-gray-600 hover:text-blue-600 transition-colors"
                    title="Copy passcode"
                  >
                    {copiedPasscode ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <Copy className="w-5 h-5" />
                    )}
                  </button>
                </div>
                <button
                  onClick={() => copyToClipboard(anchorLink, 'link')}
                  className="w-full mt-2 text-sm text-blue-600 hover:text-blue-700 transition-colors"
                >
                  Copy anchor join link
                </button>
              </div>

              {/* Public Access */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-3">
                  <Eye className="w-5 h-5 text-green-600" />
                  <h3 className="font-semibold text-gray-900">Public Access</h3>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  Share this link for audience members to watch and vote
                </p>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={publicLink}
                    readOnly
                    title="Public debate link"
                    className="flex-1 bg-gray-100 px-3 py-2 rounded text-sm"
                  />
                  <button
                    onClick={() => copyToClipboard(publicLink, 'link')}
                    className="p-2 text-gray-600 hover:text-green-600 transition-colors"
                    title="Copy public link"
                  >
                    {copiedPublicLink ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <Copy className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Debate Setup */}
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-4">Debate Setup</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Side A:</span>
                  <p className="font-medium">{room.side_a_label}</p>
                </div>
                <div>
                  <span className="text-gray-600">Side B:</span>
                  <p className="font-medium">{room.side_b_label}</p>
                </div>
                <div>
                  <span className="text-gray-600">Anchors per side:</span>
                  <p className="font-medium">{room.anchor_limit}</p>
                </div>
                <div>
                  <span className="text-gray-600">Status:</span>
                  <p className="font-medium capitalize">{room.status}</p>
                </div>
              </div>
            </div>

            {/* Participants */}
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Participants</h3>
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <Users className="w-4 h-4" />
                  <span>{participants.length} joined</span>
                </div>
              </div>
              
              {participants.length === 0 ? (
                <p className="text-gray-500 text-center py-4">
                  No participants have joined yet. Share the links above to get started.
                </p>
              ) : (
                <div className="space-y-2">
                  {participants.map((participant) => (
                    <div
                      key={participant.id}
                      className="flex items-center justify-between p-2 bg-gray-50 rounded"
                    >
                      <span className="text-sm">User {participant.user_id.slice(0, 8)}...</span>
                      <span className={`text-xs px-2 py-1 rounded-full ${
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
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-4">
              {room.status === 'waiting' ? (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={startDebate}
                  disabled={anchors.length === 0}
                  className="flex-1 flex items-center justify-center py-3 px-6 bg-gradient-to-r from-green-600 to-green-500 text-white rounded-lg hover:from-green-700 hover:to-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold"
                >
                  <Play className="w-5 h-5 mr-2" />
                  Start Debate
                </motion.button>
              ) : room.status === 'active' ? (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={endDebate}
                  className="flex-1 flex items-center justify-center py-3 px-6 bg-gradient-to-r from-red-600 to-red-500 text-white rounded-lg hover:from-red-700 hover:to-red-600 transition-all font-semibold"
                >
                  End Debate
                </motion.button>
              ) : null}
              
              <button
                onClick={() => navigate('/')}
                className="flex-1 flex items-center justify-center py-3 px-6 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Back to Home
              </button>
            </div>

            {room.status === 'waiting' && anchors.length === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-medium text-amber-900">Ready to start?</h4>
                    <p className="text-sm text-amber-700 mt-1">
                      You need at least one anchor to join before starting the debate. 
                      Share the passcode with your selected anchors.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

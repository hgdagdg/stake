import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Key, 
  Users, 
  AlertCircle,
  CheckCircle,
  ArrowRight
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

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

export function JoinRoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  
  const [room, setRoom] = useState<Room | null>(null);
  const [passcode, setPasscode] = useState(searchParams.get('passcode') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!roomId) return;
    fetchRoomData();
  }, [roomId]);

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
      setError('Room not found');
    }
  };

  const joinAsAnchor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !room || !passcode.trim()) return;

    setLoading(true);
    setError('');

    try {
      // Verify passcode
      if (passcode.trim().toUpperCase() !== room.passcode.toUpperCase()) {
        throw new Error('Invalid passcode');
      }

      // Check if user is already a participant
      const { data: existingParticipant, error: checkError } = await supabase
        .from('participants')
        .select('*')
        .eq('room_id', roomId)
        .eq('user_id', user.id)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      if (existingParticipant) {
        // User is already a participant, redirect to appropriate page
        if (existingParticipant.role === 'organiser') {
          navigate(`/room/${roomId}/organise`);
        } else {
          navigate(`/room/${roomId}`);
        }
        return;
      }

      // Count current anchors and determine which side to assign
      const { data: participants, error: countError } = await supabase
        .from('participants')
        .select('*')
        .eq('room_id', roomId)
        .eq('role', 'anchor');

      if (countError) throw countError;

      if (participants && participants.length >= room.anchor_limit * 2) {
        throw new Error('This debate already has the maximum number of anchors');
      }

      // Determine which side to assign the new anchor to
      const sideAAnchors = participants?.filter(p => p.side === 'side_a').length || 0;
      const sideBAnchors = participants?.filter(p => p.side === 'side_b').length || 0;
      const assignedSide = sideAAnchors <= sideBAnchors ? 'side_a' : 'side_b';

      // Add user as anchor with proper side assignment
      const { error: joinError } = await supabase
        .from('participants')
        .insert({
          room_id: roomId,
          user_id: user.id,
          role: 'anchor',
          side: assignedSide
        });

      if (joinError) throw joinError;

      setSuccess(true);
      setTimeout(() => {
        navigate(`/room/${roomId}`);
      }, 2000);

    } catch (err: any) {
      setError(err.message || 'Failed to join room');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Sign in required</h2>
          <p className="text-gray-600 mb-6">You need to sign in to join as an anchor.</p>
          <button
            onClick={() => navigate('/auth')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Room Not Found</h2>
          <p className="text-gray-600 mb-6">This debate room does not exist or has been removed.</p>
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

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-md mx-auto"
        >
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Welcome, Anchor!</h2>
          <p className="text-gray-600 mb-6">
            You've successfully joined the debate as an anchor. Redirecting you to the room...
          </p>
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-md mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-lg p-8"
        >
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-orange-500 rounded-2xl mb-4">
              <Key className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Join as Anchor</h1>
            <p className="text-gray-600">Enter the passcode to join this debate</p>
          </div>

          {/* Room Info */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-gray-900 mb-2">{room.topic}</h3>
            <div className="flex items-center justify-between text-sm text-gray-600">
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4" />
                <span>{room.side_a_label} vs {room.side_b_label}</span>
              </div>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                room.status === 'waiting' 
                  ? 'bg-yellow-100 text-yellow-800'
                  : room.status === 'active'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-800'
              }`}>
                {room.status === 'waiting' ? 'Starting Soon' : 
                 room.status === 'active' ? 'Live' : 'Ended'}
              </span>
            </div>
          </div>

          <form onSubmit={joinAsAnchor} className="space-y-6">
            <div>
              <label htmlFor="passcode" className="block text-sm font-medium text-gray-700 mb-2">
                Anchor Passcode *
              </label>
              <input
                id="passcode"
                type="text"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value.toUpperCase())}
                required
                maxLength={6}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-center font-mono text-lg font-bold uppercase"
                placeholder="XXXXXX"
              />
              <p className="text-xs text-gray-500 mt-1">
                This passcode was provided by the debate organiser
              </p>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700"
              >
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">{error}</span>
              </motion.div>
            )}

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading || !passcode.trim()}
              className="w-full flex justify-center items-center py-3 px-6 bg-gradient-to-r from-blue-600 to-orange-500 text-white rounded-lg hover:from-blue-700 hover:to-orange-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Join as Anchor
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </motion.button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-200 text-center">
            <p className="text-sm text-gray-600 mb-4">
              Just want to watch the debate?
            </p>
            <button
              onClick={() => navigate(`/room/${roomId}`)}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium transition-colors"
            >
              Join as audience instead
            </button>
          </div>

          <div className="text-center mt-6">
            <button
              onClick={() => navigate('/')}
              className="text-gray-600 hover:text-gray-800 transition-colors text-sm"
            >
              ← Back to Home
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

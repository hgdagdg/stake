import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Users, Lock, ArrowRight, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

export function CreateRoomPage() {
  const [topic, setTopic] = useState('');
  const [anchorLimit, setAnchorLimit] = useState(2);
  const [sideALabel, setSideALabel] = useState('For');
  const [sideBLabel, setSideBLabel] = useState('Against');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setError('');

    try {
      // Generate a random passcode for anchors
      const passcode = Math.random().toString(36).substring(2, 8).toUpperCase();
      
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .insert({
          topic: topic.trim(),
          organiser_id: user.id,
          anchor_limit: anchorLimit,
          passcode,
          side_a_label: sideALabel.trim(),
          side_b_label: sideBLabel.trim(),
        })
        .select()
        .single();

      if (roomError) throw roomError;

      // Add organiser as participant
      const { error: participantError } = await supabase
        .from('participants')
        .insert({
          room_id: room.id,
          user_id: user.id,
          role: 'organiser',
        });

      if (participantError) throw participantError;

      navigate(`/room/${room.id}/organise`);
    } catch (err: any) {
      setError(err.message || 'Failed to create room');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Sign in required</h2>
          <p className="text-gray-600 mb-6">You need to sign in to create a debate room.</p>
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

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-lg p-8"
        >
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-orange-500 rounded-2xl mb-4">
              <Plus className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Create a Debate</h1>
            <p className="text-gray-600">Set up your debate room and invite participants</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="topic" className="block text-sm font-medium text-gray-700 mb-2">
                Debate Topic *
              </label>
              <textarea
                id="topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                required
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-none"
                placeholder="What should we debate about? Be specific and clear..."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="sideALabel" className="block text-sm font-medium text-gray-700 mb-2">
                  Side A Label
                </label>
                <input
                  id="sideALabel"
                  type="text"
                  value={sideALabel}
                  onChange={(e) => setSideALabel(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  placeholder="For"
                />
              </div>

              <div>
                <label htmlFor="sideBLabel" className="block text-sm font-medium text-gray-700 mb-2">
                  Side B Label
                </label>
                <input
                  id="sideBLabel"
                  type="text"
                  value={sideBLabel}
                  onChange={(e) => setSideBLabel(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
                  placeholder="Against"
                />
              </div>
            </div>

            <div>
              <label htmlFor="anchorLimit" className="block text-sm font-medium text-gray-700 mb-2">
                Number of Anchors per Side
              </label>
              <div className="relative">
                <select
                  id="anchorLimit"
                  value={anchorLimit}
                  onChange={(e) => setAnchorLimit(Number(e.target.value))}
                  className="w-full px-4 py-3 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors appearance-none bg-white"
                >
                  <option value={1}>1 anchor per side</option>
                  <option value={2}>2 anchors per side</option>
                  <option value={3}>3 anchors per side</option>
                  <option value={4}>4 anchors per side</option>
                  <option value={5}>5 anchors per side</option>
                </select>
                <Users className="w-5 h-5 text-gray-400 absolute left-3 top-3.5" />
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Lock className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <h3 className="text-sm font-medium text-blue-900">Private Access</h3>
                  <p className="text-sm text-blue-700 mt-1">
                    A unique passcode will be generated for anchors to join privately. 
                    The general public can watch and vote using a public link.
                  </p>
                </div>
              </div>
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
              disabled={loading || !topic.trim()}
              className="w-full flex justify-center items-center py-4 px-6 bg-gradient-to-r from-blue-600 to-orange-500 text-white rounded-lg hover:from-blue-700 hover:to-orange-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Create Debate Room
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </motion.button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
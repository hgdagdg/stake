import { useVoiceCall } from '../hooks/useVoiceCall';

interface VoiceCallDebugProps {
  roomId: string;
  userId: string;
  isAnchor: boolean;
}

export function VoiceCallDebug({ roomId, userId, isAnchor }: VoiceCallDebugProps) {
  const { 
    isInCall, 
    isConnecting, 
    error, 
    connectedPeers, 
    getConnectionDiagnostics, 
    testConnection,
    joinCall,
    leaveCall 
  } = useVoiceCall(roomId, userId, isAnchor);

  const handleTestConnection = async () => {
    console.log('Running connection test...');
    const result = await testConnection();
    console.log('Connection test result:', result);
    
    if (result.success) {
      alert(`Connection test successful! Found ${result.iceCandidatesCount} ICE candidates.`);
    } else {
      alert(`Connection test failed: ${result.error}`);
    }
  };

  const handleShowDiagnostics = () => {
    const diagnostics = getConnectionDiagnostics();
    console.log('Current connection diagnostics:', diagnostics);
  };

  return (
    <div className="bg-gray-100 border border-gray-300 rounded-lg p-4 m-4">
      <h3 className="text-lg font-bold mb-3">Voice Call Debug Panel</h3>
      
      <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
        <div>Room ID: {roomId}</div>
        <div>User ID: {userId}</div>
        <div>Role: {isAnchor ? 'Anchor' : 'Audience'}</div>
        <div>In Call: {isInCall ? 'Yes' : 'No'}</div>
        <div>Connecting: {isConnecting ? 'Yes' : 'No'}</div>
        <div>Connected Peers: {connectedPeers.length}</div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded mb-4">
          Error: {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={handleTestConnection}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded text-sm"
        >
          Test Connection
        </button>
        
        <button
          onClick={handleShowDiagnostics}
          className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded text-sm"
          disabled={connectedPeers.length === 0}
        >
          Show Diagnostics
        </button>

        {!isInCall ? (
          <button
            onClick={joinCall}
            className="bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded text-sm"
            disabled={isConnecting}
          >
            {isConnecting ? 'Joining...' : 'Join Call'}
          </button>
        ) : (
          <button
            onClick={leaveCall}
            className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded text-sm"
          >
            Leave Call
          </button>
        )}
      </div>

      {connectedPeers.length > 0 && (
        <div>
          <h4 className="font-semibold mb-2">Connected Peers:</h4>
          <ul className="list-disc list-inside text-sm">
            {connectedPeers.map(peerId => (
              <li key={peerId}>{peerId}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 text-xs text-gray-600">
        <p>Open browser console to see detailed logs and diagnostics.</p>
      </div>
    </div>
  );
}

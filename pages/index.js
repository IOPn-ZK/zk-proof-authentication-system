import { useSession, signIn, signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { Identity } from '@semaphore-protocol/identity';
import { generateProof } from '@semaphore-protocol/proof';
import { Group } from '@semaphore-protocol/group';

export default function Home() {
  const { data: session, status } = useSession();
  const [serverIdentity, setServerIdentity] = useState(null);
  const [serverIdentityData, setServerIdentityData] = useState(null);
  const [groupDetails, setGroupDetails] = useState(null);
  const [verificationResult, setVerificationResult] = useState(null);
  const [logs, setLogs] = useState([]);
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Helper function to add logs
  const addLog = (message) => {
    setLogs((prevLogs) => [...prevLogs, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  // Step 1: Initialize Server Identity
  const initializeServerIdentity = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/zk/identity/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to initialize server identity');
      }
      
      setServerIdentity(data.identityCommitment);
      setServerIdentityData(data.identityData);
      addLog(`Server identity initialized: ${data.identityCommitment}`);
      addLog(`Identity data stored for proof generation`);
      setCurrentStep(2);
    } catch (error) {
      console.error('Error initializing server identity:', error);
      addLog(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Join Group
  const joinGroup = async () => {
    if (!serverIdentity) {
      addLog('No server identity available. Please initialize identity first.');
      return;
    }
    
    setIsLoading(true);
    try {
      const response = await fetch('/api/zk/group/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commitment: serverIdentity }),
      });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || `Server error: ${response.status}`);
      }
      
      addLog(`Successfully joined group: ${data.message}`);
      setCurrentStep(3);
    } catch (error) {
      addLog(`Error joining group: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Show Group Details
  const fetchGroupDetails = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/zk/group/full');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to fetch group details');
      }
      
      setGroupDetails(data);
      addLog('Successfully fetched group details');
      addLog(`Group ID: ${data.id}, Tree Depth: ${data.treeDepth || '20'}, Members: ${data.members?.length || 0}`);
      
      if (data.members && data.members.length > 0) {
        addLog(`First few members: ${data.members.slice(0, 3).join(', ')}${data.members.length > 3 ? '...' : ''}`);
      }
      
      setCurrentStep(4);
    } catch (error) {
      console.error('Error fetching group details:', error);
      addLog(`Error fetching group details: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 4: Generate and Verify Proof
  const handleProveMembership = async () => {
    if (!serverIdentity || !serverIdentityData) {
      setVerificationResult('No server identity available. Please complete previous steps.');
      addLog('No server identity available. Please complete previous steps.');
      return;
    }

    setIsLoading(true);
    try {
      // Use existing group details if available, otherwise fetch
      let groupData = groupDetails;
      if (!groupData) {
        addLog('No group details available, fetching...');
        const response = await fetch('/api/zk/group/full');
        groupData = await response.json();
        
        if (!response.ok || !groupData.success) {
          setVerificationResult(`Error: ${groupData.message || groupData.error || 'Failed to fetch group'}`);
          addLog(`Error: ${groupData.message || groupData.error || 'Failed to fetch group'}`);
          return;
        }
      }

      addLog(`Group data: ID=${groupData.id}, TreeDepth=${groupData.treeDepth || '20'}, Members=${groupData.members?.length || 0}`);

      // Validate group data
      if (!groupData.id || !Array.isArray(groupData.members)) {
        setVerificationResult(`Error: Invalid group data received`);
        addLog(`Error: Invalid group data received`);
        return;
      }

      // Check if the server identity is in the group
      addLog(`Server commitment: ${serverIdentity}`);
      addLog(`Group has ${groupData.members.length} members`);

      if (!groupData.members.includes(serverIdentity)) {
        setVerificationResult('Error: Your identity is not in the group. Please complete step 2.');
        addLog('Error: Identity not in group. Please complete step 2.');
        return;
      }

      // Initialize group for proof generation
      const treeDepth = groupData.treeDepth || 20;
      const groupId = groupData.id;
      const members = groupData.members.map(BigInt);
      const fetchedGroup = new Group(groupId, treeDepth, members);

      // Create identity from server identity data
      addLog('Creating identity from server data for proof generation');
      
      // Create identity using the same seed as the server
      const userEmail = session?.user?.email;
      const identity = new Identity(userEmail);
      
      addLog(`Identity created with commitment: ${identity.commitment.toString()}`);
      addLog(`Server identity commitment: ${serverIdentity}`);
      
      // Verify the identity matches the server commitment
      if (identity.commitment.toString() !== serverIdentity) {
        setVerificationResult('Error: Identity mismatch. Please reset and try again.');
        addLog('Error: Identity mismatch between server and client.');
        addLog(`Expected: ${serverIdentity}`);
        addLog(`Got: ${identity.commitment.toString()}`);
        return;
      }

      // Generate ZK proof
      const signal = BigInt(1);
      const externalNullifier = BigInt(Math.floor(Math.random() * 1000000));
      addLog(`Generating proof with: Signal=${signal.toString()}, ExternalNullifier=${externalNullifier.toString()}`);
      
      const fullProof = await generateProof(identity, fetchedGroup, signal, externalNullifier);

      // Send proof to server for verification
      const verifyResponse = await fetch('/api/zk/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullProof }),
      });
      const verifyData = await verifyResponse.json();
      
      if (verifyData.valid) {
        setVerificationResult('ZK proof verified successfully!');
        addLog('ZK proof verified successfully!');
        setCurrentStep(5);
      } else {
        setVerificationResult('Proof verification failed');
        addLog(`Proof verification failed: ${verifyData.error || 'Invalid proof'}`);
      }
    } catch (error) {
      console.error('Error in handleProveMembership:', error);
      setVerificationResult(`Error: ${error.message}`);
      addLog(`Error in proof generation: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Reset flow
  const resetFlow = () => {
    setCurrentStep(1);
    setServerIdentity(null);
    setServerIdentityData(null);
    setGroupDetails(null);
    setVerificationResult(null);
    setLogs([]);
    addLog('Flow reset to step 1');
  };

  // Reset group
  const resetGroup = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/zk/group/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || `Server error: ${response.status}`);
      }
      
      addLog(`Group reset: ${data.message}`);
      setGroupDetails(null);
      setCurrentStep(1);
    } catch (error) {
      addLog(`Error resetting group: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (status === 'authenticated') {
      addLog('Sign in with Google handled by /api/auth/[...nextauth].js');
      addLog('Ready to start Semaphore flow');
    }
  }, [status]);

  const steps = [
    { id: 1, title: 'Initialize Identity', description: 'Create identity' },
    { id: 2, title: 'Join Group', description: 'Add to Semaphore group' },
    { id: 3, title: 'View Details', description: 'Fetch group information' },
    { id: 4, title: 'Generate Proof', description: 'Create ZK proof' },
    { id: 5, title: 'Complete', description: 'Flow completed' }
  ];

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (status === 'authenticated') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="max-w-6xl mx-auto p-6">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-slate-800">Semaphore + OAuth Demo</h1>
              <p className="text-slate-600 mt-1">Zero-Knowledge Proof Authentication</p>
            </div>
            <button
              onClick={signOut}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors"
            >
              Sign out
            </button>
          </div>

          <div className="mb-8">
            <div className="flex items-center justify-between">
              {steps.map((step, index) => (
                <div key={step.id} className="flex items-center flex-1">
                  <div className="flex items-center">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full text-sm font-semibold transition-all duration-300 ${
                      step.id < currentStep 
                        ? 'bg-green-500 text-white shadow-lg' 
                        : step.id === currentStep
                        ? 'bg-blue-500 text-white shadow-lg'
                        : 'bg-slate-200 text-slate-500'
                    }`}>
                      {step.id < currentStep ? '✓' : step.id}
                    </div>
                    <div className="ml-3">
                      <div className={`text-sm font-semibold ${
                        step.id <= currentStep ? 'text-slate-800' : 'text-slate-500'
                      }`}>
                        {step.title}
                      </div>
                      <div className="text-xs text-slate-500">{step.description}</div>
                    </div>
                  </div>
                  {index < steps.length - 1 && (
                    <div className={`flex-1 h-px mx-6 transition-all duration-300 ${
                      step.id < currentStep ? 'bg-green-500' : 'bg-slate-200'
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
                <h2 className="text-xl font-semibold text-slate-800 mb-6">
                  Step {currentStep}: {steps[currentStep - 1]?.title}
                </h2>
                
                {currentStep === 1 && (
                  <div>
                    <p className="text-slate-600 mb-6 leading-relaxed">
                      Initialize a server-side identity using your Google account. This creates a unique cryptographic commitment for your session.
                    </p>
                    <button
                      onClick={initializeServerIdentity}
                      disabled={isLoading}
                      className="bg-blue-500 hover:bg-blue-600 disabled:bg-slate-300 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md"
                    >
                      {isLoading ? 'Initializing...' : 'Initialize Identity'}
                    </button>
                  </div>
                )}

                {currentStep === 2 && (
                  <div>
                    <p className="text-slate-600 mb-6 leading-relaxed">
                      Add your identity commitment to the Semaphore group. This establishes your membership in the group.
                    </p>
                    <button
                      onClick={joinGroup}
                      disabled={isLoading}
                      className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md"
                    >
                      {isLoading ? 'Joining...' : 'Join Group'}
                    </button>
                  </div>
                )}

                {currentStep === 3 && (
                  <div>
                    <p className="text-slate-600 mb-6 leading-relaxed">
                      Fetch and display the current group details to verify your membership status.
                    </p>
                    <button
                      onClick={fetchGroupDetails}
                      disabled={isLoading}
                      className="bg-purple-500 hover:bg-purple-600 disabled:bg-slate-300 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md"
                    >
                      {isLoading ? 'Fetching...' : 'View Group Details'}
                    </button>
                  </div>
                )}

                {currentStep === 4 && (
                  <div>
                    <p className="text-slate-600 mb-6 leading-relaxed">
                      Generate a zero-knowledge proof to demonstrate your membership without revealing your identity.
                    </p>
                    <button
                      onClick={handleProveMembership}
                      disabled={isLoading}
                      className="bg-green-500 hover:bg-green-600 disabled:bg-slate-300 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md"
                    >
                      {isLoading ? 'Generating...' : 'Generate Proof'}
                    </button>
                  </div>
                )}

                {currentStep === 5 && (
                  <div>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                      <h3 className="text-green-800 font-semibold mb-2">Flow Completed Successfully</h3>
                      <p className="text-green-700 text-sm">
                        You have successfully proven your membership in the group using zero-knowledge cryptography.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-6">
              {groupDetails && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">Group Details</h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">ID</p>
                      <p className="text-sm font-mono text-slate-800 bg-slate-50 p-2 rounded">{groupDetails.id}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Tree Depth</p>
                      <p className="text-sm font-mono text-slate-800 bg-slate-50 p-2 rounded">{groupDetails.treeDepth || '20'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Members</p>
                      <p className="text-sm font-mono text-slate-800 bg-slate-50 p-2 rounded">{groupDetails.members?.length || '0'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Root</p>
                      <p className="text-sm font-mono text-slate-800 bg-slate-50 p-2 rounded truncate">{groupDetails.root}</p>
                    </div>
                  </div>
                </div>
              )}

              {verificationResult && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">Verification Result</h3>
                  <div className={`p-3 rounded-lg ${
                    verificationResult.includes('Error')
                      ? 'bg-red-50 border border-red-200'
                      : 'bg-green-50 border border-green-200'
                  }`}>
                    <p className={`text-sm font-semibold ${
                      verificationResult.includes('Error')
                        ? 'text-red-800'
                        : 'text-green-800'
                    }`}>
                      {verificationResult}
                    </p>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="space-y-3">
                  <button
                    onClick={resetFlow}
                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
                  >
                    Reset Flow
                  </button>
                  <button
                    onClick={resetGroup}
                    className="w-full bg-orange-100 hover:bg-orange-200 text-orange-700 font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
                  >
                    Reset Group
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Activity Log</h3>
            <div className="max-h-64 overflow-y-auto bg-slate-50 rounded-lg p-4">
              {logs.length === 0 ? (
                <p className="text-slate-500 text-sm">No activity yet. Start with step 1.</p>
              ) : (
                <div className="space-y-2">
                  {logs.map((log, index) => (
                    <div key={index} className="text-sm text-slate-700 py-1 break-words">
                      {log}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-8 max-w-md w-full mx-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Semaphore Demo</h1>
          <p className="text-slate-600 mb-8">Zero-Knowledge Proof Authentication</p>
          <button
            onClick={() => signIn('google')}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md"
          >
            Login with Google
          </button>
        </div>
      </div>
    </div>
  );
}
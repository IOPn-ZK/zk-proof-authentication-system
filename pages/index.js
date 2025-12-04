import { useCallback, useEffect, useState } from 'react';
import { Identity } from '@semaphore-protocol/identity';
import { generateProof } from '@semaphore-protocol/proof';
import { Group } from '@semaphore-protocol/group';
import { useUser } from '@auth0/nextjs-auth0/client';
import { useRouter } from 'next/router';
import { useGoogleLogin } from '@react-oauth/google';

function Home() {
  const router = useRouter();
  const { user, error: authError, isLoading } = useUser();
  const [error, setError] = useState(null);
  const [walletAddress, setWalletAddress] = useState(null);
  const [serverIdentity, setServerIdentity] = useState(null);
  const [groupDetails, setGroupDetails] = useState(null);
  const [verificationResult, setVerificationResult] = useState(null);
  const [logs, setLogs] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoadingFlow, setIsLoadingFlow] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [exportedPrivateKey, setExportedPrivateKey] = useState(null);
  const [exportedSeed, setExportedSeed] = useState(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [showSeed, setShowSeed] = useState(false);
  const [isExportingPrivateKey, setIsExportingPrivateKey] = useState(false);
  const [isExportingSeed, setIsExportingSeed] = useState(false);
  const [hideCountdown, setHideCountdown] = useState(30);
  const [pendingCloudShare, setPendingCloudShare] = useState(null);
  const [cloudBackupPassword, setCloudBackupPassword] = useState('');
  const [cloudBackupStatus, setCloudBackupStatus] = useState(null);
  const [isUploadingCloudBackup, setIsUploadingCloudBackup] = useState(false);

  const addLog = useCallback((message) => {
    setLogs((prevLogs) => [...prevLogs, `${new Date().toLocaleTimeString()}: ${message}`]);
  }, []);

  useEffect(() => {
    if (router.query.error) {
      setError(decodeURIComponent(router.query.error));
      addLog(`Auth0 Error: ${decodeURIComponent(router.query.error)}`);
    }
  }, [router.query.error]);

  useEffect(() => {
    if (authError) {
      setError(authError.message);
      addLog(`Auth Error: ${authError.message}`);
    }
  }, [authError]);

  // Step 0: Generate Wallet (Wallet Abstraction)
  const generateWallet = async () => {
    setIsLoadingFlow(true);
    try {
      addLog('Generating deterministic wallet from Auth0 sub claim...');
      const response = await fetch('/api/zk/wallet/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to generate wallet');
      }
      
      setWalletAddress(data.walletAddress);
      addLog(`✅ Wallet generated: ${data.walletAddress}`);
      addLog(`Identity commitment: ${data.identityCommitment}`);
      addLog('Wallet abstraction complete - ready for ZK Semaphore');
      setCurrentStep(1);
    } catch (error) {
      console.error('Error generating wallet:', error);
      addLog(`Error: ${error.message}`);
    } finally {
      setIsLoadingFlow(false);
    }
  };

  useEffect(() => {
    if (user) {
      addLog('Sign in with Google handled by Auth0');
      addLog('Starting wallet abstraction flow...');
      // Auto-generate wallet after login
      generateWallet();
      fetch('/api/admin/users/self').then(r => r.json()).then(d => setIsAdmin(!!d.isAdmin)).catch(() => setIsAdmin(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Auto-hide private key and seed after 30 seconds for security
  useEffect(() => {
    if (showPrivateKey || showSeed) {
      // Reset countdown when showing
      setHideCountdown(30);
      
      // Countdown timer
      const countdownInterval = setInterval(() => {
        setHideCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Auto-hide timer
      const hideTimer = setTimeout(() => {
        setShowPrivateKey(false);
        setShowSeed(false);
        setExportedPrivateKey(null);
        setExportedSeed(null);
        setHideCountdown(30);
        addLog('🔒 Private key and seed hidden for security (30s timeout)');
      }, 30000); // 30 seconds

      return () => {
        clearTimeout(hideTimer);
        clearInterval(countdownInterval);
      };
    } else {
      setHideCountdown(30);
    }
  }, [showPrivateKey, showSeed]);

  // Step 1: Initialize Server Identity (uses wallet from step 0)
  const initializeServerIdentity = async () => {
    if (!walletAddress) {
      addLog('No wallet available. Please generate wallet first.');
      return;
    }
    
    setIsLoadingFlow(true);
    try {
      addLog('Initializing Semaphore identity from wallet...');
      const response = await fetch('/api/zk/identity/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to initialize server identity');
      }
      
      setServerIdentity(data.identityCommitment);
      addLog(`✅ Semaphore identity initialized: ${data.identityCommitment}`);
      addLog(`Identity commitment stored for proof generation`);
      
      // Handle key shares if they were just created (client-side only)
      if (data.sharesCreated && data.shares && typeof window !== 'undefined' && user?.sub) {
        try {
          addLog('🔐 Key shares created - storing Share A in device...');
          // Dynamic import for client-side only
          const { storeDeviceShare } = await import('../lib/security/deviceStorage.js');
          await storeDeviceShare(user.sub, data.shares.shareA);
          addLog('✅ Share A stored securely in device storage');
          addLog(`📦 Share C ready for cloud backup: ${data.shares.shareC.substring(0, 20)}...`);
          addLog('⚠️  Note: Share C should be encrypted and uploaded to Google Drive');
          setPendingCloudShare(data.shares.shareC);
          setCloudBackupStatus('Share C ready. Add a backup password and upload to Google Drive.');
        } catch (shareError) {
          console.error('Error storing Share A:', shareError);
          addLog(`⚠️  Warning: Could not store Share A: ${shareError.message}`);
        }
      } else if (data.sharesCreated === false) {
        addLog('ℹ️  Key shares already exist for this user');
      }
      
      setCurrentStep(2);
    } catch (error) {
      console.error('Error initializing server identity:', error);
      addLog(`Error: ${error.message}`);
    } finally {
      setIsLoadingFlow(false);
    }
  };

  // Step 2: Join Group
  const joinGroup = async () => {
    if (!serverIdentity) {
      addLog('No server identity available. Please initialize identity first.');
      return;
    }
    
    setIsLoadingFlow(true);
    try {
      addLog('Sending join group request...');
      const response = await fetch('/api/zk/group/members-pg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commitment: serverIdentity }),
      });
      
      addLog(`Response status: ${response.status} ${response.statusText}`);
      
      let data;
      try {
        data = await response.json();
        addLog(`Response data: ${JSON.stringify(data)}`);
      } catch (parseError) {
        addLog(`Failed to parse response as JSON: ${parseError.message}`);
        throw new Error('Invalid response format from server');
      }
      
      // Check both HTTP status AND success field
      if (!response.ok) {
        addLog(`HTTP error: ${response.status} - ${data.message || 'Unknown error'}`);
        throw new Error(data.message || `Server error: ${response.status}`);
      }
      
      if (!data.success) {
        addLog(`API returned success: false - ${data.message || 'Unknown error'}`);
        throw new Error(data.message || 'Operation failed');
      }
      
      addLog(`Successfully joined group: ${data.message}`);
      setCurrentStep(3);
    } catch (error) {
      addLog(`Error joining group: ${error.message}`);
      console.error('Join group error details:', error);
    } finally {
      setIsLoadingFlow(false);
    }
  };

  // Step 3: Show Group Details
  const fetchGroupDetails = async () => {
    setIsLoadingFlow(true);
    try {
      const response = await fetch('/api/zk/group/full-pg');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to fetch group details');
      }
      
      setGroupDetails(data);
      addLog('Successfully fetched group details');
      addLog(`Group ID: ${data.id}, Tree Depth: ${data.treeDepth || '20'}, Members: ${data.members?.length || 0}`);
      
            
      setCurrentStep(4);
    } catch (error) {
      console.error('Error fetching group details:', error);
      addLog(`Error fetching group details: ${error.message}`);
    } finally {
      setIsLoadingFlow(false);
    }
  };

  // Step 4: Generate and Verify Proof
  const handleProveMembership = async () => {
    if (!serverIdentity) {
      setVerificationResult('No server identity available. Please complete previous steps.');
      addLog('No server identity available. Please complete previous steps.');
      return;
    }

    setIsLoadingFlow(true);
    try {
      let groupData = groupDetails;
      if (!groupData) {
        addLog('No group details available, fetching...');
        const response = await fetch('/api/zk/group/full-pg');
        groupData = await response.json();
        
        if (!response.ok || !groupData.success) {
          setVerificationResult(`Error: ${groupData.message || groupData.error || 'Failed to fetch group'}`);
          addLog(`Error: ${groupData.message || groupData.error || 'Failed to fetch group'}`);
          return;
        }
      }

      addLog(`Group data: ID=${groupData.id}, TreeDepth=${groupData.treeDepth || '20'}, Members=${groupData.members?.length || 0}`);

      if (!groupData.id || !Array.isArray(groupData.members)) {
        setVerificationResult(`Error: Invalid group data received`);
        addLog(`Error: Invalid group data received`);
        return;
      }

      addLog(`Server commitment: ${serverIdentity}`);
      addLog(`Group has ${groupData.members.length} members`);

      if (!groupData.members.includes(serverIdentity)) {
        setVerificationResult('Error: Your identity is not in the group. Please complete step 2.');
        addLog('Error: Identity not in group. Please complete step 2.');
        return;
      }

      const treeDepth = groupData.treeDepth || 20;
      const groupId = groupData.id;
      const members = groupData.members.map(BigInt);
      const fetchedGroup = new Group(groupId, treeDepth, members);

      addLog('Retrieving deterministic identity for proof generation');
      
      const identityResponse = await fetch('/api/zk/identity/retrieve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!identityResponse.ok) {
        const errorData = await identityResponse.json();
        throw new Error(errorData.message || 'Failed to retrieve identity');
      }
      
      const identityData = await identityResponse.json();
      
      if (identityData.commitment !== serverIdentity) {
        setVerificationResult('Error: Identity mismatch. Please reset and try again.');
        addLog('Error: Identity mismatch between server and client.');
        addLog(`Expected: ${serverIdentity}`);
        addLog(`Got: ${identityData.commitment}`);
        return;
      }
      
      addLog('Identity validation successful - proceeding with server-side proof generation');

      const signal = 1;
      const externalNullifier = Math.floor(Math.random() * 1000000);
      addLog(`Requesting proof generation with: Signal=${signal}, ExternalNullifier=${externalNullifier}`);
      
      const proofResponse = await fetch('/api/zk/proof', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          signal, 
          externalNullifier,
          groupId: groupData.id,
          treeDepth: treeDepth
        }),
      });
      
      if (!proofResponse.ok) {
        const errorData = await proofResponse.json();
        throw new Error(errorData.message || 'Failed to generate proof');
      }
      
      const proofData = await proofResponse.json();
      const fullProof = proofData.proof;

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
        if (verifyData.error === 'REUSED_NULLIFIER') {
          addLog('⚠️ This proof was already used - replay prevention working!');
        }
      }
    } catch (error) {
      console.error('Error in handleProveMembership:', error);
      setVerificationResult(`Error: ${error.message}`);
      addLog(`Error in proof generation: ${error.message}`);
    } finally {
      setIsLoadingFlow(false);
    }
  };

  // Decrypt data using Web Crypto API
  const decryptData = async (encryptedData, sessionKey) => {
    try {
      // Convert hex strings to ArrayBuffers
      const keyBuffer = new Uint8Array(
        sessionKey.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
      );
      
      const iv = new Uint8Array(
        encryptedData.iv.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
      );
      
      const authTag = new Uint8Array(
        encryptedData.authTag.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
      );
      
      const encrypted = new Uint8Array(
        encryptedData.encrypted.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
      );

      // Import the key
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBuffer,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );

      // For AES-GCM in Web Crypto API, combine encrypted data with auth tag
      // The auth tag must be appended to the encrypted data
      const encryptedWithTag = new Uint8Array(encrypted.length + authTag.length);
      encryptedWithTag.set(encrypted);
      encryptedWithTag.set(authTag, encrypted.length);

      // Decrypt (Web Crypto API expects auth tag appended)
      const decrypted = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv,
          tagLength: 128 // 16 bytes = 128 bits
        },
        cryptoKey,
        encryptedWithTag
      );

      return new TextDecoder().decode(decrypted);
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt data. Make sure you have a valid session.');
    }
  };

  // Export and decrypt private key
  const exportPrivateKey = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (!walletAddress) {
      addLog('No wallet available. Please generate wallet first.');
      return;
    }

    if (isExportingPrivateKey || isExportingSeed) {
      return; // Prevent multiple simultaneous exports
    }

    setIsExportingPrivateKey(true);
    try {
      addLog('Exporting private key...');
      const response = await fetch('/api/zk/wallet/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to export private key');
      }

      // Decrypt the private key client-side
      const decryptedPrivateKey = await decryptData(data.encryptedPrivateKey, data.sessionKey);
      setExportedPrivateKey(decryptedPrivateKey);
      setShowPrivateKey(true);
      // Hide seed if it was showing
      setShowSeed(false);
      setExportedSeed(null);
      addLog('✅ Private key exported and decrypted');
    } catch (error) {
      console.error('Error exporting private key:', error);
      addLog(`Error: ${error.message}`);
    } finally {
      setIsExportingPrivateKey(false);
    }
  };

  // Export and decrypt seed
  const exportSeed = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (!walletAddress) {
      addLog('No wallet available. Please generate wallet first.');
      return;
    }

    if (isExportingPrivateKey || isExportingSeed) {
      return; // Prevent multiple simultaneous exports
    }

    setIsExportingSeed(true);
    try {
      addLog('Exporting seed...');
      const response = await fetch('/api/zk/wallet/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to export seed');
      }

      // Decrypt the seed client-side
      const decryptedSeed = await decryptData(data.encryptedSeed, data.sessionKey);
      setExportedSeed(decryptedSeed);
      setShowSeed(true);
      // Hide private key if it was showing
      setShowPrivateKey(false);
      setExportedPrivateKey(null);
      addLog('✅ Seed exported and decrypted');
    } catch (error) {
      console.error('Error exporting seed:', error);
      addLog(`Error: ${error.message}`);
    } finally {
      setIsExportingSeed(false);
    }
  };

  // Copy to clipboard
  const copyToClipboard = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      addLog(`✅ ${label} copied to clipboard`);
    } catch (error) {
      console.error('Failed to copy:', error);
      addLog(`Error copying ${label}`);
    }
  };

  // Reset flow
  const resetFlow = () => {
    setCurrentStep(0);
    setWalletAddress(null);
    setServerIdentity(null);
    setGroupDetails(null);
    setVerificationResult(null);
    setExportedPrivateKey(null);
    setExportedSeed(null);
    setShowPrivateKey(false);
    setShowSeed(false);
    setLogs([]);
    setPendingCloudShare(null);
    setCloudBackupPassword('');
    setCloudBackupStatus(null);
    addLog('Flow reset - regenerating wallet...');
    if (user) {
      generateWallet();
    }
  };

  const handleCloudBackupUpload = useCallback(async (accessToken) => {
    if (!pendingCloudShare) {
      setCloudBackupStatus('No Share C available to upload.');
      return;
    }
    if (!cloudBackupPassword || cloudBackupPassword.length < 8) {
      setCloudBackupStatus('Please enter a backup password with at least 8 characters.');
      return;
    }
    setIsUploadingCloudBackup(true);
    try {
      setCloudBackupStatus('Encrypting Share C...');
      const {
        encryptShareForCloudBackup,
        uploadToGoogleDrive,
        generateBackupFileName
      } = await import('../lib/security/cloudBackupService.js');
      const encrypted = await encryptShareForCloudBackup(pendingCloudShare, cloudBackupPassword);
      setCloudBackupStatus('Uploading encrypted share to Google Drive...');
      const uploadResult = await uploadToGoogleDrive(
        encrypted.encryptedData,
        generateBackupFileName(user?.sub || 'anon-user'),
        accessToken
      );
      setCloudBackupStatus('Storing cloud backup metadata...');
      const metadataResponse = await fetch('/api/zk/shares/cloud-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cloudBackupUrl: uploadResult.fileId,
          shareHash: encrypted.hash
        })
      });
      const metadata = await metadataResponse.json();
      if (!metadataResponse.ok || !metadata.success) {
        throw new Error(metadata.message || 'Failed to store cloud backup metadata');
      }
      addLog(`✅ Share C uploaded to Google Drive file ${uploadResult.fileName || uploadResult.fileId}`);
      addLog('📁 Cloud backup metadata stored successfully');
      setCloudBackupStatus('✅ Share C encrypted, uploaded, and recorded. You can now safely close this session.');
      setPendingCloudShare(null);
      setCloudBackupPassword('');
    } catch (error) {
      console.error('Cloud backup error:', error);
      setCloudBackupStatus(`Failed to back up Share C: ${error.message}`);
      addLog(`Cloud backup error: ${error.message}`);
    } finally {
      setIsUploadingCloudBackup(false);
    }
  }, [pendingCloudShare, cloudBackupPassword, user?.sub, addLog]);

  const googleDriveLogin = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/drive.file',
    onSuccess: ({ access_token: accessToken }) => handleCloudBackupUpload(accessToken),
    onError: (errorResponse) => {
      console.error('Google Drive auth error:', errorResponse);
      setCloudBackupStatus(`Google authorization failed: ${errorResponse.error || 'Unknown error'}`);
    }
  });

  const initiateCloudBackup = () => {
    if (!pendingCloudShare) {
      setCloudBackupStatus('No Share C available to upload.');
      return;
    }
    if (!cloudBackupPassword || cloudBackupPassword.length < 8) {
      setCloudBackupStatus('Please enter a backup password with at least 8 characters.');
      return;
    }
    setCloudBackupStatus('Requesting permission to create a Drive backup...');
    googleDriveLogin();
  };

  // Reset group
  const resetGroup = async () => {
    setIsLoadingFlow(true);
    try {
      const response = await fetch('/api/zk/group/reset-pg', {
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
      setIsLoadingFlow(false);
    }
  };

  const steps = [
    { id: 0, title: 'Generate Wallet', description: 'Wallet abstraction from social login' },
    { id: 1, title: 'Initialize Identity', description: 'Create Semaphore identity' },
    { id: 2, title: 'Join Group', description: 'Add to Semaphore group' },
    { id: 3, title: 'View Details', description: 'Fetch group information' },
    { id: 4, title: 'Generate Proof', description: 'Create ZK proof' },
    { id: 5, title: 'Complete', description: 'Flow completed' }
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="max-w-8xl mx-auto p-6">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-slate-800">Semaphore + OAuth Demo</h1>
              <p className="text-slate-600 mt-1">Zero-Knowledge Proof Authentication</p>
            </div>
            <div className="flex gap-3 items-center">
              <button
                onClick={async () => {
                  try {
                    // demo self-promote via /self POST (dev or ALLOW_SELF_PROMOTE=true)
                    await fetch(`/api/admin/users/self?ts=${Date.now()}`, { method: 'POST', headers: { 'Cache-Control': 'no-store' } });
                  } catch {}
                  window.location.href = '/admin';
                }}
                className="px-4 py-2 text-sm font-semibold text-white bg-slate-800 hover:bg-black transition-colors rounded-lg"
              >
                Admin
              </button>
              <button
              onClick={() => {
                window.location.href = '/api/auth/logout';
              }}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors hover:bg-slate-100 rounded-lg"
            >
              Sign out
            </button>
            </div>
          </div>

          <div className="mb-8">
            <div className="flex items-center justify-between px-3">
              {steps.map((step, index) => (
                <div key={step.id} className="flex items-center flex-1">
                  <div className="flex items-center">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full text-sm font-semibold transition-all duration-300 shrink-0 ${
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
                  {/* Connecting line intentionally removed */}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
                <h2 className="text-xl font-semibold text-slate-800 mb-6">
                  Step {currentStep}: {steps[currentStep]?.title}
                </h2>
                
                {currentStep === 0 && (
                  <div>
                    <p className="text-slate-600 mb-6 leading-relaxed">
                      Generating your deterministic wallet from your Auth0 social login. This wallet is created using HKDF from your unique Auth0 sub claim - no storage required!
                    </p>
                    {walletAddress ? (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
                        <h3 className="text-green-800 font-semibold mb-2">✅ Wallet Generated Successfully</h3>
                        <p className="text-green-700 text-sm mb-2">Your deterministic wallet address:</p>
                        <p className="text-sm font-mono text-green-800 bg-green-100 p-2 rounded break-all">{walletAddress}</p>
                      </div>
                    ) : (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-4"></div>
                        <p className="text-blue-800 text-center">Generating wallet...</p>
                      </div>
                    )}
                    <button
                      onClick={generateWallet}
                      disabled={isLoadingFlow}
                      className="bg-blue-500 disabled:bg-slate-300 text-white font-semibold py-3 px-6 my-3 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md "
                    >
                      {isLoadingFlow ? 'Generating...' : 'Regenerate Wallet'}
                    </button>
                  </div>
                )}

                {currentStep === 1 && (
                  <div>
                    <p className="text-slate-600 mb-6 leading-relaxed">
                      Initialize your Semaphore identity using the wallet generated from your social login. This creates a unique cryptographic commitment for zero-knowledge proofs.
                    </p>

                    <button
                      onClick={initializeServerIdentity}
                      disabled={isLoadingFlow || !walletAddress}
                      className="bg-blue-500 hover:bg-blue-600 disabled:bg-slate-300 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md"
                    >
                      {isLoadingFlow ? 'Initializing...' : 'Initialize Identity'}
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
                      disabled={isLoadingFlow}
                      className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md"
                    >
                      {isLoadingFlow ? 'Joining...' : 'Join Group'}
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
                      disabled={isLoadingFlow}
                      className="bg-purple-500 hover:bg-purple-600 disabled:bg-slate-300 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md"
                    >
                      {isLoadingFlow ? 'Fetching...' : 'View Group Details'}
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
                      disabled={isLoadingFlow}
                      className="bg-green-500 hover:bg-green-600 disabled:bg-slate-300 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md"
                    >
                      {isLoadingFlow ? 'Generating...' : 'Generate Proof'}
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
              {walletAddress && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">Wallet Address</h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Address</p>
                      <p className="text-sm font-mono text-slate-800 bg-slate-50 p-2 rounded break-all">{walletAddress}</p>
                    </div>


                    {/* Export Buttons */}
                    <div className="pt-3 border-t border-slate-200 space-y-2">
                      <button
                        type="button"
                        onClick={exportPrivateKey}
                        disabled={isExportingPrivateKey || isExportingSeed}
                        className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 text-sm"
                      >
                        {isExportingPrivateKey ? 'Exporting...' : 'Export Private Key'}
                      </button>
                      <button
                        type="button"
                        onClick={exportSeed}
                        disabled={isExportingPrivateKey || isExportingSeed}
                        className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 text-sm"
                      >
                        {isExportingSeed ? 'Exporting...' : 'View Seed'}
                      </button>
                    </div>

                    {/* Security Warning */}
                    {(showPrivateKey || showSeed) && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-3">
                        <p className="text-sm font-semibold text-red-800 mb-1">Security Warning</p>
                        <p className="text-xs text-red-700">
                          Never share your private key or seed with anyone. Anyone with access can control your wallet. Only import into trusted wallets like MetaMask.
                        </p>
                      </div>
                    )}

                    {/* Exported Private Key */}
                    {showPrivateKey && exportedPrivateKey && (
                      <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-semibold text-amber-800">Private Key</p>
                            {hideCountdown > 0 && (
                              <span className="text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded">
                                Hides in {hideCountdown}s
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => copyToClipboard(exportedPrivateKey, 'Private key')}
                            className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-2 py-1 rounded"
                          >
                            Copy
                          </button>
                        </div>
                        <p className="text-xs font-mono text-amber-900 bg-amber-100 p-2 rounded break-all">
                          {exportedPrivateKey}
                        </p>
                        <p className="text-xs text-amber-700 mt-2">
                          Import this into MetaMask: Settings → Security & Privacy → Show Private Key → Import Account
                        </p>
                      </div>
                    )}

                    {/* Exported Seed */}
                    {showSeed && exportedSeed && (
                      <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-semibold text-purple-800">Seed (Hex)</p>
                            {hideCountdown > 0 && (
                              <span className="text-xs text-purple-600 bg-purple-100 px-2 py-0.5 rounded">
                                Hides in {hideCountdown}s
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => copyToClipboard(exportedSeed, 'Seed')}
                            className="text-xs bg-purple-500 hover:bg-purple-600 text-white px-2 py-1 rounded"
                          >
                            Copy
                          </button>
                        </div>
                        <p className="text-xs font-mono text-purple-900 bg-purple-100 p-2 rounded break-all">
                          {exportedSeed}
                        </p>
                        <p className="text-xs text-purple-700 mt-2">
                          This is the 32-byte seed used to generate your wallet. Keep it secure.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

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

              {(pendingCloudShare || cloudBackupStatus) && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">Cloud Backup</h3>
                  <p className="text-sm text-slate-600 mb-4">
                    Encrypt Share C with a password/biometric phrase and upload it to your Google Drive.
                  </p>
                  {pendingCloudShare ? (
                    <>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                        Backup Password (min 8 chars)
                      </label>
                      <input
                        type="password"
                        value={cloudBackupPassword}
                        onChange={(e) => setCloudBackupPassword(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Strong password used to encrypt Share C"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={initiateCloudBackup}
                        disabled={isUploadingCloudBackup}
                        className="w-full bg-green-500 hover:bg-green-600 disabled:bg-slate-300 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 text-sm"
                      >
                        {isUploadingCloudBackup ? 'Uploading...' : 'Encrypt & Upload to Google Drive'}
                      </button>
                    </>
                  ) : (
                    <p className="text-sm text-slate-500">
                      No pending Share C. Re-initialize identity to create new shares if needed.
                    </p>
                  )}
                  {cloudBackupStatus && (
                    <div className="mt-4 text-sm rounded-lg p-3 border bg-slate-50 text-slate-700">
                      {cloudBackupStatus}
                    </div>
                  )}
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
          
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 text-sm font-medium">Authentication Error:</p>
              <p className="text-red-700 text-sm mt-1">{error}</p>
            </div>
          )}
          
          <button
            onClick={() => {
              window.location.href = '/api/auth/login';
            }}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Login with Google
          </button>
          
          <p className="text-xs text-slate-500 mt-4">
            Click the button above to authenticate with Google via Auth0
          </p>
          
          {error && (
            <button
              onClick={() => {
                setError(null);
                window.location.href = '/api/auth/login';
              }}
              className="mt-4 w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 text-sm"
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default Home;
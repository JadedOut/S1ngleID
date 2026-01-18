"use client";

import { useState } from 'react';
import { verifyAgeWithPasskey, hasAgePasskey, resetAgePasskey } from '@/lib/webauthn-client';
import { useRouter } from 'next/navigation';

export default function DemoCasinoPage() {
  const router = useRouter();
  const [ageVerified, setAgeVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState('');

  const handleVerifyAge = async () => {
    // 1. Check Local Storage ("The Store")
    if (!hasAgePasskey()) {
      setMessage('No passkey found. Redirecting to setup...');
      setTimeout(() => router.push('/setup-passkey'), 1500);
      return;
    }

    setVerifying(true);
    setMessage('Verifying age with passkey...');

    // 2. Trigger "The Fetch" + Windows Hello
    const result = await verifyAgeWithPasskey();

    if (result.verified) {
      // 3. Simple State Update (No Login Form anymore)
      setAgeVerified(true);
      setMessage(''); // Clear verifying message
    } else {
      setMessage(`❌ Verification failed: ${result.error}`);
    }

    setVerifying(false);
  };

  const handleReset = () => {
    resetAgePasskey(); // Clears localStorage
    setAgeVerified(false);
    setMessage('Passkey cleared. You can verify again.');
    // Optional: Redirect to setup if they need to create a new one
    // router.push('/setup-passkey'); 
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-900 via-orange-900 to-yellow-900">
      {/* Casino Header */}
      <header className="bg-black/30 backdrop-blur-sm border-b border-yellow-500/30 p-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-4xl">🎰</span>
            <h1 className="text-3xl font-bold text-yellow-400">
              Lucky777 Casino
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-yellow-300 text-sm">
              🔞 21+ Only
            </div>
            <button
              onClick={handleReset}
              className="text-xs bg-red-900/30 hover:bg-red-900/50 text-red-400 px-3 py-1.5 rounded border border-red-500/30 transition backdrop-blur-md"
              title="Clear Passkey & Reset"
            >
              🔄 Reset
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex items-center justify-center p-8 min-h-[calc(100vh-80px)]">
        <div className="max-w-md w-full bg-black/50 backdrop-blur-xl rounded-2xl shadow-2xl border border-yellow-500/30 p-8">
          {!ageVerified ? (
            <>
              <div className="text-center mb-6">
                <div className="text-6xl mb-4">🔞</div>
                <h2 className="text-2xl font-bold text-white mb-2">
                  Age Verification Required
                </h2>
                <p className="text-yellow-300 text-sm">
                  You must be 21+ to access this casino
                </p>
              </div>

              <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4 mb-6">
                <p className="text-red-200 text-sm">
                  ⚠️ This site requires age verification to comply with gambling regulations.
                </p>
              </div>

              <button
                onClick={handleVerifyAge}
                disabled={verifying}
                className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 text-black py-4 rounded-lg font-bold text-lg hover:from-yellow-600 hover:to-orange-600 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {verifying ? (
                  <>🔄 Verifying...</>
                ) : (
                  <>🔐 Verify Age with Passkey</>
                )}
              </button>

              {message && (
                <div className={`mt-4 p-3 rounded-lg text-sm ${message.includes('✅')
                  ? 'bg-green-900/50 text-green-200 border border-green-500/30'
                  : 'bg-red-900/50 text-red-200 border border-red-500/30'
                  }`}>
                  {message}
                </div>
              )}

              <div className="mt-6 text-center">
                <p className="text-xs text-gray-400">
                  Don't have a passkey?{' '}
                  <button
                    onClick={() => router.push('/setup-passkey')}
                    className="text-yellow-400 hover:text-yellow-300 underline"
                  >
                    Create one here
                  </button>
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="text-center mb-8">
                <div className="text-6xl mb-4">🎉</div>
                <h2 className="text-3xl font-bold text-white mb-2">
                  Logged In
                </h2>
                <p className="text-green-300 text-lg">
                  Welcome back, Player!
                </p>
              </div>

              <div className="bg-green-900/30 border border-green-500/50 rounded-lg p-6 mb-8 text-center">
                <p className="text-green-100 mb-2">
                  ✅ Age Verified via Windows Hello
                </p>
                <p className="text-xs text-gray-400">
                  Secure passkey authentication used.
                </p>
              </div>

              <div className="space-y-4">
                <button
                  onClick={() => alert('Starting Game... (Demo)')}
                  className="w-full bg-gradient-to-r from-green-500 to-emerald-500 text-white py-3 rounded-lg font-bold hover:from-green-600 hover:to-emerald-600 transition shadow-lg shadow-green-900/20"
                >
                  🎰 Play Slots
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from 'react';
import { createAgePasskey, hasAgePasskey } from '@/lib/webauthn-client';
import { useRouter } from 'next/navigation';

export default function SetupPasskeyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [alreadyHasPasskey, setAlreadyHasPasskey] = useState(false);

  useEffect(() => {
    setAlreadyHasPasskey(hasAgePasskey());
  }, []);

  const handleCreatePasskey = async () => {
    setLoading(true);
    setMessage('Creating your age verification passkey...');

    const result = await createAgePasskey();

    if (result.success) {
      setMessage('✅ Passkey created successfully! Redirecting...');
      setTimeout(() => {
        router.push('/demo-casino');
      }, 2000);
    } else {
      setMessage(`❌ Error: ${result.error}`);
      setLoading(false);
    }
  };

  if (alreadyHasPasskey) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 via-emerald-900 to-green-900 flex items-center justify-center p-8">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="text-3xl font-bold text-gray-800 mb-4">
            Passkey Already Set Up!
          </h1>
          <p className="text-gray-600 mb-6">
            You already have an age verification passkey.
          </p>
          <button
            onClick={() => router.push('/demo-casino')}
            className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition"
          >
            Go to Demo Site
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-purple-900 flex items-center justify-center p-8">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🔐</div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            Create Your Age Passkey
          </h1>
          <p className="text-gray-600">
            One passkey. Verify your age anywhere. No more uploading IDs.
          </p>
        </div>

        <div className="bg-blue-50 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-blue-900 mb-2">How it works:</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>✓ Create passkey with Face ID/Touch ID/Windows Hello</li>
            <li>✓ Locked to your biometrics</li>
            <li>✓ Use it on any age-restricted site</li>
            <li>✓ Your ID stays private</li>
          </ul>
        </div>

        <button
          onClick={handleCreatePasskey}
          disabled={loading}
          className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-4 rounded-lg font-bold text-lg hover:from-purple-700 hover:to-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Creating Passkey...' : 'Create Age Passkey'}
        </button>

        {message && (
          <div className={`mt-4 p-4 rounded-lg ${
            message.includes('✅') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}>
            <p className="text-sm">{message}</p>
          </div>
        )}

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            🔒 Privacy-first • Zero data storage • Client-side only
          </p>
        </div>
      </div>
    </div>
  );
}
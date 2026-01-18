"use client";

import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-8">
      <div className="max-w-4xl text-center">
        <div className="mb-8">
          <div className="text-8xl mb-6">🔐</div>
          <h1 className="text-6xl font-bold text-white mb-4">
            KirksPrivacyPirate
          </h1>
          <p className="text-2xl text-slate-300 mb-8">
            Privacy-First Age Verification with Passkeys
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
          <button
            onClick={() => router.push('/setup-passkey')}
            className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-8 rounded-2xl hover:from-purple-700 hover:to-indigo-700 transition shadow-2xl"
          >
            <div className="text-4xl mb-3">🆕</div>
            <h2 className="text-2xl font-bold mb-2">Setup Passkey</h2>
            <p className="text-sm opacity-90">Create your age verification passkey</p>
          </button>

          <button
            onClick={() => router.push('/demo-casino')}
            className="bg-gradient-to-r from-orange-600 to-red-600 text-white p-8 rounded-2xl hover:from-orange-700 hover:to-red-700 transition shadow-2xl"
          >
            <div className="text-4xl mb-3">🎰</div>
            <h2 className="text-2xl font-bold mb-2">Demo Casino</h2>
            <p className="text-sm opacity-90">Try age verification in action</p>
          </button>
        </div>

        <div className="mt-12 bg-slate-800/50 backdrop-blur-xl rounded-2xl p-6 max-w-2xl mx-auto">
          <h3 className="text-xl font-bold text-purple-400 mb-4">How It Works</h3>
          <div className="text-left text-slate-300 space-y-2 text-sm">
            <p>✅ Create passkey once with Face ID/Touch ID/Windows Hello</p>
            <p>✅ Use it on any age-restricted website</p>
            <p>✅ No IDs uploaded - everything stays on your device</p>
            <p>✅ Privacy-first, zero data storage</p>
          </div>
        </div>
      </div>
    </div>
  );
}
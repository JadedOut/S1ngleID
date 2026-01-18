import { NextRequest, NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { storeChallenge } from '@/lib/challenge-store';

export async function POST(req: NextRequest) {
  try {
    const userId = `user_${Date.now()}`;
    const userIdBuffer = new TextEncoder().encode(userId);

    const options = await generateRegistrationOptions({
      rpName: 'KirksPrivacyPirate Age Verification',
      rpID: process.env.NEXT_PUBLIC_RP_ID || 'localhost',
      userID: userIdBuffer,
      userName: 'age-verified-user',
      userDisplayName: '21+ Verified User',
      attestationType: 'none',

      // CRITICAL FOR WINDOWS HELLO
      authenticatorSelection: {
        authenticatorAttachment: 'platform', // Forces Face/Finger/PIN
        userVerification: 'required',
        residentKey: 'preferred',
      },

      excludeCredentials: [],
      supportedAlgorithmIDs: [-7, -257],
    });

    // Store challenge
    await storeChallenge(options.challenge, userId);

    return NextResponse.json(options);

  } catch (error: any) {
    console.error('Create init failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
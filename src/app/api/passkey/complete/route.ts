import { NextRequest, NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import type { VerifiedRegistrationResponse } from '@simplewebauthn/server';
import { prisma } from '@/lib/prisma';
import { getChallenge, deleteChallenge } from '@/lib/challenge-store';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    console.log('=== COMPLETE ROUTE START ===');
    console.log('Body keys:', Object.keys(body));

    // FIXED: Extract the actual registration response
    const registrationResponse = body.registrationResponse;

    console.log('registrationResponse keys:', Object.keys(registrationResponse));

    // Extract challenge
    const clientDataJSON = JSON.parse(
      Buffer.from(registrationResponse.response.clientDataJSON, 'base64').toString('utf-8')
    );

    const challenge = clientDataJSON.challenge;
    console.log('Challenge extracted:', challenge);

    const userId = await getChallenge(challenge);

    if (!userId) {
      console.error('Challenge not found');
      return NextResponse.json({ error: 'Challenge expired' }, { status: 400 });
    }

    console.log('Found userId:', userId);

    let verification: VerifiedRegistrationResponse;

    try {
      verification = await verifyRegistrationResponse({
        response: registrationResponse, // Use the unwrapped response
        expectedChallenge: challenge,
        expectedOrigin: process.env.NEXT_PUBLIC_ORIGIN || 'http://localhost:3000',
        expectedRPID: process.env.NEXT_PUBLIC_RP_ID || 'localhost',
      });
    } catch (error) {
      console.error('Verification failed:', error);
      return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
    }

    console.log('Verified:', verification.verified);

    if (!verification.verified) {
      return NextResponse.json({ error: 'Not verified' }, { status: 400 });
    }

    // Log the structure
    console.log('verification keys:', Object.keys(verification));
    console.log('registrationInfo type:', typeof verification.registrationInfo);

    if (verification.registrationInfo) {
      console.log('registrationInfo keys:', Object.keys(verification.registrationInfo));
    }

    // CORRECT: Access the credential data from the new structure
    const { credential } = verification.registrationInfo!;

    console.log('credentialID type:', typeof credential.id);
    console.log('credentialID value:', credential.id);
    console.log('credential counter:', credential.counter);

    // CRITICAL FIX: Store as base64url (not base64) to match browser format
    // SimpleWebAuthn v10+ returns ID as base64url string, so use it directly
    const credentialIdBase64Url = credential.id;
    const publicKeyBase64 = Buffer.from(credential.publicKey).toString('base64');

    console.log('Storing credentialId as base64url:', credentialIdBase64Url);
    console.log('   (Length: ' + credentialIdBase64Url.length + ')');

    const passkey = await prisma.credential.create({
      data: {
        credentialId: credentialIdBase64Url, // Store as base64url!
        publicKey: publicKeyBase64,
        counter: credential.counter, // Use credential.counter
        status: 'verified_over_21',
        issuedAt: new Date(),
      },
    });

    console.log('✅ PASSKEY SAVED TO DB:', passkey.id);
    console.log('   Credential ID:', passkey.credentialId);
    console.log('=== COMPLETE ROUTE END ===');

    await deleteChallenge(challenge);

    return NextResponse.json({ passkey_id: passkey.id });

  } catch (error: any) {
    console.error('=== COMPLETE ROUTE ERROR ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    return NextResponse.json(
      { error: 'Server error', reason: error.message },
      { status: 500 }
    );
  }
}
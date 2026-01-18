import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { prisma } from '@/lib/prisma';
import { getChallenge } from '@/lib/challenge-store';

export async function POST(req: NextRequest) {
  try {
    const { authResponse, passkey_id } = await req.json();

    if (!passkey_id) {
      return NextResponse.json({ error: 'Missing passkey_id' }, { status: 400 });
    }

    // 1. FETCH CREDENTIAL
    const credential = await prisma.credential.findUnique({
      where: { id: passkey_id }
    });

    if (!credential) {
      return NextResponse.json({ error: 'Passkey not found in DB' }, { status: 404 });
    }

    // 2. VERIFY CHALLENGE
    const clientDataJSON = JSON.parse(
      Buffer.from(authResponse.response.clientDataJSON, 'base64url').toString('utf-8')
    );
    const receivedChallenge = clientDataJSON.challenge;

    // Check if challenge exists for this user/key
    const storedUserId = await getChallenge(receivedChallenge);
    if (!storedUserId) {
      return NextResponse.json({ error: 'Challenge expired or invalid' }, { status: 400 });
    }

    // 3. CRYPTOGRAPHIC VERIFICATION
    const verification = await verifyAuthenticationResponse({
      response: authResponse,
      expectedChallenge: receivedChallenge,
      expectedOrigin: process.env.NEXT_PUBLIC_ORIGIN || 'http://localhost:3000',
      expectedRPID: process.env.NEXT_PUBLIC_RP_ID || 'localhost',
      credential: {
        id: credential.credentialId,
        publicKey: Uint8Array.from(Buffer.from(credential.publicKey, 'base64')),
        counter: Number(credential.counter),
      },
    });

    if (!verification.verified) {
      return NextResponse.json({ error: 'Verification failed' }, { status: 401 });
    }

    // 4. UPDATE COUNTER
    await prisma.credential.update({
      where: { id: credential.id },
      data: { counter: Number(verification.authenticationInfo.newCounter) },
    });

    return NextResponse.json({ verified: true, passkey_id: credential.id });

  } catch (error: any) {
    console.error('Confirm error:', error);
    return NextResponse.json(
      { error: 'Server error', reason: error.message },
      { status: 500 }
    );
  }
}
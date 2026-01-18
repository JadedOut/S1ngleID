import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { prisma } from '@/lib/prisma';
import { getChallenge, deleteChallenge } from '@/lib/challenge-store';
import type { AuthenticatorDevice } from '@simplewebauthn/server/script/deps';

export async function POST(req: NextRequest) {
  try {
    const { passkey_id, authResponse } = await req.json();

    const passkey = await prisma.credential.findUnique({
      where: { id: passkey_id },
    });

    if (!passkey) {
      return NextResponse.json(
        { error: 'Passkey not found' },
        { status: 404 }
      );
    }

    const expectedChallenge = await getChallenge(passkey_id);

    if (!expectedChallenge) {
      return NextResponse.json(
        { error: 'Challenge not found or expired' },
        { status: 400 }
      );
    }

    const authenticator: AuthenticatorDevice = {
      credentialID: Buffer.from(passkey.credentialId, 'base64'),
      credentialPublicKey: Buffer.from(passkey.publicKey, 'base64'),
      counter: passkey.counter,
    };

    const verification = await verifyAuthenticationResponse({
      response: authResponse,
      expectedChallenge,
      expectedOrigin: process.env.NEXT_PUBLIC_ORIGIN || 'http://localhost:3000',
      expectedRPID: process.env.NEXT_PUBLIC_RP_ID || 'localhost',
      authenticator,
    });

    if (!verification.verified) {
      return NextResponse.json(
        { verified: false, error: 'Authentication failed' },
        { status: 401 }
      );
    }

    await prisma.credential.update({
      where: { id: passkey_id },
      data: { counter: verification.authenticationInfo.newCounter },
    });

    await deleteChallenge(passkey_id);

    return NextResponse.json({
      verified: true,
      over_21: true,
      user_age_verified: true,
    });

  } catch (error: any) {
    console.error('Passkey confirm error:', error);
    return NextResponse.json(
      { verified: false, error: error.message },
      { status: 500 }
    );
  }
}
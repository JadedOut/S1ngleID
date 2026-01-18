import { NextRequest, NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { prisma } from '@/lib/prisma';
import { storeChallenge } from '@/lib/challenge-store';

export async function POST(req: NextRequest) {
  try {
    const { passkey_id } = await req.json();

    const passkey = await prisma.credential.findUnique({
      where: { id: passkey_id },
    });

    if (!passkey) {
      return NextResponse.json(
        { error: 'Passkey not found' },
        { status: 404 }
      );
    }

    const options = await generateAuthenticationOptions({
      rpID: process.env.NEXT_PUBLIC_RP_ID || 'localhost',
      allowCredentials: [{
        id: Buffer.from(passkey.credentialId, 'base64'),
        type: 'public-key',
        transports: ['internal', 'hybrid'],
      }],
      userVerification: 'required',
    });

    await storeChallenge(passkey_id, options.challenge);

    return NextResponse.json(options);

  } catch (error: any) {
    console.error('Passkey verify error:', error);
    return NextResponse.json(
      { error: 'Server error', reason: error.message },
      { status: 500 }
    );
  }
}
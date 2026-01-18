import { NextRequest, NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { prisma } from '@/lib/prisma';
import { storeChallenge } from '@/lib/challenge-store';

export async function POST(req: NextRequest) {
  try {
    const { passkey_id } = await req.json();

    if (!passkey_id) {
      return NextResponse.json({ error: 'Missing passkey_id (Cannot fetch key)' }, { status: 400 });
    }

    // 1. FETCH: Look up the specific key
    const credential = await prisma.credential.findUnique({
      where: { id: passkey_id }
    });

    if (!credential) {
      return NextResponse.json({ error: 'Key not found in database' }, { status: 404 });
    }

    // 2. GENERATE: Options for THIS key only
    const options = await generateAuthenticationOptions({
      rpID: process.env.NEXT_PUBLIC_RP_ID || 'localhost',
      allowCredentials: [{
        id: credential.credentialId, // base64url string
        transports: ['internal'],    // FORCE Windows Hello
      }],
      userVerification: 'required',
    });

    // Store challenge
    await storeChallenge(options.challenge, passkey_id);

    return NextResponse.json(options);

  } catch (error: any) {
    console.error('Verify init failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
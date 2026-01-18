import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/types";
import { prisma } from "@/lib/server/prisma";
import { handleCorsOptions, withCors } from "@/lib/server/cors";

// Force Node.js runtime
export const runtime = "nodejs";

// WebAuthn configuration from environment
const WEBAUTHN_RP_ID = process.env.WEBAUTHN_RP_ID || "localhost";
const WEBAUTHN_ORIGIN = process.env.WEBAUTHN_ORIGIN || "http://localhost:3000";

/**
 * Handle OPTIONS preflight for CORS
 */
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

/**
 * POST /api/auth/verify
 *
 * Input: { assertionResponse: AuthenticationResponseJSON }
 *
 * Flow:
 * 1. Extract credential ID from assertion response (passkey-first)
 * 2. Look up credential by WebAuthn credential ID
 * 3. Find matching challenge by challenge value
 * 4. Verify the assertion response
 * 5. Update stored counter
 * 6. Delete used challenge
 *
 * Output: { verified: true, over_19: true }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { assertionResponse } = body as {
      assertionResponse: AuthenticationResponseJSON;
    };

    // Validate input
    if (!assertionResponse || typeof assertionResponse !== "object") {
      const response = NextResponse.json(
        { error: "Missing or invalid assertionResponse" },
        { status: 400 }
      );
      return withCors(response, request);
    }

    // Extract the credential ID from the assertion response
    // This is the WebAuthn credential ID (base64url encoded)
    const credentialIdFromAssertion = assertionResponse.id;
    console.log("[auth/verify] Credential ID from assertion:", credentialIdFromAssertion);

    // Look up the credential by WebAuthn credential ID
    const credential = await prisma.webAuthnCredential.findUnique({
      where: { credentialId: credentialIdFromAssertion },
    });

    if (!credential) {
      console.error("[auth/verify] Credential not found for ID:", credentialIdFromAssertion);
      const response = NextResponse.json(
        { error: "Credential not found. You may need to register first." },
        { status: 404 }
      );
      return withCors(response, request);
    }

    console.log("[auth/verify] Found credential for user:", credential.userId);

    // Extract challenge from clientDataJSON to find matching challenge record
    const clientDataJSON = JSON.parse(
      Buffer.from(assertionResponse.response.clientDataJSON, "base64url").toString()
    );
    const challengeFromResponse = clientDataJSON.challenge;

    // Find the challenge record by the challenge value itself
    const challengeRecord = await prisma.webAuthnChallenge.findFirst({
      where: {
        challenge: challengeFromResponse,
        type: "authentication",
        expiresAt: { gt: new Date() },
      },
    });

    if (!challengeRecord) {
      console.error("[auth/verify] No valid challenge found for:", challengeFromResponse);
      const response = NextResponse.json(
        { error: "No valid challenge found. Please restart authentication." },
        { status: 400 }
      );
      return withCors(response, request);
    }

    console.log("[auth/verify] Found challenge, verifying assertion...");

    // Verify the assertion
    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: assertionResponse,
        expectedChallenge: challengeRecord.challenge,
        expectedOrigin: WEBAUTHN_ORIGIN,
        expectedRPID: WEBAUTHN_RP_ID,
        authenticator: {
          credentialID: Buffer.from(credential.credentialId, "base64url"),
          credentialPublicKey: credential.publicKey,
          counter: credential.counter,
          transports: credential.transports as AuthenticatorTransport[],
        },
      });
    } catch (verifyError) {
      console.error("[auth/verify] Verification error:", verifyError);
      const response = NextResponse.json(
        {
          error: "Assertion verification failed",
          details: verifyError instanceof Error ? verifyError.message : "Unknown error",
        },
        { status: 400 }
      );
      return withCors(response, request);
    }

    if (!verification.verified) {
      console.error("[auth/verify] Verification failed");
      const response = NextResponse.json(
        { error: "Assertion verification failed" },
        { status: 400 }
      );
      return withCors(response, request);
    }

    console.log("[auth/verify] Assertion verified!");

    // Update the stored counter
    const newCounter = verification.authenticationInfo.newCounter;
    await prisma.webAuthnCredential.update({
      where: { id: credential.id },
      data: { counter: newCounter },
    });

    console.log("[auth/verify] Counter updated to:", newCounter);

    // Delete the used challenge (one-time use)
    await prisma.webAuthnChallenge.delete({
      where: { id: challengeRecord.id },
    });

    console.log("[auth/verify] Challenge deleted, returning success");

    // Return success
    const response = NextResponse.json({
      verified: true,
      over_19: true,
    });
    return withCors(response, request);
  } catch (error) {
    console.error("[auth/verify] Error:", error);
    const response = NextResponse.json(
      { error: error instanceof Error ? error.message : "Authentication verification failed" },
      { status: 500 }
    );
    return withCors(response, request);
  }
}

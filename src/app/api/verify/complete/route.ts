import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/types";
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
 * POST /api/verify/complete
 * 
 * Input: { userId: string, attestationResponse: RegistrationResponseJSON }
 * 
 * Flow:
 * 1. Load expected challenge from database
 * 2. Verify attestation with @simplewebauthn/server
 * 3. Store credential in database
 * 
 * Output: { success: true, credential_id: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, attestationResponse } = body as {
      userId: string;
      attestationResponse: RegistrationResponseJSON;
    };

    // Validate input
    if (!userId || typeof userId !== "string") {
      const response = NextResponse.json(
        { error: "Missing or invalid userId" },
        { status: 400 }
      );
      return withCors(response, request);
    }

    if (!attestationResponse || typeof attestationResponse !== "object") {
      const response = NextResponse.json(
        { error: "Missing or invalid attestationResponse" },
        { status: 400 }
      );
      return withCors(response, request);
    }

    console.log("[verify/complete] Verifying attestation for user:", userId);

    // #region agent log
    const fs = require('fs');
    const logPath = 'c:\\Users\\jiami\\OneDrive\\Desktop\\workspace\\kms_please\\sduarf\\.cursor\\debug.log';
    try {
      fs.appendFileSync(logPath, JSON.stringify({location:'verify/complete/route.ts:58',message:'Starting verification',data:{userId,hasAttestationResponse:!!attestationResponse,attestationId:attestationResponse?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run7',hypothesisId:'D'})+'\n');
    } catch {}
    // #endregion

    // === Step 1: Load expected challenge from database ===
    const challengeRecord = await prisma.webAuthnChallenge.findFirst({
      where: {
        userId,
        type: "registration",
        expiresAt: { gt: new Date() }, // Not expired
      },
      orderBy: { createdAt: "desc" }, // Most recent first
    });

    // #region agent log
    try {
      fs.appendFileSync(logPath, JSON.stringify({location:'verify/complete/route.ts:69',message:'Challenge lookup result',data:{found:!!challengeRecord,userId,challengeFromDb:challengeRecord?.challenge,challengeFromResponse:attestationResponse?.response?.clientDataJSON ? JSON.parse(Buffer.from(attestationResponse.response.clientDataJSON, 'base64url').toString()).challenge : null},timestamp:Date.now(),sessionId:'debug-session',runId:'run7',hypothesisId:'D'})+'\n');
    } catch {}
    // #endregion

    if (!challengeRecord) {
      console.error("[verify/complete] No valid challenge found for user:", userId);
      const response = NextResponse.json(
        { error: "No valid challenge found. Please restart verification." },
        { status: 400 }
      );
      return withCors(response, request);
    }

    console.log("[verify/complete] Found challenge, verifying attestation...");
    console.log("[verify/complete] Expected RP_ID:", WEBAUTHN_RP_ID);
    console.log("[verify/complete] Expected ORIGIN:", WEBAUTHN_ORIGIN);

    // === Step 2: Verify attestation ===
    let verification;
    try {
      // #region agent log
      try {
        fs.appendFileSync(logPath, JSON.stringify({location:'verify/complete/route.ts:86',message:'Calling verifyRegistrationResponse',data:{expectedChallenge:challengeRecord.challenge,expectedOrigin:WEBAUTHN_ORIGIN,expectedRPID:WEBAUTHN_RP_ID},timestamp:Date.now(),sessionId:'debug-session',runId:'run7',hypothesisId:'E'})+'\n');
      } catch {}
      // #endregion
      
      verification = await verifyRegistrationResponse({
        response: attestationResponse,
        expectedChallenge: challengeRecord.challenge,
        expectedOrigin: WEBAUTHN_ORIGIN,
        expectedRPID: WEBAUTHN_RP_ID,
        requireUserVerification: false, // Allow UV-capable but not required
      });
      
      // #region agent log
      try {
        fs.appendFileSync(logPath, JSON.stringify({location:'verify/complete/route.ts:93',message:'Verification succeeded',data:{verified:verification.verified,hasRegistrationInfo:!!verification.registrationInfo},timestamp:Date.now(),sessionId:'debug-session',runId:'run7',hypothesisId:'E'})+'\n');
      } catch {}
      // #endregion
    } catch (verifyError) {
      // #region agent log
      try {
        fs.appendFileSync(logPath, JSON.stringify({location:'verify/complete/route.ts:96',message:'Verification error',data:{errorName:(verifyError as Error)?.name,errorMessage:(verifyError as Error)?.message,errorStack:(verifyError as Error)?.stack?.substring(0,300)},timestamp:Date.now(),sessionId:'debug-session',runId:'run7',hypothesisId:'E'})+'\n');
      } catch {}
      // #endregion
      console.error("[verify/complete] Verification error:", verifyError);
      const response = NextResponse.json(
        { 
          error: "Credential verification failed",
          details: verifyError instanceof Error ? verifyError.message : "Unknown error"
        },
        { status: 400 }
      );
      return withCors(response, request);
    }

    if (!verification.verified || !verification.registrationInfo) {
      // #region agent log
      try {
        fs.appendFileSync(logPath, JSON.stringify({location:'verify/complete/route.ts:105',message:'Verification failed (not verified)',data:{verified:verification.verified,hasRegistrationInfo:!!verification.registrationInfo},timestamp:Date.now(),sessionId:'debug-session',runId:'run7',hypothesisId:'E'})+'\n');
      } catch {}
      // #endregion
      console.error("[verify/complete] Verification failed");
      const response = NextResponse.json(
        { error: "Credential verification failed" },
        { status: 400 }
      );
      return withCors(response, request);
    }

    console.log("[verify/complete] Attestation verified!");

    const { registrationInfo } = verification;

    // === Step 3: Store credential in database ===
    // Convert credential ID to base64url for storage
    const credentialIdBase64 = Buffer.from(registrationInfo.credentialID).toString("base64url");

    // Check for duplicate credential
    const existingCredential = await prisma.webAuthnCredential.findUnique({
      where: { credentialId: credentialIdBase64 },
    });

    if (existingCredential) {
      console.error("[verify/complete] Duplicate credential detected");
      const response = NextResponse.json(
        { error: "This credential is already registered" },
        { status: 400 }
      );
      return withCors(response, request);
    }

    // Store the credential
    // Note: transports are not directly available in registrationInfo
    // They would need to be extracted from the attestation response if needed
    // For now, we'll store an empty array (transports are optional)
    const credential = await prisma.webAuthnCredential.create({
      data: {
        userId,
        credentialId: credentialIdBase64,
        publicKey: Buffer.from(registrationInfo.credentialPublicKey),
        counter: registrationInfo.counter,
        transports: [], // Transports not available in registrationInfo, would need to parse from response
      },
    });

    console.log("[verify/complete] Credential stored:", credential.id);

    // Delete the used challenge (one-time use)
    await prisma.webAuthnChallenge.delete({
      where: { id: challengeRecord.id },
    });

    // Return success with the stable credential ID
    const response = NextResponse.json({
      success: true,
      credential_id: credential.id,
      credentialIdBase64, // Also return the raw credential ID for reference
    });
    return withCors(response, request);
  } catch (error) {
    console.error("[verify/complete] Error:", error);
    const response = NextResponse.json(
      { error: error instanceof Error ? error.message : "Registration failed" },
      { status: 500 }
    );
    return withCors(response, request);
  }
}

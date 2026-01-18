import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { prisma } from "@/lib/server/prisma";
import { handleCorsOptions, withCors } from "@/lib/server/cors";

// Force Node.js runtime
export const runtime = "nodejs";

// WebAuthn configuration from environment
const WEBAUTHN_RP_ID = process.env.WEBAUTHN_RP_ID || "localhost";

// Challenge expiry: 5 minutes
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/**
 * Handle OPTIONS preflight for CORS
 */
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

/**
 * POST /api/auth/start
 *
 * Input: {} (no input needed - uses discoverable credentials)
 *
 * Flow:
 * 1. Generate authentication options without allowCredentials (discoverable)
 * 2. Store challenge in database (with null userId since we don't know yet)
 *
 * Output: { authenticationOptions }
 */
export async function POST(request: NextRequest) {
  try {
    console.log("[auth/start] Starting passkey-first authentication");

    // Generate authentication options for discoverable credentials
    // No allowCredentials = browser will show all available passkeys for this RP
    const authenticationOptions = await generateAuthenticationOptions({
      rpID: WEBAUTHN_RP_ID,
      userVerification: "preferred",
      timeout: 60000, // 60 seconds
      // Empty allowCredentials = discoverable credentials (passkey-first)
    });

    console.log("[auth/start] Generated authentication options for discoverable credentials");

    // Store the challenge in the database
    // We use a temporary user placeholder since we don't know which user yet
    // The challenge itself is unique and will be matched during verification
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
    await prisma.webAuthnChallenge.create({
      data: {
        // Create a temporary user for this auth attempt
        // In a real app, you might use a different approach (session-based challenge storage)
        user: {
          create: {},
        },
        challenge: authenticationOptions.challenge,
        type: "authentication",
        expiresAt,
      },
    });

    console.log("[auth/start] Challenge stored, returning options");

    // Return authentication options
    const response = NextResponse.json({
      authenticationOptions,
    });
    return withCors(response, request);
  } catch (error) {
    console.error("[auth/start] Error:", error);
    const response = NextResponse.json(
      { error: error instanceof Error ? error.message : "Authentication start failed" },
      { status: 500 }
    );
    return withCors(response, request);
  }
}

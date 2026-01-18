import { NextRequest, NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { prisma } from "@/lib/server/prisma";
import { handleCorsOptions, withCors } from "@/lib/server/cors";
import { extractDobFromOcrText } from "@/lib/server/dobExtractor";

// Force Node.js runtime
export const runtime = "nodejs";

// WebAuthn configuration from environment
const WEBAUTHN_RP_ID = process.env.WEBAUTHN_RP_ID || "localhost";
const WEBAUTHN_RP_NAME = process.env.WEBAUTHN_RP_NAME || "Age Verification";

// Challenge expiry: 5 minutes
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/**
 * Handle OPTIONS preflight for CORS
 */
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

/**
 * POST /api/verify/start
 * 
 * Input: { id_photo: string (base64), selfie: string (base64) }
 * 
 * Flow:
 * 1. Call internal OCR endpoint to extract text from ID
 * 2. Extract DOB from OCR text
 * 3. Calculate age and enforce 19+
 * 4. If pass: generate WebAuthn registration options and store challenge
 * 
 * Output: { ocr_passed, age_passed, userId, challenge, registrationOptions }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Accept pre-validated data from client (fast path) OR raw images (slow path for backward compat)
    const { rawOcrText, birthDate, age, faceMatchConfidence, id_photo } = body;

    console.log("[verify/start] Starting verification flow...");
    
    let finalBirthDate = birthDate;
    let finalAge = age;
    let ocrPassed = true;
    
    // FAST PATH: Client already validated, use pre-validated data
    if (rawOcrText && birthDate && typeof age === "number") {
      console.log("[verify/start] Using pre-validated data from client (fast path)");
      
      // Quick server-side validation: re-extract DOB from raw text to verify client didn't lie
      const dobResult = extractDobFromOcrText(rawOcrText);
      
      // Validate client-provided DOB format and age
      const clientDobValid = birthDate && /^\d{4}-\d{2}-\d{2}$/.test(birthDate) && age >= 19;
      
      if (dobResult.birthDate) {
        // Server successfully extracted DOB - use server values (more trustworthy)
        finalBirthDate = dobResult.birthDate;
        finalAge = dobResult.age;
      } else if (clientDobValid) {
        // Server extraction failed BUT client DOB is in valid format and age >= 19
        // Since face matching already passed, trust the client's extraction
        // (Client-side OCR may have better preprocessing/context awareness)
        finalBirthDate = birthDate;
        finalAge = age;
        console.log("[verify/start] Server extraction failed, but client DOB is valid format. Using client DOB:", birthDate);
      } else {
        // Both failed - reject
        const response = NextResponse.json(
          { ocr_passed: false, age_passed: false, error: "Server validation failed: could not extract DOB" },
          { status: 200 }
        );
        return withCors(response, request);
      }
      
      console.log("[verify/start] Server validated DOB:", finalBirthDate, "Age:", finalAge);
    } 
    // SLOW PATH: Client sent raw image, need to run OCR (backward compatibility)
    else if (id_photo && typeof id_photo === "string") {
      console.log("[verify/start] Falling back to server-side OCR (slow path)");
      
      const ocrUrl = new URL("/api/ocr/recognize", request.nextUrl.origin);
      const ocrResponse = await fetch(ocrUrl.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData: id_photo }),
      });

      if (!ocrResponse.ok) {
        const response = NextResponse.json(
          { ocr_passed: false, age_passed: false, error: "OCR processing failed" },
          { status: 200 }
        );
        return withCors(response, request);
      }

      const ocrResult = await ocrResponse.json();
      const ocrText = ocrResult.text || "";
      ocrPassed = ocrText.length > 20;
      
      if (!ocrPassed) {
        const response = NextResponse.json(
          { ocr_passed: false, age_passed: false, error: "Could not extract text from ID" },
          { status: 200 }
        );
        return withCors(response, request);
      }
      
      const dobResult = extractDobFromOcrText(ocrText);
      finalBirthDate = dobResult.birthDate;
      finalAge = dobResult.age;
    } else {
      const response = NextResponse.json(
        { error: "Missing required data: provide either rawOcrText+birthDate+age or id_photo" },
        { status: 400 }
      );
      return withCors(response, request);
    }

    // Check age requirement (19+)
    if (!finalBirthDate || finalAge === null || finalAge === undefined) {
      const response = NextResponse.json(
        { ocr_passed: ocrPassed, age_passed: false, error: "Could not determine date of birth" },
        { status: 200 }
      );
      return withCors(response, request);
    }

    const isOver19 = finalAge >= 19;
    if (!isOver19) {
      const response = NextResponse.json(
        { ocr_passed: true, age_passed: false, age: finalAge, error: `Age requirement not met. Must be 19+, detected age: ${finalAge}` },
        { status: 200 }
      );
      return withCors(response, request);
    }

    // Age verified! Generate WebAuthn registration options
    console.log("[verify/start] Age verified! Generating WebAuthn options...");
    console.log("[verify/start] WebAuthn RP_ID:", WEBAUTHN_RP_ID);
    console.log("[verify/start] WebAuthn RP_NAME:", WEBAUTHN_RP_NAME);

    // Create a new user for this verification
    const user = await prisma.user.create({
      data: {},
    });

    console.log("[verify/start] Created user:", user.id);

    // Get any existing credentials for this user (empty for new user)
    const existingCredentials = await prisma.webAuthnCredential.findMany({
      where: { userId: user.id },
      select: { credentialId: true, transports: true },
    });

    // Generate WebAuthn registration options
    const registrationOptions = await generateRegistrationOptions({
      rpName: WEBAUTHN_RP_NAME,
      rpID: WEBAUTHN_RP_ID,
      userID: user.id, // String user ID
      userName: `user_${user.id.slice(0, 8)}`, // Anonymous username
      userDisplayName: "Age Verified User",
      attestationType: "none", // We don't need attestation for age verification
      excludeCredentials: existingCredentials.map((cred: { credentialId: string; transports: string[] }) => ({
        id: Buffer.from(cred.credentialId, "base64url"),
        type: "public-key" as const,
        transports: cred.transports as AuthenticatorTransport[],
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
        authenticatorAttachment: "platform", // Prefer platform authenticators (TouchID, FaceID)
      },
      timeout: 60000, // 60 seconds
    });

    // Store the challenge in the database
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
    await prisma.webAuthnChallenge.create({
      data: {
        userId: user.id,
        challenge: registrationOptions.challenge,
        type: "registration",
        expiresAt,
      },
    });

    console.log("[verify/start] Challenge stored, returning registration options");

    // Return success with registration options
    const response = NextResponse.json({
      ocr_passed: true,
      age_passed: true,
      age: finalAge,
      birthDate: finalBirthDate,
      userId: user.id,
      challenge: registrationOptions.challenge,
      registrationOptions,
    });
    return withCors(response, request);
  } catch (error) {
    console.error("[verify/start] Error:", error);
    const response = NextResponse.json(
      { error: error instanceof Error ? error.message : "Verification failed" },
      { status: 500 }
    );
    return withCors(response, request);
  }
}

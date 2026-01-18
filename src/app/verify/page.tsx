"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/types";
import ProgressIndicator from "@/components/ProgressIndicator";
import IDUpload from "@/components/IDUpload";
import Camera from "@/components/Camera";
import { extractIDData, IDData } from "@/lib/ocr";
import { validateIDData, ValidationResult } from "@/lib/validation";
import { matchFaces, FaceMatchResult } from "@/lib/faceMatching";

type Step = "upload" | "processing" | "validation" | "selfie" | "matching" | "matched" | "webauthn" | "success" | "error";

const STEPS = ["Upload ID", "Verify Age", "Take Selfie", "Face Match", "Secure Credential"];

// Backend URL for WebAuthn endpoints (Railway/Render in production)
// Empty string means same-origin (local dev or unified deployment)
const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/$/, "");

export default function VerifyPage() {
    // Flow state
    const [currentStep, setCurrentStep] = useState<Step>("upload");
    const [stepIndex, setStepIndex] = useState(0);

    // Data state (stored temporarily in memory)
    const [idImage, setIdImage] = useState<string | null>(null);
    const [idData, setIdData] = useState<IDData | null>(null);
    const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
    const [selfieImage, setSelfieImage] = useState<string | null>(null);
    const [faceMatchResult, setFaceMatchResult] = useState<FaceMatchResult | null>(null);
    const [processingProgress, setProcessingProgress] = useState(0);
    const [processingStatus, setProcessingStatus] = useState("");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [failedStep, setFailedStep] = useState<Step | null>(null);

    // WebAuthn state
    const [credentialId, setCredentialId] = useState<string | null>(null);
    const [webauthnStatus, setWebauthnStatus] = useState<string>("");

    // Handle ID upload complete
    const handleIDUpload = useCallback(async (imageData: string) => {
        setIdImage(imageData);
        setCurrentStep("processing");
        setStepIndex(1);
        setProcessingProgress(0);
        setProcessingStatus("Initializing...");

        try {
            // Run OCR on the ID image
            const result = await extractIDData(imageData, (progress, status) => {
                setProcessingProgress(progress);
                setProcessingStatus(status);
            });

            if (!result.success || !result.data) {
                throw new Error(result.error || "Failed to process ID");
            }

            setIdData(result.data);

            // Validate the extracted data
            const validation = validateIDData(result.data);
            setValidationResult(validation);

            // Move to validation step
            setCurrentStep("validation");
        } catch (error) {
            console.error("Processing error:", error);
            setErrorMessage(error instanceof Error ? error.message : "An error occurred");
            setCurrentStep("error");
        }
    }, []);

    // Handle validation proceed
    const handleValidationProceed = useCallback(() => {
        if (validationResult?.isValid) {
            setCurrentStep("selfie");
            setStepIndex(2);
        }
    }, [validationResult]);

    // Handle selfie capture - runs face matching, then WebAuthn registration
    const handleSelfieCapture = useCallback(async (imageData: string) => {
        setSelfieImage(imageData);
        setCurrentStep("matching");
        setStepIndex(3);
        setProcessingProgress(0);
        setProcessingStatus("Starting face match...");

        // Perform actual face matching using face-api.js
        if (!idImage) {
            setErrorMessage("ID image not found");
            setCurrentStep("error");
            return;
        }

        try {
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/560d3d18-f172-49bb-8d5c-4fa3220c1a13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'verify/page.tsx:100',message:'Starting face matching',data:{hasIdImage:!!idImage,hasSelfie:!!imageData},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            
            const faceMatchStartTime = Date.now();
            const result = await matchFaces(idImage, imageData, (progress, status) => {
                setProcessingProgress(progress);
                setProcessingStatus(status);
            });

            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/560d3d18-f172-49bb-8d5c-4fa3220c1a13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'verify/page.tsx:107',message:'Face matching completed',data:{isMatch:result.isMatch,confidence:result.confidence,elapsedMs:Date.now()-faceMatchStartTime},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'C'})}).catch(()=>{});
            // #endregion

            setFaceMatchResult(result);

            if (!result.isMatch) {
                setErrorMessage(result.error || `Face match failed (${Math.round(result.confidence * 100)}% confidence, need 75%)`);
                setFailedStep("selfie");
                setCurrentStep("error");
                return;
            }

            // Face match passed! Show confirmation before WebAuthn
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/560d3d18-f172-49bb-8d5c-4fa3220c1a13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'verify/page.tsx:124',message:'Setting currentStep to matched',data:{confidence:result.confidence},timestamp:Date.now(),sessionId:'debug-session',runId:'run5',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
            setCurrentStep("matched");

        } catch (error) {
            console.error("Face matching error:", error);
            setErrorMessage(error instanceof Error ? error.message : "Face matching failed");
            setFailedStep("selfie");
            setCurrentStep("error");
        }
    }, [idImage]);

    // Handle proceeding from face match confirmation to WebAuthn
    const handleProceedToWebAuthn = useCallback(async () => {
        if (!idImage || !selfieImage) {
            setErrorMessage("Missing images for verification");
            setCurrentStep("error");
            return;
        }

        setCurrentStep("webauthn");
        setStepIndex(4);
        setWebauthnStatus("Verifying age with server...");

        try {
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/560d3d18-f172-49bb-8d5c-4fa3220c1a13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'verify/page.tsx:handleProceedToWebAuthn',message:'Starting fetch to /api/verify/start',data:{backendUrl:BACKEND_URL,hasIdImage:!!idImage,hasSelfie:!!selfieImage},timestamp:Date.now(),sessionId:'debug-session',runId:'run5',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            
            const fetchStartTime = Date.now();
            // Add timeout to fetch request (30 seconds)
            const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs: number = 30000) => {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
                try {
                    const response = await fetch(url, { ...options, signal: controller.signal });
                    clearTimeout(timeoutId);
                    return response;
                } catch (error) {
                    clearTimeout(timeoutId);
                    if (error instanceof Error && error.name === 'AbortError') {
                        throw new Error(`Request timeout after ${timeoutMs}ms`);
                    }
                    throw error;
                }
            };
            
            const startResponse = await fetchWithTimeout(`${BACKEND_URL}/api/verify/start`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    // Send pre-validated data instead of raw images to avoid server-side OCR
                    rawOcrText: idData?.rawText,
                    birthDate: validationResult?.birthDate,
                    age: validationResult?.age,
                    faceMatchConfidence: faceMatchResult?.confidence,
                    // Don't send images - saves bandwidth and server doesn't need to re-process
                }),
            }, 10000); // 10 seconds should be plenty without OCR
            
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/560d3d18-f172-49bb-8d5c-4fa3220c1a13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'verify/page.tsx:handleProceedToWebAuthn:fetch',message:'Fetch completed',data:{status:startResponse.status,ok:startResponse.ok,elapsedMs:Date.now()-fetchStartTime},timestamp:Date.now(),sessionId:'debug-session',runId:'run5',hypothesisId:'D'})}).catch(()=>{});
            // #endregion

            if (!startResponse.ok) {
                const errorText = await startResponse.text();
                console.error("[WebAuthn] Start endpoint error:", startResponse.status, errorText);
                setErrorMessage(`Server error: ${startResponse.status}. Please try again.`);
                setFailedStep("webauthn");
                setCurrentStep("error");
                return;
            }

            const startResult = await startResponse.json();

            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/560d3d18-f172-49bb-8d5c-4fa3220c1a13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'verify/page.tsx:198',message:'Parsed start response',data:{ocrPassed:startResult.ocr_passed,agePassed:startResult.age_passed,hasUserId:!!startResult.userId,hasRegistrationOptions:!!startResult.registrationOptions,hasChallenge:!!startResult.challenge,rpId:startResult.registrationOptions?.rp?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run7',hypothesisId:'B'})}).catch(()=>{});
            // #endregion

            if (!startResult.ocr_passed || !startResult.age_passed) {
                setErrorMessage(startResult.error || "Age verification failed on server");
                setFailedStep("webauthn");
                setCurrentStep("error");
                return;
            }

            console.log("[WebAuthn] Server verification passed, userId:", startResult.userId);

            // Clear images from memory (privacy)
            setIdImage(null);
            setSelfieImage(null);
            console.log("[WebAuthn] Cleared ID and selfie images from memory");

            // Start WebAuthn registration with browser
            setWebauthnStatus("Complete passkey verification...");
            
            // Debug: Log the registration options received from server
            console.log("[WebAuthn] registrationOptions received:", JSON.stringify(startResult.registrationOptions, null, 2));
            console.log("[WebAuthn] rp.id:", startResult.registrationOptions?.rp?.id);
            console.log("[WebAuthn] About to call startRegistration...");
            
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/560d3d18-f172-49bb-8d5c-4fa3220c1a13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'verify/page.tsx:220',message:'About to call startRegistration',data:{rpId:startResult.registrationOptions?.rp?.id,rpName:startResult.registrationOptions?.rp?.name,userId:startResult.registrationOptions?.user?.id,hasChallenge:!!startResult.registrationOptions?.challenge,authenticatorSelection:startResult.registrationOptions?.authenticatorSelection},timestamp:Date.now(),sessionId:'debug-session',runId:'run7',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            
            let attestationResponse;
            const startRegStartTime = Date.now();
            try {
                attestationResponse = await startRegistration(
                    startResult.registrationOptions as PublicKeyCredentialCreationOptionsJSON
                );
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/560d3d18-f172-49bb-8d5c-4fa3220c1a13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'verify/page.tsx:228',message:'startRegistration succeeded',data:{hasId:!!attestationResponse?.id,hasResponse:!!attestationResponse?.response,elapsedMs:Date.now()-startRegStartTime},timestamp:Date.now(),sessionId:'debug-session',runId:'run7',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                console.log("[WebAuthn] startRegistration succeeded:", attestationResponse);
            } catch (webauthnError) {
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/560d3d18-f172-49bb-8d5c-4fa3220c1a13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'verify/page.tsx:232',message:'startRegistration FAILED',data:{errorName:(webauthnError as Error)?.name,errorMessage:(webauthnError as Error)?.message,errorStack:(webauthnError as Error)?.stack?.substring(0,200),elapsedMs:Date.now()-startRegStartTime},timestamp:Date.now(),sessionId:'debug-session',runId:'run7',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                console.error("[WebAuthn] startRegistration FAILED:", webauthnError);
                console.error("[WebAuthn] Error name:", (webauthnError as Error).name);
                console.error("[WebAuthn] Error message:", (webauthnError as Error).message);
                const errorMsg = webauthnError instanceof Error ? webauthnError.message : "WebAuthn registration failed";
                // Check for user cancellation
                if (errorMsg.includes("cancelled") || errorMsg.includes("canceled") || errorMsg.includes("NotAllowedError")) {
                    setErrorMessage("Passkey verification was cancelled. Please try again.");
                } else {
                    setErrorMessage(errorMsg);
                }
                setFailedStep("webauthn");
                setCurrentStep("error");
                return;
            }

            // Complete registration with backend
            setWebauthnStatus("Storing credential...");
            
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/560d3d18-f172-49bb-8d5c-4fa3220c1a13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'verify/page.tsx:246',message:'Calling /api/verify/complete',data:{userId:startResult.userId,hasAttestationResponse:!!attestationResponse,attestationId:attestationResponse?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run7',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
            
            const completeStartTime = Date.now();
            const completeResponse = await fetch(`${BACKEND_URL}/api/verify/complete`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: startResult.userId,
                    attestationResponse,
                }),
            });

            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/560d3d18-f172-49bb-8d5c-4fa3220c1a13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'verify/page.tsx:256',message:'Complete response received',data:{status:completeResponse.status,ok:completeResponse.ok,elapsedMs:Date.now()-completeStartTime},timestamp:Date.now(),sessionId:'debug-session',runId:'run7',hypothesisId:'E'})}).catch(()=>{});
            // #endregion

            if (!completeResponse.ok) {
                let errorText = "";
                try {
                    const errorJson = await completeResponse.json();
                    errorText = errorJson.error || `Server error: ${completeResponse.status}`;
                    // #region agent log
                    fetch('http://127.0.0.1:7243/ingest/560d3d18-f172-49bb-8d5c-4fa3220c1a13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'verify/page.tsx:262',message:'Complete endpoint error',data:{status:completeResponse.status,error:errorText,errorDetails:errorJson},timestamp:Date.now(),sessionId:'debug-session',runId:'run7',hypothesisId:'E'})}).catch(()=>{});
                    // #endregion
                } catch {
                    errorText = `Server error: ${completeResponse.status}`;
                }
                console.error("[WebAuthn] Complete endpoint error:", completeResponse.status, errorText);
                setErrorMessage(errorText);
                setFailedStep("webauthn");
                setCurrentStep("error");
                return;
            }

            const completeResult = await completeResponse.json();

            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/560d3d18-f172-49bb-8d5c-4fa3220c1a13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'verify/page.tsx:275',message:'Complete result parsed',data:{success:completeResult.success,hasCredentialId:!!completeResult.credential_id},timestamp:Date.now(),sessionId:'debug-session',runId:'run7',hypothesisId:'E'})}).catch(()=>{});
            // #endregion

            if (!completeResult.success) {
                setErrorMessage(completeResult.error || "Failed to store credential");
                setFailedStep("webauthn");
                setCurrentStep("error");
                return;
            }

            // Success!
            console.log("[WebAuthn] Registration complete, credential_id:", completeResult.credential_id);
            setCredentialId(completeResult.credential_id);
            setCurrentStep("success");

        } catch (error) {
            console.error("Verification error:", error);
            setErrorMessage(error instanceof Error ? error.message : "Verification failed");
            setFailedStep("webauthn");
            setCurrentStep("error");
        }
    }, [idImage, selfieImage, idData, validationResult, faceMatchResult]);

    // Retry failed step only (not start over)
    const handleRetryCurrentStep = useCallback(() => {
        setErrorMessage(null);

        if (failedStep === "selfie") {
            // Go back to selfie step, keep ID data
            setSelfieImage(null);
            setFaceMatchResult(null);
            setCurrentStep("selfie");
            setStepIndex(2);
        } else if (failedStep === "webauthn") {
            // Go back to face match confirmed step, keep all data
            // User can click "Continue to Passkey" again
            setCurrentStep("matched");
            setStepIndex(3);
        } else if (failedStep === "validation") {
            // Go back to upload, clear ID data
            setIdImage(null);
            setIdData(null);
            setValidationResult(null);
            setCurrentStep("upload");
            setStepIndex(0);
        } else {
            // Default: start over
            handleStartOver();
        }
        setFailedStep(null);
    }, [failedStep]);

    // Start completely over
    const handleStartOver = useCallback(() => {
        setIdImage(null);
        setIdData(null);
        setValidationResult(null);
        setSelfieImage(null);
        setFaceMatchResult(null);
        setErrorMessage(null);
        setFailedStep(null);
        setCredentialId(null);
        setWebauthnStatus("");
        setCurrentStep("upload");
        setStepIndex(0);
    }, []);

    return (
        <div className="min-h-screen py-8 px-4">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="text-center mb-8">
                    <Link href="/" className="inline-flex items-center gap-2 text-white/60 hover:text-white transition-colors mb-6">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back to Home
                    </Link>
                    <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Age Verification</h1>
                    <p className="text-white/60">Complete the steps below to verify your age</p>
                </div>

                {/* Progress indicator */}
                <ProgressIndicator steps={STEPS} currentStep={stepIndex} />

                {/* Main content area */}
                <div className="mt-16">
                    {/* Step: Upload ID */}
                    {currentStep === "upload" && (
                        <IDUpload onComplete={handleIDUpload} />
                    )}

                    {/* Step: Processing */}
                    {currentStep === "processing" && (
                        <ProcessingView progress={processingProgress} status={processingStatus} />
                    )}

                    {/* Step: Validation */}
                    {currentStep === "validation" && validationResult && idData && idImage && (
                        <ValidationView
                            data={idData}
                            result={validationResult}
                            idImage={idImage}
                            onProceed={handleValidationProceed}
                            onRetry={handleStartOver}
                        />
                    )}

                    {/* Step: Selfie */}
                    {currentStep === "selfie" && (
                        <div className="space-y-6">
                            <div className="text-center mb-8">
                                <h2 className="text-2xl font-bold text-white mb-2">Take a Selfie</h2>
                                <p className="text-white/60">
                                    Take a live photo to verify it&apos;s really you
                                </p>
                            </div>
                            <Camera
                                onCapture={handleSelfieCapture}
                                onCancel={handleStartOver}
                                instructions="Look directly at the camera and hold still"
                                facing="user"
                            />

                            {/* Debug: File upload option */}
                            <div className="text-center mt-6 pt-6 border-t border-white/10">
                                <p className="text-white/40 text-xs mb-3">🔧 Debug Mode: Upload a photo instead</p>
                                <label className="btn-secondary cursor-pointer inline-block">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                const reader = new FileReader();
                                                reader.onload = (ev) => {
                                                    const data = ev.target?.result as string;
                                                    if (data) handleSelfieCapture(data);
                                                };
                                                reader.readAsDataURL(file);
                                            }
                                        }}
                                    />
                                    Upload Selfie (Debug)
                                </label>
                            </div>
                        </div>
                    )}

                    {/* Step: Matching */}
                    {currentStep === "matching" && (
                        <MatchingView progress={processingProgress} status={processingStatus} />
                    )}

                    {/* Step: Face Match Confirmed */}
                    {currentStep === "matched" && faceMatchResult && (
                        <MatchedView 
                            confidence={faceMatchResult.confidence} 
                            onProceed={handleProceedToWebAuthn}
                            onRetry={() => {
                                setSelfieImage(null);
                                setFaceMatchResult(null);
                                setCurrentStep("selfie");
                                setStepIndex(2);
                            }}
                        />
                    )}

                    {/* Step: WebAuthn Registration */}
                    {currentStep === "webauthn" && (
                        <WebAuthnView status={webauthnStatus} />
                    )}

                    {/* Step: Success */}
                    {currentStep === "success" && (
                        <SuccessView faceMatchConfidence={faceMatchResult?.confidence} credentialId={credentialId} />
                    )}

                    {/* Step: Error */}
                    {currentStep === "error" && (
                        <ErrorView
                            message={errorMessage}
                            onRetry={handleRetryCurrentStep}
                            onStartOver={handleStartOver}
                            faceMatchResult={faceMatchResult}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

// Processing View Component
function ProcessingView({ progress, status }: { progress: number; status: string }) {
    return (
        <div className="glass-card p-8 max-w-md mx-auto text-center">
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-primary-500/20 flex items-center justify-center">
                <div className="spinner" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Processing Your ID</h3>
            <p className="text-white/60 mb-6">{status}</p>

            {/* Progress bar */}
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                    className="h-full progress-bar transition-all duration-300"
                    style={{ width: `${progress}%` }}
                />
            </div>
            <p className="text-white/40 text-sm mt-2">{progress}% complete</p>

            {/* Privacy note */}
            <div className="mt-6 flex items-center justify-center gap-2 text-green-400 text-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>All processing happens on your device</span>
            </div>
        </div>
    );
}

// Validation View Component
function ValidationView({
    data,
    result,
    idImage,
    onProceed,
    onRetry,
}: {
    data: IDData;
    result: ValidationResult;
    idImage: string;
    onProceed: () => void;
    onRetry: () => void;
}) {
    const [showRawText, setShowRawText] = useState(false);

    return (
        <div className="max-w-lg mx-auto">
            {/* Status card */}
            <div className={`glass-card p-6 mb-6 border-l-4 ${result.isValid ? "border-l-green-500" : "border-l-red-500"}`}>
                <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${result.isValid ? "bg-green-500/20" : "bg-red-500/20"}`}>
                        {result.isValid ? (
                            <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        ) : (
                            <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        )}
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-white">
                            {result.isValid ? "Age Verified" : "Verification Failed"}
                        </h3>
                        <p className="text-white/60 text-sm">
                            {result.isValid
                                ? `Confirmed: You are ${result.age} years old`
                                : result.errors[0]?.message}
                        </p>
                    </div>
                </div>
            </div>

            {/* ID Photo Preview */}
            <div className="glass-card p-4 mb-6">
                <h4 className="text-sm font-semibold text-white mb-3">Uploaded ID</h4>
                <div className="relative aspect-[3/2] rounded-lg overflow-hidden bg-black/30">
                    <img
                        src={idImage}
                        alt="Uploaded ID"
                        className="w-full h-full object-contain"
                    />
                </div>
            </div>

            {/* Extracted data */}
            <div className="glass-card p-6 mb-6">
                <h4 className="text-lg font-semibold text-white mb-4">Extracted Information</h4>
                <div className="space-y-3">
                    <DataRow label="License Number" value={data.idNumber || "Not detected"} status={data.idNumber ? "success" : "warning"} />
                    <DataRow label="Date of Birth" value={result.birthDate || "Not detected"} status={result.birthDate ? "success" : "error"} />
                    <DataRow label="Calculated Age" value={result.age ? `${result.age} years` : "—"} status={result.isOver19 ? "success" : "error"} />
                    <DataRow label="Age Requirement" value={result.isOver19 ? "Met (19+)" : "Not met"} status={result.isOver19 ? "success" : "error"} />
                    <DataRow
                        label="Expiry Date"
                        value={result.expiryDate || "Not detected"}
                        status={result.expiryDate ? (result.isExpired ? "error" : "success") : "warning"}
                    />
                    {result.expiryDate && (
                        <DataRow
                            label="ID Status"
                            value={result.isExpired ? "⛔ Expired" : "✓ Valid"}
                            status={result.isExpired ? "error" : "success"}
                        />
                    )}
                </div>
            </div>

            {/* Raw OCR text (debug) */}
            <div className="glass-card p-4 mb-6">
                <button
                    onClick={() => setShowRawText(!showRawText)}
                    className="w-full flex items-center justify-between text-white/60 hover:text-white transition-colors"
                >
                    <span className="text-sm font-medium">Raw OCR Text (Debug)</span>
                    <svg
                        className={`w-4 h-4 transition-transform ${showRawText ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
                {showRawText && (
                    <div className="mt-3 p-3 bg-black/30 rounded-lg overflow-auto max-h-48">
                        <pre className="text-xs text-white/60 whitespace-pre-wrap break-words font-mono">
                            {data.rawText || "(No text extracted)"}
                        </pre>
                    </div>
                )}
            </div>

            {/* Warnings */}
            {result.warnings.length > 0 && (
                <div className="glass-card p-4 mb-6 border-l-4 border-l-yellow-500">
                    <p className="text-yellow-400 text-sm">
                        ⚠️ {result.warnings.map(w => w.message).join(" ")}
                    </p>
                </div>
            )}

            {/* Tips */}
            {!result.isValid && (
                <div className="glass-card p-4 mb-6 bg-blue-500/10 border border-blue-500/20">
                    <h4 className="text-sm font-semibold text-blue-400 mb-2">💡 Tips for better results:</h4>
                    <ul className="text-xs text-white/60 space-y-1">
                        <li>• Good lighting, avoid shadows</li>
                        <li>• Hold camera parallel to the ID</li>
                        <li>• Ensure date of birth is visible</li>
                        <li>• Avoid glare from plastic covers</li>
                    </ul>
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-4">
                <button onClick={onRetry} className="btn-secondary flex-1">
                    Retake Photo
                </button>
                {result.isValid && (
                    <button onClick={onProceed} className="btn-primary flex-1">
                        Continue
                    </button>
                )}
            </div>
        </div>
    );
}

function DataRow({ label, value, status }: { label: string; value: string; status: "success" | "warning" | "error" }) {
    const colors = {
        success: "text-green-400",
        warning: "text-yellow-400",
        error: "text-red-400",
    };

    return (
        <div className="flex justify-between items-center">
            <span className="text-white/60">{label}</span>
            <span className={`font-medium ${colors[status]}`}>{value}</span>
        </div>
    );
}


// Matching View Component
function MatchingView({ progress, status }: { progress: number; status: string }) {
    return (
        <div className="glass-card p-8 max-w-md mx-auto text-center">
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-accent-500/20 flex items-center justify-center">
                <div className="spinner" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Matching Faces</h3>
            <p className="text-white/60 mb-4">{status}</p>

            {/* Progress bar */}
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden mb-4">
                <div
                    className="h-full bg-gradient-to-r from-primary-500 to-accent-500 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                />
            </div>

            <div className="text-sm text-white/40 space-y-1">
                <p className={progress >= 30 ? "text-green-400" : ""}>
                    {progress >= 30 ? "✓" : "○"} face analysis
                </p>
                <p className="text-white/30">○ verifying biometric data</p>
            </div>
        </div>
    );
}

// Matched View Component (Face match confirmed, proceed to WebAuthn)
function MatchedView({ 
    confidence, 
    onProceed, 
    onRetry 
}: { 
    confidence: number; 
    onProceed: () => void;
    onRetry: () => void;
}) {
    return (
        <div className="glass-card p-8 max-w-md mx-auto text-center">
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center">
                <svg className="w-12 h-12 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Face Match Confirmed</h3>
            <p className="text-white/60 mb-4">
                Your face matches your ID photo with {Math.round(confidence * 100)}% confidence.
            </p>

            {/* Confidence display */}
            <div className="bg-white/5 rounded-xl p-4 mb-6">
                <p className="text-sm text-white/40 mb-1">Match Confidence</p>
                <p className="text-3xl font-bold text-green-400">
                    {Math.round(confidence * 100)}%
                </p>
            </div>

            <p className="text-white/50 text-sm mb-6">
                Next, you&apos;ll create a secure passkey to complete verification.
            </p>

            <div className="flex gap-3 justify-center">
                <button onClick={onRetry} className="btn-secondary">
                    Retake Selfie
                </button>
                <button onClick={onProceed} className="btn-primary">
                    Continue to Passkey
                </button>
            </div>
        </div>
    );
}

// WebAuthn View Component
function WebAuthnView({ status }: { status: string }) {
    return (
        <div className="glass-card p-8 max-w-md mx-auto text-center">
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-primary-500/20 flex items-center justify-center">
                <svg className="w-12 h-12 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                </svg>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Secure Credential Setup</h3>
            <p className="text-white/60 mb-6">{status}</p>

            <div className="flex items-center justify-center gap-2 text-primary-400 text-sm animate-pulse">
                <div className="spinner w-4 h-4" />
                <span>Complete the passkey prompt when it appears</span>
            </div>

            {/* Supported methods */}
            <div className="mt-4 text-xs text-white/40">
                <p>Windows Hello, Face ID, Touch ID, or security key</p>
            </div>

            {/* Privacy note */}
            <div className="mt-4 flex items-center justify-center gap-2 text-green-400 text-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>Your biometric data never leaves your device</span>
            </div>
        </div>
    );
}

// Success View Component
function SuccessView({ faceMatchConfidence, credentialId }: { faceMatchConfidence?: number; credentialId?: string | null }) {
    return (
        <div className="max-w-md mx-auto text-center">
            <div className="glass-card p-8">
                <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center animate-pulse">
                    <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Verification Complete!</h3>
                <p className="text-white/60 mb-6">
                    Your age has been verified and your identity confirmed.
                </p>

                <div className="bg-white/5 rounded-xl p-4 mb-6">
                    <p className="text-sm text-white/40 mb-2">Your credential ID</p>
                    <p className="text-lg font-mono text-primary-400 break-all">
                        {credentialId || "cred_..."}
                    </p>
                </div>

                <Link href="/" className="btn-primary inline-block">
                    Return Home
                </Link>
            </div>

            {/* Privacy confirmation */}
            <div className="mt-6 text-center">
                <p className="text-green-400 text-sm flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Your ID images and personal data have been permanently deleted from memory
                </p>
            </div>
        </div>
    );
}

// Error View Component
function ErrorView({
    message,
    onRetry,
    onStartOver,
}: {
    message: string | null;
    onRetry: () => void;
    onStartOver: () => void;
    faceMatchResult?: FaceMatchResult | null;
}) {
    // Determine if this is a face match failure
    const isFaceMatchError = message?.includes("Face match");

    return (
        <div className="glass-card p-8 max-w-md mx-auto text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
            </div>

            <h3 className="text-xl font-semibold text-white mb-2">
                {isFaceMatchError ? "Face Match Failed" : "Verification Failed"}
            </h3>
            <p className="text-white/60 mb-6">{message || "An error occurred during verification."}</p>

            {isFaceMatchError && (
                <div className="bg-white/5 rounded-xl p-4 mb-6 text-left">
                    <p className="text-xs text-white/40 mb-2">💡 Tips for better face matching:</p>
                    <ul className="text-xs text-white/50 space-y-1">
                        <li>• Ensure good, even lighting on your face</li>
                        <li>• Face the camera directly</li>
                        <li>• Match the angle of your ID photo</li>
                        <li>• Remove glasses if possible</li>
                    </ul>
                </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 justify-center">
                <button onClick={onRetry} className="btn-primary">
                    Retry This Step
                </button>
                <button onClick={onStartOver} className="btn-secondary">
                    Start Over
                </button>
            </div>
        </div>
    );
}


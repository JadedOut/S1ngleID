"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { startAuthentication } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/types";

type Step = "ready" | "authenticating" | "success" | "error";

// Backend URL for WebAuthn endpoints
const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/$/, "");

export default function AuthenticatePage() {
    const [currentStep, setCurrentStep] = useState<Step>("ready");
    const [status, setStatus] = useState("");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const handleAuthenticate = useCallback(async () => {
        setCurrentStep("authenticating");
        setStatus("Starting authentication...");

        try {
            // Step 1: Get authentication options from server (no input needed)
            setStatus("Requesting challenge...");
            const startResponse = await fetch(`${BACKEND_URL}/api/auth/start`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });

            if (!startResponse.ok) {
                const errorData = await startResponse.json();
                throw new Error(errorData.error || `Server error: ${startResponse.status}`);
            }

            const { authenticationOptions } = await startResponse.json();
            console.log("[Auth] Received authentication options");

            // Step 2: Run WebAuthn authentication (browser shows available passkeys)
            setStatus("Select your passkey...");
            let assertionResponse;
            try {
                assertionResponse = await startAuthentication(
                    authenticationOptions as PublicKeyCredentialRequestOptionsJSON
                );
                console.log("[Auth] Got assertion response");
            } catch (webauthnError) {
                const errorMsg = webauthnError instanceof Error ? webauthnError.message : "Authentication failed";
                if (errorMsg.includes("cancelled") || errorMsg.includes("canceled") || errorMsg.includes("NotAllowedError")) {
                    throw new Error("Passkey verification was cancelled. Please try again.");
                }
                throw webauthnError;
            }

            // Step 3: Verify assertion with server (no credential_id needed)
            setStatus("Verifying...");
            const verifyResponse = await fetch(`${BACKEND_URL}/api/auth/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assertionResponse }),
            });

            if (!verifyResponse.ok) {
                const errorData = await verifyResponse.json();
                throw new Error(errorData.error || `Verification failed: ${verifyResponse.status}`);
            }

            const result = await verifyResponse.json();
            console.log("[Auth] Verification result:", result);

            if (result.verified) {
                setCurrentStep("success");
            } else {
                throw new Error("Verification failed");
            }
        } catch (error) {
            console.error("[Auth] Error:", error);
            setErrorMessage(error instanceof Error ? error.message : "Authentication failed");
            setCurrentStep("error");
        }
    }, []);

    const handleRetry = useCallback(() => {
        setErrorMessage(null);
        setCurrentStep("ready");
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
                    <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Verify Your Age</h1>
                    <p className="text-white/60">Use your passkey to instantly verify you&apos;re 19+</p>
                </div>

                {/* Main content */}
                <div className="mt-16">
                    {/* Step: Ready to authenticate */}
                    {currentStep === "ready" && (
                        <div className="glass-card p-8 max-w-md mx-auto text-center">
                            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-primary-500/20 to-accent-500/20 flex items-center justify-center">
                                <svg className="w-10 h-10 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                                </svg>
                            </div>
                            <h2 className="text-xl font-semibold text-white mb-2">Ready to Verify</h2>
                            <p className="text-white/60 text-sm mb-8">
                                Click below to authenticate with your passkey. Your device will prompt you to confirm with Face ID, Touch ID, or your security key.
                            </p>

                            <button
                                onClick={handleAuthenticate}
                                className="btn-primary w-full text-lg py-4"
                            >
                                Verify with Passkey
                            </button>

                            <p className="text-white/40 text-xs mt-6">
                                No passkey yet? <Link href="/verify" className="text-primary-400 hover:underline">Register first</Link>
                            </p>
                        </div>
                    )}

                    {/* Step: Authenticating */}
                    {currentStep === "authenticating" && (
                        <div className="glass-card p-8 max-w-md mx-auto text-center">
                            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-primary-500/20 flex items-center justify-center">
                                <div className="spinner" />
                            </div>
                            <h3 className="text-xl font-semibold text-white mb-2">Authenticating</h3>
                            <p className="text-white/60 mb-6">{status}</p>

                            <div className="flex items-center justify-center gap-2 text-primary-400 text-sm animate-pulse">
                                <span>Complete the passkey prompt when it appears</span>
                            </div>

                            <div className="mt-4 flex items-center justify-center gap-2 text-green-400 text-sm">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                                <span>Your biometric data never leaves your device</span>
                            </div>
                        </div>
                    )}

                    {/* Step: Success */}
                    {currentStep === "success" && (
                        <div className="glass-card p-8 max-w-md mx-auto text-center">
                            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center animate-pulse">
                                <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h3 className="text-2xl font-bold text-white mb-2">Verified!</h3>
                            <p className="text-white/60 mb-6">
                                Your identity has been confirmed.
                            </p>

                            <div className="bg-white/5 rounded-xl p-4 mb-6">
                                <div className="flex items-center justify-center gap-3">
                                    <div className="w-3 h-3 rounded-full bg-green-400" />
                                    <span className="text-green-400 font-medium">Age verified: 19+</span>
                                </div>
                            </div>

                            <div className="flex gap-3 justify-center">
                                <button onClick={handleRetry} className="btn-secondary">
                                    Verify Again
                                </button>
                                <Link href="/" className="btn-primary">
                                    Return Home
                                </Link>
                            </div>
                        </div>
                    )}

                    {/* Step: Error */}
                    {currentStep === "error" && (
                        <div className="glass-card p-8 max-w-md mx-auto text-center">
                            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>

                            <h3 className="text-xl font-semibold text-white mb-2">Authentication Failed</h3>
                            <p className="text-white/60 mb-6">{errorMessage || "An error occurred during authentication."}</p>

                            <div className="flex gap-3 justify-center">
                                <button onClick={handleRetry} className="btn-primary">
                                    Try Again
                                </button>
                                <Link href="/verify" className="btn-secondary">
                                    Register New Passkey
                                </Link>
                            </div>
                        </div>
                    )}
                </div>

                {/* Info section */}
                <div className="mt-12 max-w-md mx-auto">
                    <div className="glass-card p-6">
                        <h4 className="text-sm font-semibold text-white mb-3">How it works</h4>
                        <ul className="space-y-2 text-sm text-white/60">
                            <li className="flex items-start gap-2">
                                <span className="text-primary-400">1.</span>
                                Click &quot;Verify with Passkey&quot;
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-primary-400">2.</span>
                                Confirm with Face ID, Touch ID, or security key
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-primary-400">3.</span>
                                Instant age verification without re-uploading ID
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}

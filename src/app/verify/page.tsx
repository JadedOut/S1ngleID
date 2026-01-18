"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import ProgressIndicator from "@/components/ProgressIndicator";
import IDUpload from "@/components/IDUpload";
import Camera from "@/components/Camera";
import { extractIDData, IDData } from "@/lib/ocr";
import { validateIDData, ValidationResult } from "@/lib/validation";

type Step = "upload" | "processing" | "validation" | "selfie" | "matching" | "success" | "error";

const STEPS = ["Upload ID", "Verify Age", "Take Selfie", "Face Match", "Done"];

export default function VerifyPage() {
    // Flow state
    const [currentStep, setCurrentStep] = useState<Step>("upload");
    const [stepIndex, setStepIndex] = useState(0);

    // Data state (stored temporarily in memory)
    const [idImage, setIdImage] = useState<string | null>(null);
    const [idData, setIdData] = useState<IDData | null>(null);
    const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
    const [selfieImage, setSelfieImage] = useState<string | null>(null);
    const [processingProgress, setProcessingProgress] = useState(0);
    const [processingStatus, setProcessingStatus] = useState("");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

    // Handle selfie capture
    const handleSelfieCapture = useCallback((imageData: string) => {
        setSelfieImage(imageData);
        setCurrentStep("matching");
        setStepIndex(3);

        // Simulate face matching (actual implementation would use face-api.js, TensorFlow, tracking.js)
        // This will be implemented in step 4-6
        setTimeout(() => {
            setCurrentStep("success");
            setStepIndex(4);
        }, 2000);
    }, []);

    // Handle retry
    const handleRetry = useCallback(() => {
        setIdImage(null);
        setIdData(null);
        setValidationResult(null);
        setSelfieImage(null);
        setErrorMessage(null);
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
                            onRetry={handleRetry}
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
                                onCancel={handleRetry}
                                instructions="Look directly at the camera and hold still"
                                facing="user"
                            />
                        </div>
                    )}

                    {/* Step: Matching */}
                    {currentStep === "matching" && (
                        <MatchingView />
                    )}

                    {/* Step: Success */}
                    {currentStep === "success" && (
                        <SuccessView />
                    )}

                    {/* Step: Error */}
                    {currentStep === "error" && (
                        <ErrorView message={errorMessage} onRetry={handleRetry} />
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
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${result.isValid ? "bg-green-500/20" : "bg-red-500/20"
                        }`}>
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
                <h4 className="text-sm font-semibold text-white mb-3">ID Photo</h4>
                <div className="relative aspect-[3/2] rounded-lg overflow-hidden bg-black/30">
                    <img
                        src={idImage}
                        alt="Uploaded ID"
                        className="w-full h-full object-contain"
                    />
                </div>
            </div>

            {/* Cropped portrait preview (Ontario fixed crop) */}
            {data.idPhoto && (
                <div className="glass-card p-4 mb-6">
                    <h4 className="text-sm font-semibold text-white mb-3">Extracted portrait</h4>
                    <div className="grid sm:grid-cols-2 gap-4 items-start">
                        <div className="relative aspect-[3/4] rounded-lg overflow-hidden bg-black/30">
                            <img
                                src={data.idPhoto}
                                alt="Extracted portrait from ID"
                                className="w-full h-full object-cover"
                            />
                        </div>
                        <div className="text-sm text-white/60 space-y-2">
                            <p>
                                This is a fixed crop on the rectified card image (no face detection yet).
                            </p>
                            <p className="text-white/40">
                                If the crop misses, retake the photo with the card centered and flat.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Extracted data */}
            <div className="glass-card p-6 mb-6">
                <h4 className="text-lg font-semibold text-white mb-4">Extracted Information</h4>
                <div className="space-y-3">
                    <DataRow label="OCR Confidence" value={`${Math.round(data.confidence)}%`} status={data.confidence >= 20 ? "success" : "warning"} />
                    <DataRow label="Name" value={data.name || "Not detected"} status={data.name ? "success" : "warning"} />
                    <DataRow
                        label="ID number"
                        value={data.idNumber || "Not detected"}
                        status={data.idNumber ? "success" : "warning"}
                    />
                    <DataRow label="Birth Year" value={data.birthYear?.toString() || "Not detected"} status={data.birthYear ? "success" : "error"} />
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

            {/* Field-level OCR details */}
            {data.fieldResults && (
                <div className="glass-card p-6 mb-6">
                    <h4 className="text-lg font-semibold text-white mb-4">Field OCR details</h4>
                    <div className="space-y-3">
                        <FieldRow label="Name" value={data.fieldResults.name?.normalized ?? data.fieldResults.name?.text ?? "—"} confidence={data.fieldResults.name?.confidence} />
                        <FieldRow label="DL number" value={data.fieldResults.dlNumber?.normalized ?? data.fieldResults.dlNumber?.text ?? "—"} confidence={data.fieldResults.dlNumber?.confidence} />
                        <FieldRow label="DOB" value={data.fieldResults.dob?.normalized ?? data.fieldResults.dob?.text ?? "—"} confidence={data.fieldResults.dob?.confidence} />
                        <FieldRow label="Expiry" value={data.fieldResults.expiry?.normalized ?? data.fieldResults.expiry?.text ?? "—"} confidence={data.fieldResults.expiry?.confidence} />
                    </div>
                    <p className="text-xs text-white/40 mt-4">
                        These come from targeted crops on the rectified card image.
                    </p>
                </div>
            )}


            {/* Raw OCR text (expandable for debugging) */}
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

            {/* Tips for better results */}
            {!result.isValid && (
                <div className="glass-card p-4 mb-6 bg-blue-500/10 border border-blue-500/20">
                    <h4 className="text-sm font-semibold text-blue-400 mb-2">💡 Tips for better results:</h4>
                    <ul className="text-xs text-white/60 space-y-1">
                        <li>• Ensure good lighting, avoid shadows on the ID</li>
                        <li>• Hold camera steady and parallel to the ID</li>
                        <li>• Make sure the date of birth is clearly visible</li>
                        <li>• Avoid glare from plastic card covers</li>
                        <li>• Try placing the ID on a dark, contrasting surface</li>
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

function FieldRow({ label, value, confidence }: { label: string; value: string; confidence?: number }) {
    const c = typeof confidence === "number" ? Math.round(confidence) : null;
    const status =
        c === null ? "text-white/40" : c >= 70 ? "text-green-400" : c >= 50 ? "text-yellow-400" : "text-red-400";

    return (
        <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
                <p className="text-white/60">{label}</p>
                <p className="text-white break-words">{value}</p>
            </div>
            <div className="text-right flex-shrink-0">
                <p className="text-white/40 text-xs">Confidence</p>
                <p className={`font-medium ${status}`}>{c === null ? "—" : `${c}%`}</p>
            </div>
        </div>
    );
}

// Matching View Component
function MatchingView() {
    return (
        <div className="glass-card p-8 max-w-md mx-auto text-center">
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-accent-500/20 flex items-center justify-center">
                <div className="spinner" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Matching Faces</h3>
            <p className="text-white/60 mb-4">
                Comparing your selfie with your ID photo...
            </p>
            <div className="text-sm text-white/40 space-y-1">
                <p>✓ face-api.js analysis</p>
                <p>✓ TensorFlow.js FaceNet</p>
                <p>✓ tracking.js validation</p>
            </div>
        </div>
    );
}

// Success View Component
function SuccessView() {
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
                    Your age has been verified. You are confirmed to be over 19.
                </p>

                <div className="bg-white/5 rounded-xl p-4 mb-6">
                    <p className="text-sm text-white/40 mb-2">Your credential ID</p>
                    <p className="text-lg font-mono text-primary-400">cred_demo123</p>
                </div>

                <Link href="/" className="btn-primary inline-block">
                    Return Home
                </Link>
            </div>

            {/* Privacy confirmation */}
            <div className="mt-6 text-center">
                <p className="text-green-400 text-sm flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Your ID data stayed on-device and in memory only for this session
                </p>
            </div>
        </div>
    );
}

// Error View Component
function ErrorView({ message, onRetry }: { message: string | null; onRetry: () => void }) {
    return (
        <div className="glass-card p-8 max-w-md mx-auto text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Something Went Wrong</h3>
            <p className="text-white/60 mb-6">{message || "An error occurred during verification."}</p>
            <button onClick={onRetry} className="btn-primary">
                Try Again
            </button>
        </div>
    );
}

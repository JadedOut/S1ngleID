/**
 * Camera Component
 * ================
 * 
 * A reusable camera component for capturing live photos.
 * Used for selfie capture during age verification.
 * 
 * REQUIREMENTS:
 * - Must be served over HTTPS or localhost (browser security requirement)
 * - User must grant camera permissions
 * - Works best in Chrome, Firefox, Edge, Safari
 * 
 * PROPS:
 * - onCapture: Callback with base64 image data when photo is taken
 * - onCancel: Callback when user cancels
 * - instructions: Text shown at bottom of viewfinder
 * - facing: "user" (front camera) or "environment" (back camera)
 * 
 * TROUBLESHOOTING:
 * - If camera fails, check that you're on HTTPS or localhost
 * - Check browser permissions (lock icon in address bar)
 * - Try closing other apps that may be using the camera
 */

"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface CameraProps {
    onCapture: (imageData: string) => void;
    onCancel: () => void;
    instructions?: string;
    facing?: "user" | "environment";
}

export default function Camera({
    onCapture,
    onCancel,
    instructions = "Position your ID card within the frame",
    facing = "environment",
}: CameraProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [errorDetails, setErrorDetails] = useState<string | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [countdown, setCountdown] = useState<number | null>(null);

    // Check if we're in a secure context (HTTPS or localhost)
    const isSecureContext = typeof window !== "undefined" && (
        window.isSecureContext ||
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1"
    );

    // Start camera
    useEffect(() => {
        async function startCamera() {
            // Check for secure context
            if (!isSecureContext) {
                setError("Camera requires HTTPS");
                setErrorDetails("Cameras can only be accessed on HTTPS or localhost. Please use https:// or run on localhost:3000");
                return;
            }

            // Check if getUserMedia is supported
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                setError("Camera not supported");
                setErrorDetails("Your browser doesn't support camera access. Try Chrome, Firefox, or Edge.");
                return;
            }

            try {
                console.log("[Camera] Requesting camera access...");
                const mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: facing,
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                    },
                    audio: false,
                });

                console.log("[Camera] Got media stream:", mediaStream.getVideoTracks()[0]?.label);

                if (videoRef.current) {
                    videoRef.current.srcObject = mediaStream;

                    // Wait for video to be ready
                    videoRef.current.onloadedmetadata = () => {
                        videoRef.current?.play()
                            .then(() => {
                                console.log("[Camera] Video playing");
                                setStream(mediaStream);
                                setIsReady(true);
                            })
                            .catch((playError) => {
                                console.error("[Camera] Play error:", playError);
                                setError("Failed to start video");
                                setErrorDetails(playError.message);
                            });
                    };
                }
            } catch (err) {
                console.error("[Camera] Access error:", err);

                const error = err as Error;
                let message = "Unable to access camera";
                let details = "";

                if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
                    message = "Camera permission denied";
                    details = "Click the camera icon in your browser's address bar and allow access, then refresh the page.";
                } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
                    message = "No camera found";
                    details = "Make sure you have a camera connected and it's not being used by another application.";
                } else if (error.name === "NotReadableError" || error.name === "TrackStartError") {
                    message = "Camera is in use";
                    details = "Close other apps or browser tabs that might be using the camera.";
                } else if (error.name === "OverconstrainedError") {
                    message = "Camera constraints not supported";
                    details = "Your camera doesn't support the requested resolution. Trying with lower settings.";
                    // Retry with basic constraints
                    try {
                        const basicStream = await navigator.mediaDevices.getUserMedia({
                            video: true,
                            audio: false,
                        });
                        if (videoRef.current) {
                            videoRef.current.srcObject = basicStream;
                            await videoRef.current.play();
                            setStream(basicStream);
                            setIsReady(true);
                            return;
                        }
                    } catch {
                        details = "Camera access failed even with basic settings.";
                    }
                } else {
                    details = error.message || "Unknown error occurred";
                }

                setError(message);
                setErrorDetails(details);
            }
        }

        startCamera();

        return () => {
            if (stream) {
                stream.getTracks().forEach((track) => track.stop());
            }
        };
    }, [facing, isSecureContext]);

    // Capture photo
    const capturePhoto = useCallback(() => {
        if (!videoRef.current || !canvasRef.current || !isReady) return;

        // Countdown
        setCountdown(3);
        let count = 3;
        const interval = setInterval(() => {
            count--;
            if (count > 0) {
                setCountdown(count);
            } else {
                clearInterval(interval);
                setCountdown(null);

                // Capture
                const video = videoRef.current;
                const canvas = canvasRef.current;
                if (!video || !canvas) return;

                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;

                const ctx = canvas.getContext("2d");
                if (!ctx) return;

                // Flip horizontally if using front camera
                if (facing === "user") {
                    ctx.translate(canvas.width, 0);
                    ctx.scale(-1, 1);
                }

                ctx.drawImage(video, 0, 0);
                const imageData = canvas.toDataURL("image/jpeg", 0.9);

                // Stop camera
                stream?.getTracks().forEach((track) => track.stop());

                onCapture(imageData);
            }
        }, 1000);
    }, [isReady, onCapture, stream, facing]);

    // Handle cancel
    const handleCancel = useCallback(() => {
        stream?.getTracks().forEach((track) => track.stop());
        onCancel();
    }, [stream, onCancel]);

    // Retry camera access
    const handleRetry = useCallback(() => {
        setError(null);
        setErrorDetails(null);
        window.location.reload();
    }, []);

    if (error) {
        return (
            <div className="glass-card p-8 text-center max-w-lg mx-auto">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                    <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">{error}</h3>
                <p className="text-white/60 mb-6">{errorDetails}</p>

                <div className="flex gap-3 justify-center">
                    <button onClick={handleCancel} className="btn-secondary">
                        Go Back
                    </button>
                    <button onClick={handleRetry} className="btn-primary">
                        Retry
                    </button>
                </div>

                {/* Debug info */}
                <div className="mt-6 text-left text-xs text-white/30 bg-white/5 rounded p-3">
                    <p><strong>Debug Info:</strong></p>
                    <p>Secure Context: {isSecureContext ? "Yes" : "No"}</p>
                    <p>Protocol: {typeof window !== "undefined" ? window.location.protocol : "N/A"}</p>
                    <p>Host: {typeof window !== "undefined" ? window.location.hostname : "N/A"}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative w-full max-w-2xl mx-auto">
            {/* Camera viewport */}
            <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-black/50">
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${facing === "user" ? "scale-x-[-1]" : ""}`}
                />

                {/* Loading state */}
                {!isReady && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
                        <div className="spinner mb-4" />
                        <p className="text-white/60 text-sm">Starting camera...</p>
                    </div>
                )}

                {/* Countdown overlay */}
                {countdown !== null && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                        <span className="text-8xl font-bold text-white animate-pulse">
                            {countdown}
                        </span>
                    </div>
                )}

                {/* Viewfinder corners */}
                <div className="absolute inset-8 viewfinder pointer-events-none" />

                {/* Instructions */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6">
                    <p className="text-white text-center">{instructions}</p>
                </div>
            </div>

            {/* Hidden canvas for capture */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Controls */}
            <div className="flex items-center justify-center gap-6 mt-6">
                <button
                    onClick={handleCancel}
                    className="btn-secondary flex items-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Cancel
                </button>

                <button
                    onClick={capturePhoto}
                    disabled={!isReady || countdown !== null}
                    className="w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-xl transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <div className="w-16 h-16 rounded-full border-4 border-primary-500" />
                </button>

                <div className="w-24" /> {/* Spacer for alignment */}
            </div>
        </div>
    );
}

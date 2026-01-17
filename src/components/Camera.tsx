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
    const [isReady, setIsReady] = useState(false);
    const [countdown, setCountdown] = useState<number | null>(null);

    // Start camera
    useEffect(() => {
        async function startCamera() {
            try {
                const mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: facing,
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                    },
                    audio: false,
                });

                if (videoRef.current) {
                    videoRef.current.srcObject = mediaStream;
                    await videoRef.current.play();
                    setStream(mediaStream);
                    setIsReady(true);
                }
            } catch (err) {
                console.error("Camera error:", err);
                setError("Unable to access camera. Please grant permission and try again.");
            }
        }

        startCamera();

        return () => {
            if (stream) {
                stream.getTracks().forEach((track) => track.stop());
            }
        };
    }, [facing]);

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

    if (error) {
        return (
            <div className="glass-card p-8 text-center max-w-lg mx-auto">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                    <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">Camera Error</h3>
                <p className="text-white/60 mb-6">{error}</p>
                <button onClick={handleCancel} className="btn-secondary">
                    Go Back
                </button>
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
                    <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                        <div className="spinner" />
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

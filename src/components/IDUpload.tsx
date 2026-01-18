"use client";

import { useState, useRef, useCallback } from "react";
import Camera from "./Camera";

interface IDUploadProps {
    onComplete: (imageData: string) => void;
}

export default function IDUpload({ onComplete }: IDUploadProps) {
    const [mode, setMode] = useState<"choose" | "camera" | "preview">("choose");
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Handle file upload
    const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith("image/")) {
            alert("Please select an image file");
            return;
        }

        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            alert("Image is too large. Please select an image under 10MB");
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const imageData = event.target?.result as string;
            setPreviewImage(imageData);
            setMode("preview");
        };
        reader.readAsDataURL(file);
    }, []);

    // Handle camera capture
    const handleCapture = useCallback((imageData: string) => {
        setPreviewImage(imageData);
        setMode("preview");
    }, []);

    // Confirm and proceed
    const handleConfirm = useCallback(() => {
        if (previewImage) {
            onComplete(previewImage);
        }
    }, [previewImage, onComplete]);

    // Retake/re-upload
    const handleRetake = useCallback(() => {
        setPreviewImage(null);
        setMode("choose");
    }, []);

    // Render based on mode
    if (mode === "camera") {
        return (
            <Camera
                onCapture={handleCapture}
                onCancel={() => setMode("choose")}
                instructions="Position your ID card within the frame. Make sure all text is visible."
                facing="environment"
            />
        );
    }

    if (mode === "preview" && previewImage) {
        return (
            <div className="w-full max-w-xl mx-auto">
                {/* Preview image */}
                <div className="glass-card p-4 mb-6">
                    <div className="relative aspect-[3/2] rounded-xl overflow-hidden">
                        <img
                            src={previewImage}
                            alt="ID Preview"
                            className="w-full h-full object-contain bg-black/20"
                        />

                        {/* Guidelines overlay */}
                        <div className="absolute inset-0 pointer-events-none">
                            <div className="absolute inset-4 border-2 border-dashed border-primary-400/50 rounded-lg" />
                        </div>
                    </div>
                </div>

                {/* Checklist */}
                <div className="glass-card p-6 mb-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Quick Check</h3>
                    <ul className="space-y-3">
                        <ChecklistItem text="ID card is fully visible" />
                        <ChecklistItem text="Text is clear and readable" />
                        <ChecklistItem text="Photo on ID is clearly visible" />
                        <ChecklistItem text="No glare or shadows blocking info" />
                    </ul>
                </div>

                {/* Action buttons */}
                <div className="flex gap-4">
                    <button onClick={handleRetake} className="btn-secondary flex-1">
                        Retake
                    </button>
                    <button onClick={handleConfirm} className="btn-primary flex-1">
                        Looks Good
                    </button>
                </div>
            </div>
        );
    }

    // Choose mode
    return (
        <div className="w-full max-w-xl mx-auto">
            <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-white mb-2">Upload Your ID</h2>
                <p className="text-white/60">
                    Take a photo or upload an image of your government-issued ID
                </p>
            </div>

            {/* Options */}
            <div className="grid gap-4">
                {/* Camera option */}
                <button
                    onClick={() => setMode("camera")}
                    className="glass-card-hover p-6 flex items-center gap-4 text-left"
                >
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary-500/20 to-accent-500/20 flex items-center justify-center flex-shrink-0">
                        <svg className="w-7 h-7 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg font-semibold text-white">Take a Photo</h3>
                        <p className="text-white/60 text-sm">Use your camera to capture your ID</p>
                    </div>
                    <svg className="w-5 h-5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </button>

                {/* Upload option */}
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="glass-card-hover p-6 flex items-center gap-4 text-left"
                >
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary-500/20 to-accent-500/20 flex items-center justify-center flex-shrink-0">
                        <svg className="w-7 h-7 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg font-semibold text-white">Upload Image</h3>
                        <p className="text-white/60 text-sm">Choose an existing photo from your device</p>
                    </div>
                    <svg className="w-5 h-5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </button>
            </div>

            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
            />

            {/* Privacy note */}
            <div className="mt-8 flex items-center justify-center gap-2 text-white/40 text-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>Your ID image is processed locally and never uploaded</span>
            </div>
        </div>
    );
}

function ChecklistItem({ text }: { text: string }) {
    return (
        <li className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-3 h-3 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
            </div>
            <span className="text-white/80 text-sm">{text}</span>
        </li>
    );
}

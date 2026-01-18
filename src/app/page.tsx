"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

export default function Home() {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        setIsVisible(true);
    }, []);

    return (
        <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
            {/* Hero Section */}
            <div
                className={`max-w-4xl mx-auto text-center transition-all duration-1000 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
                    }`}
            >
                {/* Logo/Icon */}
                <div className="mb-8 animate-float">
                    <div className="w-24 h-24 mx-auto rounded-3xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-2xl shadow-primary-500/30">
                        <svg
                            className="w-12 h-12 text-white"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                            />
                        </svg>
                    </div>
                </div>

                {/* Title */}
                <h1 className="text-5xl md:text-7xl font-bold mb-6">
                    <span className="gradient-text">S1ngleID</span>
                </h1>

                {/* Subtitle */}
                <p className="text-xl md:text-2xl text-white/80 mb-4">
                    Privacy-First Age Verification
                </p>

                {/* Description */}
                <p className="text-lg text-white/60 mb-12 max-w-2xl mx-auto">
                    Verify your age once, use everywhere. Built with cutting-edge
                    technology that <span className="line-through opacity-50">keeps your identity safe</span> doesn&apos;t keep your identity.
                </p>

                {/* Privacy Badge */}
                <div className="glass-card inline-flex items-center gap-3 px-6 py-3 mb-12">
                    <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-white/90 font-medium">
                        🔒 Your ID never reaches our database
                    </span>
                </div>

                {/* CTA Buttons */}
                <div className="mb-16 flex flex-col sm:flex-row gap-4 justify-center">
                    <Link href="/verify" className="btn-primary inline-flex items-center gap-3">
                        <span>Get Verified</span>
                        <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13 7l5 5m0 0l-5 5m5-5H6"
                            />
                        </svg>
                    </Link>
                    <Link href="/authenticate" className="btn-secondary inline-flex items-center gap-3">
                        <span>Already Verified?</span>
                        <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                            />
                        </svg>
                    </Link>
                </div>

                {/* Feature Cards */}
                <div className="grid md:grid-cols-3 gap-6 max-w-3xl mx-auto">
                    <FeatureCard
                        icon={
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                        }
                        title="100% Private"
                        description="We delete your ID data and replace it with a credential the moment you complete age verification."
                    />
                    <FeatureCard
                        icon={
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        }
                        title="Verify Once"
                        description="Complete the verification once and use your credential across all supported sites."
                    />
                    <FeatureCard
                        icon={
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                            </svg>
                        }
                        title="Biometric Lock"
                        description="Protected by your device's Face ID, Touch ID, or passkey for maximum security."
                    />
                </div>
            </div>

            {/* How It Works Section */}
            <div
                className={`max-w-4xl mx-auto mt-24 text-center transition-all duration-1000 delay-300 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
                    }`}
            >
                <h2 className="text-3xl md:text-4xl font-bold mb-12 text-white">
                    How It Works
                </h2>

                <div className="grid md:grid-cols-4 gap-8">
                    <StepCard
                        number={1}
                        title="Upload ID"
                        description="Take or upload a photo of your ID card"
                    />
                    <StepCard
                        number={2}
                        title="ID Scan"
                        description="We check your ID and age"
                    />
                    <StepCard
                        number={3}
                        title="Face Match"
                        description="Take a selfie to verify it's you"
                    />
                    <StepCard
                        number={4}
                        title="Get Credential"
                        description="Receive your secure age credential"
                    />
                </div>
            </div>

            {/* Footer */}
            <footer className="mt-24 text-center text-white/40 text-sm">
                <p>© 2026 S1ngleID. Built with privacy in mind.</p>
            </footer>
        </div>
    );
}

function FeatureCard({
    icon,
    title,
    description,
}: {
    icon: React.ReactNode;
    title: string;
    description: string;
}) {
    return (
        <div className="glass-card-hover p-6 text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-gradient-to-br from-primary-500/20 to-accent-500/20 flex items-center justify-center text-primary-400">
                {icon}
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
            <p className="text-white/60 text-sm">{description}</p>
        </div>
    );
}

function StepCard({
    number,
    title,
    description,
}: {
    number: number;
    title: string;
    description: string;
}) {
    return (
        <div className="relative">
            {/* Connector line */}
            {number < 4 && (
                <div className="hidden md:block absolute top-8 left-1/2 w-full h-0.5 bg-gradient-to-r from-primary-500/50 to-transparent" />
            )}

            <div className="relative z-10">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-primary-500/30">
                    {number}
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
                <p className="text-white/60 text-sm">{description}</p>
            </div>
        </div>
    );
}

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "SecureAge - Privacy-First Age Verification",
    description: "Verify your age once, use everywhere. Your ID never leaves your device.",
    keywords: ["age verification", "privacy", "secure", "identity"],
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className={inter.className}>
                {/* Floating background orbs */}
                <div className="fixed inset-0 overflow-hidden pointer-events-none">
                    <div className="floating-orb w-96 h-96 bg-primary-500 top-1/4 -left-48" />
                    <div className="floating-orb w-80 h-80 bg-accent-500 bottom-1/4 -right-40" style={{ animationDelay: '-3s' }} />
                    <div className="floating-orb w-64 h-64 bg-primary-400 top-3/4 left-1/3" style={{ animationDelay: '-1.5s' }} />
                </div>

                {/* Main content */}
                <main className="relative z-10 min-h-screen">
                    {children}
                </main>
            </body>
        </html>
    );
}

interface ProgressIndicatorProps {
    steps: string[];
    currentStep: number;
}

export default function ProgressIndicator({ steps, currentStep }: ProgressIndicatorProps) {
    return (
        <div className="w-full max-w-3xl mx-auto mb-8">
            <div className="flex items-center justify-between">
                {steps.map((step, index) => {
                    const isCompleted = index < currentStep;
                    const isCurrent = index === currentStep;
                    const isUpcoming = index > currentStep;

                    return (
                        <div key={step} className="flex items-center flex-1">
                            {/* Step circle */}
                            <div className="relative flex flex-col items-center">
                                <div
                                    className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-all duration-300 ${isCompleted
                                        ? "bg-gradient-to-br from-primary-500 to-accent-500 text-white"
                                        : isCurrent
                                            ? "bg-primary-500/20 border-2 border-primary-500 text-primary-400"
                                            : "bg-white/5 border border-white/20 text-white/40"
                                        }`}
                                >
                                    {isCompleted ? (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    ) : (
                                        index + 1
                                    )}
                                </div>

                                {/* Step label */}
                                <span
                                    className={`absolute -bottom-6 whitespace-nowrap text-xs transition-all duration-300 ${isCurrent ? "text-white font-medium" : "text-white/40"
                                        }`}
                                >
                                    {step}
                                </span>
                            </div>

                            {/* Connector line */}
                            {index < steps.length - 1 && (
                                <div className="flex-1 h-0.5 mx-3">
                                    <div
                                        className={`h-full transition-all duration-500 ${isCompleted
                                            ? "bg-gradient-to-r from-primary-500 to-accent-500"
                                            : "bg-white/10"
                                            }`}
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

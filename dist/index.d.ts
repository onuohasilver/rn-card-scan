import React from 'react';

type CardBrand = 'visa' | 'mastercard' | 'amex' | 'discover' | 'other';
type ScanStatus = 'success' | 'manual_required' | 'failed';
type CardScanErrorCode = 'CAMERA_PERMISSION' | 'TIMEOUT' | 'LOW_LIGHT' | 'NO_CARD' | 'LIVENESS_FAILED' | 'INTERNAL';
type LivenessCheckName = 'glare_consistency' | 'edge_parallax' | 'screen_recapture' | 'active_challenge';
interface LivenessCheckResult {
    name: LivenessCheckName;
    passed: boolean;
    confidence: number;
    reason?: string;
}
interface CardFields {
    pan?: string;
    expiryMonth?: number;
    expiryYear?: number;
    cardholderName?: string;
    cvv?: string;
    brand?: CardBrand;
}
interface CardScanConfidence {
    panRead: number;
    expiryRead: number;
    liveness: number;
    overall: number;
}
interface CardScanTimings {
    total: number;
    detection: number;
    ocr: number;
    liveness: number;
}
interface CardScanResult {
    status: ScanStatus;
    fields: CardFields;
    confidence: CardScanConfidence;
    liveness: {
        passed: boolean;
        checks: LivenessCheckResult[];
    };
    captureDiagnostics: {
        frameCountUsed: number;
        sharpnessScore: number;
        exposureScore: number;
        glareScore: number;
        parallaxScore: number;
        recaptureScore: number;
        challengeTriggered: boolean;
        failureReasons: string[];
    };
    riskFlags: string[];
    reasons: string[];
    timingsMs: CardScanTimings;
}
interface CardScanError {
    code: CardScanErrorCode;
    message: string;
    retryable: boolean;
}
interface CardScanOptions {
    requireLiveness?: boolean;
    timeoutMs?: number;
    allowedCardBrands?: CardBrand[];
    captureMode?: 'auto' | 'manual';
    burstCount?: number;
    enableActiveChallengeOnSuspicion?: boolean;
    livenessStrictness?: 'standard' | 'high';
    /** Automatically scan the back of the card for the CVV after the front scan succeeds. Default: true. */
    captureBackForCvv?: boolean;
    /** How long (ms) to wait after showing the "flip your card" prompt before auto-capturing the back. Default: 2500. Ignored when `waitForBackTrigger` is supplied. */
    flipPauseMs?: number;
    /**
     * Optional async hook that gates the back-of-card capture. When provided,
     * the SDK awaits this Promise instead of running `flipPauseMs` on a timer
     * — letting the host implement a "tap to capture the back" UX. Resolve
     * when the user is ready; reject to skip the back capture entirely.
     */
    waitForBackTrigger?: () => Promise<void>;
    debugDiagnostics?: boolean;
    collectName?: boolean;
    collectExpiry?: boolean;
    enableTorchToggle?: boolean;
    uiMode?: 'fullscreen' | 'embedded';
    showTorchControl?: boolean;
    showCancelControl?: boolean;
    showHintText?: boolean;
    debugMode?: boolean;
    onProgress?: (stage: string, metrics?: Record<string, number | string | boolean>) => void;
    onAutoCapture?: (frameMeta: Record<string, number | string | boolean>) => void;
    onResult?: (result: CardScanResult) => void;
    onError?: (error: CardScanError) => void;
}
interface ParsedCardFields {
    pan?: string;
    expiryMonth?: number;
    expiryYear?: number;
    cardholderName?: string;
    cvv?: string;
    brand: CardBrand;
}
interface ValidationResult {
    valid: boolean;
    reasons: string[];
    brand: CardBrand;
}
interface OcrPayload {
    panCandidate?: string;
    expiryCandidate?: string;
    nameCandidate?: string;
    cvvCandidate?: string;
    panConfidence?: number;
    expiryConfidence?: number;
}
interface LivenessInput {
    glareScore: number;
    edgeParallaxScore: number;
    screenRecaptureScore: number;
    challengeTriggered?: boolean;
    challengePassed?: boolean;
}
interface ScanInput {
    ocr: OcrPayload;
    liveness: LivenessInput;
    captureDiagnostics?: Partial<CardScanResult['captureDiagnostics']>;
    timingsMs?: Partial<CardScanTimings>;
}
interface CardScanHealth {
    sdk: string;
    platform: 'ios' | 'android' | 'web' | 'unknown';
    turboModuleAvailable: boolean;
    ocrEngine: string;
}

interface CardScannerViewProps {
    options?: CardScanOptions;
    fullscreen?: boolean;
    onCameraReady?: () => void;
    onCardDetected?: () => void;
    onStart?: () => void;
    onStop?: () => void;
    onCancel?: () => void;
}
declare function CardScannerView({ options, fullscreen, onCameraReady, onCardDetected, onStart, onStop, onCancel, }: CardScannerViewProps): React.ReactElement;

declare function startCardScan(options?: CardScanOptions): Promise<string>;
declare function stopCardScan(sessionId: string): Promise<void>;
declare function processScanInput(input: ScanInput, options?: CardScanOptions): Promise<CardScanResult>;
declare function captureCard(options?: CardScanOptions): Promise<CardScanResult>;
declare function getSdkHealth(): Promise<CardScanHealth>;
declare function validateCardFields(fields: ParsedCardFields, allowedBrands?: ParsedCardFields['brand'][]): ValidationResult;

export { type CardBrand, type CardFields, type CardScanError, type CardScanErrorCode, type CardScanHealth, type CardScanOptions, type CardScanResult, CardScannerView, type LivenessCheckResult, type ParsedCardFields, type ScanInput, captureCard, getSdkHealth, processScanInput, startCardScan, stopCardScan, validateCardFields };

import type { CardScanOptions, NormalizedCardScanOptions } from '../types';

const ALL_BRANDS = ['visa', 'mastercard', 'amex', 'discover', 'other'] as const;

export function normalizeOptions(options: CardScanOptions = {}): NormalizedCardScanOptions {
  return {
    requireLiveness: options.requireLiveness ?? true,
    timeoutMs: options.timeoutMs ?? 10_000,
    allowedCardBrands: options.allowedCardBrands ?? [...ALL_BRANDS],
    captureMode: options.captureMode ?? 'auto',
    burstCount: Math.max(1, Math.min(8, options.burstCount ?? 5)),
    enableActiveChallengeOnSuspicion: options.enableActiveChallengeOnSuspicion ?? true,
    livenessStrictness: options.livenessStrictness ?? 'standard',
    captureBackForCvv: options.captureBackForCvv ?? true,
    flipPauseMs: Math.max(500, options.flipPauseMs ?? 2500),
    debugDiagnostics: options.debugDiagnostics ?? false,
    collectName: options.collectName ?? true,
    collectExpiry: options.collectExpiry ?? true,
    enableTorchToggle: options.enableTorchToggle ?? true,
    uiMode: options.uiMode ?? 'fullscreen',
    showTorchControl: options.showTorchControl ?? true,
    showCancelControl: options.showCancelControl ?? true,
    showHintText: options.showHintText ?? true,
    debugMode: options.debugMode ?? false,
    // Preserve the host-driven back-capture gate. captureCard() runs options
    // through normalizeOptions() before handing them to the JS runtime, so a
    // field that is dropped here never reaches captureCardWithJsRuntime. Without
    // this passthrough the back-of-card (CVV) frame auto-fires on the
    // flipPauseMs timer — often mid-flip while the lens is still refocusing —
    // which can crash the camera session. Forwarding it lets the back capture
    // be user-triggered (and shot on a stable camera) exactly like the front.
    waitForBackTrigger: options.waitForBackTrigger,
    onProgress: options.onProgress,
    onAutoCapture: options.onAutoCapture,
    onResult: options.onResult,
    onError: options.onError,
  };
}

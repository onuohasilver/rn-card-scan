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
    onProgress: options.onProgress,
    onAutoCapture: options.onAutoCapture,
    onResult: options.onResult,
    onError: options.onError,
  };
}

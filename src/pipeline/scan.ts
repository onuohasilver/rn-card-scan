import type {
  CardScanError,
  CardScanOptions,
  CardScanResult,
  ScanInput,
  CardScanTimings,
} from '../types';
import { buildScanResult } from './confidence';
import { runLivenessChecks } from './liveness';
import { normalizeOptions } from './options';
import { parseOcrPayload } from './parser';
import { validateCardFields } from './validation';

export async function runScanPipeline(input: ScanInput, options?: CardScanOptions): Promise<CardScanResult> {
  const normalized = normalizeOptions(options);
  const start = Date.now();

  normalized.onProgress?.('detection', { timeoutMs: normalized.timeoutMs });

  const parsed = parseOcrPayload(input.ocr);
  const validation = validateCardFields(parsed, normalized.allowedCardBrands);

  normalized.onProgress?.('ocr', {
    panDetected: Boolean(parsed.pan),
    expiryDetected: Boolean(parsed.expiryMonth && parsed.expiryYear),
  });

  const checks = runLivenessChecks(input.liveness, {
    strictness: normalized.livenessStrictness,
    challengeTriggered: input.captureDiagnostics?.challengeTriggered,
  });
  const timings = mergeTimings(input.timingsMs, start);

  const result = buildScanResult({
    validation,
    parsed,
    panConfidence: input.ocr.panConfidence ?? 0,
    expiryConfidence: input.ocr.expiryConfidence ?? 0,
    livenessChecks: checks,
    timingsMs: timings,
    requireLiveness: normalized.requireLiveness,
    captureDiagnostics: input.captureDiagnostics,
    livenessStrictness: normalized.livenessStrictness,
  });

  normalized.onResult?.(result);

  return result;
}

export function timeoutError(): CardScanError {
  return {
    code: 'TIMEOUT',
    message: 'Card scan timed out before reaching confidence threshold.',
    retryable: true,
  };
}

function mergeTimings(input: Partial<CardScanTimings> | undefined, start: number): CardScanTimings {
  const now = Date.now();
  const total = input?.total ?? Math.max(0, now - start);

  return {
    total,
    detection: input?.detection ?? Math.round(total * 0.3),
    ocr: input?.ocr ?? Math.round(total * 0.4),
    liveness: input?.liveness ?? Math.round(total * 0.3),
  };
}

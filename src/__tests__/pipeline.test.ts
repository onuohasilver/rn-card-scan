import { describe, expect, it } from 'vitest';
import { runLivenessChecks } from '../pipeline/liveness';
import { runScanPipeline } from '../pipeline/scan';

describe('scan pipeline', () => {
  it('returns success for strong OCR and liveness', async () => {
    const result = await runScanPipeline({
      ocr: {
        panCandidate: '4111 1111 1111 1111',
        expiryCandidate: '12/29',
        nameCandidate: 'JANE DOE',
        cvvCandidate: '123',
        panConfidence: 0.98,
        expiryConfidence: 0.9,
      },
      liveness: {
        glareScore: 0.9,
        edgeParallaxScore: 0.88,
        screenRecaptureScore: 0.1,
      },
    });

    expect(result.status).toBe('success');
    expect(result.fields.brand).toBe('visa');
    expect(result.fields.cvv).toBe('123');
    expect(result.liveness.passed).toBe(true);
  });

  it('returns manual_required for borderline confidence', async () => {
    const result = await runScanPipeline({
      ocr: {
        panCandidate: '4111 1111 1111 1111',
        expiryCandidate: '12/29',
        panConfidence: 0.7,
        expiryConfidence: 0.62,
      },
      liveness: {
        glareScore: 0.7,
        edgeParallaxScore: 0.66,
        screenRecaptureScore: 0.33,
      },
    });

    expect(result.status).toBe('manual_required');
    expect(result.riskFlags).toContain('MANUAL_ENTRY_REQUIRED');
    expect(result.fields.pan).toBeUndefined();
    expect(result.reasons).toContain('PAN_SUPPRESSED_LOW_CONFIDENCE');
  });

  it('returns failed for hard liveness failure', async () => {
    const result = await runScanPipeline({
      ocr: {
        panCandidate: '4111 1111 1111 1111',
        expiryCandidate: '12/29',
        panConfidence: 0.95,
        expiryConfidence: 0.9,
      },
      liveness: {
        glareScore: 0.2,
        edgeParallaxScore: 0.3,
        screenRecaptureScore: 0.9,
      },
    });

    expect(result.status).toBe('failed');
    expect(result.reasons).toContain('LIVENESS_FAILED');
  });

  it('suppresses invalid PAN values instead of returning guessed digits', async () => {
    const result = await runScanPipeline({
      ocr: {
        panCandidate: '4111 1111 1111 1112',
        expiryCandidate: '12/29',
        panConfidence: 0.95,
        expiryConfidence: 0.9,
      },
      liveness: {
        glareScore: 0.9,
        edgeParallaxScore: 0.88,
        screenRecaptureScore: 0.1,
      },
    });

    expect(result.fields.pan).toBeUndefined();
    expect(result.fields.brand).toBeUndefined();
    expect(result.reasons).toContain('PAN_SUPPRESSED_INVALID');
  });

  it('computes liveness checks', () => {
    const checks = runLivenessChecks({
      glareScore: 0.8,
      edgeParallaxScore: 0.9,
      screenRecaptureScore: 0.2,
    });

    expect(checks.every((check) => check.passed)).toBe(true);
  });
});

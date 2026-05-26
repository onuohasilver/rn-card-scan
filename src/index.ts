import { CardScannerView } from './components/CardScannerView';
import { captureCardWithJsRuntime } from './capture/jsCapture';
import { NativeCardScanModule, inferPlatform } from './native/CardScanTurboModule';
import { normalizeOptions } from './pipeline/options';
import { runScanPipeline } from './pipeline/scan';
import { validateCardFields as validateCardFieldsInternal } from './pipeline/validation';
import type { CardScanHealth, CardScanOptions, CardScanResult, ParsedCardFields, ScanInput } from './types';

const VERSION = '0.1.0';
const sessions = new Set<string>();

export { CardScannerView };
export type {
  CardBrand,
  CardScanError,
  CardScanErrorCode,
  CardScanOptions,
  CardScanResult,
  CardFields,
  CardScanHealth,
  LivenessCheckResult,
  ScanInput,
  ParsedCardFields,
} from './types';

export async function startCardScan(options: CardScanOptions = {}): Promise<string> {
  const normalized = normalizeOptions(options);
  const sessionId = createSessionId();
  sessions.add(sessionId);

  normalized.onProgress?.('session_started', { sessionId, requireLiveness: normalized.requireLiveness });

  if (NativeCardScanModule) {
    await NativeCardScanModule.startCardScan(sessionId, normalized);
  }

  return sessionId;
}

export async function stopCardScan(sessionId: string): Promise<void> {
  if (!sessions.has(sessionId)) {
    return;
  }

  sessions.delete(sessionId);

  if (NativeCardScanModule) {
    await NativeCardScanModule.stopCardScan(sessionId);
  }
}

export async function processScanInput(input: ScanInput, options: CardScanOptions = {}): Promise<CardScanResult> {
  return runScanPipeline(input, options);
}

export async function captureCard(options: CardScanOptions = {}): Promise<CardScanResult> {
  const normalized = normalizeOptions(options);
  const sessionId = await startCardScan(normalized);

  try {
    const result = await captureCardWithJsRuntime(normalized);
    normalized.onResult?.(result);
    return result;
  } catch (error) {
    normalized.onError?.({
      code: 'INTERNAL',
      message: String(error),
      retryable: true,
    });
    throw error;
  } finally {
    await stopCardScan(sessionId);
  }
}

export async function getSdkHealth(): Promise<CardScanHealth> {
  const platform = inferPlatform();

  if (NativeCardScanModule) {
    const health = await NativeCardScanModule.getSdkHealth();
    return {
      sdk: VERSION,
      platform,
      turboModuleAvailable: health.turboModuleAvailable,
      ocrEngine: health.ocrEngine,
    };
  }

  return {
    sdk: VERSION,
    platform,
    turboModuleAvailable: false,
    ocrEngine: platform === 'ios' ? 'vision_stub' : platform === 'android' ? 'mlkit_stub' : 'none',
  };
}

export function validateCardFields(
  fields: ParsedCardFields,
  allowedBrands?: ParsedCardFields['brand'][]
) {
  return validateCardFieldsInternal(fields, allowedBrands);
}

function createSessionId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `scan_${Date.now()}_${rand}`;
}

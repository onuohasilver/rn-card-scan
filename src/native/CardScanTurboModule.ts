import { NativeModules, Platform } from 'react-native';
import type { CardScanOptions, CardScanResult, ScanInput } from '../types';

interface NativeCardScanTurboModule {
  startCardScan(sessionId: string, options: CardScanOptions): Promise<void>;
  stopCardScan(sessionId: string): Promise<void>;
  captureCard?(sessionId: string, options: CardScanOptions): Promise<CardScanResult>;
  recognizeCardTextFromImage?(uri: string): Promise<{
    lines: string[];
    positionedLines: Array<{ text: string; yNorm: number }>;
    sharpnessScore: number;
    exposureScore: number;
    glareScore: number;
    recaptureScore: number;
  }>;
  getSdkHealth(): Promise<{ turboModuleAvailable: boolean; ocrEngine: string }>;
  debugInjectScanInput?(sessionId: string, input: ScanInput): Promise<void>;
}

const MODULE_NAME = 'RNCardScanTurboModule';

export const NativeCardScanModule: NativeCardScanTurboModule | null =
  (NativeModules[MODULE_NAME] as NativeCardScanTurboModule | undefined) ?? null;

export function inferPlatform(): 'ios' | 'android' | 'web' | 'unknown' {
  if (Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web') {
    return Platform.OS;
  }

  return 'unknown';
}

export interface CaptureAdapter {
  capturePhoto: () => Promise<{ uri: string }>;
  captureBurst?: (count: number) => Promise<Array<{ uri: string }>>;
}

let adapter: CaptureAdapter | null = null;

export function registerCaptureAdapter(nextAdapter: CaptureAdapter | null): void {
  adapter = nextAdapter;
}

export function getCaptureAdapter(): CaptureAdapter | null {
  return adapter;
}

import Foundation

@objc(RNCardScanTurboModule)
class RNCardScanTurboModule: NSObject {
  typealias PromiseResolve = (Any?) -> Void
  typealias PromiseReject = (String?, String?, Error?) -> Void

  private var activeSessions: Set<String> = []
  private let mlKitService = CardScanMlKitService()

  @objc(startCardScan:options:resolver:rejecter:)
  func startCardScan(
    _ sessionId: String,
    options: NSDictionary,
    resolver resolve: @escaping PromiseResolve,
    rejecter reject: @escaping PromiseReject
  ) {
    activeSessions.insert(sessionId)
    resolve(nil)
  }

  @objc(stopCardScan:resolver:rejecter:)
  func stopCardScan(
    _ sessionId: String,
    resolver resolve: @escaping PromiseResolve,
    rejecter reject: @escaping PromiseReject
  ) {
    activeSessions.remove(sessionId)
    resolve(nil)
  }

  @objc(captureCard:options:resolver:rejecter:)
  func captureCard(
    _ sessionId: String,
    options: NSDictionary,
    resolver resolve: @escaping PromiseResolve,
    rejecter reject: @escaping PromiseReject
  ) {
    _ = sessionId
    _ = options
    reject("E_NOT_IMPLEMENTED", "Native captureCard not implemented. SDK JS runtime path should be used.", nil)
  }

  @objc(recognizeCardTextFromImage:resolver:rejecter:)
  func recognizeCardTextFromImage(
    _ uri: String,
    resolver resolve: @escaping PromiseResolve,
    rejecter reject: @escaping PromiseReject
  ) {
    mlKitService.recognizeTextFromImage(uri: uri) { result in
      switch result {
      case .success(let ocrResult):
        let positionedLinesArray: [[String: Any]] = ocrResult.positionedLines.map { entry in
          ["text": entry.text, "yNorm": entry.yNorm]
        }
        resolve([
          "lines": ocrResult.lines,
          "positionedLines": positionedLinesArray,
          "sharpnessScore": ocrResult.sharpnessScore,
          "exposureScore": ocrResult.exposureScore,
          "glareScore": ocrResult.glareScore,
          "recaptureScore": ocrResult.recaptureScore
        ])
      case .failure(let error):
        reject("E_OCR", "Native ML Kit OCR failed: \(error.localizedDescription)", error)
      }
    }
  }

  @objc(getSdkHealth:rejecter:)
  func getSdkHealth(
    _ resolve: @escaping PromiseResolve,
    rejecter reject: @escaping PromiseReject
  ) {
    resolve([
      "turboModuleAvailable": true,
      "ocrEngine": "mlkit"
    ])
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }
}

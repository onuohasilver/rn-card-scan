package com.company.rncardscan

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableNativeArray
import com.facebook.react.bridge.WritableNativeMap

class RNCardScanTurboModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val activeSessions: MutableSet<String> = mutableSetOf()
  private val mlKitService = CardScanMlKitService()

  override fun getName(): String = "RNCardScanTurboModule"

  @ReactMethod
  fun startCardScan(sessionId: String, options: ReadableMap, promise: Promise) {
    activeSessions.add(sessionId)
    promise.resolve(null)
  }

  @ReactMethod
  fun stopCardScan(sessionId: String, promise: Promise) {
    activeSessions.remove(sessionId)
    promise.resolve(null)
  }

  @ReactMethod
  fun captureCard(sessionId: String, options: ReadableMap, promise: Promise) {
    // The combined native capture path is not implemented on Android either.
    // The SDK's JS runtime drives capture + OCR by calling
    // recognizeCardTextFromImage per frame, which IS implemented below.
    val unusedSession = sessionId
    val unusedOptions = options
    promise.reject(
      "E_NOT_IMPLEMENTED",
      "Native captureCard not implemented. SDK JS runtime path should be used.",
    )
  }

  /**
   * OCR entry point used by the SDK's JS `recognizeCardFrame()`. Takes a
   * `file://` URI to a JPEG captured by the host's camera adapter, returns
   * the extracted text + a few image-quality diagnostics used by the JS
   * liveness pipeline. Contract mirrors the iOS Swift implementation —
   * see CardScanTurboModule.ts for the expected shape.
   */
  @ReactMethod
  fun recognizeCardTextFromImage(uri: String, promise: Promise) {
    mlKitService.recognizeTextFromImage(
      uri = uri,
      onSuccess = { result ->
        val map = WritableNativeMap()

        val linesArray = WritableNativeArray()
        for (line in result.lines) {
          linesArray.pushString(line)
        }
        map.putArray("lines", linesArray)

        val positionedArray = WritableNativeArray()
        for (positioned in result.positionedLines) {
          val entry = WritableNativeMap()
          entry.putString("text", positioned.text)
          entry.putDouble("yNorm", positioned.yNorm)
          positionedArray.pushMap(entry)
        }
        map.putArray("positionedLines", positionedArray)

        map.putDouble("sharpnessScore", result.sharpnessScore)
        map.putDouble("exposureScore", result.exposureScore)
        map.putDouble("glareScore", result.glareScore)
        map.putDouble("recaptureScore", result.recaptureScore)

        promise.resolve(map)
      },
      onError = { error ->
        promise.reject(
          "E_OCR_FAILED",
          error.message ?: "Android MLKit OCR failed",
          error,
        )
      },
    )
  }

  @ReactMethod
  fun getSdkHealth(promise: Promise) {
    val map = WritableNativeMap()
    map.putBoolean("turboModuleAvailable", true)
    map.putString("ocrEngine", "mlkit")
    promise.resolve(map)
  }
}

package com.company.rncardscan

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeMap

class RNCardScanTurboModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val activeSessions: MutableSet<String> = mutableSetOf()

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
    val _sessionId = sessionId
    val _options = options
    promise.reject("E_NOT_IMPLEMENTED", "Native captureCard not implemented. SDK JS runtime path should be used.")
  }

  @ReactMethod
  fun getSdkHealth(promise: Promise) {
    val map = WritableNativeMap()
    map.putBoolean("turboModuleAvailable", true)
    map.putString("ocrEngine", "mlkit")
    promise.resolve(map)
  }
}

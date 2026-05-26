package com.company.rncardscan

class CardScanMlKitService {
  data class LivenessInput(
    val glareScore: Double,
    val edgeParallaxScore: Double,
    val screenRecaptureScore: Double,
  )

  data class OcrResult(
    val panCandidate: String?,
    val expiryCandidate: String?,
    val nameCandidate: String?,
    val panConfidence: Double,
    val expiryConfidence: Double,
  )

  fun detectCardQuad(frame: Any): Boolean {
    // TODO: Wire CameraX frame analysis + edge/quad detection.
    return true
  }

  fun extractOcr(frame: Any): OcrResult {
    // TODO: Use ML Kit text recognition over PAN/expiry/name regions.
    return OcrResult(
      panCandidate = null,
      expiryCandidate = null,
      nameCandidate = null,
      panConfidence = 0.0,
      expiryConfidence = 0.0,
    )
  }

  fun computeLiveness(frameWindow: List<Any>): LivenessInput {
    // TODO: Implement glare consistency, motion parallax, and moire checks.
    return LivenessInput(
      glareScore = 0.0,
      edgeParallaxScore = 0.0,
      screenRecaptureScore = 1.0,
    )
  }
}

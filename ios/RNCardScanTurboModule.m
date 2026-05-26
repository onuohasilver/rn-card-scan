#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(RNCardScanTurboModule, NSObject)

RCT_EXTERN_METHOD(startCardScan:(NSString *)sessionId
                  options:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stopCardScan:(NSString *)sessionId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(captureCard:(NSString *)sessionId
                  options:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(recognizeCardTextFromImage:(NSString *)uri
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getSdkHealth:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end

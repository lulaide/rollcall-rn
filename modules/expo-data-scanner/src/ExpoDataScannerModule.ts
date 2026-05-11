import { NativeModule, requireNativeModule } from 'expo';

declare class ExpoDataScannerModule extends NativeModule {
  /**
   * Returns true if VisionKit DataScannerViewController is supported AND available
   * on this device. iOS 16+ on devices with a Neural Engine.
   *
   * Async because the underlying API (`DataScannerViewController.isSupported`)
   * is `@MainActor`-isolated and must be hopped onto the main actor.
   */
  isSupported(): Promise<boolean>;
}

export default requireNativeModule<ExpoDataScannerModule>('ExpoDataScanner');

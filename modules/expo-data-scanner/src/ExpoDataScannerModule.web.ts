import { NativeModule, registerWebModule } from 'expo';

class ExpoDataScannerModule extends NativeModule {
  /**
   * Web stub. Real web scanner will be implemented later via @zxing/browser
   * + getUserMedia. Smoke-test phase intentionally resolves to `false` so the
   * UI can render a fallback.
   */
  async isSupported(): Promise<boolean> {
    return false;
  }
}

export default registerWebModule(ExpoDataScannerModule, 'ExpoDataScannerModule');

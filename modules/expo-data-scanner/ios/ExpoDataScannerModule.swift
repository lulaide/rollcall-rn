import ExpoModulesCore
import VisionKit

public class ExpoDataScannerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoDataScanner")

    // DataScannerViewController is @MainActor-isolated. AsyncFunction returns
    // a Promise on the JS side and lets us hop to the main actor explicitly.
    AsyncFunction("isSupported") { () -> Bool in
      if #available(iOS 16.0, *) {
        return await MainActor.run {
          DataScannerViewController.isSupported
              && DataScannerViewController.isAvailable
        }
      }
      return false
    }

    View(ExpoDataScannerView.self) {
      Events("onScan")

      Prop("enabled") { (view: ExpoDataScannerView, enabled: Bool?) in
        view.enabled = enabled ?? true
      }
    }
  }
}

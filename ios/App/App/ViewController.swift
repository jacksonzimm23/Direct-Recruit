import UIKit
import Capacitor

// Custom Capacitor bridge view controller.
// capacitorDidLoad() is the earliest reliable hook where the WKWebView is guaranteed
// to exist, so we enable the native iOS edge-swipe-back gesture here. (The previous
// AppDelegate.applicationDidBecomeActive approach was timing-unreliable in Release builds.)
class ViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        webView?.allowsBackForwardNavigationGestures = true
    }
}

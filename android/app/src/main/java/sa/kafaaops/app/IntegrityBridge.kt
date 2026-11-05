package sa.kafaaops.app

import android.webkit.JavascriptInterface
import android.webkit.WebView

class IntegrityBridge(
    private val activity: android.app.Activity,
    private val webView: WebView,
) {
    @JavascriptInterface
    fun getIntegrity(): String {
        val report = DeviceIntegrity.report(activity, null)
        val blocked = DeviceIntegrity.blocked(activity, null)
        if (blocked) {
            webView.post {
                webView.evaluateJavascript(
                    "window.__kafaaIntegrity && window.__kafaaIntegrity(${report})",
                    null,
                )
            }
        }
        return report.toString()
    }
}

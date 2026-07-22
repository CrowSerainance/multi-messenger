package expo.modules.webviewprofiles

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.webkit.WebView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * ML-0 capability probe for AndroidX WebKit multi-profile support.
 *
 * Intentionally read-only: no cookies, no profile mutation, no session
 * data. Future ML-1 APIs (create/list/delete profile, profile-scoped
 * cookies) will extend this module behind ENABLE_ISOLATED_PROFILES.
 */
class WebViewProfilesModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("WebViewProfiles")

    AsyncFunction("getCapability") {
      val context = appContext.reactContext
        ?: throw IllegalStateException("React context is unavailable.")

      val multiProfileSupported =
        WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)

      val packageInfo = resolveWebViewPackage(context)
      val isMultiProcessEnabled =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          WebView.getCurrentWebViewPackage()?.let {
            // getCurrentWebViewPackage exists; multiprocess status is
            // exposed via WebViewCompat when the feature is present.
            if (WebViewFeature.isFeatureSupported(
                WebViewFeature.MULTI_PROCESS
              )
            ) {
              WebViewCompat.isMultiProcessEnabled()
            } else {
              null
            }
          }
        } else {
          null
        }

      mapOf(
        "platform" to "android",
        "multiProfileSupported" to multiProfileSupported,
        "multiProcessEnabled" to isMultiProcessEnabled,
        "multiProcessFeatureSupported" to
          WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROCESS),
        "providerPackageName" to (packageInfo?.packageName ?: ""),
        "providerVersionName" to (packageInfo?.versionName ?: ""),
        "providerVersionCode" to (
          if (packageInfo == null) {
            -1L
          } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            packageInfo.longVersionCode
          } else {
            @Suppress("DEPRECATION")
            packageInfo.versionCode.toLong()
          }
        ),
        "androidSdkInt" to Build.VERSION.SDK_INT,
        "webkitFeatureConstants" to mapOf(
          "MULTI_PROFILE" to WebViewFeature.MULTI_PROFILE,
          "MULTI_PROCESS" to WebViewFeature.MULTI_PROCESS,
        ),
      )
    }
  }

  private fun resolveWebViewPackage(context: Context):
    android.content.pm.PackageInfo? {
    val webViewPackage = WebViewCompat.getCurrentWebViewPackage(context)
      ?: return null

    return try {
      context.packageManager.getPackageInfo(
        webViewPackage.packageName,
        0,
      )
    } catch (_: PackageManager.NameNotFoundException) {
      null
    }
  }
}

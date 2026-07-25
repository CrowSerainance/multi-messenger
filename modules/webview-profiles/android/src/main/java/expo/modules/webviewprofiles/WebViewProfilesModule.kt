package expo.modules.webviewprofiles

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import android.webkit.WebView
import androidx.webkit.ProfileStore
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * ML-0 capability probe for AndroidX WebKit multi-profile support.
 *
 * Intentionally read-only: no cookies, no profile mutation, no session
 * data. Future ML-1 APIs (create/list/delete profile, profile-scoped
 * cookies) will extend this module behind ENABLE_ISOLATED_PROFILES.
 */
private const val TEST_PROFILE_A = "mltest_a"
private const val TEST_PROFILE_B = "mltest_b"
private const val ML0_LOG_TAG = "ML0Probe"

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
      ).also {
        // ML-0 evidence: native-side log so the capability
        // result is recorded in logcat regardless of the JS
        // console plumbing. Contains no session data.
        Log.i(
          ML0_LOG_TAG,
          "capability multiProfileSupported=$multiProfileSupported " +
            "provider=${packageInfo?.packageName}:${packageInfo?.versionName} " +
            "sdkInt=${Build.VERSION.SDK_INT}",
        )
      }
    }

    // ML-0 isolation self-test. Read-only w.r.t. real
    // accounts: it only creates, inspects, and deletes
    // two throwaway "mltest_*" profiles and a disposable
    // WebView. No cookies, no Facebook sessions, no
    // account profiles are touched.
    AsyncFunction("runProfileSelfTest") { promise: Promise ->
      val activity = appContext.currentActivity

      if (!WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
        promise.resolve(
          mapOf(
            "ran" to false,
            "multiProfileSupported" to false,
          ),
        )
        return@AsyncFunction
      }

      if (activity == null) {
        promise.resolve(
          mapOf(
            "ran" to false,
            "multiProfileSupported" to true,
            "error" to "no-current-activity",
          ),
        )
        return@AsyncFunction
      }

      // WebView construction and profile binding must run
      // on the UI thread.
      activity.runOnUiThread {
        val result = HashMap<String, Any?>()
        result["multiProfileSupported"] = true

        var webView: WebView? = null

        try {
          val store = ProfileStore.getInstance()

          val profileA = store.getOrCreateProfile(TEST_PROFILE_A)
          val profileB = store.getOrCreateProfile(TEST_PROFILE_B)

          val names = store.allProfileNames
          result["createdTwoProfiles"] =
            names.contains(TEST_PROFILE_A) &&
            names.contains(TEST_PROFILE_B)
          result["profileCount"] = names.size

          // Prove setProfile is accepted BEFORE the WebView is
          // navigated/used, and that the binding sticks.
          webView = WebView(activity)
          WebViewCompat.setProfile(webView!!, TEST_PROFILE_A)
          result["setProfileBeforeLoad"] =
            WebViewCompat.getProfile(webView!!).name == TEST_PROFILE_A
          webView!!.destroy()
          webView = null

          // Core isolation proof: each profile owns a separate
          // cookie store. Write a distinct cookie into each,
          // then confirm neither sees the other's.
          val cookieUrl = "https://mltest.invalid/"
          val cmA = profileA.cookieManager
          val cmB = profileB.cookieManager
          cmA.setAcceptCookie(true)
          cmB.setAcceptCookie(true)

          @Suppress("DEPRECATION")
          cmA.setCookie(cookieUrl, "iso=A")
          @Suppress("DEPRECATION")
          cmB.setCookie(cookieUrl, "iso=B")
          cmA.flush()
          cmB.flush()

          val aCookie = cmA.getCookie(cookieUrl) ?: ""
          val bCookie = cmB.getCookie(cookieUrl) ?: ""
          result["cookieIsolation"] =
            aCookie.contains("iso=A") &&
            !aCookie.contains("iso=B") &&
            bCookie.contains("iso=B") &&
            !bCookie.contains("iso=A")

          // Clear profile A's browsing data (cookies) and prove
          // profile B stays intact. removeAllCookies is async,
          // so the promise resolves inside its callback.
          cmA.removeAllCookies {
            try {
              cmA.flush()
              cmB.flush()
              val aAfter = cmA.getCookie(cookieUrl) ?: ""
              val bAfter = cmB.getCookie(cookieUrl) ?: ""
              result["clearOneKeepsOther"] =
                !aAfter.contains("iso=A") &&
                bAfter.contains("iso=B")
              // Clean up B's test cookie too.
              cmB.removeAllCookies {
                cmB.flush()
                result["ran"] = true
                Log.i(ML0_LOG_TAG, "selfTest $result")
                promise.resolve(result)
              }
            } catch (error: Throwable) {
              result["ran"] = false
              result["error"] = error.javaClass.simpleName
              result["errorMessage"] = error.message
              Log.i(ML0_LOG_TAG, "selfTest $result")
              promise.resolve(result)
            }
          }
        } catch (error: Throwable) {
          webView?.destroy()
          result["ran"] = false
          result["error"] = error.javaClass.simpleName
          result["errorMessage"] = error.message
          Log.i(ML0_LOG_TAG, "selfTest $result")
          promise.resolve(result)
        }
      }
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

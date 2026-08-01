package expo.modules.webviewprofiles

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import android.webkit.WebView
import androidx.webkit.ProfileStore
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.reactnativecommunity.webview.RNCWebViewProfileRegistry
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

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
private const val ML1_LOG_TAG = "ML1Profiles"

/** One cookie write: a target URL plus a full Set-Cookie value. */
class ProfileCookieRecord : Record {
  @Field
  var url: String = ""

  @Field
  var cookie: String = ""
}

class WebViewProfilesModule : Module() {
  /**
   * Runs [block] on the UI thread (profile APIs require it) and
   * funnels any throwable into a promise rejection. Never logs
   * cookie or session contents.
   */
  private fun onUiThread(
    promise: Promise,
    block: () -> Unit,
  ) {
    val activity = appContext.currentActivity

    if (activity == null) {
      promise.reject(
        "ERR_NO_ACTIVITY",
        "No current activity for a WebView profile operation.",
        null,
      )
      return
    }

    activity.runOnUiThread {
      try {
        block()
      } catch (error: Throwable) {
        Log.e(ML1_LOG_TAG, "profile operation failed", error)
        promise.reject(
          "ERR_PROFILE_OPERATION",
          error.message ?: error.javaClass.simpleName,
          error,
        )
      }
    }
  }

  private fun requireMultiProfile() {
    if (!WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
      throw IllegalStateException(
        "MULTI_PROFILE is not supported by the current WebView provider.",
      )
    }
  }

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

    // ML-1: announce which profile the NEXT created WebView must
    // bind to. The binding itself happens inside the patched
    // react-native-webview factory, before the first navigation.
    // Passing null restores the default profile (login flow).
    AsyncFunction("setNextWebViewProfile") { profileName: String?, promise: Promise ->
      onUiThread(promise) {
        if (profileName != null) {
          requireMultiProfile()
          ProfileStore.getInstance().getOrCreateProfile(profileName)
        }
        RNCWebViewProfileRegistry.pendingProfileName = profileName
        Log.i(
          ML1_LOG_TAG,
          "pending WebView profile ${if (profileName == null) "cleared" else "set"}",
        )
        promise.resolve(null)
      }
    }

    // ML-1: read the cookie header a profile would send for each
    // URL (name=value pairs only). Used for auth/expiry checks;
    // the JS side never logs the returned values.
    AsyncFunction("getProfileCookies") { profileName: String, urls: List<String>, promise: Promise ->
      onUiThread(promise) {
        requireMultiProfile()
        val profile = ProfileStore.getInstance().getOrCreateProfile(profileName)
        val cookieManager = profile.cookieManager

        val result = HashMap<String, String>()
        for (url in urls) {
          result[url] = cookieManager.getCookie(url) ?: ""
        }
        promise.resolve(result)
      }
    }

    // ML-1: import cookies into a profile's own jar. Each record
    // is a full Set-Cookie string applied against its URL.
    AsyncFunction("setProfileCookies") { profileName: String, cookies: List<ProfileCookieRecord>, promise: Promise ->
      onUiThread(promise) {
        requireMultiProfile()
        val profile = ProfileStore.getInstance().getOrCreateProfile(profileName)
        val cookieManager = profile.cookieManager
        cookieManager.setAcceptCookie(true)

        for (record in cookies) {
          @Suppress("DEPRECATION")
          cookieManager.setCookie(record.url, record.cookie)
        }
        cookieManager.flush()
        Log.i(ML1_LOG_TAG, "imported ${cookies.size} cookies into a profile")
        promise.resolve(null)
      }
    }

    // ML-1: clear one profile's cookies without touching any other
    // profile or the default jar.
    AsyncFunction("clearProfileCookies") { profileName: String, promise: Promise ->
      onUiThread(promise) {
        requireMultiProfile()
        val profile = ProfileStore.getInstance().getOrCreateProfile(profileName)
        val cookieManager = profile.cookieManager

        cookieManager.removeAllCookies {
          cookieManager.flush()
          promise.resolve(null)
        }
      }
    }

    // ML-1: best-effort profile deletion (account removal).
    // Deleting a profile whose WebView is still alive throws;
    // callers treat `false` as "retry later / ignore".
    AsyncFunction("deleteProfile") { profileName: String, promise: Promise ->
      onUiThread(promise) {
        requireMultiProfile()
        val deleted = try {
          ProfileStore.getInstance().deleteProfile(profileName)
        } catch (error: Throwable) {
          Log.w(ML1_LOG_TAG, "deleteProfile failed", error)
          false
        }
        promise.resolve(deleted)
      }
    }

    // ML-1: diagnostics only; names contain no session data.
    AsyncFunction("listProfiles") { promise: Promise ->
      onUiThread(promise) {
        requireMultiProfile()
        promise.resolve(ProfileStore.getInstance().allProfileNames.toList())
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

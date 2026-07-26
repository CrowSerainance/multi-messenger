package expo.modules.nativecookies

import android.webkit.CookieManager
import android.webkit.WebStorage
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Owned replacement for the archived
 * @react-native-cookies/cookies Android backend.
 *
 * Wraps the platform android.webkit.CookieManager,
 * which is the same singleton store the WebView
 * reads and writes. Kept intentionally small:
 * the session layer only needs to read the raw
 * cookie string for an origin, set a fully
 * serialized cookie, clear everything, and flush.
 *
 * getCookie only returns name=value pairs (an
 * Android WebView platform limitation shared by
 * the library it replaces); cookie attributes
 * such as domain, path, and expiry are supplied
 * by the JS layer from its stored snapshot.
 */
class NativeCookiesModule : Module() {
  private val cookieManager: CookieManager
    get() = CookieManager.getInstance()

  override fun definition() = ModuleDefinition {
    Name("NativeCookies")

    AsyncFunction("getCookieString") { url: String ->
      cookieManager.getCookie(url) ?: ""
    }

    AsyncFunction("setCookie") { url: String, cookie: String, promise: Promise ->
      cookieManager.setCookie(url, cookie) { promise.resolve(true) }
    }

    AsyncFunction("clearAll") { promise: Promise ->
      cookieManager.removeAllCookies {
        cookieManager.flush()
        promise.resolve(true)
      }
    }

    AsyncFunction("flush") {
      cookieManager.flush()
    }

    /**
     * Clears Local/Session Storage, IndexedDB, Web SQL and
     * Application Cache for every origin in the shared
     * WebView profile.
     *
     * This replaces injecting a destructive wipe script into
     * pages: doing it natively before a WebView mounts cannot
     * interrupt an in-flight authentication flow, and it
     * covers every origin at once rather than one origin per
     * page load.
     *
     * Must run on the main thread.
     */
    AsyncFunction("clearAllWebStorage") { promise: Promise ->
      val activity = appContext.currentActivity

      if (activity == null) {
        WebStorage.getInstance().deleteAllData()
        promise.resolve(true)
        return@AsyncFunction
      }

      activity.runOnUiThread {
        try {
          WebStorage.getInstance().deleteAllData()
          promise.resolve(true)
        } catch (error: Throwable) {
          promise.resolve(false)
        }
      }
    }
  }
}

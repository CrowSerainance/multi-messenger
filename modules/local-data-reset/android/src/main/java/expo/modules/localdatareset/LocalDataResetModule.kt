package expo.modules.localdatareset

import android.app.ActivityManager
import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Security boundary for unauthenticated forgotten-PIN recovery.
 *
 * Android owns the deletion so SecureStore orphan chunks, cookies,
 * WebView data, caches, databases, files, and future profile data are
 * removed together. Android terminates the process after accepting the
 * request; the next launch is a genuine first run.
 */
class LocalDataResetModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LocalDataReset")

    AsyncFunction("clearApplicationData") {
      val context = appContext.reactContext
        ?: throw IllegalStateException("React context is unavailable.")

      val activityManager = context.getSystemService(
        Context.ACTIVITY_SERVICE,
      ) as? ActivityManager
        ?: throw IllegalStateException(
          "Android application data service is unavailable.",
        )

      activityManager.clearApplicationUserData()
    }
  }
}

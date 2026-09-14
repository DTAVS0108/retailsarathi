package `in`.retailsarathi.retail_sarathi_mobile

import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity

/**
 * Applies the last Flutter theme splash color (SharedPreferences) to the
 * native launch window so cold start matches in-app Appearance.
 */
class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        val splashBg = resolveSplashColor()
        window.setBackgroundDrawable(ColorDrawable(splashBg))
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            @Suppress("DEPRECATION")
            window.statusBarColor = splashBg
            @Suppress("DEPRECATION")
            window.navigationBarColor = splashBg
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            splashScreen.setOnExitAnimationListener { splashView ->
                splashView.setBackgroundColor(splashBg)
                splashView
                    .animate()
                    .alpha(0f)
                    .setDuration(180L)
                    .withEndAction { splashView.remove() }
                    .start()
            }
        }

        super.onCreate(savedInstanceState)
        window.setBackgroundDrawable(ColorDrawable(splashBg))
    }

    private fun resolveSplashColor(): Int {
        val prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        val hex = prefs.getString(SPLASH_KEY, null)
        if (!hex.isNullOrBlank()) {
            try {
                return Color.parseColor(hex)
            } catch (_: IllegalArgumentException) {
                // fall through
            }
        }
        return Color.parseColor(DEFAULT_SPLASH)
    }

    companion object {
        private const val PREFS_NAME = "FlutterSharedPreferences"
        private const val SPLASH_KEY = "flutter.splash_bg_color"
        private const val DEFAULT_SPLASH = "#0A4F4A"
    }
}

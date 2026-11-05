package sa.kafaaops.app

import android.content.Context
import android.location.Location
import android.os.Build
import android.provider.Settings
import org.json.JSONObject
import java.time.Instant

object DeviceIntegrity {
    fun developerOptionsEnabled(context: Context): Boolean {
        return Settings.Global.getInt(
            context.contentResolver,
            Settings.Global.DEVELOPMENT_SETTINGS_ENABLED,
            0,
        ) == 1
    }

    fun adbEnabled(context: Context): Boolean {
        return Settings.Global.getInt(
            context.contentResolver,
            Settings.Global.ADB_ENABLED,
            0,
        ) == 1
    }

    fun isMock(location: Location): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            location.isMock
        } else {
            @Suppress("DEPRECATION")
            location.isFromMockProvider
        }
    }

    fun report(context: Context, location: Location?): JSONObject {
        val mock = location?.let { isMock(it) } ?: false
        return JSONObject()
            .put("platform", "android")
            .put("developerOptions", developerOptionsEnabled(context))
            .put("adbEnabled", adbEnabled(context))
            .put("mockLocation", mock)
            .put("simulatedLocation", mock)
            .put("checkedAt", Instant.now().toString())
    }

    fun blocked(context: Context, location: Location?): Boolean {
        return developerOptionsEnabled(context) || adbEnabled(context) || (location?.let { isMock(it) } ?: false)
    }
}

package expo.modules.matkaactivity

import android.Manifest
import android.app.ActivityManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import androidx.core.content.ContextCompat
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.tasks.Tasks
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The phone's own motion classification (walking, running, cycling, in a
 * vehicle, still) from Google Play Services Activity Recognition. Updates go
 * to ActivityReceiver, which keeps only the latest reading; the location task
 * reads it when it stores a fix. Each new reading is also sent as an
 * "onActivity" event so smart tracking can react without waiting for a fix.
 * Works in the background while Matka's location foreground service keeps the
 * process alive.
 */
class MatkaActivityModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun pendingIntent(ctx: Context): PendingIntent {
    // Mutable: Play Services fills in the result extras.
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
    return PendingIntent.getBroadcast(ctx, REQUEST_CODE, Intent(ctx, ActivityReceiver::class.java), flags)
  }

  private fun hasPermission(ctx: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
      ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED

  private val forward: (Map<String, Any?>) -> Unit = { reading -> sendEvent("onActivity", reading) }

  private val grantedResponse = mapOf("status" to "granted", "granted" to true, "canAskAgain" to true, "expires" to "never")

  override fun definition() = ModuleDefinition {
    Name("MatkaActivity")

    /** Each new reading, { type, confidence, at }, while this module's JS runtime is alive. */
    Events("onActivity")

    OnCreate {
      ActivityReceiver.onReading = forward
    }

    OnDestroy {
      if (ActivityReceiver.onReading === forward) ActivityReceiver.onReading = null
    }

    Function("isAvailable") { true }

    AsyncFunction("getPermissionsAsync") { promise: Promise ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
        promise.resolve(grantedResponse)
      } else {
        Permissions.getPermissionsWithPermissionsManager(appContext.permissions, promise, Manifest.permission.ACTIVITY_RECOGNITION)
      }
    }

    AsyncFunction("requestPermissionsAsync") { promise: Promise ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
        promise.resolve(grantedResponse)
      } else {
        Permissions.askForPermissionsWithPermissionsManager(appContext.permissions, promise, Manifest.permission.ACTIVITY_RECOGNITION)
      }
    }

    AsyncFunction("startAsync") { intervalMs: Long ->
      val ctx = context
      if (!hasPermission(ctx)) throw MissingPermissionException()
      Tasks.await(ActivityRecognition.getClient(ctx).requestActivityUpdates(intervalMs, pendingIntent(ctx)))
      true
    }

    AsyncFunction("stopAsync") {
      val ctx = context
      Tasks.await(ActivityRecognition.getClient(ctx).removeActivityUpdates(pendingIntent(ctx)))
      ActivityReceiver.clear(ctx)
    }

    /**
     * Whole-phone battery readings for Matka's stats, raw (normalised in JS,
     * src/usage-logic.ts): currentNow (BATTERY_PROPERTY_CURRENT_NOW, nominally µA,
     * positive = charging, but sign and units vary by OEM), chargeCounter
     * (BATTERY_PROPERTY_CHARGE_COUNTER, nominally µAh), plugged, interactive
     * (screen on). Each is null when the phone doesn't support it.
     */
    Function("batterySnapshot") {
      val ctx = context
      val bm = ctx.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
      // Unsupported properties return Integer.MIN_VALUE (0 on some older phones).
      fun prop(id: Int): Double? = bm?.getIntProperty(id)?.takeIf { it != Int.MIN_VALUE && it != 0 }?.toDouble()
      // ACTION_BATTERY_CHANGED is sticky: a null receiver just returns the last intent.
      val battery = ctx.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
      val plugged = battery?.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1)?.takeIf { it >= 0 }
      val pm = ctx.getSystemService(Context.POWER_SERVICE) as? PowerManager
      mapOf(
        "currentNow" to prop(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW),
        "chargeCounter" to prop(BatteryManager.BATTERY_PROPERTY_CHARGE_COUNTER),
        "plugged" to plugged?.let { it != 0 },
        "interactive" to pm?.isInteractive
      )
    }

    /**
     * expo-location's LocationTaskService right now: "foreground" (notification
     * up, full-rate location), "background" (running but not in the foreground,
     * so Android throttles location to a few fixes an hour) or "none".
     */
    Function("locationServiceState") {
      val am = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
      // getRunningServices is deprecated for other apps' services but still lists our own.
      @Suppress("DEPRECATION")
      val own = am?.getRunningServices(Int.MAX_VALUE)?.filter {
        it.service.packageName == context.packageName && it.service.className == LOCATION_SERVICE
      }.orEmpty()
      when {
        own.any { it.foreground } -> "foreground"
        own.isNotEmpty() -> "background"
        else -> "none"
      }
    }

    /**
     * expo-location only (re)starts its foreground service while it thinks an
     * activity is in front, and refuses startLocationUpdatesAsync with the
     * foregroundService option otherwise. After Android kills and relaunches
     * the process in the background, the restored task therefore runs without
     * the service until the app is opened, and Android throttles it. Android
     * itself lets an app that is exempt from battery optimisation start a
     * foreground service from the background, so the watchdog lifts expo's
     * guard (true) around one re-register and puts it back (false) after.
     * "Back" means the real state, so an activity that came to the front in
     * between keeps counting as foreground. Returns whether the guard was lifted.
     */
    Function("allowLocationServiceStart") { allow: Boolean ->
      val set = setExpoForegrounded(allow || appInFront())
      allow && set && canStartFromBackground()
    }

    /** The latest reading, or null: { type, confidence (0-100), at (epoch ms) }. */
    Function("latest") {
      ActivityReceiver.latest(context)
    }
  }

  /**
   * expo-location's AppForegroundedSingleton.isForegrounded, by reflection (no
   * Gradle dependency on expo-location; consumer-rules.pro keeps it through R8).
   * False when the class or setter is missing, e.g. after an expo-location upgrade.
   */
  private fun setExpoForegrounded(value: Boolean): Boolean = try {
    val cls = Class.forName("expo.modules.location.AppForegroundedSingleton")
    cls.getMethod("setForegrounded", Boolean::class.javaPrimitiveType).invoke(cls.getField("INSTANCE").get(null), value)
    true
  } catch (e: ReflectiveOperationException) {
    false
  }

  /** An activity of ours is in front (an FGS alone ranks lower, IMPORTANCE_FOREGROUND_SERVICE). */
  private fun appInFront(): Boolean {
    val info = ActivityManager.RunningAppProcessInfo()
    ActivityManager.getMyMemoryState(info)
    return info.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
  }

  /** Android 12+ only lets exempt apps start a foreground service from the background. */
  private fun canStartFromBackground(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
    return pm?.isIgnoringBatteryOptimizations(context.packageName) == true
  }

  companion object {
    private const val REQUEST_CODE = 7311
    private const val LOCATION_SERVICE = "expo.modules.location.services.LocationTaskService"
  }
}

internal class MissingPermissionException :
  CodedException("ERR_ACTIVITY_PERMISSION", "Physical activity permission is not granted", null)

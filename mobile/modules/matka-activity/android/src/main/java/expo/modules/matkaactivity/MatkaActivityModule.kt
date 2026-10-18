package expo.modules.matkaactivity

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
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
 * reads it when it stores a fix. Works in the background while Matka's
 * location foreground service keeps the process alive.
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

  private val grantedResponse = mapOf("status" to "granted", "granted" to true, "canAskAgain" to true, "expires" to "never")

  override fun definition() = ModuleDefinition {
    Name("MatkaActivity")

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

    /** The latest reading, or null: { type, confidence (0-100), at (epoch ms) }. */
    Function("latest") {
      ActivityReceiver.latest(context)
    }
  }

  companion object {
    private const val REQUEST_CODE = 7311
  }
}

internal class MissingPermissionException :
  CodedException("ERR_ACTIVITY_PERMISSION", "Physical activity permission is not granted", null)

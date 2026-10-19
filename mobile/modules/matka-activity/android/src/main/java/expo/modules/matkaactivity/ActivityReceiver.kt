package expo.modules.matkaactivity

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.location.ActivityRecognitionResult
import com.google.android.gms.location.DetectedActivity

/** Receives Activity Recognition results, keeps the latest one and forwards it to JS. */
class ActivityReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (!ActivityRecognitionResult.hasResult(intent)) return
    val result = ActivityRecognitionResult.extractResult(intent) ?: return
    var best = result.mostProbableActivity
    // "On foot" is the general case; prefer the specific walking/running reading.
    if (best.type == DetectedActivity.ON_FOOT) {
      result.probableActivities
        .filter { it.type == DetectedActivity.WALKING || it.type == DetectedActivity.RUNNING }
        .maxByOrNull { it.confidence }
        ?.let { best = it }
    }
    val name = when (best.type) {
      DetectedActivity.IN_VEHICLE -> "in_vehicle"
      DetectedActivity.ON_BICYCLE -> "on_bicycle"
      DetectedActivity.ON_FOOT, DetectedActivity.WALKING -> "walking"
      DetectedActivity.RUNNING -> "running"
      DetectedActivity.STILL -> "still"
      else -> return // tilting, unknown: keep the previous reading
    }
    prefs(context).edit()
      .putString(KEY_TYPE, name)
      .putInt(KEY_CONFIDENCE, best.confidence)
      .putLong(KEY_AT, result.time)
      .apply()
    // Wake the JS side (smart tracking) if a JS runtime is alive.
    try {
      onReading?.invoke(mapOf("type" to name, "confidence" to best.confidence, "at" to result.time.toDouble()))
    } catch (e: Exception) {
      // No JS listener or runtime gone: the stored reading is still read on the next fix.
    }
  }

  companion object {
    private const val PREFS = "matka_activity"
    private const val KEY_TYPE = "type"
    private const val KEY_CONFIDENCE = "confidence"
    private const val KEY_AT = "at"

    /** Set by MatkaActivityModule while it exists; forwards readings as an "onActivity" event. */
    @Volatile
    var onReading: ((Map<String, Any?>) -> Unit)? = null

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun latest(ctx: Context): Map<String, Any>? {
      val p = prefs(ctx)
      val type = p.getString(KEY_TYPE, null) ?: return null
      return mapOf("type" to type, "confidence" to p.getInt(KEY_CONFIDENCE, 0), "at" to p.getLong(KEY_AT, 0L).toDouble())
    }

    fun clear(ctx: Context) {
      prefs(ctx).edit().clear().apply()
    }
  }
}

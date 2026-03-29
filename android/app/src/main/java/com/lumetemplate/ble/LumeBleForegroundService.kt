package com.lumetemplate.ble

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.lumetemplate.MainActivity
import com.lumetemplate.R

class LumeBleForegroundService : HeadlessJsTaskService() {

  override fun onCreate() {
    super.onCreate()

    if (!hasForegroundBlePermissions(this)) {
      stopSelf()
      return
    }

    createChannelIfNeeded()

    try {
      startForeground(NOTIFICATION_ID, buildNotification())
    } catch (_: SecurityException) {
      stopSelf()
    }
  }

  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig {
    val extras = intent?.extras ?: Bundle()
    return HeadlessJsTaskConfig(
      TASK_NAME,
      Arguments.fromBundle(extras),
      0,
      true
    )
  }

  private fun createChannelIfNeeded() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Lume Proximity Service",
      NotificationManager.IMPORTANCE_LOW
    )
    channel.description = "Maintains BLE scanning and advertising for Lume encounters"

    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannel(channel)
  }

  private fun buildNotification(): Notification {
    val intent = Intent(this, MainActivity::class.java)
    val pendingFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    } else {
      PendingIntent.FLAG_UPDATE_CURRENT
    }
    val pendingIntent = PendingIntent.getActivity(this, 0, intent, pendingFlags)

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("Lume Radar Active")
      .setContentText("Scanning nearby Lume IDs and syncing encounters")
      .setContentIntent(pendingIntent)
      .setOngoing(true)
      .setCategory(Notification.CATEGORY_SERVICE)
      .build()
  }

  companion object {
    private const val CHANNEL_ID = "lume_ble_background"
    private const val NOTIFICATION_ID = 1207
    private const val TASK_NAME = "LumeBleHeadlessTask"

    private fun hasForegroundBlePermissions(context: Context): Boolean {
      val connectGranted = ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.BLUETOOTH_CONNECT,
      ) == PackageManager.PERMISSION_GRANTED

      val scanGranted = ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.BLUETOOTH_SCAN,
      ) == PackageManager.PERMISSION_GRANTED

      val advertiseGranted = ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.BLUETOOTH_ADVERTISE,
      ) == PackageManager.PERMISSION_GRANTED

      return connectGranted && scanGranted && advertiseGranted
    }

    fun start(context: Context) {
      if (!hasForegroundBlePermissions(context)) {
        return
      }

      val intent = Intent(context, LumeBleForegroundService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun stop(context: Context) {
      val intent = Intent(context, LumeBleForegroundService::class.java)
      context.stopService(intent)
    }
  }
}

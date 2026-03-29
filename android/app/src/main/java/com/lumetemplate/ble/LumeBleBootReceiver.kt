package com.lumetemplate.ble

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat

class LumeBleBootReceiver : BroadcastReceiver() {
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

  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_LOCKED_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED -> {
        if (!hasForegroundBlePermissions(context)) {
          return
        }

        LumeBleForegroundService.start(context)
      }
    }
  }
}

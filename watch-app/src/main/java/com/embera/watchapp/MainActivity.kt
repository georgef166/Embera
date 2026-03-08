package com.embera.watchapp

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.tooling.preview.Preview
import androidx.core.content.ContextCompat
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import java.util.Locale

class MainActivity : ComponentActivity() {

    private val requiredPermissions = arrayOf(
        Manifest.permission.BODY_SENSORS,
        Manifest.permission.FOREGROUND_SERVICE
    )

    private val requestPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { permissions ->
            if (permissions.all { it.value }) {
                startDataService()
            } else {
                // Handle permission denial
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            WearApp(onStartClick = {
                checkPermissionsAndStartService()
            })
        }
    }

    private fun checkPermissionsAndStartService() {
        if (hasPermissions()) {
            startDataService()
        } else {
            requestPermissionLauncher.launch(requiredPermissions)
        }
    }

    private fun hasPermissions(): Boolean {
        return requiredPermissions.all {
            ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED
        }
    }

    private fun startDataService() {
        val intent = Intent(this, RealTimeDataService::class.java)
        startForegroundService(intent)
    }
}

@Composable
fun WearApp(onStartClick: () -> Unit) {
    var heartRate by remember { mutableStateOf(0.0) }
    var oxygenSaturation by remember { mutableStateOf(0.0) }
    var skinTemperature by remember { mutableStateOf(0.0) }
    val context = LocalContext.current

    val biometricDataReceiver = remember {
        object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent?.action == RealTimeDataService.ACTION_BIOMETRIC_DATA) {
                    heartRate = intent.getDoubleExtra(RealTimeDataService.EXTRA_HEART_RATE, 0.0)
                    oxygenSaturation = intent.getDoubleExtra(RealTimeDataService.EXTRA_SPO2, 0.0)
                    skinTemperature = intent.getDoubleExtra(RealTimeDataService.EXTRA_SKIN_TEMP, 0.0)
                }
            }
        }
    }

    DisposableEffect(Unit) {
        val filter = IntentFilter(RealTimeDataService.ACTION_BIOMETRIC_DATA)
        LocalBroadcastManager.getInstance(context).registerReceiver(biometricDataReceiver, filter)

        onDispose {
            LocalBroadcastManager.getInstance(context).unregisterReceiver(biometricDataReceiver)
        }
    }


    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("Embera FireSight")
        Text("HR: ${heartRate.toInt()} bpm")
        Text(String.format(Locale.getDefault(), "SpO2: %.1f%%", oxygenSaturation))
        Text(String.format(Locale.getDefault(), "Temp: %.1f°C", skinTemperature))
        Button(onClick = onStartClick) {
            Text("Start")
        }
    }
}

@Preview(showBackground = true)
@Composable
fun DefaultPreview() {
    WearApp {}
}

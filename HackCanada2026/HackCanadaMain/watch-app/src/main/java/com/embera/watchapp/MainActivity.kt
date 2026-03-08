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
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import android.graphics.Paint
import android.graphics.Rect
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.Text
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.Spring
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import java.util.Locale

class MainActivity : ComponentActivity() {

    private val requiredPermissions = arrayOf(
        Manifest.permission.BODY_SENSORS,
        Manifest.permission.FOREGROUND_SERVICE,
        Manifest.permission.RECORD_AUDIO,
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION
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
            WearApp(onToggleService = { start ->
                if (start) {
                    checkPermissionsAndStartService()
                } else {
                    stopDataService()
                }
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

    private fun stopDataService() {
        val intent = Intent(this, RealTimeDataService::class.java)
        stopService(intent)
    }
}

@Composable
fun WearApp(onToggleService: (Boolean) -> Unit) {
    var isRunning by remember { mutableStateOf(RealTimeDataService.isServiceRunning) }
    var heartRate by remember { mutableStateOf(0.0) }
    var oxygenSaturation by remember { mutableStateOf(0.0) }
    var skinTemperature by remember { mutableStateOf(0.0) }
    var continuousHeading by remember { mutableStateOf(0f) }
    
    val animatedHeading by animateFloatAsState(
        targetValue = continuousHeading,
        animationSpec = spring(stiffness = Spring.StiffnessLow),
        label = "HeadingAnimation"
    )

    val context = LocalContext.current

    val biometricDataReceiver = remember {
        object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent?.action == RealTimeDataService.ACTION_BIOMETRIC_DATA) {
                    heartRate = intent.getDoubleExtra(RealTimeDataService.EXTRA_HEART_RATE, 0.0)
                    oxygenSaturation = intent.getDoubleExtra(RealTimeDataService.EXTRA_SPO2, 0.0)
                    skinTemperature = intent.getDoubleExtra(RealTimeDataService.EXTRA_SKIN_TEMP, 0.0)
                    val newHeading = intent.getDoubleExtra(RealTimeDataService.EXTRA_HEADING, 0.0).toFloat()
                    
                    // Smooth shortest-path wrap-around logic
                    var diff = (newHeading - continuousHeading) % 360f
                    if (diff > 180f) diff -= 360f
                    if (diff < -180f) diff += 360f
                    continuousHeading += diff
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

    val neonGreen = Color(0xFF00FF85)
    val hudShadow = Color(0x5900FF85) // 0.35 alpha
    
    // Background Radial Gradient
    val bgBrush = Brush.radialGradient(
        colors = listOf(
            Color(0x520B2416), // 0.32 alpha
            Color.Transparent
        ),
        radius = 200f
    )

    // Layout
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .background(bgBrush)
    ) {
        // Render HUD Corners
        androidx.compose.foundation.Canvas(modifier = Modifier.fillMaxSize()) {
            val strokeWidth = 3.dp.toPx()
            val cornerLength = 20.dp.toPx()
            val inset = 12.dp.toPx()
            
            // Top Left
            drawLine(neonGreen, Offset(inset, inset), Offset(inset + cornerLength, inset), strokeWidth)
            drawLine(neonGreen, Offset(inset, inset), Offset(inset, inset + cornerLength), strokeWidth)
            
            // Top Right
            drawLine(neonGreen, Offset(size.width - inset, inset), Offset(size.width - inset - cornerLength, inset), strokeWidth)
            drawLine(neonGreen, Offset(size.width - inset, inset), Offset(size.width - inset, inset + cornerLength), strokeWidth)
            
            // Bottom Left
            drawLine(neonGreen, Offset(inset, size.height - inset), Offset(inset + cornerLength, size.height - inset), strokeWidth)
            drawLine(neonGreen, Offset(inset, size.height - inset), Offset(inset, size.height - inset - cornerLength), strokeWidth)

            // Bottom Right
            drawLine(neonGreen, Offset(size.width - inset, size.height - inset), Offset(size.width - inset - cornerLength, size.height - inset), strokeWidth)
            drawLine(neonGreen, Offset(size.width - inset, size.height - inset), Offset(size.width - inset, size.height - inset - cornerLength), strokeWidth)
        }

        // Top Status Indicators
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.TopCenter)
                .padding(top = 24.dp, start = 30.dp, end = 30.dp),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = "SYS: OK", 
                color = neonGreen, 
                fontFamily = FontFamily.Monospace,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = "AI: RUN", 
                color = neonGreen, 
                fontFamily = FontFamily.Monospace,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold
            )
        }

        // Center Telemetry
        Column(
            modifier = Modifier.align(Alignment.Center),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(
                text = "HR: ${if (isRunning) heartRate.toInt().toString() else "--"} bpm",
                color = neonGreen,
                fontFamily = FontFamily.Monospace,
                fontSize = 14.sp
            )
            Text(
                text = if (isRunning) String.format(Locale.getDefault(), "SpO2: %.1f%%", oxygenSaturation) else "SpO2: --%",
                color = neonGreen,
                fontFamily = FontFamily.Monospace,
                fontSize = 14.sp
            )
            Text(
                text = if (isRunning) String.format(Locale.getDefault(), "Temp: %.1f°C", skinTemperature) else "Temp: --°C",
                color = neonGreen,
                fontFamily = FontFamily.Monospace,
                fontSize = 14.sp
            )
            // TODO: Replace with the actual IP address of the machine running the server
            val serverIp = "10.190.147.86"
            val serverUrl = "ws://$serverIp:8000/api/sessions/demo-session/stream"
            // Display Heading degrees in small text
            Text(
                text = "HDG: ${if (isRunning) (continuousHeading % 360f).let { if (it < 0) it + 360 else it }.toInt().toString() else "--"}°",
                color = neonGreen.copy(alpha = 0.7f),
                fontFamily = FontFamily.Monospace,
                fontSize = 10.sp
            )
        }

        // --- COMPASS OVERLAY (Rotating Border Indicator) ---
        if (isRunning) {
            androidx.compose.foundation.Canvas(modifier = Modifier.fillMaxSize()) {
                val center = Offset(size.width / 2, size.height / 2)
                val radius = (size.minDimension / 2) - 8.dp.toPx() // Stay on the border
                
                // Use animatedHeading for smooth rotation
                rotate(degrees = -animatedHeading, pivot = center) {
                    // Draw Arrow (Pointing North)
                    val arrowSize = 10.dp.toPx()
                    val arrowTop = center.y - radius
                    
                    // Draw a simple Triangle for arrow
                    val path = androidx.compose.ui.graphics.Path().apply {
                        moveTo(center.x, arrowTop) // Tip of arrow
                        lineTo(center.x - arrowSize/2, arrowTop + arrowSize)
                        lineTo(center.x + arrowSize/2, arrowTop + arrowSize)
                        close()
                    }
                    drawPath(path, neonGreen)
                    
                    // Draw 'N' text
                    val paint = Paint().apply {
                        color = neonGreen.toArgb()
                        textSize = 14.sp.toPx()
                        typeface = android.graphics.Typeface.MONOSPACE
                        textAlign = Paint.Align.CENTER
                    }
                    
                    // Draw 'N' slightly below the arrow tip
                    drawContext.canvas.nativeCanvas.drawText(
                        "N",
                        center.x,
                        arrowTop + arrowSize + 15.dp.toPx(),
                        paint
                    )
                }
            }
        }

        // Action Button
        val buttonText = if (isRunning) "NAV: STOP" else "NAV: START"
        val buttonBorderColor = if (isRunning) Color(0xFFFF4D57) else neonGreen
        
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 24.dp)
                .border(1.dp, buttonBorderColor)
                .background(Color(0x99000000))
                .clickable {
                    isRunning = !isRunning
                    onToggleService(isRunning)
                }
                .padding(horizontal = 8.dp, vertical = 4.dp)
        ) {
            Text(
                text = buttonText,
                color = buttonBorderColor,
                fontFamily = FontFamily.Monospace,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

@Preview(showBackground = true)
@Composable
fun DefaultPreview() {
    WearApp {}
}

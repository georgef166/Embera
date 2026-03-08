package com.embera.watchapp

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.content.pm.ServiceInfo
import androidx.core.app.NotificationCompat
import androidx.health.services.client.HealthServices
import androidx.health.services.client.MeasureCallback
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataPointContainer
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.DeltaDataType
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.random.Random
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager

class   RealTimeDataService : Service(), SensorEventListener {

    private val serviceJob = SupervisorJob()
    private val serviceScope = CoroutineScope(Dispatchers.Default + serviceJob)

    private lateinit var healthServicesClient: androidx.health.services.client.MeasureClient
    private lateinit var powerManager: PowerManager
    private var wakeLock: PowerManager.WakeLock? = null
    private lateinit var broadcastManager: LocalBroadcastManager
    private lateinit var sensorManager: SensorManager

    // Biometric data values
    private var heartRate: Double = 0.0
    private var oxygenSaturation: Double = 98.0 // Starting simulated value
    private var skinTemperature: Double = 36.5 // Starting simulated value
    private var currentLat: Double = 0.0
    private var currentLng: Double = 0.0
    private var currentHeading: Double = 0.0

    // Sensor buffers
    private val accelerometerReading = FloatArray(3)
    private val magnetometerReading = FloatArray(3)
    private val rotationMatrix = FloatArray(9)
    private val adjustedRotationMatrix = FloatArray(9)
    private val orientationAngles = FloatArray(3)

    // Streaming clients
    private lateinit var webSocketClient: WebSocketClient
    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private var audioRecord: AudioRecord? = null
    private var isRecordingAudio = false

    // Constants for Audio
    private val sampleRate = 8000
    private val channelConfig = AudioFormat.CHANNEL_IN_MONO
    private val audioFormat = AudioFormat.ENCODING_PCM_16BIT
    private val bufferSize = AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioFormat)

    override fun onCreate() {
        super.onCreate()
        healthServicesClient = HealthServices.getClient(this).measureClient
        powerManager = getSystemService(POWER_SERVICE) as PowerManager
        broadcastManager = LocalBroadcastManager.getInstance(this)
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        sensorManager = getSystemService(SENSOR_SERVICE) as SensorManager
        webSocketClient = WebSocketClient(serviceScope)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val typeFlags = ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH or
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION or
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                
        startForeground(1, createNotification(), typeFlags)
        acquireWakeLock()
        
        // Connect to prototype backend
        webSocketClient.connect("ws://10.190.147.86:8000/api/sessions/demo-session/stream")

        startDataCollection()
        startLocationTracking()
        startCompassTracking()
        startAudioStreaming()
        
        isServiceRunning = true
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        isServiceRunning = false
        stopDataCollection()
        stopAudioStreaming()
        stopCompassTracking()
        fusedLocationClient.removeLocationUpdates(locationCallback)
        webSocketClient.disconnect()
        releaseWakeLock()
        serviceJob.cancel()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotification(): Notification {
        val channel = NotificationChannel(
            "real_time_data_channel",
            "Firefighter Data",
            NotificationManager.IMPORTANCE_DEFAULT
        )
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(channel)

        return NotificationCompat.Builder(this, "real_time_data_channel")
            .setContentTitle("Embera FireSight")
            .setContentText("Collecting biometric data.")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .build()
    }

    private fun acquireWakeLock() {
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Embera::DataWakeLock")
        wakeLock?.acquire()
    }

    private fun releaseWakeLock() {
        wakeLock?.release()
        wakeLock = null
    }

    // Real Heart Rate Callback via Health Services API
    private val heartRateCallback = object : MeasureCallback {
        override fun onAvailabilityChanged(dataType: DeltaDataType<*, *>, availability: Availability) {}
        override fun onDataReceived(data: DataPointContainer) {
            data.getData(DataType.HEART_RATE_BPM).lastOrNull()?.let {
                heartRate = it.value
            }
        }
    }

    private fun startDataCollection() {
        // 1. Start real heart rate tracking
        serviceScope.launch {
            try {
                healthServicesClient.registerMeasureCallback(DataType.HEART_RATE_BPM, heartRateCallback)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        // 2. Start broadcast loop with simulated SpO2 and Skin Temp
        serviceScope.launch {
            while (true) {
                // Simulate SpO2 (95% - 100%)
                oxygenSaturation += Random.nextDouble(-0.5, 0.5)
                oxygenSaturation = oxygenSaturation.coerceIn(95.0, 100.0)

                // Simulate Skin Temperature (36.0C - 37.5C)
                skinTemperature += Random.nextDouble(-0.2, 0.2)
                skinTemperature = skinTemperature.coerceIn(36.0, 37.5)

                println("DIAGNOSTIC: Attempting to send Biometric Data (HR: $heartRate)")
                sendBiometricData()
                delay(1000)
            }
        }
    }

    private fun stopDataCollection() {
        serviceScope.launch {
            try {
                healthServicesClient.unregisterMeasureCallbackAsync(DataType.HEART_RATE_BPM, heartRateCallback)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    private fun sendBiometricData() {
        val intent = Intent(ACTION_BIOMETRIC_DATA).apply {
            putExtra(EXTRA_HEART_RATE, heartRate)
            putExtra(EXTRA_SPO2, oxygenSaturation)
            putExtra(EXTRA_SKIN_TEMP, skinTemperature)
            putExtra(EXTRA_HEADING, currentHeading)
        }
        broadcastManager.sendBroadcast(intent)
        
        // Broadcast over WebSocket Directly
        val payload = BiometricData(
            heartRate = heartRate,
            oxygenSaturation = oxygenSaturation,
            skinTemperature = skinTemperature,
            latitude = currentLat,
            longitude = currentLng,
            heading = currentHeading,
            isManDown = false
        )
        webSocketClient.sendBiometricData(payload)
    }

    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(locationResult: LocationResult) {
            locationResult.lastLocation?.let { location ->
                currentLat = location.latitude
                currentLng = location.longitude
            }
        }
    }

    private fun startLocationTracking() {
        // Use balanced power for faster indoor locks (Wi-Fi based)
        val locationRequest = LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, 5000)
            .setMinUpdateIntervalMillis(2000)
            .build()

        try {
            fusedLocationClient.lastLocation
                .addOnSuccessListener { location ->
                    if (location != null) {
                        currentLat = location.latitude
                        currentLng = location.longitude
                        println("SUCCESS: Grabbed Last Known Location ($currentLat, $currentLng)")
                    } else {
                        println("WARNING: Last Known Location is NULL")
                    }
                }
                .addOnFailureListener { e ->
                    println("ERROR: Failed to get Last Known Location: ${e.message}")
                }

            val task = fusedLocationClient.requestLocationUpdates(locationRequest, locationCallback, Looper.getMainLooper())
            task.addOnFailureListener { e ->
                println("ERROR: requestLocationUpdates failed: ${e.message}")
            }
            println("SUCCESS: Started Location Updates")
        } catch (e: SecurityException) {
            println("ERROR: Missing Location Permission")
        }
    }

    private fun startAudioStreaming() {
        try {
            audioRecord = AudioRecord(
                MediaRecorder.AudioSource.MIC,
                sampleRate,
                channelConfig,
                audioFormat,
                bufferSize
            )

            if (audioRecord?.state == AudioRecord.STATE_INITIALIZED) {
                audioRecord?.startRecording()
                isRecordingAudio = true
                println("SUCCESS: Started Audio Recording")

                serviceScope.launch(Dispatchers.IO) {
                    try {
                        val audioBuffer = ByteArray(bufferSize)
                        while (isRecordingAudio) {
                            val bytesRead = audioRecord?.read(audioBuffer, 0, bufferSize) ?: 0
                            if (bytesRead > 0) {
                                // We must copy because the buffer is reused
                                val chunk = audioBuffer.copyOfRange(0, bytesRead)
                                webSocketClient.sendBinary(chunk)
                            }
                        }
                    } catch (t: Throwable) {
                        println("FATAL ERROR: Audio Recording loop crashed: ${t.message}")
                        t.printStackTrace()
                    }
                }
            } else {
                 println("ERROR: AudioRecord failed to initialize")
            }
        } catch (e: SecurityException) {
            println("ERROR: Missing Record Audio Permission")
        }
    }

    private fun stopAudioStreaming() {
        isRecordingAudio = false
        audioRecord?.stop()
        audioRecord?.release()
        audioRecord = null
    }

    private fun startCompassTracking() {
        sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)?.also { accelerometer ->
            sensorManager.registerListener(
                this,
                accelerometer,
                SensorManager.SENSOR_DELAY_NORMAL,
                SensorManager.SENSOR_DELAY_UI
            )
        }
        sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)?.also { magneticField ->
            sensorManager.registerListener(
                this,
                magneticField,
                SensorManager.SENSOR_DELAY_NORMAL,
                SensorManager.SENSOR_DELAY_UI
            )
        }
    }

    private fun stopCompassTracking() {
        sensorManager.unregisterListener(this)
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (event.sensor.type == Sensor.TYPE_ACCELEROMETER) {
            System.arraycopy(event.values, 0, accelerometerReading, 0, accelerometerReading.size)
        } else if (event.sensor.type == Sensor.TYPE_MAGNETIC_FIELD) {
            System.arraycopy(event.values, 0, magnetometerReading, 0, magnetometerReading.size)
        }

        updateOrientationAngles()
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        // Not needed
    }

    private fun updateOrientationAngles() {
        if (SensorManager.getRotationMatrix(
            rotationMatrix,
            null,
            accelerometerReading,
            magnetometerReading
        )) {
            // Remap coordinate system for vertical "looking at watch" orientation
            // "Just flip the axis" - trying Y as the new X axis
            SensorManager.remapCoordinateSystem(
                rotationMatrix,
                SensorManager.AXIS_Y,
                SensorManager.AXIS_MINUS_X,
                adjustedRotationMatrix
            )

            SensorManager.getOrientation(adjustedRotationMatrix, orientationAngles)
            
            // Azimuth is orientationAngles[0] in radians. Convert to degrees.
            val azimuthRadians = orientationAngles[0]
            var azimuthDegrees = Math.toDegrees(azimuthRadians.toDouble())
            
            // Normalize to North = 0, clock-wise 0-360
            if (azimuthDegrees < 0) {
                azimuthDegrees += 360.0
            }
            
            currentHeading = azimuthDegrees
        }
    }

    companion object {
        var isServiceRunning = false
        const val ACTION_BIOMETRIC_DATA = "com.embera.watchapp.ACTION_BIOMETRIC_DATA"
        const val EXTRA_HEART_RATE = "com.embera.watchapp.EXTRA_HEART_RATE"
        const val EXTRA_SPO2 = "com.embera.watchapp.EXTRA_SPO2"
        const val EXTRA_SKIN_TEMP = "com.embera.watchapp.EXTRA_SKIN_TEMP"
        const val EXTRA_HEADING = "com.embera.watchapp.EXTRA_HEADING"
    }
}

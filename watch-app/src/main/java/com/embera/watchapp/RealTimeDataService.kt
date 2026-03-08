package com.embera.watchapp

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.os.PowerManager
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

class RealTimeDataService : Service() {

    private val serviceJob = SupervisorJob()
    private val serviceScope = CoroutineScope(Dispatchers.Default + serviceJob)

    private lateinit var healthServicesClient: androidx.health.services.client.MeasureClient
    private lateinit var powerManager: PowerManager
    private var wakeLock: PowerManager.WakeLock? = null
    private lateinit var broadcastManager: LocalBroadcastManager

    // Biometric data values
    private var heartRate: Double = 0.0
    private var oxygenSaturation: Double = 98.0 // Starting simulated value
    private var skinTemperature: Double = 36.5 // Starting simulated value
    private var currentLat: Double = 0.0
    private var currentLng: Double = 0.0

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
        webSocketClient = WebSocketClient(serviceScope)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(1, createNotification())
        acquireWakeLock()
        
        // Connect to prototype backend
        webSocketClient.connect("ws://10.190.147.86:8080/stream")

        startDataCollection()
        startLocationTracking()
        startAudioStreaming()
        
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        stopDataCollection()
        stopAudioStreaming()
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
        }
        broadcastManager.sendBroadcast(intent)
        
        // Broadcast over WebSocket Directly
        val payload = BiometricData(
            heartRate = heartRate,
            oxygenSaturation = oxygenSaturation,
            skinTemperature = skinTemperature,
            latitude = currentLat,
            longitude = currentLng,
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
        val locationRequest = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5000)
            .setMinUpdateIntervalMillis(2000)
            .build()

        try {
            fusedLocationClient.requestLocationUpdates(locationRequest, locationCallback, null)
        } catch (e: SecurityException) {
            e.printStackTrace()
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

                serviceScope.launch(Dispatchers.IO) {
                    val audioBuffer = ByteArray(bufferSize)
                    while (isRecordingAudio) {
                        val bytesRead = audioRecord?.read(audioBuffer, 0, bufferSize) ?: 0
                        if (bytesRead > 0) {
                            // Trim to actual bytes read
                            val chunk = audioBuffer.copyOfRange(0, bytesRead)
                            webSocketClient.sendBinary(chunk)
                        }
                    }
                }
            }
        } catch (e: SecurityException) {
            e.printStackTrace()
        }
    }

    private fun stopAudioStreaming() {
        isRecordingAudio = false
        audioRecord?.stop()
        audioRecord?.release()
        audioRecord = null
    }

    companion object {
        const val ACTION_BIOMETRIC_DATA = "com.embera.watchapp.ACTION_BIOMETRIC_DATA"
        const val EXTRA_HEART_RATE = "com.embera.watchapp.EXTRA_HEART_RATE"
        const val EXTRA_SPO2 = "com.embera.watchapp.EXTRA_SPO2"
        const val EXTRA_SKIN_TEMP = "com.embera.watchapp.EXTRA_SKIN_TEMP"
    }
}

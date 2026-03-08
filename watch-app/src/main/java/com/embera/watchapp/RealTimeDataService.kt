package com.embera.watchapp

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.health.services.client.HealthServices
import androidx.health.services.client.MeasureCallback
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.MeasureData
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.sqrt

class RealTimeDataService : Service(), SensorEventListener {

    private val serviceJob = SupervisorJob()
    private val serviceScope = CoroutineScope(Dispatchers.Default + serviceJob)

    private lateinit var healthServicesClient: androidx.health.services.client.MeasureClient
    private lateinit var powerManager: PowerManager
    private var wakeLock: PowerManager.WakeLock? = null
    private lateinit var sensorManager: SensorManager

    private var heartRate: Double = 0.0
    private var spo2: Double = 0.0
    private var skinTemperature: Double = 0.0
    private var isManDown: Boolean = false

    private var lastMovementTimestamp: Long = 0
    private val manDownThreshold = 10000L // 10 seconds
    private val fallDetectionThreshold = 25.0 // m/s^2

    private val webSocketClient = WebSocketClient(serviceScope)

    override fun onCreate() {
        super.onCreate()
        healthServicesClient = HealthServices.getClient(this).measureClient
        powerManager = getSystemService(POWER_SERVICE) as PowerManager
        sensorManager = getSystemService(SENSOR_SERVICE) as SensorManager

        webSocketClient.connect("ws://192.168.1.100:8080/ws") // Replace with your server address
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(1, createNotification())
        acquireWakeLock()
        startDataCollection()
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        stopDataCollection()
        releaseWakeLock()
        webSocketClient.disconnect()
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

    private fun startDataCollection() {
        registerHealthServicesCallback(DataType.HEART_RATE_BPM)
        registerHealthServicesCallback(DataType.SPO2)
        // Skin temperature is not directly available, so we'll simulate for now
        // registerHealthServicesCallback(DataType.SKIN_TEMPERATURE)
        
        val accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        sensorManager.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_NORMAL)

        lastMovementTimestamp = System.currentTimeMillis()
        
        serviceScope.launch {
            while (true) {
                checkManDownStatus()
                val data = BiometricData(heartRate, spo2, skinTemperature, isManDown)
                webSocketClient.sendBiometricData(data)
                delay(1000)
            }
        }
    }

    private fun stopDataCollection() {
        healthServicesClient.clearMeasureCallback(DataType.HEART_RATE_BPM)
        healthServicesClient.clearMeasureCallback(DataType.SPO2)
        sensorManager.unregisterListener(this)
    }

    private fun registerHealthServicesCallback(dataType: DataType<*, *>) {
        val callback = object : MeasureCallback {
            override fun onAvailabilityChanged(dataType: DataType<*, *>, availability: Availability) {}

            override fun onData(data: MeasureData) {
                when (data.dataType) {
                    DataType.HEART_RATE_BPM -> heartRate = (data.value as Double)
                    DataType.SPO2 -> spo2 = (data.value as Double)
                    // DataType.SKIN_TEMPERATURE -> skinTemperature = (data.value as Double)
                }
            }
        }
        healthServicesClient.registerMeasureCallback(dataType, callback)
    }
    
    override fun onSensorChanged(event: SensorEvent?) {
        if (event?.sensor?.type == Sensor.TYPE_ACCELEROMETER) {
            val x = event.values[0]
            val y = event.values[1]
            val z = event.values[2]
            
            val magnitude = sqrt((x * x + y * y + z * z).toDouble())

            if (magnitude > 1.0) { // Simple movement check
                lastMovementTimestamp = System.currentTimeMillis()
            }

            if (magnitude > fallDetectionThreshold) {
                isManDown = true
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
    
    private fun checkManDownStatus() {
        if (System.currentTimeMillis() - lastMovementTimestamp > manDownThreshold) {
            isManDown = true
        }
    }
}

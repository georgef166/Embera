package com.embera.watchapp

import kotlinx.serialization.Serializable

@Serializable
data class BiometricData(
    val heartRate: Double,
    val oxygenSaturation: Double,
    val skinTemperature: Double,
    val latitude: Double,
    val longitude: Double,
    val heading: Double,
    val isManDown: Boolean
)

package com.embera.watchapp

import io.ktor.client.*
import io.ktor.client.engine.cio.*
import io.ktor.client.plugins.websocket.*
import io.ktor.client.request.*
import io.ktor.websocket.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class WebSocketClient(private val scope: CoroutineScope) {

    private val client = HttpClient(CIO) {
        install(WebSockets)
    }

    private var session: DefaultClientWebSocketSession? = null
    private val _isConnected = MutableStateFlow(false)
    val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    private var reconnectJob: Job? = null

    fun connect(url: String) {
        if (session?.isActive == true) return

        reconnectJob?.cancel()
        reconnectJob = scope.launch(Dispatchers.IO) {
            while (isActive) {
                try {
                    println("Attempting to connect to WebSocket at $url")
                    client.webSocket(url) {
                        session = this
                        _isConnected.value = true
                        println("WebSocket connection established.")
                        // Keep the connection alive
                        while (isActive) {
                            incoming.receiveCatching()
                        }
                    }
                } catch (e: Exception) {
                    println("WebSocket connection failed: ${e.message}")
                } finally {
                    session = null
                    _isConnected.value = false
                    println("WebSocket connection closed. Reconnecting in 5 seconds...")
                    delay(5000)
                }
            }
        }
    }

    fun sendBiometricData(data: BiometricData) {
        scope.launch(Dispatchers.IO) {
            if (session?.isActive == true) {
                try {
                    val json = Json.encodeToString(data)
                    session?.send(Frame.Text(json))
                } catch (e: Exception) {
                    println("Failed to send biometric data: ${e.message}")
                }
            }
        }
    }

    fun disconnect() {
        reconnectJob?.cancel()
        scope.launch {
            session?.close()
            session = null
        }
        _isConnected.value = false
        client.cancel()
        println("WebSocket client disconnected.")
    }
}

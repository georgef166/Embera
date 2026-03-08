package com.embera.watchapp

import kotlin.jvm.Volatile
import io.ktor.client.*
import io.ktor.client.engine.cio.*
import io.ktor.client.plugins.websocket.*
import io.ktor.client.request.*
import io.ktor.websocket.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
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

    @Volatile
    private var session: DefaultClientWebSocketSession? = null
    private val _isConnected = MutableStateFlow(false)
    val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    private val messageChannel = Channel<Frame>(capacity = Channel.BUFFERED)
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

                        // Launch a consumer coroutine to send queued messages
                        val senderJob = launch {
                            try {
                                for (frame in messageChannel) {
                                    if (isActive) {
                                        send(frame)
                                    }
                                }
                            } catch (e: Exception) {
                                println("ERROR: Sender loop crashed: ${e.message}")
                            }
                        }

                        try {
                            // Listen for incoming messages (keep-alive)
                            while (isActive) {
                                incoming.receive()
                            }
                        } finally {
                            senderJob.cancel()
                        }
                    }
                } catch (t: Throwable) {
                    println("FATAL ERROR: WebSocket connection crashed: ${t.message}")
                    t.printStackTrace()
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
        val json = Json.encodeToString(data)
        val result = messageChannel.trySend(Frame.Text(json))
        if (result.isSuccess) {
            println("QUEUED: Biometric JSON")
        } else {
            println("DROPPED: Biometric data (Queue full or closed)")
        }
    }

    fun sendBinary(data: ByteArray) {
        // We use trySend to avoid blocking the audio recording loop
        messageChannel.trySend(Frame.Binary(true, data))
    }

    fun disconnect() {
        reconnectJob?.cancel()
        messageChannel.close()
        scope.launch {
            session?.close()
            session = null
        }
        _isConnected.value = false
        client.cancel()
        println("WebSocket client disconnected.")
    }
}

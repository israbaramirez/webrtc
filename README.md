# Proyecto WebRTC de videollamadas

Este proyecto es una base funcional para hacer videollamadas 1 a 1 usando:

- Node.js
- Express
- WebSocket (`ws`) para signaling
- WebRTC para audio/video en tiempo real

## Qué incluye

- Cámara y micrófono local
- Unión por sala
- Conexión entre 2 participantes
- Botones para silenciar micrófono y apagar cámara
- Signaling simple con WebSocket
- Interfaz básica lista para personalizar

## Cómo ejecutar

1. Instala dependencias:

```bash
npm install
```

2. Inicia el proyecto:

```bash
npm start
```

3. Abre en tu navegador:

```bash
http://localhost:3000
```

4. Abre la misma URL en dos pestañas o en dos dispositivos.
5. Escribe el mismo nombre de sala en ambos y presiona **Unirme**.

## Importante

- Este proyecto usa servidores **STUN públicos de Google**.
- Para escenarios reales y redes más restrictivas, conviene agregar un **servidor TURN**.
- Es una base educativa/prototipo, no una solución de producción completa.

## Estructura

```text
webrtc-video-call/
├── package.json
├── server.js
├── README.md
└── public/
    ├── index.html
    ├── style.css
    └── app.js
```

## Ideas para mejorarlo

- Chat en tiempo real con `RTCDataChannel`
- Compartir pantalla
- Más de dos participantes usando SFU/MCU
- Diseño de interfaz más profesional
- Grabación de llamada
- Autenticación de usuarios

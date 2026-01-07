# Android Emulator Streaming to VS Code

This document explores streaming the Android emulator (AVD/QEMU) display to VS Code, similar to how Docker VNC streaming works.

## Overview

Yes! It's absolutely possible to stream from Android emulators. In fact, there are **multiple approaches** that can work even better than Docker VNC streaming since Android emulators have built-in streaming capabilities.

## Comparison: Docker VNC vs Android Emulator

| Feature | Docker VNC | Android Emulator |
|---------|------------|------------------|
| Protocol | VNC (RFB) | ADB screencast / gRPC / WebRTC |
| Setup Complexity | Medium | Low (built-in) |
| Latency | ~100-200ms | ~50-150ms |
| Quality | Good | Excellent (native) |
| GPU Acceleration | Limited | Full support |

---

## Method 1: ADB Screencast (Simplest)

The Android emulator supports direct screen mirroring via ADB.

### Stream to File/Pipe
```bash
# Record screen to file
adb shell screenrecord /sdcard/demo.mp4

# Stream raw frames (requires processing)
adb exec-out screenrecord --output-format=h264 - | ffplay -
```

### Continuous Screenshot Stream
```bash
#!/bin/bash
# Simple frame grabber
while true; do
    adb exec-out screencap -p > /tmp/android_screen.png
    sleep 0.1  # ~10 FPS
done
```

---

## Method 2: scrcpy (Recommended)

[scrcpy](https://github.com/Genymobile/scrcpy) provides high-performance screen mirroring with minimal latency.

### Installation
```bash
# macOS
brew install scrcpy

# Linux
apt install scrcpy

# Windows
scoop install scrcpy
```

### Basic Usage
```bash
# Mirror with window
scrcpy

# Headless mode - output to v4l2 (Linux)
scrcpy --v4l2-sink=/dev/video0 --no-display

# Record to file
scrcpy --record=android_session.mp4
```

### Stream to VNC-compatible format
```bash
# Start scrcpy and capture to virtual display
scrcpy --no-display --record=- | ffmpeg -i - -f vnc vnc://localhost:5900
```

---

## Method 3: Android Emulator gRPC API

The Android emulator exposes a gRPC API for programmatic control and streaming.

### Enable gRPC
```bash
emulator -avd Pixel_9a -grpc 8554
```

### Python Client Example
```python
# Using emulator gRPC API
import grpc
from google.protobuf import empty_pb2
from android_emulator import emulator_controller_pb2_grpc as emu_grpc
from android_emulator import emulator_controller_pb2 as emu_pb2

channel = grpc.insecure_channel('localhost:8554')
stub = emu_grpc.EmulatorControllerStub(channel)

# Get screenshot
image = stub.getScreenshot(emu_pb2.ImageFormat(
    format=emu_pb2.ImageFormat.PNG,
    width=1080,
    height=2400
))

# Stream frames
for frame in stub.streamScreenshot(emu_pb2.ImageFormat()):
    process_frame(frame.image)
```

---

## Method 4: Emulator WebRTC (Built-in)

Modern Android emulators support WebRTC streaming out of the box!

### Start with WebRTC
```bash
emulator -avd Pixel_9a -grpc 8554 -grpc-use-token
```

### Access via Browser
Navigate to: `http://localhost:8554` (when emulator web UI is enabled)

### VS Code Integration
```typescript
// In VS Code extension
const panel = vscode.window.createWebviewPanel(
    'androidPreview',
    'Android Emulator',
    vscode.ViewColumn.Two,
    { enableScripts: true }
);

panel.webview.html = `
<!DOCTYPE html>
<html>
<head>
    <title>Android Emulator Stream</title>
</head>
<body>
    <video id="emulator-stream" autoplay></video>
    <script>
        // Connect to emulator WebRTC stream
        const pc = new RTCPeerConnection();
        // ... WebRTC negotiation with emulator gRPC API
    </script>
</body>
</html>
`;
```

---

## Method 5: VNC via x11vnc (Linux Host)

If running on Linux with X11, you can capture the emulator window directly.

```bash
# Find emulator window ID
WINDOW_ID=$(xdotool search --name "Android Emulator")

# Start VNC server for that window
x11vnc -id $WINDOW_ID -display :0 -rfbport 5900 -nopw -forever
```

---

## Recommended Architecture for VS Code Extension

```
┌─────────────────────────────────────────────────────────────┐
│                    VS Code Extension                         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │ Webview     │◄───│ Frame Buffer │◄───│ scrcpy/ADB    │  │
│  │ Panel       │    │ Processor    │    │ Stream        │  │
│  └─────────────┘    └──────────────┘    └───────┬───────┘  │
│                                                   │          │
└───────────────────────────────────────────────────┼──────────┘
                                                    │
                    ┌───────────────────────────────▼──────────┐
                    │         Android Emulator (QEMU)          │
                    │  ┌─────────────────────────────────────┐ │
                    │  │  Swift + PySwiftKit + Python App    │ │
                    │  └─────────────────────────────────────┘ │
                    └──────────────────────────────────────────┘
```

---

## Implementation: AndroidEmulatorPanel.ts

Here's a starter implementation for a VS Code extension:

```typescript
import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as net from 'net';

export class AndroidEmulatorPanel {
    public static currentPanel: AndroidEmulatorPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _scrcpyProcess: ChildProcess | undefined;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel) {
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.html = this._getHtml();
    }

    public static async create(context: vscode.ExtensionContext) {
        const panel = vscode.window.createWebviewPanel(
            'androidEmulator',
            'Android Emulator',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        AndroidEmulatorPanel.currentPanel = new AndroidEmulatorPanel(panel);
        await AndroidEmulatorPanel.currentPanel.startStreaming();
    }

    private async startStreaming() {
        // Option 1: Use scrcpy with websocket output
        this._scrcpyProcess = spawn('scrcpy', [
            '--no-display',
            '--max-fps=30',
            '--bit-rate=4M',
            '--record=-',  // Output to stdout
        ]);

        // Process frames and send to webview
        this._scrcpyProcess.stdout?.on('data', (data: Buffer) => {
            const base64Frame = data.toString('base64');
            this._panel.webview.postMessage({
                type: 'frame',
                data: base64Frame
            });
        });
    }

    private _getHtml(): string {
        return `<!DOCTYPE html>
<html>
<head>
    <style>
        body { margin: 0; background: #1e1e1e; display: flex; justify-content: center; align-items: center; height: 100vh; }
        #screen { max-width: 100%; max-height: 100%; border-radius: 8px; }
        .status { color: #888; font-family: system-ui; }
    </style>
</head>
<body>
    <img id="screen" />
    <p class="status" id="status">Connecting to Android Emulator...</p>
    <script>
        const vscode = acquireVsCodeApi();
        const screen = document.getElementById('screen');
        const status = document.getElementById('status');
        
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'frame') {
                screen.src = 'data:image/png;base64,' + message.data;
                status.style.display = 'none';
            }
        });
    </script>
</body>
</html>`;
    }

    public dispose() {
        this._scrcpyProcess?.kill();
        this._panel.dispose();
        this._disposables.forEach(d => d.dispose());
    }
}
```

---

## Quick Start Script

Create a script to easily start streaming:

```bash
#!/bin/bash
# android-stream.sh

ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
SCRCPY=$(which scrcpy)

case "$1" in
    vnc)
        # Stream to VNC server on port 5900
        echo "🖥️  Starting VNC stream on :5900"
        $SCRCPY --no-display --record=- | \
            ffmpeg -i - -pix_fmt bgr24 -f vnc tcp://0.0.0.0:5900
        ;;
    
    ws)
        # Stream via WebSocket (for browser/VS Code)
        echo "🌐 Starting WebSocket stream on :8765"
        $SCRCPY --no-display --record=- | \
            websocat -s 8765 --binary
        ;;
    
    preview)
        # Simple preview with scrcpy window
        echo "📱 Opening emulator preview"
        $SCRCPY --window-title="Android Preview" --stay-awake
        ;;
    
    grpc)
        # Use emulator's built-in gRPC
        echo "📡 Emulator gRPC available at localhost:8554"
        echo "   Start emulator with: emulator -avd <name> -grpc 8554"
        ;;
    
    *)
        echo "Usage: $0 [vnc|ws|preview|grpc]"
        echo ""
        echo "  vnc     - Stream to VNC server"
        echo "  ws      - Stream via WebSocket"  
        echo "  preview - Open scrcpy window"
        echo "  grpc    - Info about gRPC streaming"
        ;;
esac
```

---

## Swift + PySwiftKit Specific Considerations

When running Swift + PySwiftKit on Android emulator:

### 1. Performance
- Use `x86_64` emulator image for best performance on Intel/AMD
- Use ARM emulator images on Apple Silicon (M1/M2/M3)
- Enable GPU acceleration: `emulator -avd <name> -gpu host`

### 2. Hot Reload Integration
```bash
# Watch for Swift changes and rebuild
fswatch -o Sources/ | while read; do
    ./gradlew assembleDebug
    adb install -r app/build/outputs/apk/debug/app-debug.apk
    adb shell am start -n com.example.app/.MainActivity
done
```

### 3. Debugging
```bash
# View Swift/Python logs
adb logcat -v time | grep -E "(Swift|Python|PySwift)"
```

---

## Comparison of Methods

| Method | Latency | Setup | VS Code Integration | Touch Input |
|--------|---------|-------|---------------------|-------------|
| ADB Screenshot | High (~200ms) | None | Easy | No |
| scrcpy | Low (~50ms) | Install scrcpy | Medium | Yes |
| gRPC | Low (~30ms) | None | Complex | Yes |
| WebRTC | Very Low (~20ms) | None | Medium | Yes |
| x11vnc | Medium (~100ms) | Linux only | Easy | Yes |

---

## Recommended Setup

For your Swift + PySwiftKit project, I recommend:

1. **Development**: Use `scrcpy` directly for lowest latency
2. **VS Code Extension**: Use gRPC API for programmatic control
3. **CI/CD**: Use ADB screenshot for automated testing

```bash
# Install scrcpy
brew install scrcpy

# Start emulator
./emulator.sh start Pixel_9a

# Stream to VS Code (separate terminal)
scrcpy --window-title="Swift Android Preview"
```

---

## Resources

- [scrcpy GitHub](https://github.com/Genymobile/scrcpy)
- [Android Emulator gRPC](https://android.googlesource.com/platform/external/qemu/+/refs/heads/emu-master-dev/android/android-grpc/)
- [ADB Documentation](https://developer.android.com/studio/command-line/adb)
- [WebRTC in Android Emulator](https://developer.android.com/studio/run/emulator-networking)

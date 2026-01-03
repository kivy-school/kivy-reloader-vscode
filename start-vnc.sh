#!/bin/bash
set -e

# Clean up any stale lock files
echo "Cleaning up any stale X server lock files..."
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99

echo "Starting Xvfb on display :99..."
Xvfb :99 -screen 0 1024x768x24 -ac +extension GLX +render -noreset &
XVFB_PID=$!

# Wait for X server to be ready
sleep 2

echo "Starting x11vnc with minimal compression (optimized for local streaming)..."
x11vnc \
    -display :99 \
    -forever \
    -shared \
    -rfbport 5900 \
    -nopw \
    -xkb \
    -ncache 0 \
    -ncache_cr \
    -noxdamage \
    -noxfixes \
    -noxcomposite \
    -skip_lockkeys \
    -speeds lan \
    -wait 5 \
    -defer 5 \
    -progressive 0 \
    -q \
    &
X11VNC_PID=$!

# Wait for VNC server to start
sleep 2

echo "Starting websockify to bridge WebSocket (6080) to VNC (5900)..."
websockify --web /usr/share/novnc 6080 localhost:5900 &
WEBSOCKIFY_PID=$!

echo "Starting Kivy-Reloader server on port 8050..."
python3 /usr/local/bin/kivy_reloader_server.py &
RELOADER_PID=$!

echo "================================================"
echo "VNC Streaming Server Ready!"
echo "================================================"
echo "VNC Port:       5900 (for native VNC clients)"
echo "WebSocket Port: 6080 (for browser/VSCode)"
echo "Reloader Port:  8050 (for hot-reload updates)"
echo "noVNC URL:      http://localhost:6080/vnc.html"
echo "================================================"
echo "Configuration: Optimized for local streaming"
echo "  - No compression"
echo "  - No damage tracking"
echo "  - LAN speed optimization"
echo "  - Minimal CPU overhead (~2-5%)"
echo "================================================"

# Cleanup function
cleanup() {
    echo "Shutting down VNC streaming server..."
    kill $XVFB_PID $X11VNC_PID $WEBSOCKIFY_PID $RELOADER_PID 2>/dev/null || true
    # Clean up lock files
    rm -f /tmp/.X99-lock /tmp/.X11-unix/X99
    exit 0
}

# Keep container running and forward signals
trap cleanup EXIT TERM INT

# Wait for any process to exit
wait -n

# Exit with status of process that exited first
exit $?

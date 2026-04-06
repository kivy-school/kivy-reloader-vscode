#!/bin/bash
set -e

# Display resolution — override with -e DISPLAY_WIDTH=W -e DISPLAY_HEIGHT=H on docker run
DISPLAY_WIDTH="${DISPLAY_WIDTH:-800}"
DISPLAY_HEIGHT="${DISPLAY_HEIGHT:-600}"

# Clean up any stale lock files
echo "Cleaning up any stale X server lock files..."
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99

# Xvfb must start at a large ceiling so xrandr can scale down to any frame size.
# RandR resizing only works within the initial framebuffer dimensions.
echo "Starting Xvfb on display :99 at 1920x1080 (RandR ceiling)..."
Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +extension RANDR +render -noreset &
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

echo "Starting figma-kivy-previewer on ws://0.0.0.0:${PREVIEWER_PORT}..."
figma-kivy-previewer &
PREVIEWER_PID=$!

echo "================================================"
echo "VNC Streaming Server Ready!"
echo "================================================"
echo "VNC Port:       5900 (for native VNC clients)"
echo "WebSocket Port: 6080 (for browser/VSCode)"
echo "Previewer WS:   ${PREVIEWER_PORT} (canvas-py payload)"
echo "noVNC URL:      http://localhost:6080/vnc.html"
echo "================================================"

# Cleanup function
cleanup() {
    echo "Shutting down..."
    kill $XVFB_PID $X11VNC_PID $WEBSOCKIFY_PID $PREVIEWER_PID 2>/dev/null || true
    rm -f /tmp/.X99-lock /tmp/.X11-unix/X99
    exit 0
}

# Keep container running and forward signals
trap cleanup EXIT TERM INT

# Wait for any process to exit
wait -n

# Exit with status of process that exited first
exit $?

FROM python:3.13-slim

# Install system dependencies for Kivy and VNC streaming
RUN apt-get update && apt-get install -y \
    # X11 and display
    xvfb \
    x11vnc \
    # noVNC for browser-based VNC client
    novnc \
    websockify \
    # Kivy dependencies
    python3-dev \
    libgl1 \
    libgles2 \
    libgstreamer1.0-0 \
    gstreamer1.0-plugins-base \
    gstreamer1.0-plugins-good \
    libmtdev1 \
    libsdl2-2.0-0 \
    libsdl2-image-2.0-0 \
    libsdl2-mixer-2.0-0 \
    libsdl2-ttf-2.0-0 \
    # Build tools and version control (needed for pip dependencies and uv)
    git \
    curl \
    ca-certificates \
    # Utils
    xclip \
    xsel \
    procps \
    x11-xserver-utils \
    fontconfig \
    fonts-noto-core \
    fonts-roboto \
    fonts-open-sans \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast Python package management
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

RUN pip install --no-cache-dir kivy pillow websockets

# Install figma-kivy-previewer from workspace root build context
COPY figma-kivy-previewer/figma-kivy-previewer /tmp/fkp
RUN pip install --no-cache-dir /tmp/fkp && rm -rf /tmp/fkp

# Set up working directory
WORKDIR /work

# Environment variables for display and previewer
ENV DISPLAY=:99
ENV SDL_VIDEODRIVER=x11
ENV PREVIEWER_IP=0.0.0.0
ENV PREVIEWER_PORT=7654

# Copy startup script
COPY kivy-reloader-vscode/start-vnc.sh /usr/local/bin/start-vnc.sh
RUN chmod +x /usr/local/bin/start-vnc.sh

# Expose VNC, WebSocket (noVNC), and previewer ports
EXPOSE 5900 6080 7654

CMD ["/usr/local/bin/start-vnc.sh"]

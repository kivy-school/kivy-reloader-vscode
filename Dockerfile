FROM python:3.11-slim

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
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast Python package management
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

# Install Python packages (toml needed by kivy_reloader_server.py)
RUN pip install --no-cache-dir \
    kivy \
    pillow \
    kivy-reloader \
    toml

# Set up working directory
WORKDIR /work

# Environment variables for display
ENV DISPLAY=:99
ENV SDL_VIDEODRIVER=x11

# Copy startup script and kivy-reloader server
COPY start-vnc.sh /usr/local/bin/start-vnc.sh
COPY kivy_reloader_server.py /usr/local/bin/kivy_reloader_server.py
RUN chmod +x /usr/local/bin/start-vnc.sh
RUN chmod +x /usr/local/bin/kivy_reloader_server.py

# Expose VNC, WebSocket, and Kivy-reloader ports
EXPOSE 5900 6080 8050

CMD ["/usr/local/bin/start-vnc.sh"]

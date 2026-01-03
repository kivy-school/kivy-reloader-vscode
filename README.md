# Kivy Hot Reloader

VSCode extension for hot reloading Kivy applications with live VNC preview - fully automated Docker setup included!

## Features

- 🔥 **Auto Hot Reload**: Changes sent 2 seconds after you stop typing (.py and .kv files)
- 🐳 **One-Click Docker Setup**: Automatic image build and container management
- 📹 **Live VNC Preview**: See your Kivy app running in real-time in VSCode
- 📦 **Full Deploy**: Deploy entire project with one click
- 🎯 **Smart Detection**: Automatically finds project root (pyproject.toml)

## Installation

### Method 1: From GitHub Release (Recommended)

1. Download the latest `.vsix` file from [Releases](https://github.com/kivy-school/kivy-reloader-vscode/releases)
2. Open VSCode
3. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
4. Type "Extensions: Install from VSIX"
5. Select the downloaded `.vsix` file

### Method 2: From Source

```bash
git clone https://github.com/kivy-school/kivy-reloader-vscode.git
cd kivy-reloader-vscode
npm install
npm run compile
npm install -g @vscode/vsce
vsce package
```

This creates a `.vsix` file. Install it using "Extensions: Install from VSIX" or press F5 to run in debug mode.

## Quick Start (3 Steps)

### 1. Install Docker

```bash
# macOS
brew install --cask docker

# Or download from https://www.docker.com/get-started
```

Start Docker Desktop and ensure it's running.

### 2. Set Up Docker (One Command!)

1. Open your Kivy project folder in VSCode
2. Press `Cmd+Shift+P` and type "**Kivy Reloader: Setup Docker**"
3. Wait for image build to complete (shows in terminal)
4. Click "Yes" when asked to start container

**That's it!** The extension automatically:
- Builds Docker image with Kivy, Python, VNC, and hot reload server
- Installs all dependencies (git, uv, toml, websockify, noVNC)
- Mounts your project folder
- Starts hot reload server on port 8050
- Starts VNC server on ports 5900 (VNC) and 6080 (WebSocket)

### 3. Start Coding

Open any `.py` or `.kv` file and start editing. Changes automatically reload after 2 seconds!

## Commands

Access via Command Palette (`Cmd+Shift+P`) or editor toolbar icons:

### Editor Toolbar (when viewing .py or .kv files)

1. **⚡ Sync** - Send current file immediately
2. **☁️ Cloud** - Deploy full project (shows success alert)
3. **🔄 Debug** - Toggle auto-send on/off  
4. **📹 Camera** - Open VNC live preview

### Docker Management Commands

- **🖥️ Setup Docker** - Build Docker image (one-time setup)
- **▶️ Start Container** - Start hot reload server
- **⏹️ Stop Container** - Stop hot reload server
- **📊 Check Status** - View container status

## Extension Settings

```json
{
  "kivyReloader.host": "localhost",
  "kivyReloader.port": 8050,
  "kivyReloader.autoSend": true
}
```

## How It Works

1. **Auto-send**: Extension watches .py and .kv files, sends changes after 2-second pause
2. **Docker Container**: Runs Kivy app with Xvfb (virtual display) + x11vnc + noVNC
3. **Hot Reload Server**: Receives file changes on port 8050, reloads app automatically
4. **VNC Preview**: View live app in VSCode via WebSocket (port 6080)

## What's Included

The Docker image automatically includes:
- Python 3.11 with Kivy
- uv (fast package manager)
- git, toml (dependency management)
- Xvfb (virtual display)
- x11vnc + noVNC (VNC with web interface)
- Hot reload server (kivy_reloader_server.py)

Everything is pre-configured and ready to use!

## Troubleshooting

**"Docker is not installed"**  
Install Docker Desktop from https://www.docker.com/get-started

**"Docker is not running"**  
Start Docker Desktop application

**"No pyproject.toml found"**  
Create a new Kivy project with uv:

```bash
# Initialize project
uv init --package . --name myapp

# Install dependencies
uv add kivy kivy-reloader trio
```

Then update your app structure:

change __init__.py content to

**src/myapp/__init__.py:**
```python
from .app import main
```

create app.py

**src/myapp/app.py:**
```python
import trio
from kivy.lang import Builder
from kivy_reloader.app import App

kv = """
Button:
    text: "Hello World"
"""

class MainApp(App):
    def build(self):
        return Builder.load_string(kv)

def main():
    app = MainApp()
    trio.run(app.async_run, "trio")
```

**Quick Setup:**
```bash
# Create project
uv init --package . --name myapp

# Install dependencies
uv add kivy kivy-reloader trio

# Create app.py (see structure above)
# Update __init__.py to import main

# Run with hot reload
uv run myappapp.async_run, "trio"
```

**Changes not reloading**  
- Run "**Check Status**" command to verify container is running
- Check Docker logs: `docker logs kivy-app-dev`
- Open Developer Console (Help > Toggle Developer Tools) for extension logs

**VNC preview is blank**  
The container is running but no Kivy app started. Check:
- Your pyproject.toml has a `[project.scripts]` entry
- The app path is correct in pyproject.toml
- Docker logs show app starting: `docker logs kivy-app-dev -f`

**Image build fails**  
Run "**Setup Docker**" command again. Build happens in terminal so you can see errors in real-time.

## Project Structure

```
my-kivy-project/
├── pyproject.toml       # Required - defines project and scripts
├── src/
│   └── mypackage/
│       ├── __init__.py
│       ├── main.py      # Entry point
│       └── app.kv       # Kivy UI
└── README.md
```

## Contributing

Found a bug or want to contribute? Visit [GitHub repository](https://github.com/kivy-school/kivy-reloader-vscode)

## License

MIT License - see LICENSE file for details

# Splitting Kivy Hot Reload into Separate Extension

This guide explains how to complete the separation of hot reload functionality from the KvToPyClass extension.

## New Structure

### kivy-reloader-vscode (New Extension)
- **Purpose**: Hot reload for Kivy apps in Docker
- **Features**: Send files, deploy projects, auto-send on save
- **Files Created**:
  - `package.json` - Extension manifest
  - `tsconfig.json` - TypeScript configuration
  - `src/extension.ts` - Main extension code
  - `src/kivyHotReloader.ts` - Hot reload client (copied)
  - `kivy_reloader_server.py` - Docker server (copied)
  - `README.md` - Documentation

### KvToPyClass (Updated Extension)
- **Purpose**: KV language support, parser, widgets, code generation
- **Features**: Syntax highlighting, completions, drag-n-drop widgets, Python generation

## Setup Steps

### 1. Install Dependencies for kivy-reloader-vscode

```bash
cd /Volumes/CodeSSD/GitHub/kivy-reloader-vscode
npm install
npm install --save-dev @types/node @types/vscode @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint typescript
npm install jszip
```

### 2. Compile kivy-reloader-vscode

```bash
cd /Volumes/CodeSSD/GitHub/kivy-reloader-vscode
npm run compile
```

### 3. Clean up KvToPyClass Extension

```bash
cd /Volumes/CodeSSD/GitHub/PySwiftKitDemoPlugin/KvToPyClassVsCode
chmod +x cleanup-hot-reload.sh
./cleanup-hot-reload.sh
```

### 4. Update KvToPyClass package.json

Remove these commands from `package.json`:
- `kvToPyClass.sendToKivyReloader`
- `kvToPyClass.deployFullProject`
- `kvToPyClass.toggleHotReloadWatcher`
- `kvToPyClass.showHotReloadOutput`

Remove hot reload related menus and configuration.

### 5. Update KvToPyClass extension.ts

Remove:
- Import: `import { KivyHotReloader } from './kivyHotReloader';`
- Variable: `let hotReloader: KivyHotReloader;`
- Initialization: `hotReloader = new KivyHotReloader(...)`
- Commands: `sendToKivyReloaderCommand`, `deployFullProjectCommand`, etc.
- Auto-send logic in save listener

### 6. Recompile KvToPyClass

```bash
cd /Volumes/CodeSSD/GitHub/PySwiftKitDemoPlugin/KvToPyClassVsCode
npm run compile
```

### 7. Install Extensions in VS Code

#### Option A: Development Mode
1. Open `/Volumes/CodeSSD/GitHub/kivy-reloader-vscode` in VS Code
2. Press F5 to launch Extension Development Host
3. Open `/Volumes/CodeSSD/GitHub/PySwiftKitDemoPlugin/KvToPyClassVsCode` in another VS Code window
4. Press F5 to launch with updated KvToPyClass

#### Option B: Package and Install
```bash
# Install vsce
npm install -g @vscode/vsce

# Package kivy-reloader
cd /Volumes/CodeSSD/GitHub/kivy-reloader-vscode
vsce package

# Package KvToPyClass (from workspace root)
cd /Volumes/CodeSSD/GitHub/PySwiftKitDemoPlugin/KvToPyClassVsCode
vsce package

# Install both .vsix files in VS Code
```

## Icon Visibility

The hot reload icons (Send, Deploy, Toggle Auto) will appear in:
- **Python files** (`.py`) in editor toolbar
- **KV files** (`.kv`) in editor toolbar  
- **TOML files** (`kivy-reloader.toml`) in context menu

## Testing

1. Open a project with `/kv_projs/` structure
2. Ensure Docker container is running with `kivy_reloader_server.py`
3. Edit a `.py` or `.kv` file
4. Click the sync icon (Send to Hot Reload)
5. Verify file is sent to Docker container
6. Enable Auto Hot Reload and test auto-send on save

## Benefits of Separation

- **Cleaner codebases**: Each extension has single responsibility
- **Independent updates**: Update hot reload without rebuilding WASM
- **Optional installation**: Users can install only what they need
- **Better maintainability**: Smaller, focused extensions

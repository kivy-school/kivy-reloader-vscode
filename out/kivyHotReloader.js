"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.KivyHotReloader = void 0;
const vscode = __importStar(require("vscode"));
const net = __importStar(require("net"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const JSZip = require("jszip");
class KivyHotReloader {
    constructor(config = {}, outputChannel) {
        this.lastSendTime = 0;
        this.debounceDelay = 500; // 500ms debounce
        this.config = {
            host: config.host || 'localhost',
            port: config.port || 8050,
            timeout: config.timeout || 5000
        };
        this.outputChannel = outputChannel || vscode.window.createOutputChannel('Kivy Hot Reload');
    }
    /**
     * Send full project folder (initial deployment)
     * @param projectPath - The project folder to deploy (with pyproject.toml)
     * @param workspaceRoot - Not used, kept for compatibility
     */
    async sendFullProject(projectPath, workspaceRoot) {
        try {
            this.log(`📦 Preparing full project deployment...`);
            this.log(`   projectPath: ${projectPath}`);
            // Verify pyproject.toml exists
            const pyprojectPath = path.join(projectPath, 'pyproject.toml');
            try {
                await fs.promises.access(pyprojectPath);
                this.log(`   ✓ Found pyproject.toml`);
            }
            catch (error) {
                throw new Error(`No pyproject.toml found in ${projectPath}. This is required for uv to run the app.`);
            }
            // Get all files in the project folder
            const files = await this.getAllFilesRecursive(projectPath);
            this.log(`Found ${files.length} files to deploy`);
            // Create ZIP package - files relative to projectPath
            const zipBuffer = await this.createFullPackage(files, projectPath, workspaceRoot);
            // Send to Docker container
            const success = await this.sendToServer(zipBuffer);
            if (success) {
                this.log('✅ Full project deployed successfully');
                vscode.window.showInformationMessage('✅ Full project deployed to Kivy app');
            }
            else {
                this.log('❌ Full project deployment failed');
                vscode.window.showErrorMessage('❌ Failed to deploy project');
            }
            return success;
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.log(`❌ Error: ${errorMsg}`);
            vscode.window.showErrorMessage(`Project deployment error: ${errorMsg}`);
            return false;
        }
    }
    /**
     * Send changed files to the Kivy-reloader server
     */
    async sendUpdate(files, workspaceRoot) {
        try {
            this.log(`📦 Preparing update with ${files.length} file(s)...`);
            // Create ZIP package
            const zipBuffer = await this.createDeltaPackage(files, workspaceRoot);
            // Send to Docker container
            const success = await this.sendToServer(zipBuffer);
            if (success) {
                this.log('✅ Hot reload sent successfully');
            }
            else {
                this.log('❌ Hot reload failed');
                vscode.window.showErrorMessage('❌ Failed to send hot reload');
            }
            return success;
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.log(`❌ Error: ${errorMsg}`);
            vscode.window.showErrorMessage(`Hot reload error: ${errorMsg}`);
            return false;
        }
    }
    /**
     * Create a ZIP package with changed files and metadata
     */
    async createDeltaPackage(files, workspaceRoot) {
        const zip = new JSZip();
        // Prepare relative paths
        const relativeFiles = [];
        // Add files to ZIP
        for (const file of files) {
            try {
                const content = await fs.promises.readFile(file);
                const relativePath = path.relative(workspaceRoot, file);
                // Use forward slashes for consistency
                const normalizedPath = relativePath.split(path.sep).join('/');
                zip.file(normalizedPath, content);
                relativeFiles.push(normalizedPath);
                this.log(`  ✓ Added: ${normalizedPath}`);
            }
            catch (error) {
                this.log(`  ✗ Failed to add ${file}: ${error}`);
            }
        }
        // Add metadata
        const metadata = {
            type: 'delta',
            timestamp: Date.now() / 1000,
            file_count: relativeFiles.length,
            files: relativeFiles,
            deleted_files: []
        };
        zip.file('_delta_metadata.json', JSON.stringify(metadata, null, 2));
        // Generate ZIP buffer
        const buffer = await zip.generateAsync({
            type: 'nodebuffer',
            compression: 'DEFLATE',
            compressionOptions: {
                level: 6
            }
        });
        this.log(`📦 Created ZIP package (${buffer.length} bytes)`);
        return buffer;
    }
    /**
     * Send ZIP buffer to the Kivy-reloader server via TCP
     */
    async sendToServer(zipBuffer) {
        return new Promise((resolve, reject) => {
            this.log(`🔗 Connecting to ${this.config.host}:${this.config.port}...`);
            const client = net.connect({ host: this.config.host, port: this.config.port }, () => {
                this.log('✓ Connected to Kivy-reloader server');
                // Send ZIP data in chunks
                const CHUNK_SIZE = 256 * 1024; // 256KB chunks
                let offset = 0;
                while (offset < zipBuffer.length) {
                    const chunk = zipBuffer.slice(offset, offset + CHUNK_SIZE);
                    client.write(chunk);
                    offset += CHUNK_SIZE;
                }
                this.log(`📤 Sent ${zipBuffer.length} bytes`);
                client.end();
            });
            // Wait for ACK
            client.on('data', (data) => {
                const response = data.toString();
                if (response.startsWith('OK')) {
                    this.log('✓ ACK received from server');
                    resolve(true);
                }
                else {
                    this.log(`✗ Unexpected response: ${response}`);
                    resolve(false);
                }
            });
            client.on('error', (err) => {
                this.log(`✗ Connection error: ${err.message}`);
                reject(err);
            });
            client.on('timeout', () => {
                this.log('✗ Connection timeout');
                client.destroy();
                reject(new Error('Timeout waiting for server'));
            });
            client.setTimeout(this.config.timeout);
        });
    }
    /**
     * Start watching for file changes
     */
    startWatching(workspaceRoot) {
        if (this.fileWatcher) {
            this.log('⚠️  File watcher already running');
            return;
        }
        // Watch .kv and .py files in the workspace
        const pattern = new vscode.RelativePattern(workspaceRoot, '**/*.{kv,py}');
        this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
        // Handle file changes
        const handleChange = async (uri) => {
            const now = Date.now();
            // Debounce: ignore if too soon after last send
            if (now - this.lastSendTime < this.debounceDelay) {
                return;
            }
            this.lastSendTime = now;
            // Check if auto-reload is enabled
            const config = vscode.workspace.getConfiguration('kvToPyClass');
            const autoReload = config.get('hotReload.autoSend', false);
            if (!autoReload) {
                return;
            }
            this.log(`📝 File changed: ${path.basename(uri.fsPath)}`);
            // Send the changed file
            await this.sendUpdate([uri.fsPath], workspaceRoot);
        };
        this.fileWatcher.onDidChange(handleChange);
        this.fileWatcher.onDidCreate(handleChange);
        // Handle file deletions
        this.fileWatcher.onDidDelete(async (uri) => {
            const config = vscode.workspace.getConfiguration('kvToPyClass');
            const autoReload = config.get('hotReload.autoSend', false);
            if (autoReload) {
                this.log(`🗑️  File deleted: ${path.basename(uri.fsPath)}`);
                // TODO: Implement deletion handling with deleted_files metadata
            }
        });
        this.log(`👀 Started watching for file changes in ${workspaceRoot}`);
        vscode.window.showInformationMessage('🔥 Hot reload watching enabled');
    }
    /**
     * Stop watching for file changes
     */
    stopWatching() {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
            this.fileWatcher = undefined;
            this.log('⏹️  Stopped watching for file changes');
            vscode.window.showInformationMessage('Hot reload watching disabled');
        }
    }
    /**
     * Create a full project ZIP package with all files
     */
    async createFullPackage(files, projectPath, workspaceRoot) {
        const zip = new JSZip();
        // Prepare relative paths
        const relativeFiles = [];
        // Add files to ZIP
        for (const file of files) {
            try {
                const content = await fs.promises.readFile(file);
                // Make paths relative to project root (not workspace root)
                const relativePath = path.relative(projectPath, file);
                // Use forward slashes for consistency
                const normalizedPath = relativePath.split(path.sep).join('/');
                zip.file(normalizedPath, content);
                relativeFiles.push(normalizedPath);
                this.log(`  ✓ Added: ${normalizedPath}`);
            }
            catch (error) {
                this.log(`  ✗ Failed to add ${file}: ${error}`);
            }
        }
        // Add metadata for full deployment
        const metadata = {
            type: 'full',
            timestamp: Date.now() / 1000,
            file_count: relativeFiles.length,
            files: relativeFiles,
            deleted_files: []
        };
        zip.file('_delta_metadata.json', JSON.stringify(metadata, null, 2));
        // Generate ZIP buffer
        const buffer = await zip.generateAsync({
            type: 'nodebuffer',
            compression: 'DEFLATE',
            compressionOptions: {
                level: 6
            }
        });
        this.log(`📦 Created full project ZIP (${buffer.length} bytes)`);
        return buffer;
    }
    /**
     * Recursively get all files in a directory
     */
    async getAllFilesRecursive(dir) {
        const files = [];
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            // Skip excluded patterns
            if (entry.name.startsWith('.') ||
                entry.name === '__pycache__' ||
                entry.name === 'node_modules' ||
                entry.name.endsWith('.pyc')) {
                continue;
            }
            if (entry.isDirectory()) {
                const subFiles = await this.getAllFilesRecursive(fullPath);
                files.push(...subFiles);
            }
            else {
                files.push(fullPath);
            }
        }
        return files;
    }
    /**
     * Log a message to the output channel
     */
    log(message) {
        const timestamp = new Date().toLocaleTimeString();
        this.outputChannel.appendLine(`[${timestamp}] ${message}`);
    }
    /**
     * Show the output channel
     */
    showOutput() {
        this.outputChannel.show();
    }
    /**
     * Dispose resources
     */
    dispose() {
        this.stopWatching();
        this.outputChannel.dispose();
    }
}
exports.KivyHotReloader = KivyHotReloader;
//# sourceMappingURL=kivyHotReloader.js.map
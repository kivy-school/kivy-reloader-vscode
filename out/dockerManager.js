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
exports.DockerManager = void 0;
const vscode = __importStar(require("vscode"));
const child_process = __importStar(require("child_process"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class DockerManager {
    /**
     * Check if Docker is installed and running
     */
    static async checkDockerInstalled() {
        try {
            await this.execCommand('docker --version');
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Check if Docker daemon is running
     */
    static async checkDockerRunning() {
        try {
            await this.execCommand('docker ps');
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Build Docker image from Dockerfile in extension
     */
    static async buildImage(extensionPath) {
        const dockerfilePath = path.join(extensionPath, 'Dockerfile');
        if (!fs.existsSync(dockerfilePath)) {
            throw new Error('Dockerfile not found in extension');
        }
        vscode.window.showInformationMessage('🐳 Building Docker image in terminal...');
        // Create terminal and run build command
        const terminal = vscode.window.createTerminal('Docker Build');
        terminal.show();
        terminal.sendText(`cd "${extensionPath}"`);
        terminal.sendText(`docker build --no-cache -t ${this.IMAGE_NAME} -f "${dockerfilePath}" "${extensionPath}"`);
        // Wait for build to complete (check every 2 seconds)
        await new Promise((resolve, reject) => {
            const checkInterval = setInterval(async () => {
                if (await this.imageExists()) {
                    clearInterval(checkInterval);
                    vscode.window.showInformationMessage(`✅ Docker image '${this.IMAGE_NAME}' built successfully`);
                    resolve();
                }
            }, 2000);
            // Timeout after 10 minutes
            setTimeout(() => {
                clearInterval(checkInterval);
                reject(new Error('Build timeout'));
            }, 600000);
        });
    }
    /**
     * Check if image exists
     */
    static async imageExists() {
        try {
            const output = await this.execCommand(`docker images -q ${this.IMAGE_NAME}`);
            return output.trim().length > 0;
        }
        catch {
            return false;
        }
    }
    /**
     * Check if container exists
     */
    static async containerExists() {
        try {
            const output = await this.execCommand(`docker ps -a --filter "name=${this.CONTAINER_NAME}" --format "{{.Names}}"`);
            return output.trim() === this.CONTAINER_NAME;
        }
        catch {
            return false;
        }
    }
    /**
     * Check if container is running
     */
    static async isContainerRunning() {
        try {
            const output = await this.execCommand(`docker ps --filter "name=${this.CONTAINER_NAME}" --format "{{.Names}}"`);
            return output.trim() === this.CONTAINER_NAME;
        }
        catch {
            return false;
        }
    }
    /**
     * Start hot reload container
     */
    static async startContainer(projectPath) {
        // Stop existing container if running
        if (await this.containerExists()) {
            await this.execCommand(`docker rm -f ${this.CONTAINER_NAME}`);
        }
        vscode.window.showInformationMessage('🚀 Starting hot reload container...');
        // Start container with project mounted
        await this.execCommand(`docker run -d ` +
            `--name ${this.CONTAINER_NAME} ` +
            `-p 5900:5900 ` +
            `-p 6080:6080 ` +
            `-p 8050:8050 ` +
            `-v "${projectPath}:/work" ` +
            `${this.IMAGE_NAME}`);
        // Wait a moment for server to start
        await new Promise(resolve => setTimeout(resolve, 2000));
        vscode.window.showInformationMessage('✅ Hot reload server started');
    }
    /**
     * Stop container
     */
    static async stopContainer() {
        if (!await this.containerExists()) {
            vscode.window.showWarningMessage('Container not found');
            return;
        }
        await this.execCommand(`docker stop ${this.CONTAINER_NAME}`);
        await this.execCommand(`docker rm ${this.CONTAINER_NAME}`);
        vscode.window.showInformationMessage('🛑 Hot reload server stopped');
    }
    /**
     * Get container status
     */
    static async getStatus() {
        const dockerInstalled = await this.checkDockerInstalled();
        if (!dockerInstalled) {
            return '❌ Docker not installed';
        }
        const dockerRunning = await this.checkDockerRunning();
        if (!dockerRunning) {
            return '❌ Docker daemon not running';
        }
        const containerExists = await this.containerExists();
        if (!containerExists) {
            return '⚪ Container not created';
        }
        const isRunning = await this.isContainerRunning();
        if (isRunning) {
            return '✅ Hot reload server running';
        }
        else {
            return '⚠️ Container exists but not running';
        }
    }
    /**
     * Execute shell command
     */
    static execCommand(command, options) {
        return new Promise((resolve, reject) => {
            child_process.exec(command, options, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(String(stderr) || error.message));
                }
                else {
                    resolve(String(stdout));
                }
            });
        });
    }
}
exports.DockerManager = DockerManager;
DockerManager.IMAGE_NAME = 'kivy-hot-reload';
DockerManager.CONTAINER_NAME = 'kivy-app-dev';
//# sourceMappingURL=dockerManager.js.map
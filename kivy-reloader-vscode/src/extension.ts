import * as vscode from 'vscode';
import { KivyHotReloader } from './kivyHotReloader';
import { VncPreviewPanel } from './vncPreviewPanel';
import { DockerManager } from './dockerManager';
import * as fs from 'fs';
import * as path from 'path';

let hotReloader: KivyHotReloader;
let autoSendTimer: NodeJS.Timeout | undefined;

/**
 * Find project root by searching upward for pyproject.toml
 */
function findProjectRoot(startPath: string): string | undefined {
    let currentPath = startPath;
    
    // If it's a file, start from its directory
    if (fs.existsSync(currentPath) && fs.statSync(currentPath).isFile()) {
        currentPath = path.dirname(currentPath);
    }
    
    // Search upward for pyproject.toml
    while (currentPath && currentPath !== '/' && currentPath.length > 1) {
        const pyprojectPath = path.join(currentPath, 'pyproject.toml');
        if (fs.existsSync(pyprojectPath)) {
            return currentPath;
        }
        
        // Move up one directory
        const parentPath = path.dirname(currentPath);
        if (parentPath === currentPath) {
            break; // Reached root
        }
        currentPath = parentPath;
    }
    
    return undefined;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Kivy Hot Reloader extension activated');
    
    // Initialize hot reloader
    const config = vscode.workspace.getConfiguration('kivyReloader');
    hotReloader = new KivyHotReloader({
        host: config.get('host', 'localhost'),
        port: config.get('port', 8050)
    });
    
    // Command: Send file to hot reload
    const sendFileCommand = vscode.commands.registerCommand(
        'kivyReloader.sendFile',
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor');
                return;
            }
            
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                vscode.window.showWarningMessage('No workspace folder open');
                return;
            }
            
            // Get the current file path
            const currentFile = editor.document.uri.fsPath;
            
            // Find project root by searching for pyproject.toml
            const projectPath = findProjectRoot(currentFile);
            
            if (!projectPath) {
                vscode.window.showWarningMessage('Could not find pyproject.toml in any parent directory');
                return;
            }
            
            // Save the current file first
            if (editor.document.isDirty) {
                await editor.document.save();
            }
            
            // Send the current file (relative to project folder)
            await hotReloader.sendUpdate([currentFile], projectPath);
        }
    );
    
    // Command: Deploy full project
    const deployFullProjectCommand = vscode.commands.registerCommand(
        'kivyReloader.deployFullProject',
        async (uri?: vscode.Uri) => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                vscode.window.showWarningMessage('No workspace folder open');
                return;
            }
            
            let projectPath: string | undefined;
            
            // If called from context menu with URI
            if (uri) {
                projectPath = findProjectRoot(uri.fsPath);
            } else {
                // If called from command palette, use active editor
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.window.showWarningMessage('No active editor');
                    return;
                }
                
                projectPath = findProjectRoot(editor.document.uri.fsPath);
            }
            
            if (!projectPath) {
                vscode.window.showWarningMessage('Could not find pyproject.toml in any parent directory');
                return;
            }
            
            // Deploy the full project
            await hotReloader.sendFullProject(projectPath, projectPath);
        }
    );
    
    // Command: Toggle auto-send
    const toggleAutoSendCommand = vscode.commands.registerCommand(
        'kivyReloader.toggleAutoSend',
        async () => {
            const config = vscode.workspace.getConfiguration('kivyReloader');
            const currentValue = config.get('autoSend', false);
            await config.update('autoSend', !currentValue, vscode.ConfigurationTarget.Workspace);
            vscode.window.showInformationMessage(`Hot Reload Auto-Send ${!currentValue ? 'enabled' : 'disabled'}`);
        }
    );
    
    // Command: Show VNC Live Preview - Instance Selector
    const vncPreviewCommand = vscode.commands.registerCommand(
        'kivyReloader.showVncPreview',
        async () => {
            try {
                await VncPreviewPanel.showInstanceSelector(context);
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to open VNC preview: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }
    );
    
    // Command: Show VNC Live Preview - Instance 1
    const vncPreview1Command = vscode.commands.registerCommand(
        'kivyReloader.showVncPreview1',
        async () => {
            try {
                const panel = VncPreviewPanel.getInstance(context, 1);
                await panel.show();
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to open VNC preview (Instance 1): ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }
    );
    
    // Command: Show VNC Live Preview - Instance 2
    const vncPreview2Command = vscode.commands.registerCommand(
        'kivyReloader.showVncPreview2',
        async () => {
            try {
                const panel = VncPreviewPanel.getInstance(context, 2);
                await panel.show();
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to open VNC preview (Instance 2): ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }
    );
    
    // Command: Setup Docker
    const setupDockerCommand = vscode.commands.registerCommand(
        'kivyReloader.setupDocker',
        async () => {
            try {
                vscode.window.showInformationMessage('Starting Docker setup...');
                console.log('Setup Docker command started');
                
                // Check Docker installed
                console.log('Checking if Docker is installed...');
                const dockerInstalled = await DockerManager.checkDockerInstalled();
                console.log('Docker installed:', dockerInstalled);
                
                if (!dockerInstalled) {
                    const result = await vscode.window.showErrorMessage(
                        'Docker is not installed. Please install Docker Desktop first.',
                        'Open Docker Website'
                    );
                    if (result === 'Open Docker Website') {
                        vscode.env.openExternal(vscode.Uri.parse('https://www.docker.com/get-started'));
                    }
                    return;
                }
                
                // Check Docker running
                console.log('Checking if Docker is running...');
                const dockerRunning = await DockerManager.checkDockerRunning();
                console.log('Docker running:', dockerRunning);
                
                if (!dockerRunning) {
                    vscode.window.showErrorMessage('Docker is not running. Please start Docker Desktop.');
                    return;
                }
                
                // Build image
                console.log('Building Docker image from:', context.extensionPath);
                await DockerManager.buildImage(context.extensionPath);
                console.log('Image built successfully');
                
                // Ask to start container
                const result = await vscode.window.showInformationMessage(
                    'Docker image built. Start hot reload server now?',
                    'Yes', 'No'
                );
                
                if (result === 'Yes') {
                    vscode.commands.executeCommand('kivyReloader.startContainer');
                }
            } catch (error) {
                console.error('Setup failed:', error);
                vscode.window.showErrorMessage(`Setup failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    );
    
    // Command: Start Container
    const startContainerCommand = vscode.commands.registerCommand(
        'kivyReloader.startContainer',
        async () => {
            try {
                // Check if already running
                if (await DockerManager.isContainerRunning()) {
                    vscode.window.showInformationMessage('✅ Hot reload server is already running');
                    return;
                }
                
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders || workspaceFolders.length === 0) {
                    vscode.window.showWarningMessage('No workspace folder open');
                    return;
                }
                
                const projectPath = workspaceFolders[0].uri.fsPath;
                await DockerManager.startContainer(projectPath);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to start: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    );
    
    // Command: Stop Container
    const stopContainerCommand = vscode.commands.registerCommand(
        'kivyReloader.stopContainer',
        async () => {
            try {
                await DockerManager.stopContainer();
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to stop: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    );
    
    // Command: Check Status
    const checkStatusCommand = vscode.commands.registerCommand(
        'kivyReloader.checkStatus',
        async () => {
            try {
                const status = await DockerManager.getStatus();
                vscode.window.showInformationMessage(`Docker Status: ${status}`);
            } catch (error) {
                vscode.window.showErrorMessage(`Status check failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    );
    
    // Auto-send on text change with debounce
    const changeListener = vscode.workspace.onDidChangeTextDocument(event => {
        const document = event.document;
        
        // Skip non-file documents (like settings, output panels, etc)
        if (document.uri.scheme !== 'file') {
            return;
        }
        
        const filePath = document.uri.fsPath;
        
        // Check by file extension since .kv might not be registered
        if (filePath.endsWith('.kv') || filePath.endsWith('.py')) {
            // Clear existing timer
            if (autoSendTimer) {
                clearTimeout(autoSendTimer);
            }
            
            // Set new timer for 2 seconds
            autoSendTimer = setTimeout(async () => {
                try {
                    const projectPath = findProjectRoot(filePath);
                    
                    if (projectPath) {
                        await hotReloader.sendUpdate([filePath], projectPath);
                    }
                } catch (error) {
                    console.error('Auto-send failed:', error);
                }
            }, 2000);
        }
    });
    
    context.subscriptions.push(
        sendFileCommand,
        deployFullProjectCommand,
        toggleAutoSendCommand,
        vncPreviewCommand,
        vncPreview1Command,
        vncPreview2Command,
        setupDockerCommand,
        startContainerCommand,
        stopContainerCommand,
        checkStatusCommand,
        changeListener
    );
}

export function deactivate() {
    if (autoSendTimer) {
        clearTimeout(autoSendTimer);
    }
}

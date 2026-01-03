import * as vscode from 'vscode';

interface VncInstance {
    port: number;
    display: string;
    name: string;
}

const VNC_INSTANCES: VncInstance[] = [
    { port: 6080, display: ':99', name: 'Instance 1 (Blue App)' },
    { port: 6081, display: ':100', name: 'Instance 2 (Green App)' }
];

export class VncPreviewPanel {
    private static instances: Map<number, VncPreviewPanel> = new Map();
    private panel: vscode.WebviewPanel | undefined;
    private readonly context: vscode.ExtensionContext;
    private readonly instanceNumber: number;
    private readonly vncConfig: VncInstance;

    private constructor(context: vscode.ExtensionContext, instanceNumber: number) {
        this.context = context;
        this.instanceNumber = instanceNumber;
        this.vncConfig = VNC_INSTANCES[instanceNumber - 1];
    }

    public static getInstance(context: vscode.ExtensionContext, instanceNumber: number): VncPreviewPanel {
        if (!VncPreviewPanel.instances.has(instanceNumber)) {
            VncPreviewPanel.instances.set(instanceNumber, new VncPreviewPanel(context, instanceNumber));
        }
        return VncPreviewPanel.instances.get(instanceNumber)!;
    }

    public static async showInstanceSelector(context: vscode.ExtensionContext): Promise<void> {
        const items = VNC_INSTANCES.map((instance, index) => ({
            label: instance.name,
            description: `Port ${instance.port}, Display ${instance.display}`,
            instanceNumber: index + 1
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select VNC instance to preview'
        });

        if (selected) {
            const panel = VncPreviewPanel.getInstance(context, selected.instanceNumber);
            await panel.show();
        }
    }

    public async show(): Promise<void> {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            `vncPreview${this.instanceNumber}`,
            `VNC Live Preview - ${this.vncConfig.name}`,
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.panel.webview.html = this.getWebviewContent();

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(
            message => {
                switch (message.type) {
                    case 'widgetDrop':
                        vscode.window.showInformationMessage(
                            `Widget dropped at (${message.x}, ${message.y}) - VNC coords: (${message.vncX}, ${message.vncY})`
                        );
                        // TODO: Implement collision detection and widget placement
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        }, null, this.context.subscriptions);
    }

    private getWebviewContent(): string {
        const vncUrl = `http://localhost:${this.vncConfig.port}/vnc.html?autoconnect=true&resize=scale&view_clip=false`;
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VNC Live Preview - ${this.vncConfig.name}</title>
    <style>
        body, html {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100vh;
            overflow: hidden;
            background: #1e1e1e;
        }
        #vnc-container {
            position: relative;
            width: 100%;
            height: 100%;
        }
        #vnc-frame {
            width: 100%;
            height: 100%;
            border: none;
        }
        #drop-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 1000;
        }
        #drop-overlay.drag-over {
            background: rgba(0, 122, 204, 0.1);
            border: 2px dashed #007acc;
            pointer-events: auto;
        }
        .drop-indicator {
            position: absolute;
            width: 10px;
            height: 10px;
            background: #007acc;
            border-radius: 50%;
            transform: translate(-50%, -50%);
            pointer-events: none;
        }
    </style>
</head>
<body>
    <div id="vnc-container">
        <iframe id="vnc-frame" src="${vncUrl}"></iframe>
        <div id="drop-overlay"></div>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        const overlay = document.getElementById('drop-overlay');
        const vncFrame = document.getElementById('vnc-frame');
        
        // Handle drag over
        overlay.addEventListener('dragover', (e) => {
            e.preventDefault();
            overlay.classList.add('drag-over');
        });
        
        // Handle drag leave
        overlay.addEventListener('dragleave', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('drag-over');
            }
        });
        
        // Handle drop
        overlay.addEventListener('drop', (e) => {
            e.preventDefault();
            overlay.classList.remove('drag-over');
            
            console.log('Drop event detected!', e);
            alert('Drop detected at: ' + e.clientX + ', ' + e.clientY);
            
            const rect = overlay.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Normalize coordinates (0-1 range)
            const normalizedX = x / rect.width;
            const normalizedY = y / rect.height;
            
            // Assume VNC display is 1024x768 (default from Xvfb)
            const vncX = Math.round(normalizedX * 1024);
            const vncY = Math.round(normalizedY * 768);
            
            // Get widget data from drag
            const widgetData = e.dataTransfer?.getData('application/json');
            
            vscode.postMessage({
                type: 'widgetDrop',
                x: Math.round(x),
                y: Math.round(y),
                normalizedX: normalizedX,
                normalizedY: normalizedY,
                vncX: vncX,
                vncY: vncY,
                widgetData: widgetData
            });
            
            // Show visual feedback
            const indicator = document.createElement('div');
            indicator.className = 'drop-indicator';
            indicator.style.left = x + 'px';
            indicator.style.top = y + 'px';
            overlay.appendChild(indicator);
            
            setTimeout(() => indicator.remove(), 1000);
        });
        
        // Enable drag events on overlay when drag enters window
        document.addEventListener('dragenter', (e) => {
            overlay.style.pointerEvents = 'auto';
        });
        
        document.addEventListener('dragend', (e) => {
            overlay.classList.remove('drag-over');
            overlay.style.pointerEvents = 'none';
        });
    </script>
</body>
</html>`;
    }
}

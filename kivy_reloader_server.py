#!/usr/bin/env python3
"""
Kivy-Reloader Server for Docker Container
Simulates Android kivy-reloader TCP server to receive hot-reload updates
"""

import socket
import os
import zipfile
import json
import signal
import sys
import subprocess
import toml
from pathlib import Path
from datetime import datetime


class KivyReloaderServer:
    def __init__(self, port=8050, work_dir='/work'):
        self.port = port
        self.work_dir = Path(work_dir)
        self.server = None
        self.running = True
        self.app_process = None
        
    def log(self, message):
        """Print timestamped log message"""
        timestamp = datetime.now().strftime('%H:%M:%S')
        print(f'[{timestamp}] {message}', flush=True)
        
    def signal_handler(self, signum, frame):
        """Handle shutdown signals"""
        self.log('Received shutdown signal, closing server...')
        self.running = False
        
        # Kill app process if running
        if self.app_process:
            self.log('Stopping Kivy app...')
            self.app_process.terminate()
            try:
                self.app_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.app_process.kill()
        
        if self.server:
            self.server.close()
        sys.exit(0)
        
    def process_update(self, zip_data):
        """Process received ZIP update"""
        try:
            # Save ZIP to temporary file
            zip_path = '/tmp/app_update.zip'
            with open(zip_path, 'wb') as f:
                f.write(zip_data)
            
            self.log(f'Received {len(zip_data)} bytes, extracting...')
            
            # Extract files
            with zipfile.ZipFile(zip_path, 'r') as zip_file:
                # Read metadata if present
                if '_delta_metadata.json' in zip_file.namelist():
                    metadata = json.loads(zip_file.read('_delta_metadata.json'))
                    update_type = metadata.get('type', 'unknown')
                    file_count = metadata.get('file_count', 0)
                    files = metadata.get('files', [])
                    deleted_files = metadata.get('deleted_files', [])
                    
                    self.log(f"Processing {update_type} update with {file_count} file(s)")
                    
                    # Extract changed files
                    for file_name in files:
                        if file_name != '_delta_metadata.json':
                            try:
                                # Extract to work directory
                                target_path = self.work_dir / file_name
                                target_path.parent.mkdir(parents=True, exist_ok=True)
                                
                                with zip_file.open(file_name) as source:
                                    with open(target_path, 'wb') as target:
                                        target.write(source.read())
                                
                                self.log(f'  ✓ Updated: {file_name}')
                            except Exception as e:
                                self.log(f'  ✗ Error updating {file_name}: {e}')
                    
                    # Delete removed files
                    for file_name in deleted_files:
                        file_path = self.work_dir / file_name
                        if file_path.exists():
                            try:
                                file_path.unlink()
                                self.log(f'  ✓ Deleted: {file_name}')
                            except Exception as e:
                                self.log(f'  ✗ Error deleting {file_name}: {e}')
                    
                    # If this is a full deployment, start the app
                    if update_type == 'full':
                        self.log('Full deployment detected, starting Kivy app...')
                        self.run_kivy_app()
                else:
                    # Full transfer - extract all files
                    self.log('Processing full update (no metadata)')
                    zip_file.extractall(self.work_dir)
                    file_count = len(zip_file.namelist())
                    self.log(f'  ✓ Extracted {file_count} file(s)')
            
            # Clean up temporary ZIP
            os.remove(zip_path)
            
            self.log('✅ Hot reload completed successfully')
            return True
            
        except Exception as e:
            self.log(f'❌ Error processing update: {e}')
            return False
    
    def run_kivy_app(self):
        """Start the Kivy application using uv"""
        try:
            # Kill existing app process if running
            if self.app_process and self.app_process.poll() is None:
                self.log('Stopping existing Kivy app...')
                self.app_process.terminate()
                try:
                    self.app_process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    self.app_process.kill()
                    self.app_process.wait()
            
            # Look for pyproject.toml in work directory
            pyproject_file = self.work_dir / 'pyproject.toml'
            
            if not pyproject_file.exists():
                self.log(f'⚠️  No pyproject.toml found in {self.work_dir}, app not started')
                return False
            
            # Parse pyproject.toml to get script name
            try:
                config = toml.load(pyproject_file)
                scripts = config.get('project', {}).get('scripts', {})
                
                if not scripts:
                    self.log('⚠️  No [project.scripts] found in pyproject.toml')
                    return False
                
                # Get the first script name
                script_name = next(iter(scripts.keys()))
                self.log(f'📋 Found script in pyproject.toml: {script_name}')
                
            except Exception as e:
                self.log(f'❌ Error parsing pyproject.toml: {e}')
                return False
            
            # Find uv binary
            uv_path = '/root/.local/bin/uv'
            if not os.path.exists(uv_path):
                self.log(f'❌ uv not found at {uv_path}')
                return False
            
            # Start the Kivy app using uv
            self.log(f'🚀 Starting Kivy app with: {uv_path} run --reinstall {script_name}')
            
            # Prepare environment with proper PATH
            env = os.environ.copy()
            env['DISPLAY'] = ':99'
            env['PATH'] = '/root/.local/bin:' + env.get('PATH', '')
            
            self.app_process = subprocess.Popen(
                [uv_path, 'run', '--reinstall', script_name],
                cwd=str(self.work_dir),
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                bufsize=1,
                universal_newlines=True
            )
            
            self.log(f'✅ Kivy app started with PID {self.app_process.pid}')
            return True
            
        except Exception as e:
            self.log(f'❌ Error starting Kivy app: {e}')
            return False
    
    def start(self):
        """Start the TCP server"""
        # Set up signal handlers
        signal.signal(signal.SIGINT, self.signal_handler)
        signal.signal(signal.SIGTERM, self.signal_handler)
        
        # Create socket
        self.server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        
        try:
            self.server.bind(('0.0.0.0', self.port))
            self.server.listen(5)
            self.log(f'🚀 Kivy-Reloader server listening on port {self.port}')
            self.log(f'📁 Working directory: {self.work_dir}')
            
            while self.running:
                try:
                    # Set timeout to allow checking self.running
                    self.server.settimeout(1.0)
                    
                    try:
                        client, addr = self.server.accept()
                    except socket.timeout:
                        continue
                    
                    self.log(f'📥 Connection from {addr[0]}:{addr[1]}')
                    
                    # Receive ZIP data
                    data = b''
                    client.settimeout(5.0)  # 5 second timeout for receiving data
                    
                    while True:
                        try:
                            chunk = client.recv(256 * 1024)  # 256KB chunks
                            if not chunk:
                                break
                            data += chunk
                        except socket.timeout:
                            self.log('⚠️  Receive timeout, processing what we have...')
                            break
                    
                    # Process the update
                    if data:
                        success = self.process_update(data)
                        
                        # Send ACK
                        if success:
                            client.sendall(b'OK')
                            self.log('📤 Sent ACK to client')
                        else:
                            client.sendall(b'ERROR')
                            self.log('📤 Sent ERROR to client')
                    else:
                        self.log('⚠️  No data received')
                        client.sendall(b'ERROR: No data')
                    
                    client.close()
                    
                except Exception as e:
                    self.log(f'Error handling client: {e}')
                    try:
                        client.close()
                    except:
                        pass
                    
        except Exception as e:
            self.log(f'Server error: {e}')
        finally:
            if self.server:
                self.server.close()
                self.log('Server closed')


def main():
    # Get configuration from environment variables
    port = int(os.environ.get('RELOADER_PORT', 8050))
    work_dir = os.environ.get('WORK_DIR', '/work')
    
    # Create and start server
    server = KivyReloaderServer(port=port, work_dir=work_dir)
    server.start()


if __name__ == '__main__':
    main()

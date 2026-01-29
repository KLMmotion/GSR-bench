#!/usr/bin/env python3
"""
Configuration server for 3D Desktop Organizer Simulator
Handles saving, loading, and managing environment configurations
"""

import http.server
import socketserver
import json
import yaml
import os
from urllib.parse import urlparse, parse_qs
import threading
import time
from datetime import datetime

class ConfigHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        self.config_file = '../saved_configs.yaml'
        super().__init__(*args, **kwargs)

    def do_GET(self):
        """Handle GET requests"""
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        
        if path == '/list_configs':
            self.handle_list_configs()
        elif path.startswith('/load_config/'):
            config_number = path.split('/')[-1]
            self.handle_load_config(config_number)
        else:
            # Serve static files
            super().do_GET()

    def do_POST(self):
        """Handle POST requests"""
        if self.path == '/save_config':
            self.handle_save_config()
        else:
            self.send_error(404)

    def do_DELETE(self):
        """Handle DELETE requests"""
        if self.path.startswith('/delete_config/'):
            config_number = self.path.split('/')[-1]
            self.handle_delete_config(config_number)
        else:
            self.send_error(404)

    def send_json_response(self, data, status=200):
        """Send JSON response"""
        self.send_response(status)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        
        response = json.dumps(data, ensure_ascii=False, indent=2)
        self.wfile.write(response.encode('utf-8'))

    def do_OPTIONS(self):
        """Handle CORS preflight requests"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def load_configs(self):
        """Load configurations from YAML file"""
        try:
            if not os.path.exists(self.config_file):
                return {'configs': []}
                
            with open(self.config_file, 'r', encoding='utf-8') as file:
                data = yaml.safe_load(file)
                return data if data else {'configs': []}
        except Exception as e:
            print(f"Error loading configs: {e}")
            return {'configs': []}

    def save_configs(self, data):
        """Save configurations to YAML file"""
        try:
            with open(self.config_file, 'w', encoding='utf-8') as file:
                yaml.dump(data, file, default_flow_style=False, allow_unicode=True, 
                         sort_keys=False, width=1000)
            return True
        except Exception as e:
            print(f"Error saving configs: {e}")
            return False

    def handle_save_config(self):
        """Handle saving a new configuration"""
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            new_config = json.loads(post_data.decode('utf-8'))
            
            # Load existing configurations
            data = self.load_configs()
            configs = data.get('configs', [])
            
            # Find next available number
            existing_numbers = [config.get('number', 0) for config in configs]
            next_number = max(existing_numbers, default=0) + 1
            
            # Set configuration number and update name
            new_config['number'] = next_number
            if not new_config.get('name') or new_config['name'].startswith('配置_'):
                new_config['name'] = f'配置_{next_number}'
            
            # Add timestamp
            new_config['created'] = datetime.now().strftime('%Y/%m/%d %H:%M:%S')
            
            # Add to list
            configs.append(new_config)
            data['configs'] = configs
            
            # Save to file
            if self.save_configs(data):
                self.send_json_response({
                    'success': True,
                    'number': next_number,
                    'message': f'Configuration #{next_number} saved successfully'
                })
                print(f"Saved configuration #{next_number}")
            else:
                self.send_json_response({
                    'success': False,
                    'error': 'Failed to save configuration to file'
                }, 500)
                
        except Exception as e:
            print(f"Error in handle_save_config: {e}")
            self.send_json_response({
                'success': False,
                'error': str(e)
            }, 500)

    def handle_load_config(self, config_number):
        """Handle loading a specific configuration"""
        try:
            config_num = int(config_number)
            data = self.load_configs()
            configs = data.get('configs', [])
            
            # Find configuration by number
            target_config = None
            for config in configs:
                if config.get('number') == config_num:
                    target_config = config
                    break
            
            if target_config:
                self.send_json_response({
                    'success': True,
                    'config': target_config
                })
                print(f"Loaded configuration #{config_num}")
            else:
                self.send_json_response({
                    'success': False,
                    'error': f'Configuration #{config_num} not found'
                }, 404)
                
        except ValueError:
            self.send_json_response({
                'success': False,
                'error': 'Invalid configuration number'
            }, 400)
        except Exception as e:
            print(f"Error in handle_load_config: {e}")
            self.send_json_response({
                'success': False,
                'error': str(e)
            }, 500)

    def handle_list_configs(self):
        """Handle listing all configurations"""
        try:
            data = self.load_configs()
            configs = data.get('configs', [])
            
            # Sort by number
            configs.sort(key=lambda x: x.get('number', 0))
            
            self.send_json_response({
                'success': True,
                'configs': configs,
                'count': len(configs)
            })
            print(f"Listed {len(configs)} configurations")
            
        except Exception as e:
            print(f"Error in handle_list_configs: {e}")
            self.send_json_response({
                'success': False,
                'error': str(e)
            }, 500)

    def handle_delete_config(self, config_number):
        """Handle deleting a specific configuration"""
        try:
            config_num = int(config_number)
            data = self.load_configs()
            configs = data.get('configs', [])
            
            # Find and remove configuration by number
            original_count = len(configs)
            configs = [config for config in configs if config.get('number') != config_num]
            
            if len(configs) < original_count:
                data['configs'] = configs
                if self.save_configs(data):
                    self.send_json_response({
                        'success': True,
                        'message': f'Configuration #{config_num} deleted successfully'
                    })
                    print(f"Deleted configuration #{config_num}")
                else:
                    self.send_json_response({
                        'success': False,
                        'error': 'Failed to save changes to file'
                    }, 500)
            else:
                self.send_json_response({
                    'success': False,
                    'error': f'Configuration #{config_num} not found'
                }, 404)
                
        except ValueError:
            self.send_json_response({
                'success': False,
                'error': 'Invalid configuration number'
            }, 400)
        except Exception as e:
            print(f"Error in handle_delete_config: {e}")
            self.send_json_response({
                'success': False,
                'error': str(e)
            }, 500)

    def log_message(self, format, *args):
        """Override log message to reduce noise"""
        # Only log errors and important requests
        if any(keyword in format % args for keyword in ['POST', 'DELETE', 'error', 'Error']):
            super().log_message(format, *args)

def start_config_server(port=8080):
    """Start the configuration server"""
    print(f"Starting configuration server on port {port}...")
    
    with socketserver.TCPServer(("", port), ConfigHandler) as httpd:
        print(f"Configuration server running at http://localhost:{port}")
        print("Press Ctrl+C to stop the server")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down configuration server...")
            httpd.shutdown()

if __name__ == "__main__":
    import sys
    
    port = 8080
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print(f"Invalid port number: {sys.argv[1]}")
            sys.exit(1)
    
    start_config_server(port)
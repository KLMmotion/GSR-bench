#!/usr/bin/env python3
"""
Agent Terminal Assistant UI - Simplified Version
Compact interface for agent interaction with ROS topic communication
"""

import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox
import tkinter.font as tkfont
import threading
import subprocess
import time
import queue
import re
from datetime import datetime
import os
import sys

try:
    import rclpy
    from rclpy.node import Node
    from std_msgs.msg import String, Bool
    ROS_AVAILABLE = True
except ImportError:
    ROS_AVAILABLE = False
    print("ROS2 not available, running in simulation mode")

class AgentTerminalUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Agent Terminal")
        self.root.geometry("600x700")
        self.root.configure(bg='#f0f0f0')
        self.root.resizable(False, False)
        
        self.setup_fonts()
        
        # State variables
        self.agent_process = None
        self.ros_node = None
        self.is_connected = False
        self.current_status = "IDLE"
        self.task_active = False
        
        # Quick action templates
        self.quick_actions = [
            "Put all the cubes into their corresponding colored boxes",
            "move all boxes in one stack", 
            "move cube on table",
            "move cube in box"
        ]
        
        self.setup_ui()
        self.setup_ros_if_available()
        self.update_status_display()
        
    def setup_ui(self):
        """Setup the simplified UI interface"""
        # Main container
        main_frame = tk.Frame(self.root, bg='#f0f0f0')
        main_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # Top control panel
        self.create_control_panel(main_frame)
        
        # Agent status panel
        self.create_status_panel(main_frame)
        
        # Task input panel
        self.create_task_input_panel(main_frame)
        
        # Current action display
        self.create_action_display(main_frame)
        
        # Message log
        self.create_message_log(main_frame)
        
        # Scene graph display
        self.create_scene_graph_display(main_frame)
        
    def create_control_panel(self, parent):
        """Create control panel"""
        control_frame = tk.Frame(parent, bg='#ffffff', relief=tk.RAISED, bd=1)
        control_frame.pack(fill=tk.X, pady=(0, 10))
        
        # Left side - Connection status
        left_section = tk.Frame(control_frame, bg='#ffffff')
        left_section.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=10, pady=8)
        
        # Connection indicator
        conn_frame = tk.Frame(left_section, bg='#ffffff')
        conn_frame.pack(anchor=tk.W)
        
        self.connection_light = tk.Label(conn_frame, text="●", 
                                         font=self.fonts['huge'], fg='red', bg='#ffffff')
        self.connection_light.pack(side=tk.LEFT)
        
        tk.Label(conn_frame, text="Agent Connection", 
                font=self.fonts['medium_bold'], bg='#ffffff').pack(side=tk.LEFT, padx=(5, 0))
        
        # Right side - Control buttons
        right_section = tk.Frame(control_frame, bg='#ffffff')
        right_section.pack(side=tk.RIGHT, padx=10, pady=8)
        
        self.start_btn = tk.Button(right_section, text="Start Agent", 
                                  command=self.start_agent,
                                  bg='#28a745', fg='white',
                                  font=self.fonts['normal'], padx=15, pady=5)
        self.start_btn.pack(side=tk.LEFT, padx=2)
        
        self.stop_btn = tk.Button(right_section, text="Stop Agent", 
                                 command=self.stop_agent,
                                 bg='#dc3545', fg='white',
                                 font=self.fonts['normal'], padx=15, pady=5, state=tk.DISABLED)
        self.stop_btn.pack(side=tk.LEFT, padx=2)
        
        self.exit_btn = tk.Button(right_section, text="Exit", 
                                 command=self.exit_application,
                                 bg='#6c757d', fg='white',
                                 font=self.fonts['normal'], padx=15, pady=5)
        self.exit_btn.pack(side=tk.LEFT, padx=2)
        
        # Manual trigger button for agent
        self.trigger_btn = tk.Button(right_section, text="⚡", 
                                   command=self.manual_trigger,
                                   bg='#ffc107', fg='black',
                                   font=self.fonts['normal'], 
                                   padx=8, pady=5)
        self.trigger_btn.pack(side=tk.LEFT, padx=2)
        
    def create_status_panel(self, parent):
        """Create status panel"""
        status_frame = tk.Frame(parent, bg='#ffffff', relief=tk.RAISED, bd=1)
        status_frame.pack(fill=tk.X, pady=(0, 10))
        
        tk.Label(status_frame, text="Status:", 
                font=self.fonts['medium_bold'], bg='#ffffff').pack(side=tk.LEFT, padx=10, pady=5)
        
        self.status_label = tk.Label(status_frame, text="IDLE", 
                                    font=self.fonts['medium'], bg='#ffffff')
        self.status_label.pack(side=tk.LEFT, padx=5, pady=5)
        
        self.loading_label = tk.Label(status_frame, text="", 
                                    font=self.fonts['medium'], bg='#ffffff')
        self.loading_label.pack(side=tk.LEFT, padx=5, pady=5)
        
        # Reset button
        self.reset_btn = tk.Button(status_frame, text="🔄 Reset", 
                                 command=self.reset_ui,
                                 bg='#17a2b8', fg='white',
                                 font=self.fonts['normal'], padx=10, pady=2)
        self.reset_btn.pack(side=tk.RIGHT, padx=10, pady=5)
        
    def create_task_input_panel(self, parent):
        """Create task input panel"""
        input_frame = tk.Frame(parent, bg='#ffffff', relief=tk.RAISED, bd=1)
        input_frame.pack(fill=tk.X, pady=(0, 10))
        
        # Quick actions - hidden scrollable design
        quick_frame = tk.Frame(input_frame, bg='#ffffff')
        quick_frame.pack(fill=tk.X, padx=10, pady=(10, 5))
        
        # Quick actions label and hint
        quick_label_frame = tk.Frame(quick_frame, bg='#ffffff')
        quick_label_frame.pack(fill=tk.X)
        
        tk.Label(quick_label_frame, text="Quick Actions (scroll with mouse wheel):", 
                font=self.fonts['normal_bold'], bg='#ffffff').pack(side=tk.LEFT)
        
        # Current quick action display
        self.quick_action_display = tk.Label(quick_label_frame, 
                                           text="1/4 - Put all the cubes into their corresponding colored boxes", 
                                           font=self.fonts['small'], fg='#666666', bg='#ffffff')
        self.quick_action_display.pack(side=tk.RIGHT)
        
        # Hidden quick action selector frame
        self.quick_selector_frame = tk.Frame(quick_frame, bg='#f8f9fa', relief=tk.SUNKEN, bd=1, height=30)
        self.quick_selector_frame.pack(fill=tk.X, pady=(5, 0))
        self.quick_selector_frame.pack_propagate(False)
        
        # Current selected action display
        self.current_action_label = tk.Label(self.quick_selector_frame, 
                                             text="Put all the cubes into their corresponding colored boxes", 
                                             font=self.fonts['normal'], bg='#f8f9fa', fg='#333333')
        self.current_action_label.pack(expand=True)
        
        # Bind mouse wheel events to the frame and all its children
        self.quick_selector_frame.bind('<MouseWheel>', self.on_mouse_wheel)
        self.quick_selector_frame.bind('<Button-4>', self.on_mouse_wheel)  # Linux
        self.quick_selector_frame.bind('<Button-5>', self.on_mouse_wheel)  # Linux
        self.current_action_label.bind('<MouseWheel>', self.on_mouse_wheel)
        self.current_action_label.bind('<Button-4>', self.on_mouse_wheel)
        self.current_action_label.bind('<Button-5>', self.on_mouse_wheel)
        
        # Add hover effect to show it's interactive
        self.quick_selector_frame.bind('<Enter>', lambda e: self.quick_selector_frame.config(bg='#e8f4f8'))
        self.quick_selector_frame.bind('<Leave>', lambda e: self.quick_selector_frame.config(bg='#f8f9fa'))
        
        # Quick action selector index
        self.current_quick_action_index = 0
        
        # Custom task input
        task_frame = tk.Frame(input_frame, bg='#ffffff')
        task_frame.pack(fill=tk.X, padx=10, pady=(10, 10))
        
        tk.Label(task_frame, text="Task:", 
                font=self.fonts['normal_bold'], bg='#ffffff').pack(side=tk.LEFT)
        
        self.task_entry = tk.Entry(task_frame, font=self.fonts['normal'], width=40)
        self.task_entry.pack(side=tk.LEFT, padx=10, fill=tk.X, expand=True)
        
        self.send_btn = tk.Button(task_frame, text="Send", 
                                 command=self.send_task_command,
                                 bg='#007bff', fg='white',
                                 font=self.fonts['normal'], padx=15, pady=2)
        self.send_btn.pack(side=tk.LEFT, padx=5)
        
        # Use button for current quick action
        self.use_quick_btn = tk.Button(task_frame, text="Use Selected", 
                                      command=self.use_selected_quick_action,
                                      bg='#28a745', fg='white',
                                      font=self.fonts['small'], padx=10, pady=2)
        self.use_quick_btn.pack(side=tk.LEFT, padx=5)
        
    def create_action_display(self, parent):
        """Create current action display"""
        action_frame = tk.LabelFrame(parent, text="Current Action", 
                                   font=self.fonts['large_bold'], bg='#ffffff')
        action_frame.pack(fill=tk.X, pady=(0, 10))
        
        self.action_display = tk.Text(action_frame, 
                                    font=self.fonts['xlarge_bold'], 
                                    bg='#f8f9fa', height=3, wrap=tk.WORD)
        self.action_display.pack(fill=tk.X, padx=10, pady=10)
        self.action_display.insert(1.0, "Waiting for task...")
        self.action_display.tag_add("waiting", "1.0", tk.END)
        self.action_display.tag_config("waiting", foreground="black", font=self.fonts['large'])
        self.action_display.config(state=tk.DISABLED)
        
    def create_message_log(self, parent):
        """Create message log"""
        log_frame = tk.LabelFrame(parent, text="Messages", 
                                 font=self.fonts['medium_bold'], bg='#ffffff')
        log_frame.pack(fill=tk.X, pady=(0, 5))
        
        self.message_log = scrolledtext.ScrolledText(log_frame, 
                                                     font=self.fonts['mono_small'],
                                                     bg='#f8f9fa', height=1, wrap=tk.WORD)
        self.message_log.pack(fill=tk.X, padx=10, pady=5)
        
    def create_scene_graph_display(self, parent):
        """Create scene graph display window"""
        scene_frame = tk.LabelFrame(parent, text="Scene Graph", 
                                  font=self.fonts['medium_bold'], bg='#ffffff')
        scene_frame.pack(fill=tk.BOTH, expand=True)
        
        self.scene_graph_display = scrolledtext.ScrolledText(scene_frame, 
                                                            font=self.fonts['mono_small'],
                                                            bg='#f8f9fa', height=4, wrap=tk.WORD)
        self.scene_graph_display.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
        self.scene_graph_display.insert(1.0, "Waiting for scene graph data...")
        self.scene_graph_display.config(state=tk.DISABLED)
        
    def setup_ros_if_available(self):
        """Setup ROS node if available"""
        if not ROS_AVAILABLE:
            self.log_message("ROS2 not available - running in simulation mode")
            return
            
        try:
            rclpy.init()
            self.ros_node = AgentTerminalNode(self)
            
            # Start ROS spin thread
            self.ros_thread = threading.Thread(target=self.ros_spin, daemon=True)
            self.ros_thread.start()
            
            self.log_message("ROS2 node initialized successfully")
            self.update_connection_status(True)
            
        except Exception as e:
            self.log_message(f"Failed to initialize ROS2: {e}")
            
    def ros_spin(self):
        """ROS spin loop"""
        while rclpy.ok():
            rclpy.spin_once(self.ros_node, timeout_sec=0.1)
            
    def update_connection_status(self, connected):
        """Update connection status display"""
        self.is_connected = connected
        if connected:
            self.connection_light.config(fg='green')
        else:
            self.connection_light.config(fg='red')
            
    def update_status_display(self):
        """Update status display with loading animation"""
        self.status_label.config(text=self.current_status)
        
        # Update loading animation
        if self.task_active:
            loading_frames = ["◐", "◓", "◑", "◒"]
            current_frame = loading_frames[int(time.time() * 3) % 4]
            self.loading_label.config(text=current_frame)
        else:
            self.loading_label.config(text="")
            
        self.root.after(200, self.update_status_display)
        
    def set_task_command(self, command):
        """Set task command from quick action"""
        self.task_entry.delete(0, tk.END)
        self.task_entry.insert(0, command)
        
    def on_mouse_wheel(self, event):
        """Handle mouse wheel scrolling for quick actions"""
        # Determine scroll direction
        if event.delta:
            # Windows/macOS
            if event.delta > 0:
                # Scroll up
                self.current_quick_action_index = (self.current_quick_action_index - 1) % len(self.quick_actions)
            else:
                # Scroll down
                self.current_quick_action_index = (self.current_quick_action_index + 1) % len(self.quick_actions)
        else:
            # Linux
            if event.num == 4:
                # Scroll up
                self.current_quick_action_index = (self.current_quick_action_index - 1) % len(self.quick_actions)
            elif event.num == 5:
                # Scroll down
                self.current_quick_action_index = (self.current_quick_action_index + 1) % len(self.quick_actions)
        
        # Update display
        self.update_quick_action_display()
        
        # Visual feedback - briefly highlight the selector frame
        self.quick_selector_frame.config(bg='#e3f2fd')
        self.root.after(150, lambda: self.quick_selector_frame.config(bg='#f8f9fa'))
        
        # Prevent event propagation
        return 'break'
        
    def update_quick_action_display(self):
        """Update the quick action display"""
        current_action = self.quick_actions[self.current_quick_action_index]
        action_number = self.current_quick_action_index + 1
        total_actions = len(self.quick_actions)
        
        # Update the counter display
        self.quick_action_display.config(text=f"{action_number}/{total_actions} - {current_action[:30]}...")
        
        # Update the current action label
        self.current_action_label.config(text=current_action)
        
    def use_selected_quick_action(self):
        """Use the currently selected quick action"""
        selected_action = self.quick_actions[self.current_quick_action_index]
        self.set_task_command(selected_action)
        
        # Visual feedback
        self.use_quick_btn.config(bg='#20c997')
        self.root.after(200, lambda: self.use_quick_btn.config(bg='#28a745'))
        
    def send_task_command(self):
        """Send task command to agent"""
        command = self.task_entry.get().strip()
        if not command:
            messagebox.showwarning("Input Error", "Please enter a task command")
            return
            
        if not self.is_connected:
            messagebox.showwarning("Connection Error", "Agent not connected. Please start the agent first.")
            return
            
        self.log_message(f"Sending task: {command}")
        
        # Clear action display
        self.action_display.config(state=tk.NORMAL)
        self.action_display.delete(1.0, tk.END)
        self.action_display.insert(1.0, "Agent is planning...")
        self.action_display.tag_add("planning", "1.0", tk.END)
        self.action_display.tag_config("planning", foreground="black", font=self.fonts['large'])
        self.action_display.config(state=tk.DISABLED)
        
        # Publish to ROS topic if available
        if ROS_AVAILABLE and self.ros_node:
            try:
                self.ros_node.publish_task_command(command)
                self.current_status = "PLANNING"
                self.task_active = True
                self.task_entry.config(state=tk.DISABLED)
                self.send_btn.config(state=tk.DISABLED)
            except Exception as e:
                self.log_message(f"Failed to publish command: {e}")
        else:
            # Simulation mode
            self.log_message(f"[SIMULATION] Command would be sent: {command}")
            self.current_status = "PLANNING"
            self.task_active = True
            self.task_entry.config(state=tk.DISABLED)
            self.send_btn.config(state=tk.DISABLED)
            
    def start_agent(self):
        """Start agent process"""
        try:
            # Start agent in background
            self.agent_process = subprocess.Popen(
                [sys.executable, "start_agent.py"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            
            self.start_btn.config(state=tk.DISABLED)
            self.stop_btn.config(state=tk.NORMAL)
            self.log_message("Agent process starting...")
            
            # Wait a moment for agent to initialize
            self.root.after(3000, self.check_agent_status)
            
        except Exception as e:
            self.log_message(f"Failed to start agent: {e}")
            messagebox.showerror("Error", f"Failed to start agent: {e}")
            
    def stop_agent(self):
        """Stop agent process"""
        if self.agent_process:
            try:
                # Terminate the process
                self.agent_process.terminate()
                self.agent_process.wait(timeout=5)
                
                self.agent_process = None
                self.start_btn.config(state=tk.NORMAL)
                self.stop_btn.config(state=tk.DISABLED)
                self.log_message("Agent process stopped")
                self.update_connection_status(False)
                
            except subprocess.TimeoutExpired:
                # Force kill if terminate doesn't work
                self.agent_process.kill()
                self.agent_process = None
                self.start_btn.config(state=tk.NORMAL)
                self.stop_btn.config(state=tk.DISABLED)
                self.log_message("Agent process force killed")
            except Exception as e:
                self.log_message(f"Error stopping agent: {e}")
                
    def check_agent_status(self):
        """Check if agent is running properly"""
        if self.agent_process and self.agent_process.poll() is None:
            self.log_message("Agent process running successfully")
            self.update_connection_status(True)
        else:
            self.log_message("Agent process failed to start")
            self.update_connection_status(False)
            
    def exit_application(self):
        """Exit the application"""
        if messagebox.askyesno("Exit", "Are you sure you want to exit?"):
            self.cleanup()
            self.root.quit()
            
    def log_message(self, message):
        """Log message to the message log"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        formatted_message = f"[{timestamp}] {message}\n"
        
        self.message_log.insert(tk.END, formatted_message)
        self.message_log.see(tk.END)
        
        # Keep log manageable
        lines = int(self.message_log.index('end-1c').split('.')[0])
        if lines > 50:
            self.message_log.delete(1.0, 2.0)
            
    def handle_instruction_received(self, instruction):
        """Handle received instruction message"""
        self.current_status = "EXECUTING"
        self.task_active = True
        
        # Update action display with green color and larger font
        self.action_display.config(state=tk.NORMAL)
        self.action_display.delete(1.0, tk.END)
        self.action_display.insert(1.0, instruction)
        self.action_display.tag_add("action", "1.0", tk.END)
        self.action_display.tag_config("action", foreground="orange", font=self.fonts['xlarge_bold'])
        self.action_display.config(state=tk.DISABLED)
        
        self.log_message(f"Agent action: {instruction[:50]}...")
        
    def handle_trigger_received(self, trigger_value):
        """Handle received trigger message"""
        self.current_status = "PLANNING"
        self.task_active = True
        
        self.log_message("Action completed, continuing planning")
        
        # Clear action display with smaller black font
        self.action_display.config(state=tk.NORMAL)
        self.action_display.delete(1.0, tk.END)
        self.action_display.insert(1.0, "Planning next action...")
        self.action_display.tag_add("planning", "1.0", tk.END)
        self.action_display.tag_config("planning", foreground="black", font=self.fonts['large'])
        self.action_display.config(state=tk.DISABLED)
        
    def handle_agent_over(self, message):
        """Handle agent completion message"""
        self.current_status = "IDLE"
        self.task_active = False
        self.task_entry.config(state=tk.NORMAL)
        self.send_btn.config(state=tk.NORMAL)
        
        # Update action display with green color and larger font
        # Display the original message from /agent_over topic
        self.action_display.config(state=tk.NORMAL)
        self.action_display.delete(1.0, tk.END)
        self.action_display.insert(1.0, "Task completed!")
        self.action_display.insert(2.0, f"\n{message}")
        self.action_display.tag_add("completed", "1.0", "2.0")
        self.action_display.tag_add("message", "2.0", tk.END)
        self.action_display.tag_config("completed", foreground="green", font=self.fonts['normal_bold'])
        self.action_display.tag_config("message", foreground="green", font=self.fonts['normal'])
        self.action_display.config(state=tk.DISABLED)
        
        self.log_message(f"Task completed: {message[:50]}...")
        
    def reset_ui(self):
        """重置整个UI状态"""
        try:
            self.current_status = "IDLE"
            self.task_active = False
            
            self.task_entry.config(state=tk.NORMAL)
            self.send_btn.config(state=tk.NORMAL)
            self.task_entry.delete(0, tk.END)
            
            self.action_display.config(state=tk.NORMAL)
            self.action_display.delete(1.0, tk.END)
            self.action_display.insert(1.0, "Waiting for task...")
            self.action_display.tag_add("waiting", "1.0", tk.END)
            self.action_display.tag_config("waiting", foreground="black", font=self.fonts['large'])
            self.action_display.config(state=tk.DISABLED)
            
            self.message_log.config(state=tk.NORMAL)
            self.message_log.delete(1.0, tk.END)
            self.message_log.config(state=tk.DISABLED)
            
            self.scene_graph_display.config(state=tk.NORMAL)
            self.scene_graph_display.delete(1.0, tk.END)
            self.scene_graph_display.insert(1.0, "Waiting for scene graph data...")
            self.scene_graph_display.config(state=tk.DISABLED)
            
            self.current_quick_action_index = 0
            self.update_quick_action_display()
            
            self.log_message("UI has been reset")
            
            self.reset_btn.config(bg='#138496')
            self.root.after(200, lambda: self.reset_btn.config(bg='#17a2b8'))
            
        except Exception as e:
            self.log_message(f"Error resetting UI: {e}")
            
    def manual_trigger(self):
        """手动触发agent"""
        if ROS_AVAILABLE and self.ros_node:
            try:
                self.ros_node.publish_trigger()
                self.log_message("Manual trigger sent to agent")
            except Exception as e:
                self.log_message(f"Failed to send trigger: {e}")
        else:
            self.log_message("[SIMULATION] Manual trigger would be sent")
            
    def handle_scene_graph_update(self, msg):
        """
        Handle scene graph update message (String type with JSON data)

        New format: '{"timestamp":1769423107508,"nodes":[...],"edges":[...]}'
        """
        try:
            import json
            from datetime import datetime

            # Parse JSON from String message
            json_str = msg.data
            scene_data = json.loads(json_str)

            # Extract fields
            timestamp = scene_data.get('timestamp', 0)
            nodes = scene_data.get('nodes', [])
            edges = scene_data.get('edges', [])

            # Convert timestamp to readable format
            if timestamp:
                time_str = datetime.fromtimestamp(timestamp / 1000.0).strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
            else:
                time_str = "N/A"

            # Format display text
            display_text = f"🕐 Timestamp: {time_str}\n\n"
            display_text += f"📦 Nodes ({len(nodes)}):\n"
            if nodes:
                # Show nodes as comma-separated list
                nodes_str = ", ".join(str(node) for node in nodes[:10])  # Show first 10 nodes
                display_text += f"  {nodes_str}"
                if len(nodes) > 10:
                    display_text += f" ... (+{len(nodes) - 10} more)"
            display_text += "\n\n"

            display_text += f"🔗 Edges ({len(edges)}):\n"
            for i, edge in enumerate(edges[:8]):  # Show first 8 edges
                display_text += f"  • {edge}\n"
            if len(edges) > 8:
                display_text += f"  ... and {len(edges) - 8} more\n"

            # Update display
            self.scene_graph_display.config(state=tk.NORMAL)
            self.scene_graph_display.delete(1.0, tk.END)
            self.scene_graph_display.insert(1.0, display_text)
            self.scene_graph_display.config(state=tk.DISABLED)

        except json.JSONDecodeError as e:
            self.log_message(f"❌ JSON parsing error: {e}")
            # Show raw data for debugging
            self.scene_graph_display.config(state=tk.NORMAL)
            self.scene_graph_display.delete(1.0, tk.END)
            self.scene_graph_display.insert(1.0, f"Raw data:\n{msg.data[:500]}")
            self.scene_graph_display.config(state=tk.DISABLED)
        except Exception as e:
            self.log_message(f"❌ Error parsing scene graph: {e}")
            # Show raw data for debugging
            self.scene_graph_display.config(state=tk.NORMAL)
            self.scene_graph_display.delete(1.0, tk.END)
            self.scene_graph_display.insert(1.0, f"Error:\n{str(e)}\n\nRaw data:\n{msg.data[:500]}")
            self.scene_graph_display.config(state=tk.DISABLED)
        
    def cleanup(self):
        """Cleanup resources"""
        if self.ros_node:
            rclpy.shutdown()
        if self.agent_process:
            self.agent_process.terminate()

    def setup_fonts(self):
        """设置现代化英文字体配置"""
        import tkinter.font as tkfont
        
        available_fonts = [f.lower() for f in tkfont.families()]
        
        font_preferences = [
            'Bitstream Charter',
            'Charter',
            'Georgia',
            'Times New Roman',
            'Segoe UI',
            'SF Pro Display',
            'Inter',
            'Roboto',             # Google Material Design
            'Ubuntu',
            'Open Sans',
            'Lato',
            'Source Sans Pro',
            'Nunito',
            'Poppins',
            'Helvetica Neue',
            'Helvetica',
            'Arial'
        ]
        
        monospace_preferences = [
            'JetBrains Mono',
            'Fira Code',
            'Source Code Pro',
            'Inconsolata',
            'Roboto Mono',
            'Ubuntu Mono',
            'Consolas',
            'Monaco',
            'DejaVu Sans Mono',
            'Courier New'
        ]
        
        selected_main_font = 'Arial'
        for font in font_preferences:
            if font.lower() in available_fonts:
                selected_main_font = font
                break
        
        if 'bitstream charter' in available_fonts:
            selected_main_font = 'Bitstream Charter'
        elif 'charter' in available_fonts:
            selected_main_font = 'Charter'
        
        selected_mono_font = 'Courier New'
        for font in monospace_preferences:
            if font.lower() in available_fonts:
                selected_mono_font = font
                break
        
        print(f"🎨 选择主字体: {selected_main_font}")
        print(f"🎨 选择等宽字体: {selected_mono_font}")
        
        self.fonts = {
            'tiny': (selected_main_font, 9),
            'small': (selected_main_font, 10),
            'normal': (selected_main_font, 11),
            'medium': (selected_main_font, 12),
            'large': (selected_main_font, 14),
            'xlarge': (selected_main_font, 16),
            'huge': (selected_main_font, 18),
            
            'small_bold': (selected_main_font, 10, 'bold'),
            'normal_bold': (selected_main_font, 11, 'bold'),
            'medium_bold': (selected_main_font, 12, 'bold'),
            'large_bold': (selected_main_font, 14, 'bold'),
            'xlarge_bold': (selected_main_font, 18, 'bold'),
            
            'mono_small': (selected_mono_font, 10),
            'mono_normal': (selected_mono_font, 11),
            'mono_medium': (selected_mono_font, 12),
        }
        
        self.current_font_index = 0
        self.font_options = [
            ('Bitstream Charter', 'JetBrains Mono'),
            ('Charter', 'Fira Code'),
            ('Georgia', 'Source Code Pro'),
            ('Times New Roman', 'Consolas'),
            ('Segoe UI', 'JetBrains Mono'),
            ('Inter', 'Fira Code'),
            ('Roboto', 'Source Code Pro'),
            ('Ubuntu', 'Ubuntu Mono'),
            ('Open Sans', 'Consolas'),
            ('Helvetica', 'Monaco'),
            ('Arial', 'Courier New')
        ]
        
        self.current_main_font = selected_main_font
        self.current_mono_font = selected_mono_font
        
        if '--debug-fonts' in sys.argv:
            print(f"📝 可用字体数量: {len(available_fonts)}")
            print("🎯 推荐字体可用性:")
            for font in font_preferences[:10]:
                available = font.lower() in available_fonts
                status = "✅" if available else "❌"
                print(f"   {status} {font}")
    
    def cycle_font(self):
        """循环切换字体"""
        import tkinter.font as tkfont
        available_fonts = [f.lower() for f in tkfont.families()]
        
        self.current_font_index = (self.current_font_index + 1) % len(self.font_options)
        main_font, mono_font = self.font_options[self.current_font_index]
        
        attempts = 0
        while attempts < len(self.font_options):
            if main_font.lower() in available_fonts:
                break
            self.current_font_index = (self.current_font_index + 1) % len(self.font_options)
            main_font, mono_font = self.font_options[self.current_font_index]
            attempts += 1
        
        self.current_main_font = main_font
        self.current_mono_font = mono_font if mono_font.lower() in available_fonts else 'Courier New'
        
        self.fonts = {
            'tiny': (self.current_main_font, 9),
            'small': (self.current_main_font, 10),
            'normal': (self.current_main_font, 11),
            'medium': (self.current_main_font, 12),
            'large': (self.current_main_font, 14),
            'xlarge': (self.current_main_font, 16),
            'huge': (self.current_main_font, 18),
            'small_bold': (self.current_main_font, 10, 'bold'),
            'normal_bold': (self.current_main_font, 11, 'bold'),
            'medium_bold': (self.current_main_font, 12, 'bold'),
            'large_bold': (self.current_main_font, 14, 'bold'),
            'xlarge_bold': (self.current_main_font, 16, 'bold'),
            'mono_small': (self.current_mono_font, 10),
            'mono_normal': (self.current_mono_font, 11),
            'mono_medium': (self.current_mono_font, 12),
        }
        
        self.apply_fonts_to_widgets()
        
        print(f"🔄 字体已切换: {self.current_main_font} / {self.current_mono_font}")
        self.log_message(f"Font switched to: {self.current_main_font}")
    
    def apply_fonts_to_widgets(self):
        """应用字体到所有组件"""
        try:
            if hasattr(self, 'connection_light'):
                self.connection_light.config(font=self.fonts['huge'])
            if hasattr(self, 'status_label'):
                self.status_label.config(font=self.fonts['medium'])
            if hasattr(self, 'loading_label'):
                self.loading_label.config(font=self.fonts['medium'])
            if hasattr(self, 'action_display'):
                self.action_display.config(font=self.fonts['xlarge_bold'])
            if hasattr(self, 'message_log'):
                self.message_log.config(font=self.fonts['mono_small'])
            
            if hasattr(self, 'start_btn'):
                self.start_btn.config(font=self.fonts['normal'])
            if hasattr(self, 'stop_btn'):
                self.stop_btn.config(font=self.fonts['normal'])
            if hasattr(self, 'exit_btn'):
                self.exit_btn.config(font=self.fonts['normal'])
            if hasattr(self, 'send_btn'):
                self.send_btn.config(font=self.fonts['normal'])
            if hasattr(self, 'use_quick_btn'):
                self.use_quick_btn.config(font=self.fonts['small'])
            if hasattr(self, 'font_btn'):
                self.font_btn.config(font=self.fonts['normal'])
            
            if hasattr(self, 'task_entry'):
                self.task_entry.config(font=self.fonts['normal'])
            if hasattr(self, 'quick_action_display'):
                self.quick_action_display.config(font=self.fonts['small'])
            if hasattr(self, 'current_action_label'):
                self.current_action_label.config(font=self.fonts['normal'])
                
        except Exception as e:
            print(f"字体应用失败: {e}")

class AgentTerminalNode(Node):
    """ROS2 node for agent terminal communication"""
    
    def __init__(self, ui):
        super().__init__('agent_terminal_node')
        self.ui = ui
        
        # Publishers
        self.task_cmd_publisher = self.create_publisher(String, '/task_cmd', 10)
        self.trigger_publisher = self.create_publisher(Bool, '/agent_trigger', 10)
        
        # Subscribers
        self.instruction_subscriber = self.create_subscription(
            String, '/instruction', self.instruction_callback, 10)
        self.trigger_subscriber = self.create_subscription(
            Bool, '/agent_trigger', self.trigger_callback, 10)
        self.agent_over_subscriber = self.create_subscription(
            String, '/agent_over', self.agent_over_callback, 10)
        
        # Scene graph subscriber (String type with JSON data)
        self.scene_graph_subscriber = self.create_subscription(
            String, '/scene_graph', self.scene_graph_callback, 10)
            
    def publish_task_command(self, command):
        """Publish task command to /task_cmd topic"""
        msg = String()
        msg.data = f"task: {command}"
        self.task_cmd_publisher.publish(msg)
        
    def publish_trigger(self):
        """Publish trigger to /agent_trigger topic"""
        msg = Bool()
        msg.data = True
        self.trigger_publisher.publish(msg)
        
    def instruction_callback(self, msg):
        """Handle /instruction messages"""
        self.ui.handle_instruction_received(msg.data)
        
    def trigger_callback(self, msg):
        """Handle /agent_trigger messages"""
        self.ui.handle_trigger_received(msg.data)
        
    def agent_over_callback(self, msg):
        """Handle /agent_over messages"""
        self.ui.handle_agent_over(msg.data)
        
    def scene_graph_callback(self, msg):
        """Handle /scene_graph messages (String with JSON data)"""
        self.ui.handle_scene_graph_update(msg)


def main():
    """Main function"""
    root = tk.Tk()
    app = AgentTerminalUI(root)
    
    # Handle window close
    def on_closing():
        app.cleanup()
        root.destroy()
        
    root.protocol("WM_DELETE_WINDOW", on_closing)
    root.mainloop()


if __name__ == "__main__":
    main()

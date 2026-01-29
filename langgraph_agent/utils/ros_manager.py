"""
ROS2 管理器：管理 ROS2 节点和订阅者
Created: 2024-01-05
Updated: 2025-08-06 - 迁移到 ROS2
"""

import json
import sys
import os
from typing import Optional, Callable

try:
    import rclpy
    from rclpy.node import Node
    from rclpy.qos import QoSProfile, ReliabilityPolicy, HistoryPolicy, DurabilityPolicy
    from std_msgs.msg import String
    import threading
    ROS_AVAILABLE = True
except ImportError:
    print("警告: ROS2 不可用，将使用模拟模式")
    ROS_AVAILABLE = False

try:
    from config import ROS2_CONFIG
except ImportError:
    from langgraph_agent.config import ROS2_CONFIG
    
   
    class MockRclpy:
        def init(self, args=None):
            print("模拟 ROS2 初始化")
        
        def spin_once(self, node, timeout_sec=None):
            import time
            time.sleep(0.01)
        
        def shutdown(self):
            print("模拟 ROS2 关闭")
    
    class MockNode:
        def __init__(self, node_name):
            self.node_name = node_name
            print(f"模拟 ROS2 节点初始化: {node_name}")
        
        def create_subscription(self, msg_type, topic, callback, qos_profile):
            print(f"模拟 ROS2 订阅器: {topic}")
            return MockSubscription()
        
        def create_publisher(self, msg_type, topic, qos_profile):
            print(f"模拟 ROS2 发布器: {topic}")
            return MockPublisher()
        
        def destroy_node(self):
            print("模拟节点销毁")
    
    class MockSubscription:
        def __init__(self):
            pass
    
    class MockPublisher:
        def __init__(self):
            pass
        
        def publish(self, msg):
            print(f"模拟 ROS2 发布消息: {msg.data[:50]}...")
    
    class MockQoSProfile:
        def __init__(self, **kwargs):
            pass
    
    class MockString:
        def __init__(self, data=""):
            self.data = data
    
    rclpy = MockRclpy()
    Node = MockNode
    QoSProfile = MockQoSProfile
    String = MockString
    ReliabilityPolicy = type('ReliabilityPolicy', (), {'RELIABLE': 'reliable', 'BEST_EFFORT': 'best_effort'})()
    HistoryPolicy = type('HistoryPolicy', (), {'KEEP_LAST': 'keep_last', 'KEEP_ALL': 'keep_all'})()
    DurabilityPolicy = type('DurabilityPolicy', (), {'VOLATILE': 'volatile', 'TRANSIENT_LOCAL': 'transient_local'})()
    threading = __import__('threading')

try:
    from config import ROS2_CONFIG
except ImportError:
    from langgraph_agent.config import ROS2_CONFIG


class ROS2Manager:
    """
    ROS2 管理器：处理 ROS2 节点初始化和消息订阅
    """
    
    def __init__(self, scene_graph_callback: Callable[[dict], None], task_cmd_callback: Optional[Callable[[str], None]] = None):
        self.scene_graph_callback = scene_graph_callback
        self.task_cmd_callback = task_cmd_callback
        self.subscriber = None
        self.task_cmd_subscriber = None
        self.completion_publisher = None 
        self.is_initialized = False
        self.node_name = ROS2_CONFIG.get("node_name", "scene_graph_listener")
        self.topic_name = "/scene_graph"
        self.task_cmd_topic = "/task_cmd"  
        self.completion_topic = "/agent_over" 
        self.executor_thread = None
        self.executor = None
        self.node = None
    
    def initialize(self) -> bool:
        """
        初始化 ROS2 节点和订阅者
        
        Returns:
            bool: 初始化是否成功
        """
        try:

            if ROS_AVAILABLE:
                rclpy.init()
                self.node = Node(self.node_name)
            else:
                rclpy.init()
                self.node = Node(self.node_name)

            qos_profile = QoSProfile(
                history=HistoryPolicy.KEEP_LAST,
                depth=10,
                reliability=ReliabilityPolicy.RELIABLE
            )

            print(f"🔧 使用消息类型: std_msgs/msg/String")
            print(f"🔧 订阅话题: {self.topic_name}")

            self.subscriber = self.node.create_subscription(
                String,
                self.topic_name,
                self._ros2_callback,
                qos_profile
            )
            print(f"ROS2 场景图订阅者初始化成功: {self.topic_name}")
            
            standard_qos = QoSProfile(
                history=HistoryPolicy.KEEP_LAST,
                depth=10,
                reliability=ReliabilityPolicy.RELIABLE,
                durability=DurabilityPolicy.VOLATILE
            )

            if self.task_cmd_callback:
                self.task_cmd_subscriber = self.node.create_subscription(
                    String,
                    self.task_cmd_topic,
                    self._task_cmd_callback,
                    standard_qos
                )
                print(f"ROS2 任务指令订阅者初始化成功: {self.task_cmd_topic}")
            
            self.completion_publisher = self.node.create_publisher(
                String,
                self.completion_topic,
                standard_qos
            )
            print(f"ROS2 任务完成发布器初始化成功: {self.completion_topic}")
            
            self._start_executor()
            
            self.is_initialized = True
            return True
        except Exception as e:
            print(f"ROS2 订阅者初始化失败: {e}")
            return False
    
    def _ros2_callback(self, msg):
        """
        场景图消息回调函数 (std_msgs/msg/String)

        新数据格式示例：
        '{"timestamp":1769423107508,"nodes":["table","blue_box",...],"edges":["blue_box(on)table",...]}'

        Args:
            msg: String 消息，data字段包含完整的JSON场景图
        """
        try:
            json_str = msg.data

            if not json_str or not json_str.strip():
                print("⚠️ 收到空的场景图消息")
                return

            scene_graph_data = json.loads(json_str)

            if not isinstance(scene_graph_data, dict):
                print(f"❌ 场景图数据格式错误：期望dict，实际{type(scene_graph_data)}")
                return

            if "nodes" not in scene_graph_data or "edges" not in scene_graph_data:
                print(f"❌ 场景图数据缺少必要字段：{scene_graph_data.keys()}")
                return

            self.scene_graph_callback(scene_graph_data, msg)

        except json.JSONDecodeError as e:
            print(f"❌ JSON 解析错误: {e}")
            print(f"原始数据: {msg.data[:200]}...")
        except Exception as e:
            print(f"❌ ROS2 回调函数错误: {e}")
            print(f"错误详情: {str(e)}")
    
    def _task_cmd_callback(self, msg):
        """
        任务指令回调函数
        
        Args:
            msg: ROS2 任务指令消息
        """
        try:
            task_data = msg.data.strip()
            print(f"📡 收到任务指令: {task_data}")
            
            if task_data.startswith("配置_"):
                task_content = task_data
            else:
                task_content = self._extract_task_content(task_data)
            
            if task_content and self.task_cmd_callback:
                print(f"🎯 提取任务内容: {task_content}")
                self.task_cmd_callback(task_content)
            elif not task_content:
                print(f"⚠️ 无法从消息中提取任务内容: {task_data}")
            
        except Exception as e:
            print(f"❌ 任务指令回调函数错误: {e}")
    
    def _extract_task_content(self, task_data: str) -> str:
        """
        从任务指令数据中提取任务内容
        
        Args:
            task_data: 原始任务数据，如 "task: move box2 to table"
            
        Returns:
            str: 提取的任务内容，如 "move box2 to table"
        """
        import re
        
        pattern = r'^task\s*:\s*(.+)$'
        match = re.match(pattern, task_data.strip(), re.IGNORECASE)
        
        if match:
            return match.group(1).strip()
        
        return ""
    
    def _start_executor(self):
        """启动 ROS2 执行器线程"""
        executor_type = ROS2_CONFIG.get("executor", "single_threaded")
        
        if executor_type == "multi_threaded":
            from rclpy.executors import MultiThreadedExecutor
            self.executor = MultiThreadedExecutor()
        else:
            from rclpy.executors import SingleThreadedExecutor
            self.executor = SingleThreadedExecutor()
        
        self.executor.add_node(self.node)
        
        self.executor_thread = threading.Thread(target=self.executor.spin, daemon=True)
        self.executor_thread.start()
    
    def is_ros_available(self) -> bool:
        """
        检查 ROS2 是否可用
        
        Returns:
            bool: ROS2 是否可用
        """
        return self.is_initialized
    
    def spin_once(self):
        """执行一次 ROS2 消息处理"""
        if self.is_initialized and self.executor:
            try:
                rclpy.spin_once(self.node, timeout_sec=0.01)
            except Exception as e:
                print(f"ROS2 spin_once 错误: {e}")
    
    def publish_task_completion(self, agent_response: str, scene_graph: str) -> bool:
        """
        发布任务完成通知
        
        Args:
            agent_response: Agent的回复内容
            scene_graph: 当前场景图
            
        Returns:
            bool: 发布是否成功
        """
        if not self.is_initialized or self.completion_publisher is None:
            print("❌ 任务完成发布器未初始化")
            return False
        
        try:
            completion_message = f"{agent_response}\n\nCurrent Scene Graph: {scene_graph}"
            
            msg = String()
            msg.data = completion_message.strip()
            self.completion_publisher.publish(msg)
            
            print(f"📤 任务完成通知已发布到 {self.completion_topic}")
            print(f"📝 消息内容: {completion_message[:100]}...") 
            
            return True
            
        except Exception as e:
            print(f"❌ 发布任务完成通知时出错: {e}")
            return False
    
    def shutdown(self):
        """关闭 ROS2 管理器"""
        try:
            if self.executor:
                self.executor.shutdown()
            
            if self.executor_thread and self.executor_thread.is_alive():
                self.executor_thread.join(timeout=1.0)
            
            if ROS_AVAILABLE and self.is_initialized and self.node:
                self.node.destroy_node()
            
            if ROS_AVAILABLE:
                rclpy.shutdown()
            
            self.is_initialized = False
            print("ROS2 管理器已关闭")
        except Exception as e:
            print(f"关闭 ROS2 管理器时发生错误: {e}")
    
    def get_status(self) -> dict:
        """
        获取 ROS2 管理器状态
        
        Returns:
            dict: 状态信息
        """
        return {
            "is_initialized": self.is_initialized,
            "node_name": self.node_name,
            "topic_name": self.topic_name,
            "message_type": "std_msgs/msg/String",
            "task_cmd_topic": self.task_cmd_topic,
            "completion_topic": self.completion_topic,
            "has_subscriber": self.subscriber is not None,
            "has_task_cmd_subscriber": self.task_cmd_subscriber is not None,
            "has_completion_publisher": self.completion_publisher is not None,
            "executor_running": self.executor_thread is not None and self.executor_thread.is_alive() if self.executor_thread else False,
            "ros_available": ROS_AVAILABLE
        }


ROSManager = ROS2Manager

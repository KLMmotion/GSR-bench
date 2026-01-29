#!/usr/bin/env python3
"""
ROS2 User Command Client
等待用户输入指令，单次发布到话题
使用QoS Reliable确保消息可靠传递，无需额外确认机制
"""

import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, DurabilityPolicy, HistoryPolicy
from std_msgs.msg import String
import threading
import time


class UserCommandClient(Node):
    """
    用户指令客户端
    """
    
    def __init__(self):
        super().__init__('user_command_client')
        
        qos_profile = QoSProfile(
            reliability=ReliabilityPolicy.RELIABLE,
            durability=DurabilityPolicy.VOLATILE,
            history=HistoryPolicy.KEEP_LAST,
            depth=10
        )
        
        self.cmd_publisher = self.create_publisher(
            String, 
            '/instruction', 
            qos_profile
        )
        
        self.get_logger().info("用户指令客户端已启动 (QoS Reliable模式)")
        self.get_logger().info("发布话题: /instruction")
        self.get_logger().info("QoS Reliable确保消息可靠传递")
        self.get_logger().info("请输入指令 (输入 'quit' 退出):")
    
    def send_command(self, command):
        """
        发送新指令 - 单次发布，QoS Reliable确保可靠传递
        """
        msg = String()
        msg.data = command
        self.cmd_publisher.publish(msg)
        
        self.get_logger().info(f"✓ 已发布指令: '{command}' (QoS Reliable保证传递)")
    
    def run_interactive_loop(self):
        """
        运行交互式输入循环
        """
        try:
            while rclpy.ok():
                try:
                    user_input = input("\n请输入指令: ").strip()
                    
                    if not user_input:
                        continue
                    
                    if user_input.lower() in ['quit', 'exit', 'q']:
                        self.get_logger().info("用户退出")
                        break
                    
                    self.send_command(user_input)
                    
                except KeyboardInterrupt:
                    self.get_logger().info("程序被用户中断")
                    break
                except EOFError:
                    self.get_logger().info("输入结束")
                    break
                    
        except Exception as e:
            self.get_logger().error(f"运行出错: {str(e)}")


def main():
    """
    主函数
    """
    rclpy.init()
    
    try:
        client = UserCommandClient()
        
        client.run_interactive_loop()
        
    except KeyboardInterrupt:
        print("\n程序被用户中断")
    except Exception as e:
        print(f"程序运行出错: {str(e)}")
    finally:
        try:
            rclpy.shutdown()
        except:
            pass


if __name__ == '__main__':
    main()
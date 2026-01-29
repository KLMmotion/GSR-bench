#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LangGraph Agent 主运行文件
Created: 2024-01-05
"""

import time
import threading
from queue import Queue, Empty
import sys
import os

current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

try:
    from core.agent_reflect import LangGraphAgent
    from config import OUTPUT_SEPARATOR, MINOR_SEPARATOR, LLM_CONFIG
except ImportError:
    try:
        from langgraph_agent.core.agent_reflect import LangGraphAgent
        from langgraph_agent.config import OUTPUT_SEPARATOR, MINOR_SEPARATOR, LLM_CONFIG
    except ImportError:
        print("❌ 无法导入必要的模块")
        print("💡 请确保在项目根目录或 langgraph_agent 目录中运行")
        sys.exit(1)


class AgentRunner:
    """
    Agent 运行器：管理用户交互和 Agent 运行
    """
    
    def __init__(self):
        self.agent = LangGraphAgent()
        self.input_queue = Queue()
        self.running = False
    
    def start(self):
        """启动 Agent 系统"""
        if not self.agent.initialize():
            print("Agent 初始化失败，退出程序")
            return
        
        self._start_input_thread()
        
        self._print_welcome_message()
        
        self._main_loop()
    
    def _start_input_thread(self):
        """启动输入线程"""
        def input_thread():
            while True:
                try:
                    print(">> ", end="", flush=True)
                    user_input = input()
                    self.input_queue.put(user_input)
                except EOFError:
                    break
                except KeyboardInterrupt:
                    self.input_queue.put("quit")
                    break
        
        threading.Thread(target=input_thread, daemon=True).start()
    
    def _print_welcome_message(self):
        """打印欢迎消息"""
        print("abner-1.0 LangGraph Agent")
        model_name=LLM_CONFIG.get("model", "claude-sonnet-4-20250514")
        print(f"🚀 -------- 使用 {model_name} 模型 + LangGraph ReAct Agent--------🚀 ")
        print("📌 支持两种输入方式:")
        print("   1. 终端输入: 在命令行直接输入任务")
        print("   2. ROS话题输入: 发布到 /task_cmd 话题，格式: 'task: <任务内容>'")
        print("🔧 可用命令:")
        print("   • 'exit' 或 'quit': 退出程序")
        print("   • 'status': 查看系统状态")
        print("   • 'goon' 或 'retry': 重试上一个失败的任务")
        print("请输入任务:")
        print(MINOR_SEPARATOR)
    
    def _main_loop(self):
        """主循环"""
        self.running = True
        
        while self.running:
            self.agent.spin_once()
            
            self._handle_ros_tasks()
            
            try:
                user_input = self.input_queue.get_nowait()
                if not self._handle_user_input(user_input):
                    break
            except Empty:
                pass
            
            time.sleep(0.1)
        
        self.agent.shutdown()
    
    def _handle_ros_tasks(self):
        """
        处理来自ROS话题的任务指令
        """
        try:
            if self.agent.has_pending_tasks():
                task_content = self.agent.get_pending_task()
                if task_content:
                    print("\n" + "="*60)
                    print(f"📡 处理ROS任务指令: {task_content}")
                    print("abner-1.0 LangGraph Agent")
                    
                    response = self.agent.process_user_input(task_content)
                    print(f"\nAssistant: {response}\n")
                    print(OUTPUT_SEPARATOR)
                    
                    remaining_tasks = self.agent.get_task_queue_size()
                    if remaining_tasks > 0:
                        print(f"📋 剩余任务数量: {remaining_tasks}")
                    else:
                        print("请输入下一个任务 (输入 'exit' 或 'quit' 退出，'status' 查看状态):")
                    
        except Exception as e:
            print(f"❌ 处理ROS任务时出错: {e}")
    
    def _handle_user_input(self, user_input: str) -> bool:
        """
        处理用户输入
        
        Args:
            user_input: 用户输入
            
        Returns:
            bool: 是否继续运行
        """
        if user_input.lower() in ["exit", "quit"]:
            print("再见!")
            return False
        
        if user_input.lower() == "status":
            self._print_system_status()
            return True
        
        print("abner-1.0 LangGraph Agent")
        if user_input.strip():
            response = self.agent.process_user_input(user_input)
            print(f"\nAssistant: {response}\n")
            print(OUTPUT_SEPARATOR)
            print("请输入下一个任务 (输入 'exit' 或 'quit' 退出，'status' 查看状态):")
        
        return True
    
    def _print_system_status(self):
        """打印系统状态"""
        status = self.agent.get_system_status()
        
        print("\n📊 系统状态:")
        print(f"🔸 Agent 就绪: {status['is_ready']}")
        print(f"🔸 ROS 状态: {status['ros_status']}")
        print(f"🔸 场景图统计: {status['scene_graph_stats']}")
        print(f"🔸 工具统计: {status['tool_stats']}")
        print(f"🔸 Token 分析器: {status['token_analyzer_stats']}")
        
        print(f"🔸 待处理任务数量: {self.agent.get_task_queue_size()}")
        print(f"🔸 ROS任务订阅: {status['ros_status'].get('has_task_cmd_subscriber', False)}")
        
        print(OUTPUT_SEPARATOR)
    
    def stop(self):
        """停止 Agent 系统"""
        self.running = False


def main():
    """主函数"""
    runner = AgentRunner()
    
    try:
        runner.start()
    except KeyboardInterrupt:
        print("\n程序被用户中断")
        runner.stop()
    except Exception as e:
        print(f"程序运行出错: {e}")
        runner.stop()


if __name__ == "__main__":
    main()

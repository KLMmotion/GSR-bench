#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LangGraph Agent 启动脚本
Created: 2024-01-05

使用方法:
1. 激活 ROS2 环境: conda activate ros2
2. 在 langgraph_agent 目录下运行: python start_agent.py
"""

import sys
import os

def check_conda_environment():
    """检查是否在 ros2 conda 环境中"""
    conda_env = os.environ.get('CONDA_DEFAULT_ENV', '')

    if conda_env != 'ros2':
        print("=" * 60)
        print("⚠️  警告: 当前不在 ros2 conda 环境中")
        print("=" * 60)
        print(f"当前环境: {conda_env if conda_env else 'base'}")
        print("\n💡 请先激活 ROS2 环境:")
        print("   conda activate ros2")
        print("\n或者按 Ctrl+C 退出，然后运行:")
        print("   conda activate ros2 && python start_agent.py")
        print("=" * 60)

        try:
            response = input("\n是否继续启动? (y/N): ").strip().lower()
            if response != 'y':
                print("❌ 已取消启动")
                sys.exit(0)
        except (KeyboardInterrupt, EOFError):
            print("\n❌ 已取消启动")
            sys.exit(0)
    else:
        print("=" * 60)
        print("✅ ROS2 环境已激活")
        print("=" * 60)

current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

if __name__ == "__main__":
    check_conda_environment()

    try:
        from config import validate_prompt_paths
        print("=" * 60)
        print("🚀 启动 LangGraph Agent")
        print("=" * 60)

        validate_prompt_paths()
        print("=" * 60)
        print("new version not allow replanning")

        from main import main
        main()
    except ImportError as e:
        print(f"❌ 导入错误: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    except Exception as e:
        print(f"❌ 启动错误: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

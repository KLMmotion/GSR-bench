# -*- coding: utf-8 -*-
"""
LangGraph Agent 模块化包
Created: 2024-01-05
"""

try:
    from .main import AgentRunner, main
except ImportError as e:
    print(f"导入主模块失败: {e}")
    AgentRunner = None
    main = None

__version__ = "1.0.0"
__author__ = "Assistant"
__description__ = "Modular LangGraph Agent for Robotic Operation Planning"

__all__ = [
    "AgentRunner", 
    "main"
]

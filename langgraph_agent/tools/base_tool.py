#!/usr/bin/env python3
"""
工具基类定义
Created: 2025年7月4日
"""

import sys
import os
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional
import time

class BaseTool(ABC):
    """工具基类，所有工具都应该继承此类"""

    def __init__(self, name: str, description: str):
        self.name = name
        self.description = description
        self.call_count = 0
        self.total_execution_time = 0.0
        self.call_history = []
    
    @abstractmethod
    def execute(self, query: str = "", **kwargs) -> str:
        """执行工具的主要逻辑"""
        pass

    def __call__(self, query: str = "", **kwargs) -> str:
        """工具调用入口，包含统计和日志功能"""
        start_time = time.time()
        self.call_count += 1
        success = True
        error_msg = ""

        print(f"🔧 [工具调用] {self.name} - 开始执行")

        try:
            result = self.execute(query, **kwargs)
            execution_time = time.time() - start_time
            self.total_execution_time += execution_time

            print(f"✅ [工具返回] {self.name} - 执行成功 (耗时: {execution_time:.4f}s)")

            if self.name == "ValidateActionFaster" and isinstance(result, str):
                try:
                    import json
                    result_data = json.loads(result)
                    if result_data.get("is_valid", False):
                        action_summary = result_data.get("action_summary", {})
                        action_desc = action_summary.get("description", "N/A")
                        print(f"📋 [BaseTool校验成功返回]: {action_desc}")
                except (json.JSONDecodeError, Exception):
                    pass

        except Exception as e:
            execution_time = time.time() - start_time
            self.total_execution_time += execution_time
            success = False
            error_msg = str(e)
            result = f"Tool execution failed: {str(e)}"

            print(f"❌ [工具错误] {self.name} - 执行失败: {str(e)[:100]}... (耗时: {execution_time:.2f}s)")

        call_record = {
            'timestamp': start_time,
            'duration': execution_time,
            'success': success,
            'error_msg': error_msg,
            'query': str(query)[:200] if query else ""
        }
        self.call_history.append(call_record)

        return result

    def get_stats(self) -> Dict[str, Any]:
        """获取工具统计信息"""
        avg_time = self.total_execution_time / max(1, self.call_count)
        return {
            'name': self.name,
            'call_count': self.call_count,
            'total_execution_time': self.total_execution_time,
            'average_execution_time': avg_time,
            'success_rate': len([r for r in self.call_history if r['success']]) / max(1, len(self.call_history))
        }

    def reset_stats(self):
        """重置统计信息"""
        self.call_count = 0
        self.total_execution_time = 0.0
        self.call_history.clear()
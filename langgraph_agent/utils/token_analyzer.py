"""
Token 分析器：分析和统计 token 使用情况
Created: 2024-01-05
"""

import sys
import os
from typing import Dict, Any, Optional

try:
    from langchain_core.messages import AIMessage
    LANGCHAIN_AVAILABLE = True
except ImportError:
    print("警告: LangChain 不可用，将使用模拟 AIMessage")
    LANGCHAIN_AVAILABLE = False

    class AIMessage:
        def __init__(self, content):
            self.content = content

try:
    from config import TOKEN_CONFIG
except ImportError:
    from langgraph_agent.config import TOKEN_CONFIG


class TokenAnalyzer:
    """
    Token 分析器：估算和分析 token 使用情况
    """
    
    def __init__(self):
        self.chars_per_token = TOKEN_CONFIG.get("chars_per_token", 3.5)
        self.enable_analysis = TOKEN_CONFIG.get("enable_analysis", True)
    
    def estimate_tokens(self, text: str) -> int:
        """
        估算文本的 token 数量

        Args:
            text: 输入文本

        Returns:
            int: 估算的 token 数量
        """
        if not text:
            return 0

        char_count = len(text)
        return max(1, int(char_count / self.chars_per_token))
    
    def analyze_conversation_tokens(self, result: Dict[str, Any],
                                   system_prompt: str,
                                   user_input: str):
        """
        分析对话各部分的 token 使用情况

        Args:
            result: Agent 返回结果
            system_prompt: 系统提示
            user_input: 用户输入
        """
        if not self.enable_analysis:
            return

        try:
            if isinstance(result, dict) and "messages" in result:
                messages = result["messages"]

                system_tokens = self.estimate_tokens(system_prompt)
                user_tokens = self.estimate_tokens(user_input)

                tool_tokens = 0
                history_tokens = 0
                
                for msg in messages:
                    if hasattr(msg, 'content'):
                        content = str(msg.content)
                        if "Current scene graph:" in content:
                            tool_tokens += self.estimate_tokens(content)
                        elif hasattr(msg, 'type'):
                            if msg.type == 'human' and msg.content != user_input:
                                history_tokens += self.estimate_tokens(content)
                            elif msg.type == 'ai' and "Current scene graph:" not in content:
                                history_tokens += self.estimate_tokens(content)
                
                self._print_token_breakdown(
                    system_tokens, user_tokens, tool_tokens, history_tokens
                )

                self._print_actual_token_usage(result)
                
        except Exception as e:
            print(f"📊 Token 分析出错: {e}")
    
    def _print_token_breakdown(self, system_tokens: int, user_tokens: int, 
                              tool_tokens: int, history_tokens: int):
        """
        打印 token 分解信息
        
        Args:
            system_tokens: 系统提示 tokens
            user_tokens: 用户输入 tokens
            tool_tokens: 工具结果 tokens
            history_tokens: 历史对话 tokens
        """
        total_estimated = system_tokens + user_tokens + tool_tokens + history_tokens
        
        print(f"📊 Token 分解:")
        print(f"  🎯 System Prompt: ~{system_tokens} tokens")
        print(f"  👤 用户消息: ~{user_tokens} tokens")
        print(f"  🔧 工具结果: ~{tool_tokens} tokens")
        print(f"  📚 历史对话: ~{history_tokens} tokens")
        print(f"  📝 估算总输入: ~{total_estimated} tokens")
    
    def _print_actual_token_usage(self, result: Dict[str, Any]):
        """
        打印实际 token 使用情况

        Args:
            result: Agent 返回结果
        """
        try:
            if isinstance(result, dict) and "messages" in result:
                for msg in reversed(result["messages"]):
                    if isinstance(msg, AIMessage):
                        usage_info = self._extract_usage_info(msg)
                        if usage_info:
                            print(f"🔹 实际 Token 使用: {usage_info}")
                            return

                print("🔹 实际 Token 使用信息不可用")

        except Exception as e:
            print(f"🔹 Token 统计出错: {e}")
    
    def _extract_usage_info(self, msg: AIMessage) -> Optional[str]:
        """
        从 AI 消息中提取使用情况信息

        Args:
            msg: AI 消息

        Returns:
            Optional[str]: 使用情况信息字符串
        """
        if hasattr(msg, 'usage_metadata') and msg.usage_metadata:
            usage = msg.usage_metadata
            input_tokens = usage.get('input_tokens', 'N/A')
            output_tokens = usage.get('output_tokens', 'N/A')
            total_tokens = usage.get('total_tokens', 'N/A')
            return f"输入={input_tokens}, 输出={output_tokens}, 总计={total_tokens}"

        if hasattr(msg, 'response_metadata') and msg.response_metadata:
            metadata = msg.response_metadata
            if 'token_usage' in metadata:
                return str(metadata['token_usage'])

        return None
    
    def get_token_stats(self) -> Dict[str, Any]:
        """
        获取 token 分析器统计信息
        
        Returns:
            Dict: 统计信息
        """
        return {
            "chars_per_token": self.chars_per_token,
            "enable_analysis": self.enable_analysis
        }

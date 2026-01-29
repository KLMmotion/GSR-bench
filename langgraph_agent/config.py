#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LangGraph Agent 配置文件
Created: 2024-01-05
"""

import os
LLM_CONFIG = {
    "model": "Qwen3-8B",   
    "api_key": "AC1554DFFVSA6664",
    "base_url": "http://127.0.0.1:8002/v1",  
    "temperature": 1,
    "max_tokens": 2048,
    "top_p": 0.9,
    "top_k": "5",
    "enable_thinking":False,  
    "thinking_budget": 5000
}

AGENT_CONFIG = {
    "thread_id": "default-thread",
    "timeout": 600,
    "api_test_timeout": 15,
    "max_iterations": 30,
    "recursion_limit": 30
}

PROMPT_CONFIG = {
    "system_prompt_kewei_path": "prompts/system_prompt_common_test.txt",
    "make_table_config_path": "prompts/make_table.json",
    "fallback_prompt": "You are a helpful robotic operation planning assistant."
}

ROS2_CONFIG = {
    "node_name": "scene_graph_listener",
    "topic_name": "/scene_graph",
    "qos_profile": {
        "history": "keep_last",
        "depth": 10,
        "reliability": "reliable",
        "durability": "volatile"
    },
    "timeout": 30,
    "executor": "single_threaded"  # single_threaded, multi_threaded
}

TOKEN_CONFIG = {
    "chars_per_token": 3.5,
    "enable_analysis": True,
    "max_token_threshold": 8000,
    "warning_threshold": 6000
}

STABILITY_CONFIG = {
    "max_wait_time": 120,
    "check_interval": 1,
    "stable_frame_threshold": 5,
    "max_history_size": 15
}

OUTPUT_SEPARATOR = "=" * 80
MINOR_SEPARATOR = "-" * 40

LOG_CONFIG = {
    "level": "INFO",
    "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    "file": None
}

TOOL_CONFIG = {
    "max_tool_calls": 5,
    "tool_timeout": 30
}

RETRY_CONFIG = {
    "max_retries": 10,
    "base_delay": 15,
    "max_delay": 120,
    "backoff_factor": 2,
    "retry_on_429": True,
    "retry_on_timeout": True,
}


def validate_prompt_paths():
    """验证提示文件路径是否存在"""
    print("🔍 验证配置文件路径:")

    base_dir = os.path.dirname(os.path.abspath(__file__))

    for key, path in PROMPT_CONFIG.items():
        if key.endswith('_path'):
            full_path = os.path.join(base_dir, path) if not os.path.isabs(path) else path
            if os.path.exists(full_path):
                print(f"✅ 配置文件存在: {key} -> {full_path}")
            else:
                print(f"❌ 配置文件不存在: {key} -> {full_path}")

def get_prompt_path(config_key: str) -> str:
    """
    获取提示文件的完整路径

    Args:
        config_key: 配置键名

    Returns:
        str: 提示文件的绝对路径
    """
    path = PROMPT_CONFIG.get(config_key, "")
    if not path:
        raise ValueError(f"配置键 '{config_key}' 不存在")

    if not os.path.isabs(path):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        path = os.path.join(base_dir, path)

    if not os.path.exists(path):
        raise FileNotFoundError(f"配置文件不存在: {path}")

    return path

def print_all_prompt_paths():
    """打印所有提示文件的路径"""
    print("📂 所有提示文件路径:")

    base_dir = os.path.dirname(os.path.abspath(__file__))

    for key, path in PROMPT_CONFIG.items():
        if key.endswith('_path'):
            full_path = os.path.join(base_dir, path) if not os.path.isabs(path) else path
            status = "✅" if os.path.exists(full_path) else "❌"
            print(f"  {status} {key}: {full_path}")

if __name__ == "__main__":
    validate_prompt_paths()

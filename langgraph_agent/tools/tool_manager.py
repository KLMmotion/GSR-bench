# -*- coding: utf-8 -*-
"""
工具管理器：管理和创建所有工具
Created: 2024-01-05
"""

import sys
import os
from typing import List, Dict, Any

_current_dir = os.path.dirname(os.path.abspath(__file__))
_parent_dir = os.path.dirname(_current_dir)
if _parent_dir not in sys.path:
    sys.path.insert(0, _parent_dir)

from tools.scene_graph_tool import SceneGraphTool
from tools.action_validation_execution_tool import ActionValidationExecutionTool
from tools.action_plan_ref_tool import ActionPlanRefTool

# from tools.check_task_over_tool import CheckTaskOverTool
CheckTaskOverTool = None

try:
    from langchain_core.tools import tool
    LANGCHAIN_AVAILABLE = True
except ImportError:
    print("警告: LangChain 不可用，将使用模拟 tool 装饰器")
    LANGCHAIN_AVAILABLE = False

    def tool(func):
        return func


class ToolManager:
    """
    工具管理器：创建和管理所有工具实例
    """

    def __init__(self, scene_graph_manager, llm_model=None, agent=None):
        self.scene_graph_manager = scene_graph_manager
        self.llm_model = llm_model
        self.agent = agent
        self.tools = {}
        self._initialize_tools()

    def _initialize_tools(self):
        """初始化所有工具"""
        self.tools["scene_graph"] = SceneGraphTool(
            scene_graph_getter=self.scene_graph_manager.get_latest_scene_graph,
            agent=self.agent
        )
        
        self.tools["validate_and_execute_action"] = ActionValidationExecutionTool(
            scene_graph_manager=self.scene_graph_manager,
            agent=self.agent
        )

        self.tools["action_plan_ref"] = ActionPlanRefTool()

        # if CheckTaskOverTool is not None:
        #     self.tools["check_task_over"] = CheckTaskOverTool(
        #         scene_graph_manager=self.scene_graph_manager,
        #         agent=self.agent
        #     )

    def get_action_tool_only(self) -> List:
        """
        获取仅包含ValidateAndExecuteAction的工具列表，用于agent节点
        
        Returns:
            List: 仅包含ValidateAndExecuteAction的工具函数列表
        """
        langchain_tools = []
        
        if "validate_and_execute_action" in self.tools:
            validate_execute_tool = self.tools["validate_and_execute_action"]
            
            @tool
            def validate_and_execute_action(query: str = "") -> str:
                """验证并执行动作计划（集成验证和执行功能）"""
                return validate_execute_tool.__call__(query)
            
            validate_and_execute_action.name = validate_execute_tool.name
            validate_and_execute_action.description = validate_execute_tool.description
            langchain_tools.append(validate_and_execute_action)

        return langchain_tools

    def get_langchain_tools(self) -> List:
        """
        获取 LangGraph 兼容的工具列表

        Returns:
            List: 工具函数列表
        """
        langchain_tools = []

        print("abner-1.0 action_plan_ref")
        if "action_plan_ref" in self.tools:
            action_plan_ref_tool = self.tools["action_plan_ref"]
            
            @tool
            def get_action_plan_ref(query: str = "") -> str:
                """获取动作计划参考信息"""
                return action_plan_ref_tool.__call__(query)
            
            get_action_plan_ref.name = action_plan_ref_tool.name
            get_action_plan_ref.description = action_plan_ref_tool.description
            langchain_tools.append(get_action_plan_ref)

        scene_graph_tool = self.tools["scene_graph"]
        
        @tool
        def get_scene_graph(query: str = "") -> str:
            """获取当前场景图信息"""
            return scene_graph_tool.__call__(query)
        
        get_scene_graph.name = scene_graph_tool.name
        get_scene_graph.description = scene_graph_tool.description
        langchain_tools.append(get_scene_graph)

        if "validate_and_execute_action" in self.tools:
            validate_execute_tool = self.tools["validate_and_execute_action"]
            
            @tool
            def validate_and_execute_action(query: str = "") -> str:
                """验证并执行动作计划（集成验证和执行功能）"""
                return validate_execute_tool.__call__(query)
            
            validate_and_execute_action.name = validate_execute_tool.name
            validate_and_execute_action.description = validate_execute_tool.description
            langchain_tools.append(validate_and_execute_action)

        if "check_task_over" in self.tools:
            check_task_over_tool = self.tools["check_task_over"]
            
            @tool
            def check_task_over(user_input: str = "") -> str:
                """检查任务是否真正完成"""
                return check_task_over_tool.__call__(user_input)
            
            check_task_over.name = check_task_over_tool.name
            check_task_over.description = check_task_over_tool.description
            langchain_tools.append(check_task_over)

        return langchain_tools

    def get_tool_by_name(self, name: str):
        """
        根据名称获取工具

        Args:
            name: 工具名称

        Returns:
            BaseTool: 工具实例
        """
        tool_mapping = {
            "GetSceneGraph": "scene_graph",
            "GetActionPlanRef": "action_plan_ref",
            "ValidateAndExecuteAction": "validate_and_execute_action",
            "CheckTaskOver": "check_task_over",
        }

        key = tool_mapping.get(name)
        if key:
            return self.tools.get(key)
        return None

    def get_all_tools_stats(self) -> Dict[str, Any]:
        """
        获取所有工具的统计信息

        Returns:
            Dict: 工具统计信息
        """
        stats = {}
        for key, tool in self.tools.items():
            stats[key] = tool.get_stats()
        return stats

    def reset_all_tools_stats(self):
        """重置所有工具的统计信息"""
        for tool in self.tools.values():
            tool.reset_stats()

    def add_custom_tool(self, key: str, tool_instance):
        """
        添加自定义工具

        Args:
            key: 工具键名
            tool_instance: 工具实例
        """
        self.tools[key] = tool_instance

    def remove_tool(self, key: str):
        """
        移除工具

        Args:
            key: 工具键名
        """
        if key in self.tools:
            del self.tools[key]

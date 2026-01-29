import json
import os
import sys
from typing import Dict, Any, Optional, List

try:
    from .base_tool import BaseTool
    from config import PROMPT_CONFIG
except ImportError:
    from langgraph_agent.tools.base_tool import BaseTool
    from langgraph_agent.config import PROMPT_CONFIG



class ActionPlanRefTool(BaseTool):
    """
    动作计划参考工具：获取任务计划的摘要和步骤信息
    """
    
    def __init__(self):
        super().__init__(
            name="GetActionPlanRef",
            description="Get the summary, action type descriptions, successful ReAct examples, and planning guides for box moving tasks. Call this tool FIRST for any task. This tool provides complete ReAct execution examples showing the correct Think→Act→Observe cycle with validation and execution steps. Specify an action type number to get details of that specific action type, or leave empty to get all information including ReAct examples."
        )
        self.prompt_dir = "prompts"
        
    def execute(self, query: str = "") -> str:
        """
        获取动作计划参考信息

        Args:
            query: 查询参数（可选），可指定动作类型号

        Returns:
            str: 计划参考信息的 JSON 字符串
        """
        try:
            action_type_number = None
            if query and query.isdigit():
                action_type_number = int(query)

            file_path = PROMPT_CONFIG["make_table_config_path"]
            print(f"📂 正在加载动作计划配置文件: {file_path}")
            
            if not os.path.exists(file_path):
                error_msg = f"计划文件不存在: {file_path}"
                print(f"❌ {error_msg}")
                return json.dumps({"error": error_msg})

            with open(file_path, 'r', encoding='utf-8') as f:
                print("✅ operation_description提示加载成功")
                print(f"✅ 成功加载动作计划配置文件: {file_path}")
                data = json.load(f)

            doc_id = data.get("doc_id", "")
            print(f"🔸 doc_id: {doc_id}")

            summary = data.get("summary", "")
            if isinstance(summary, list):
                summary = "\n".join(summary)

            organization_strategies = data.get("organization_strategies", {})

            core_rules = data.get("core_rules_summary", {})
            print(f"🔸core rules: {core_rules}")
            task_examples = data.get("task_examples", {})

            result = {
                "doc_id": doc_id,
                "summary": summary,
                "organization_strategies": organization_strategies,
                "core_rules": core_rules,
                "task_examples": task_examples
            }

            # self._print_plan_ref(result)

            return json.dumps(result, indent=2)

        except Exception as e:
            error_msg = f"获取计划参考信息失败: {str(e)}"
            print(f"错误: {error_msg}")
            import traceback
            print(traceback.format_exc())

    def _print_plan_ref(self, result: Dict[str, Any]):
        """打印计划参考信息"""
        try:
            print("=" * 60)
            print("📋 动作计划参考信息:")
            print(f"🔸 总动作类型数: {result['total_action_types']}")
            
            if result.get("requested_action_type"):
                print(f"🔸 请求的动作类型: {result['requested_action_type']}")
            
            summary = result.get('summary', '')
            if summary:
                if len(summary) > 300:
                    print(f"🔸 任务摘要: {summary[:300]}...")
                else:
                    print(f"🔸 任务摘要: {summary}")
            
            react_examples = result.get("successful_react_examples", {})
            if react_examples:
                print("\n🎯 成功的ReAct执行示例:")
                for example_key, example_data in react_examples.items():
                    task = example_data.get("task", "未知任务")
                    description = example_data.get("description", "无描述")
                    print(f"🔹 示例: {task}")
                    print(f"   描述: {description}")
                    
                    flow = example_data.get("flow", [])
                    if flow:
                        print("   关键步骤:")
                        for i, step in enumerate(flow[:3]):
                            print(f"     {i+1}. {step}")
                        if len(flow) > 3:
                            print(f"     ... (总共{len(flow)}个步骤)")
            
            if result.get("action_types"):
                print("\n📝 动作类型:")
                for action_type in result["action_types"]:
                    print(f"🔹 类型 {action_type['action_type_number']}: {action_type['action_type_title']}")
                    desc = action_type.get('operation_description', '')
                    if desc:
                        if len(desc) > 200:
                            print(f"   {desc[:200]}...")
                        else:
                            print(f"   {desc}")
        
            print("=" * 60)
            total_examples = len(react_examples)
            total_action_types = len(result.get('action_types', []))
            print(f"📊 [工具返回] GetActionPlanRef - 成功获取计划参考信息，包含 {total_action_types} 个动作类型描述和 {total_examples} 个ReAct示例")
        except Exception as e:
            print(f"打印计划参考信息失败: {e}")
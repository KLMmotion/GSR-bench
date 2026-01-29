# -*- coding: utf-8 -*-
"""
LangGraph Agent 核心类
Created: 2025-08-23
Coder: kewei
测试tag提交
"""

import json
import concurrent.futures
import sys
import os
import time
import re
from queue import Queue, Empty
from typing import Dict, Any, Optional, Sequence, Annotated, TypedDict, List, Union
from datetime import datetime

call_model_count = 0

try:
    from langchain_openai import ChatOpenAI
    from langgraph.graph import StateGraph, END
    from langgraph.graph.message import add_messages
    from langgraph.checkpoint.memory import InMemorySaver
    from langchain_core.messages import AIMessage, SystemMessage, ToolMessage, BaseMessage
    LANGCHAIN_AVAILABLE = True
except ImportError as e:
    print(f"警告: LangChain 依赖未安装: {e}")
    LANGCHAIN_AVAILABLE = False
    
    class ChatOpenAI:
        def __init__(self, **kwargs):
            pass 
        
        def invoke(self, messages):
            return {"content": "模拟响应"}
        
        def bind_tools(self, tools):
            return self
    
    class StateGraph:
        def __init__(self, state_schema):
            pass
            
        def add_node(self, name, func):
            pass
            
        def set_entry_point(self, name):
            pass
            
        def add_conditional_edges(self, start, condition, mapping):
            pass
            
        def add_edge(self, start, end):
            pass
            
        def compile(self):
            return None
    
    END = "END"
    
    def create_react_agent(llm, tools, checkpointer=None):
        return None
    
    class InMemorySaver:
        def __init__(self):
            pass
    
    class AIMessage:
        def __init__(self, content=""):
            self.content = content
    
    class SystemMessage:
        def __init__(self, content=""):
            self.content = content
    
    class ToolMessage:
        def __init__(self, content="", name="", tool_call_id=""):
            self.content = content
            self.name = name
            self.tool_call_id = tool_call_id
    
    class BaseMessage:
        def __init__(self, content=""):
            self.content = content
    
    def add_messages(x, y):
        return x + y

_current_dir = os.path.dirname(os.path.abspath(__file__))
_parent_dir = os.path.dirname(_current_dir)
if _parent_dir not in sys.path:
    sys.path.insert(0, _parent_dir)

try:

    from config import LLM_CONFIG, AGENT_CONFIG, PROMPT_CONFIG, RETRY_CONFIG
    from utils.scene_graph_manager import SceneGraphManager
    from utils.ros_manager import ROS2Manager as ROSManager
    from utils.token_analyzer import TokenAnalyzer

    from tools.tool_manager import ToolManager
    from tools.base_tool import BaseTool


    print(f"✅ 导入成功，api_key: {LLM_CONFIG.get('api_key', 'MISSING')[:10]}...")

except ImportError as e:

    try:
        from langgraph_agent.config import LLM_CONFIG, AGENT_CONFIG, PROMPT_CONFIG, RETRY_CONFIG
        from langgraph_agent.utils.scene_graph_manager import SceneGraphManager
        from langgraph_agent.utils.ros_manager import ROS2Manager as ROSManager
        from langgraph_agent.utils.token_analyzer import TokenAnalyzer

        from langgraph_agent.tools.tool_manager import ToolManager
        from langgraph_agent.tools.base_tool import BaseTool

        print(f"✅ 包导入成功，api_key: {LLM_CONFIG.get('api_key', 'MISSING')[:10]}...")

    except ImportError as e2:
        print(f"❌ 错误: 无法导入所需依赖")
        print(f"   直接导入错误: {e}")
        print(f"   包导入错误: {e2}")
        print(f"\n💡 请确保在正确的目录运行此脚本")
        print(f"   当前目录: {_current_dir}")
        print(f"   父目录: {_parent_dir}")
        print(f"   sys.path[:3]: {sys.path[:3]}")

        class MockClass:
            def __init__(self, *args, **kwargs):
                pass
            def __call__(self, *args, **kwargs):
                return self
            def __getattr__(self, name):
                return MockClass()

        LLM_CONFIG = {}
        AGENT_CONFIG = {}
        PROMPT_CONFIG = {}
        RETRY_CONFIG = {}
        SceneGraphManager = MockClass
        ROSManager = MockClass
        TokenAnalyzer = MockClass
        ToolManager = MockClass
        BaseTool = MockClass

class AgentState(TypedDict):
    """LangGraph Agent 状态定义"""
    messages: Annotated[Sequence[BaseMessage], add_messages]


class LangGraphAgent:
    """
    LangGraph Agent 核心类：管理整个 Agent 系统
    """

    def __init__(self):
        print("abner-1.0 LangGraph Agent")
        self.scene_graph_manager = SceneGraphManager()
        self.task_queue = Queue()

        self.last_failed_task = None
        self.last_error_message = None
        self.last_task_context = None
        self.last_call_message = None
        self.last_last_call_message = None
        self.same_tool_count = 0
        self.ros_manager = ROSManager(
            self.scene_graph_manager.update_scene_graph,
            self._on_task_received  
        )
        self.token_analyzer = TokenAnalyzer()
        self.llm = self._initialize_llm()
        self.tool_manager = ToolManager(self.scene_graph_manager, self.llm, agent=self)
    
        self.all_tools = self.tool_manager.get_langchain_tools()
        self.all_tools_by_name = {tool.name: tool for tool in self.all_tools}
        
        self.action_tools = self.tool_manager.get_action_tool_only()
        if self.llm is not None:
            self.tools_by_name = {tool.name: tool for tool in self.all_tools} 
        else:
            self.tools_by_name = {}
        self.scene_graph_manager._agent = self

        self.agent = None
        self.checkpointer = InMemorySaver()
        self.config = {"configurable": {"thread_id": AGENT_CONFIG.get(
            "thread_id", "default-thread")}, "recursion_limit": AGENT_CONFIG.get("recursion_limit", 100)}

        self.system_prompt = self._load_system_prompt()

        self.is_ready = False
        
        self.execution_records = []  
        self.task_start_time = None  
        self.task_end_time = None    
    def _parse_action_from_text(self, text: str) -> dict | None:
        """
        从文本中解析动作指令，转换为标准的 tool_call 格式
        支持两种写法：
        1. 5. move obj on/in/into/to container
        2. 5. validateAndExecuteAction("move obj on/in/into/to container")
        返回：tool_call 字典 or None
        """

        line_pat = re.compile(r'^\d+\.\s*(.+)$', re.MULTILINE)
        for line in line_pat.findall(text):
            line = line.strip()
            va_match = re.search(r'validateAndExecuteAction\(["\'](.+?)["\']\)', line, re.I)
            if va_match:
                inner = va_match.group(1)          # -> 'move blue_cube1 in blue_box'
            else:
                inner = line

            act_match = re.match(
                r'(?P<verb>move|put|Put)\s+'
                r'(?P<obj>\w+)\s+'
                r'(?P<prep>on|in|into|to)\s+'
                r'(?P<container>\w+)',
                inner.strip(), re.I
            )
            if not act_match:
                continue

            verb      = act_match.group('verb').lower()
            obj       = act_match.group('obj')
            prep      = act_match.group('prep')
            container = act_match.group('container')
            action_str = f"move {obj} {prep} {container}"

            return {
                "name": "ValidateAndExecuteAction",
                "args": {"query": action_str},
                "id":   f"call_{hash(action_str) & 0xFFFFFFFF}",
                "type": "tool_call"
            }

        return None
    
    def _parse_next_action_from_text(self, text: str) -> dict:
        """
        从纯文本中解析下一个动作指令,转换为标准的 tool_call 格式
        支持：
            1. move/put/Put <obj> on/in/into/to <container>
            2. open/close <obj>
        均可选前缀 "Action:"
        能处理以逗号或换行符分隔的动作序列，并返回找到的第一个有效动作。
        自动把简写抽屉名 drawer_high / drawer_middle / drawer_low 补全为
        short_cabinet/drawer_high 等完整路径。
        """
        DRAWER_ALIAS = {
            "drawer_high":   "short_cabinet/drawer_high",
            "drawer_middle": "short_cabinet/drawer_middle",
            "drawer_low":    "short_cabinet/drawer_low",
        }

        def _canonical_name(name: str) -> str:
            """把抽屉别名替换成完整路径；其余原样返回。"""
            return DRAWER_ALIAS.get(name, name)

        text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
        print("解析动作：", text)

        action_chunks = re.split(r"(,)", text)
        potential_actions = []
        for i in range(0, len(action_chunks), 2):
            chunk = action_chunks[i]
            for line in chunk.splitlines():
                line = line.strip()
                if line:
                    potential_actions.append(line)


        open_close_pattern = r"^\s*(?:Action:\s*)?(open|close)\s+([\w/-]+)[\s\.]*$"
        move_pattern = r"^\s*(?:Action:\s*)?(move|put|Put)\s+([\w/-]+)\s+(on|in|into|to)\s+([\w/-]+)[\s\.]*$"

        for action_text in potential_actions:
            action_text = action_text.strip()
            if not action_text:
                continue


            oc_match = re.match(open_close_pattern, action_text)
            if oc_match:
                verb, obj = oc_match.groups()
                obj = _canonical_name(obj)
                action_str = f"{verb} {obj}"
                return {
                    "name": "ValidateAndExecuteAction",
                    "args": {"query": action_str},
                    "id": f"call_{hash(action_str) & 0xFFFFFFFF}",
                    "type": "tool_call"
                }

            mv_match = re.match(move_pattern, action_text)
            if mv_match:
                _, obj, prep, container = mv_match.groups()
                obj = _canonical_name(obj)
                container = _canonical_name(container)
                action_str = f"move {obj} {prep} {container}"
                return {
                    "name": "ValidateAndExecuteAction",
                    "args": {"query": action_str},
                    "id": f"call_{hash(action_str) & 0xFFFFFFFF}",
                    "type": "tool_call"
                }

        return None

    def _parse_next_action_from_text_think(self, text: str) -> dict:
        """
        从纯文本中解析下一个动作指令,转换为标准的 tool_call 格式
        支持：
            1. move/put/Put <obj> on/in/into/to <container>
            2. open/close <obj>
        会先剔除 <think>...</think> 段。
        """

        text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()


        open_close_pattern = r'^\s*(open|close)\s+([\w/-]+)[\s\.]*$'
        oc_match = re.match(open_close_pattern, text)
        if oc_match:
            verb, obj = oc_match.groups()
            action_str = f"{verb} {obj}"
            return {
                "name": "ValidateAndExecuteAction",
                "args": {"query": action_str},
                "id": f"call_{hash(action_str) & 0xFFFFFFFF}",
                "type": "tool_call"
            }

        pattern = r'^\s*(move|put|Put)\s+(\w+)\s+(on|in|into|to)\s+(\w+)[\s\.]*$'
        match = re.match(pattern, text)
        if match:
            action_verb, object_name, preposition, container_name = match.groups()
            action_str = f"move {object_name} {preposition} {container_name}"
            return {
                "name": "ValidateAndExecuteAction",
                "args": {"query": action_str},
                "id": f"call_{hash(action_str) & 0xFFFFFFFF}",
                "type": "tool_call"
            }


        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue

            if re.match(open_close_pattern, line):
                verb, obj = re.match(open_close_pattern, line).groups()
                action_str = f"{verb} {obj}"
                return {
                    "name": "ValidateAndExecuteAction",
                    "args": {"query": action_str},
                    "id": f"call_{hash(action_str) & 0xFFFFFFFF}",
                    "type": "tool_call"
                }

            if re.match(pattern, line):
                action_verb, object_name, preposition, container_name = \
                    re.match(pattern, line).groups()
                action_str = f"move {object_name} {preposition} {container_name}"
                return {
                    "name": "ValidateAndExecuteAction",
                    "args": {"query": action_str},
                    "id": f"call_{hash(action_str) & 0xFFFFFFFF}",
                    "type": "tool_call"
                }

        return None
    def _call_model(self, state: AgentState, config=None) -> Dict[str, Any]:
        global call_model_count  
        call_model_count += 1  
        
        
        start_time = time.time()  
        start_datetime = datetime.now()  
        
        system_message = SystemMessage(content=self.system_prompt)  
        from langchain_core.messages import HumanMessage  

        state_messages = state["messages"]
        first_state_msg=state_messages[0]     
        if hasattr(first_state_msg,'content'):
            if isinstance(first_state_msg,HumanMessage):
                modified_first_state_msg = HumanMessage(content=f" and user query is {first_state_msg.content}")
            else:
                modified_first_state_msg = type(first_state_msg)(content=f" and user query is {first_state_msg.content}")
        else:
            modified_first_state_msg = first_state_msg

        messages = [state_messages[-1],modified_first_state_msg, system_message]
        print(f"last_state_message: {state_messages[-1]}")

        print(f"\n🤖 第 {call_model_count} 次进入 call_model 节点")
        print(f"当前状态消息数量: {len(state['messages'])}")
        print(f"进入时间: {start_datetime.strftime('%Y-%m-%d %H:%M:%S')}")

        response = self.llm.invoke(messages)

        end_time = time.time()
        end_datetime = datetime.now()
        duration = end_time - start_time
        tool_calls = []
        tool_calls_detail = []

        if not (hasattr(response, 'tool_calls') and response.tool_calls):  
            # parsed_tool_call = self._parse_action_from_text(response.content)
            parsed_tool_call = self._parse_next_action_from_text(response.content)  
          
            if parsed_tool_call:  
                response = AIMessage(  
                    content=response.content,  
                    tool_calls=[parsed_tool_call]  
                )  
                print(f"✅ 从文本中解析出工具调用: {parsed_tool_call['args']['query']}")  
            else:  
                print(f"⚠️ 未能从文本中解析出有效的动作指令")  
        
        if hasattr(response, 'tool_calls') and response.tool_calls:
            tool_calls = [tc['name'] for tc in response.tool_calls]
            tool_calls_detail = response.tool_calls
            print(f"工具调用: {tool_calls}")
        print(f"结束时间: {end_datetime.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"call_model 节点执行完成，耗时: {duration:.3f}秒\n")
        
        record = {
            "type": "call_model",
            "count": call_model_count,
            "start_time": start_datetime.strftime('%Y-%m-%d %H:%M:%S'),
            "end_time": end_datetime.strftime('%Y-%m-%d %H:%M:%S'),
            "duration": f"{duration:.3f}秒",
            "model_output": response.content if hasattr(response, 'content') else str(response),
            "tool_calls": tool_calls,
            "tool_calls_detail": tool_calls_detail
        }
        self.execution_records.append(record)
        
        return {"messages": [response]}
    
    def _call_tools(self, state: AgentState) -> Dict[str, Any]:
        """
        调用工具节点
        
        Args:
            state: 当前状态
            
        Returns:
            Dict: 包含 tool messages 的状态更新
        """
        start_time = time.time()
        start_datetime = datetime.now()
        
        tool_outputs = []
        last_message = state["messages"][-1]
        print(f"\n🔧 进入工具节点...")
        print(f"进入时间: {start_datetime.strftime('%Y-%m-%d %H:%M:%S')}")
        
        tool_names_called = []
        tool_results = {}
        
        if hasattr(last_message, 'tool_calls') and last_message.tool_calls:
            for tool_call in last_message.tool_calls:
                try:
                    tool_name = tool_call["name"]
                    tool_args = tool_call["args"]
                    tool_call_id = tool_call["id"]
                    print(f"调用工具: {tool_name}")
                    print(f"输入参数: {tool_args}")
                    
                    tool_names_called.append(tool_name)
                    
                    if tool_name in self.tools_by_name:
                        result = self.tools_by_name[tool_name].invoke(tool_args)
                        
                        if tool_name == "GetActionPlanRef":
                            print(f"工具获取plan信息")
                            tool_results[tool_name] = "工具获取plan信息"
                        else:
                            print(f"工具输出: {result}")
                            tool_results[tool_name] = str(result)

                        tool_outputs.append(ToolMessage(
                            content=str(result),
                            name=tool_name,
                            tool_call_id=tool_call_id
                        ))
                    else:
                        error_msg = f"Error: Tool '{tool_name}' not found"
                        tool_results[tool_name] = error_msg
                        tool_outputs.append(ToolMessage(
                            content=error_msg,
                            name=tool_name,
                            tool_call_id=tool_call_id
                        ))
                except Exception as e:
                    error_msg = f"Error executing tool: {str(e)}"
                    tool_name = tool_call.get("name", "unknown")
                    tool_results[tool_name] = error_msg
                    tool_outputs.append(ToolMessage(
                        content=error_msg,
                        name=tool_name,
                        tool_call_id=tool_call.get("id", "unknown")
                    ))
        
        end_time = time.time()
        end_datetime = datetime.now()
        duration = end_time - start_time
        
        print(f"结束时间: {end_datetime.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"工具节点执行完成，耗时: {duration:.3f}秒\n")
        
        if tool_outputs:
            last_tool_name = tool_outputs[-1].name
            if last_tool_name == "GetActionPlanRef":
                print(f"工具获取plan信息")
            else:
                print(f"工具消息最新消息: {tool_outputs[-1].content}")

        record = {
            "type": "call_tools",
            "start_time": start_datetime.strftime('%Y-%m-%d %H:%M:%S'),
            "end_time": end_datetime.strftime('%Y-%m-%d %H:%M:%S'),
            "duration": f"{duration:.3f}秒",
            "tools_called": tool_names_called,
            "tool_results": tool_results
        }
        self.execution_records.append(record)

        return {"messages": tool_outputs}
    
    def _get_initial_info(self, state: AgentState) -> Dict[str, Any]:
        """
        并行获取初始信息节点：同时获取场景图和动作计划参考
        
        Args:
            state: 当前状态
            
        Returns:
            Dict: 包含初始信息的状态更新
        """
        start_time = time.time()
        start_datetime = datetime.now()
        
        print(f"\n📋 进入并行信息获取节点...")
        print(f"进入时间: {start_datetime.strftime('%Y-%m-%d %H:%M:%S')}")
        
        scene_graph_tool = self.tool_manager.get_tool_by_name("GetSceneGraph")
        # action_ref_tool = self.tool_manager.get_tool_by_name("GetActionPlanRef")
        
        print("🔍 获取场景图信息...")
        scene_result = scene_graph_tool("")
        print("✅ 场景图信息获取完成")
        
        # action_ref_result = action_ref_tool("")
        
        info_content = f"""

    
            {scene_result}

            """
        
        end_time = time.time()
        end_datetime = datetime.now()
        duration = end_time - start_time
        
        print(f"结束时间: {end_datetime.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"并行信息获取完成，耗时: {duration:.3f}秒\n")
        
        record = {
            "type": "get_initial_info",
            "start_time": start_datetime.strftime('%Y-%m-%d %H:%M:%S'),
            "end_time": end_datetime.strftime('%Y-%m-%d %H:%M:%S'),
            "duration": f"{duration:.3f}秒",
            "tools_called": ["GetSceneGraph", "GetActionPlanRef"],
            "scene_graph_data": str(scene_result),
            "scene_info_length": len(str(scene_result))
            # "action_ref_length": len(str(action_ref_result)),
            # "total_info_size": len(str(scene_result)) + len(str(action_ref_result))
        }
        self.execution_records.append(record)
        
        from langchain_core.messages import HumanMessage
        info_message = HumanMessage(content=info_content)
        
        return {"messages": [info_message]}

    def _build_action_feedback_message(self, result, tool_args) -> str:
        """
        构建包含操作反馈和场景图的组合消息
        
        Args:
            result: 工具执行结果
            tool_args: 工具调用参数
            
        Returns:
            str: 组合的反馈消息，包含操作反馈和当前场景图
        """
        try:
            if isinstance(result, str):
                result_json = json.loads(result)
            else:
                result_json = result
            
            status = result_json.get("status", "unknown")
            
            action_query = tool_args.get("query", "") if isinstance(tool_args, dict) else str(tool_args)
            
            scene_graph = result_json.get("current_scene_graph") or result_json.get("scene_graph")
            
            if status == "execution_success":
                feedback_prefix = f"The previous action '{action_query}' was executed successfully."
                print(f"📊 构建成功反馈消息")
                
            elif status == "validation_failed":
                error_reason = result_json.get("error_reason", "Unknown validation error")
                feedback_prefix = f"The action '{action_query}' is invalid, reason: {error_reason}"
                print(f"📊 构建验证失败反馈消息: {error_reason}")
                
            elif status == "task_failed":
                error_reason = result_json.get("error_reason", "Task failed")
                feedback_prefix = f"The action '{action_query}' failed, reason: {error_reason}"
                print(f"📊 构建任务失败反馈消息: {error_reason}")
                
            elif status == "execution_timeout":
                feedback_prefix = f"The action '{action_query}' timed out waiting for completion signal."
                print(f"📊 构建超时反馈消息")
                
            elif status == "execution_error":
                error_msg = result_json.get("message", "Unknown execution error")
                feedback_prefix = f"The action '{action_query}' encountered an error: {error_msg}"
                print(f"📊 构建执行错误反馈消息")
                
            else:
                message = result_json.get("message", "")
                if message:
                    feedback_prefix = f"Action '{action_query}' result: {message}"
                else:
                    feedback_prefix = f"Action '{action_query}' completed with status: {status}"
                print(f"📊 构建未知状态反馈消息: {status}")
            
            if scene_graph:
                scene_graph_str = json.dumps(scene_graph, indent=2, ensure_ascii=False)
                feedback_message = f"{feedback_prefix}\n\nCurrent scene graph:\n{scene_graph_str}"
            else:
                try:
                    current_scene = self.scene_graph_manager.get_current_scene_graph()
                    if current_scene:
                        scene_graph_str = json.dumps(current_scene, indent=2, ensure_ascii=False)
                        feedback_message = f"{feedback_prefix}\n\nCurrent scene graph:\n{scene_graph_str}"
                    else:
                        feedback_message = f"{feedback_prefix}\n\n(Scene graph not available)"
                except:
                    feedback_message = f"{feedback_prefix}\n\n(Scene graph not available)"
            
            print(f"📝 最终反馈消息长度: {len(feedback_message)}")
            return feedback_message
            
        except (json.JSONDecodeError, AttributeError, TypeError) as e:
            print(f"⚠️ 解析结果失败: {e}，返回原始结果")
            return str(result)

    def _call_validate_execute(self, state: AgentState) -> Dict[str, Any]:
        """
        调用ValidateAndExecuteAction工具节点
        
        Args:
            state: 当前状态
            
        Returns:
            Dict: 包含 tool messages 的状态更新
        """
        start_time = time.time()
        start_datetime = datetime.now()
        
        tool_outputs = []
        last_message = state["messages"][-1]
        print(f"\n⚡ 进入ValidateAndExecuteAction工具节点...")
        print(f"进入时间: {start_datetime.strftime('%Y-%m-%d %H:%M:%S')}")
        
        tool_names_called = []
        tool_results = {}
        
        if hasattr(last_message, 'tool_calls') and last_message.tool_calls:
            tool_call = last_message. tool_calls[0]  
            try:
                tool_name = tool_call["name"]
                tool_args = tool_call["args"]
                tool_call_id = tool_call["id"]
                print(f"🔧 调用工具: {tool_args}")
                # if self.last_call_message is not None:          
                if self.last_last_call_message is not None and tool_args == self.last_last_call_message:
                    print(f"⚠️  工具调用与上上次相同，标记为invalid")

                    self.same_tool_count=0
                    self. last_call_message=None
                    self.last_last_call_message=None
                    end_time = time.time()
                    end_datetime = datetime.now()
                    duration = end_time - start_time
                    record = {  
                        "type": "call_validate_execute",  
                        "start_time": start_datetime. strftime('%Y-%m-%d %H:%M:%S'),  
                        "end_time": end_datetime.strftime('%Y-%m-%d %H:%M:%S'),  
                        "duration": f"{duration:.3f}秒",  
                        "tools_called": ["ValidateAndExecuteAction"],  
                        "tool_results": {"ValidateAndExecuteAction": f"invalid, reason: The action \"{tool_args}\" is the same as the one before last. "},  
                        # "task_failed": False,  
                        "action_invalid": True,
                        "invalid_reason": f"The action \"{tool_args}\" is the same as the one before last."
                    }  
                    self.execution_records.append(record)
                    return {"messages": [f"invalid, reason: The action \"{tool_args}\" is the same as the one before last."]} 
                
                if self. last_call_message is not None and tool_args == self.last_call_message:
                    print(f"⚠️  工具调用与上次相同")
                    self.same_tool_count+=1
                    if self.same_tool_count>=5:
                        print(f"⚠️  工具调用已重复5次，标记为invalid")
                        self.same_tool_count=0
                        self.last_call_message=None
                        end_time = time.time()
                        end_datetime = datetime. now()
                        duration = end_time - start_time
                        record = {  
                            "type": "call_validate_execute",  
                            "start_time": start_datetime.strftime('%Y-%m-%d %H:%M:%S'),  
                            "end_time": end_datetime.strftime('%Y-%m-%d %H:%M:%S'),  
                            "duration": f"{duration:.3f}秒",  
                            "tools_called": ["ValidateAndExecuteAction"],  
                            "tool_results": {"ValidateAndExecuteAction": f"invalid, reason: The action \"{tool_args}\" was repeated."},  
                            # "task_failed": False,  
                            "action_invalid": True,
                            "invalid_reason": f"The action \"{tool_args}\" was repeated."
                        }  
                        self.execution_records.append(record)
                        return {"messages": [f"invalid, reason: The action \"{tool_args}\" was repeated."]}

                else:   
                    self.same_tool_count=0
                    self.last_last_call_message=self.last_call_message
                    self.last_call_message=tool_args

                if tool_name == "ValidateAndExecuteAction":
                    print(f"🔧 调用工具: {tool_name}")
                    print(f"📝 输入参数: {tool_args}")
                    
                    tool_names_called.append(tool_name)
                    
                    if tool_name in self.tools_by_name:
                        result = self.tools_by_name[tool_name].invoke(tool_args)
                        print(f"✅ 工具输出: {result}")
                        tool_results[tool_name] = str(result)
                        
                        content_to_save = self._build_action_feedback_message(result, tool_args)
                        
                        tool_outputs.append(ToolMessage(
                            content=content_to_save,
                            name=tool_name,
                            tool_call_id=tool_call_id
                        ))
                    
            except Exception as e:
                error_msg = f"工具调用失败: {str(e)}"
                print(f"❌ {error_msg}")
                tool_results[tool_call["name"]] = error_msg
                tool_outputs.append(ToolMessage(
                    content=error_msg,
                    name=tool_call["name"],
                    tool_call_id=tool_call["id"]
                ))
        
        end_time = time.time()
        end_datetime = datetime.now()
        duration = end_time - start_time
        
        print(f"结束时间: {end_datetime.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"ValidateAndExecuteAction节点执行完成，耗时: {duration:.3f}秒\n")
        
        task_failed = False
        task_failed_reason = None
        for tool_name, result in tool_results.items():
            if tool_name == "ValidateAndExecuteAction":
                try:
                    if isinstance(result, str):
                        result_json = json.loads(result)
                        if result_json.get("status") == "task_failed":
                            task_failed = True
                            task_failed_reason = result_json.get("error_reason", "Unknown error")
                            print(f"❌ 检测到任务失败: {task_failed_reason}")
                            break
                except json.JSONDecodeError:
                    if "task_failed" in result.lower():
                        task_failed = True
                        task_failed_reason = "Task failed (parsed from string result)"
                        print(f"❌ 检测到任务失败: {task_failed_reason}")
                        break

        record = {
            "type": "call_validate_execute",
            "start_time": start_datetime.strftime('%Y-%m-%d %H:%M:%S'),
            "end_time": end_datetime.strftime('%Y-%m-%d %H:%M:%S'),
            "duration": f"{duration:.3f}秒",
            "tools_called": tool_names_called,
            "tool_results": tool_results,
            "task_failed": task_failed,
            "task_failed_reason": task_failed_reason
        }
        self.execution_records.append(record)

        result_dict = {"messages": tool_outputs}
        if task_failed:
            result_dict["task_failed"] = True
            result_dict["task_failed_reason"] = task_failed_reason
            print(f"🚨 _call_validate_execute: 检测到任务失败，设置状态标记")

            # from langchain_core.messages import SystemMessage
            # failure_message = SystemMessage(content=f"TASK_FAILED: {task_failed_reason}")
            # result_dict["messages"].append(failure_message)
            from langchain_core.messages import SystemMessage
            continue_message = SystemMessage(content="If the user goal is not completed, please continue planning.")
            tool_outputs.append(continue_message)

        return {"messages": tool_outputs}
        # return result_dict

    def _should_continue(self, state: AgentState) -> str:
        """
        决定是否继续执行的条件函数
        
        Args:
            state: 当前状态
            
        Returns:
            str: 'continue' 或 'end'
        """
        last_message = state["messages"][-1]
        
        if hasattr(last_message, 'tool_calls') and last_message.tool_calls:
            for tool_call in last_message.tool_calls:
                if tool_call["name"] == "ValidateAndExecuteAction":
                    print(f"🔄 检测到ValidateAndExecuteAction工具调用，继续执行")
                    return "continue"
            print(f"🛑 检测到其他工具调用，终止执行")
            return "end"
        else:
            print(f"🛑 没有工具调用，终止执行")
            return "end"

    def _should_continue_after_execution(self, state: AgentState) -> str:
        """
        在validate_execute执行后，决定是否继续执行的条件函数
        检查是否有验证失败或任务失败，如果有则直接结束

        Args:
            state: 当前状态

        Returns:
            str: 'continue' 或 'end'
        """
        print(f"🔍 _should_continue_after_execution: 检查执行结果状态")
        print(f"🔍 状态键: {list(state.keys())}")
        print(f"🔍 task_failed值: {state.get('task_failed', 'NOT_FOUND')}")

        messages = state.get("messages", [])

        for msg in messages:
            if hasattr(msg, 'content') and isinstance(msg.content, str) and msg.content.startswith("TASK_FAILED:"):
                print(f"❌ 在消息中检测到TASK_FAILED标记，直接结束执行")
                print(f"失败原因: {msg.content[12:]}")
                return "end"

        last_tool_message = None
        for msg in reversed(messages):
            if hasattr(msg, 'name') and msg.name == "ValidateAndExecuteAction":
                last_tool_message = msg
                break

        if last_tool_message and hasattr(last_tool_message, 'content'):
            content = last_tool_message.content

            try:
                import json
                result_json = json.loads(content)
                status = result_json.get("status", "")

                if status == "validation_failed":
                    error_reason = result_json.get("error_reason", "Unknown validation error")
                    print(f"❌ 检测到验证失败(validation_failed)，Agent规划错误，直接结束执行")
                    print(f"错误原因: {error_reason}")
                    return "end"

                elif status == "task_failed":
                    error_reason = result_json.get("error_reason", "Task failed")
                    print(f"❌ 检测到任务失败(task_failed)，直接结束执行")
                    print(f"失败原因: {error_reason}")
                    return "end"

            except (json.JSONDecodeError, TypeError):
                if content.startswith("The action '") and "is invalid, reason:" in content:
                    print(f"❌ 检测到验证失败(文本格式)，Agent规划错误，直接结束执行")
                    print(f"错误信息: {content[:200]}...")
                    return "end"

        if state.get("task_failed", False):
            print(f"❌ 检测到任务失败(state标记)，直接结束执行")
            if "task_failed_reason" in state:
                print(f"失败原因: {state['task_failed_reason']}")
            return "end"

        if self.execution_records:
            last_record = self.execution_records[-1]
            if last_record.get("type") == "call_validate_execute" and last_record.get("task_failed", False):
                print(f"❌ 从执行记录中检测到任务失败，直接结束执行")
                if last_record.get("task_failed_reason"):
                    print(f"失败原因: {last_record['task_failed_reason']}")
                return "end"

        print(f"✅ 动作执行成功，继续agent推理")
        return "continue"

    def _should_execute_action(self, state: AgentState) -> str:
        """
        决定agent是否需要执行动作的条件函数

        Args:
            state: 当前状态

        Returns:
            str: 'execute' 或 'end'
        """
        last_message = state["messages"][-1]

        if hasattr(last_message, 'tool_calls') and last_message.tool_calls:
            for i, tool_call in enumerate(last_message.tool_calls):
                print(f"    工具调用 {i}: {tool_call}")
                print(f"    工具调用类型: {type(tool_call)}")

                tool_name = None
                if isinstance(tool_call, dict):
                    tool_name = tool_call.get("name")
                elif hasattr(tool_call, 'name'):
                    tool_name = tool_call.name

                print(f"    提取的工具名称: {tool_name}")

                if tool_name == "ValidateAndExecuteAction":
                    print(f"✅ 检测到ValidateAndExecuteAction，准备执行动作")
                    return "execute"

        print(f"🏁 没有动作需要执行，结束流程")
        return "end"

    def _initialize_llm(self):

        if not LANGCHAIN_AVAILABLE:
            print("错误: LangChain 依赖不可用，无法初始化 LLM")
            return None
    
        return ChatOpenAI(
            model=LLM_CONFIG.get("model", "qwen3-8b"),
            api_key=LLM_CONFIG.get("api_key"),
            base_url=LLM_CONFIG.get("base_url"),
            temperature=LLM_CONFIG.get("temperature", 1.0),
            max_tokens=LLM_CONFIG.get("max_tokens", 2048),

            top_p=LLM_CONFIG.get("top_p", 0.9),
            extra_body={
                "top_k": int(LLM_CONFIG.get("top_k", 5)),
                "enable_thinking": bool(LLM_CONFIG.get("enable_thinking", False)),
                "thinking_budget": LLM_CONFIG.get("thinking_budget", None)
            }
        )

    def _load_system_prompt(self) -> str:
        """
        加载系统提示

        Returns:
            str: 系统提示内容
        """
        try:
            prompt_path = PROMPT_CONFIG["system_prompt_kewei_path"]
            print(f"📂 正在加载Agent系统提示文件: {prompt_path}")
            
            with open(prompt_path, "r", encoding="utf-8") as f:
                print("✅ 系统提示加载成功")
                print(f"✅ 成功加载Agent系统提示文件: {prompt_path}")
                return f.read().strip()
        except Exception as e:
            print(f"⚠️ 加载系统提示失败: {e}")
            print(f"📂 尝试加载的文件路径: {PROMPT_CONFIG.get('system_prompt_kewei_path', 'N/A')}")
            return PROMPT_CONFIG.get("fallback_prompt", "You are a helpful robotic operation planning assistant.")

    def initialize(self) -> bool:
        """
        初始化 Agent 系统

        Returns:
            bool: 初始化是否成功
        """
        print("=== 机器人操作规划助手 (LangGraph Agent 模式) ===")
        print("正在初始化...")

        if not LANGCHAIN_AVAILABLE:
            print("错误: LangChain 依赖不可用，无法初始化 Agent")
            return False

        ros_success = self.ros_manager.initialize()
        if not ros_success:
            print("警告: ROS 订阅器初始化失败，scene graph 功能不可用")

        if self.llm is None:
            print("错误: LLM 初始化失败")
            return False

        api_success = self._test_api_connection()
        if not api_success:
            print("错误: API 连接测试失败")
            return False

        try:
            if not hasattr(self, 'action_tools') or not self.action_tools:
                self.action_tools = self.tool_manager.get_action_tool_only()
                if self.llm is not None:
                    # self.llm = self.llm.bind_tools(self.action_tools)
                    self.tools_by_name = {tool.name: tool for tool in self.all_tools}
            
            workflow = StateGraph(AgentState)            
            workflow.add_node("get_initial_info", self._get_initial_info)
            workflow.add_node("agent", self._call_model)
            workflow.add_node("validate_execute", self._call_validate_execute)
            workflow.set_entry_point("get_initial_info")            
            workflow.add_edge("get_initial_info", "agent")            
            workflow.add_conditional_edges(
                "agent",
                self._should_execute_action,
                {
                    "execute": "validate_execute",
                    "end": END
                }
            )            
            workflow.add_conditional_edges(
                "validate_execute",
                self._should_continue_after_execution,
                {
                    "continue": "agent",
                    "end": END
                }
            )
            self.agent = workflow.compile()
            print("🎯 新的优化工作流初始化成功!")
            print("📋 流程: 信息获取 → Agent推理 → [需要时]执行动作 → [检查失败] → 完成")
            self.is_ready = True
            return True
        except Exception as e:
            print(f"Agent 初始化失败: {e}")
            return False

    def _test_api_connection(self) -> bool:
        """
        测试 API 连接，包含重试机制

        Returns:
            bool: API 连接是否成功
        """
        model_name=LLM_CONFIG.get("model", "claude-sonnet-4-20250514")
        print(f"🚀🚀 --------  正在测试 {model_name} API 连接...-------- 🚀🚀 ")

        max_retries = RETRY_CONFIG.get("max_retries", 3)
        base_delay = RETRY_CONFIG.get("base_delay", 15)
        
        for attempt in range(max_retries + 1):
            try:
                def test_api():
                    return self.llm.invoke("Hello, please reply with 'API test successful'")

                timeout = AGENT_CONFIG.get("api_test_timeout", 15)
                with concurrent.futures.ThreadPoolExecutor() as executor:
                    future = executor.submit(test_api)
                    try:
                        test_response = future.result(timeout=timeout)
                        content = getattr(test_response, 'content', str(test_response))
                        print(f"API 测试成功: {content}")

                        if hasattr(test_response, 'usage_metadata') and test_response.usage_metadata:
                            usage = test_response.usage_metadata
                            print(f"🔹 API 测试 Token 使用: 输入={usage.get('input_tokens', 'N/A')}, 输出={usage.get('output_tokens', 'N/A')}, 总计={usage.get('total_tokens', 'N/A')}")

                        return True
                        
                    except concurrent.futures.TimeoutError:
                        if attempt < max_retries:
                            delay = base_delay * (2 ** attempt)
                            print(f"⏱️ API 测试超时，第 {attempt + 1} 次重试，将在 {delay} 秒后重试...")
                            time.sleep(delay)
                            continue
                        else:
                            print("API 测试超时")
                            return False
                            
                    except Exception as e:
                        error_str = str(e)
                        if self._is_rate_limit_error(error_str) and RETRY_CONFIG.get("retry_on_429", True):
                            if attempt < max_retries:
                                suggested_delay = self._extract_retry_delay(error_str)
                                delay = max(suggested_delay, base_delay * (2 ** attempt))
                                print(f"🚫 API 测试遇到速率限制，第 {attempt + 1} 次重试，将在 {delay} 秒后重试...")
                                time.sleep(delay)
                                continue
                            else:
                                print(f"API 测试失败 (速率限制): {error_str}")
                                return False
                        else:
                            print(f"API 测试失败: {error_str}")
                            return False
                            
            except Exception as e:
                print(f"API 初始化失败: {str(e)}")
                return False
        
        print("API 测试失败，已尝试所有重试")
        return False
    def reset_validation_count(self):
      """重置动作验证执行工具的验证次数"""
      validation_tool = self.tool_manager.get_tool_by_name("ValidateAndExecuteAction")
      if validation_tool and hasattr(validation_tool, 'validation_count'):
          validation_tool.validation_count = 0
          validation_tool.consecutive_failures= 0
          self.same_tool_count=0
          self.last_call_message=None
          self.last_last_call_message=None
          print("✅ 验证计数已重置")

    import re

    def extract_cfg_task(self,user_input: str) -> str:
        """
        从 "配置_数字: 任务指令" 里提取真正的任务指令。
        例如：
            配置_17: move red_cubes into blue_box.
        返回：
            move red_cubes into blue_box.
        如果格式不对，返回空字符串。
        """
        m = re.match(r"配置_\d+:\s*(.*)", user_input.strip())
        return m.group(1).strip() if m else ""

    def process_user_input(self, user_input: str) -> str:
        """
        处理用户输入，包含重试机制
        
        Args:
            user_input: 用户输入
            
        Returns:
            str: Agent 响应
        """
        if not self.is_ready:
            return "Agent 尚未初始化，请先调用 initialize() 方法"
        self.reset_validation_count()
        self._reset_execution_records()
        self.task_start_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]

        if user_input.startswith("配置_"):
            agent_input_cmd = self.extract_cfg_task(user_input)
        else:
            agent_input_cmd = user_input

        print(f"正在处理: {agent_input_cmd}")
        print(f"任务开始时间: {self.task_start_time}")
        

        max_retries = RETRY_CONFIG.get("max_retries", 3)
        base_delay = RETRY_CONFIG.get("base_delay", 15)
        max_delay = RETRY_CONFIG.get("max_delay", 120)
        backoff_factor = RETRY_CONFIG.get("backoff_factor", 2)

        for attempt in range(max_retries + 1):
            response_text = None

            try:
                print("Agent 正在思考并调用工具...")

                def agent_call():
                    result = self.agent.invoke(
                        {"messages": [{"role": "user", "content": agent_input_cmd}]},
                        self.config
                    )

                    self.token_analyzer.analyze_conversation_tokens(
                        result, self.system_prompt, agent_input_cmd
                    )

                    response_text = self._extract_agent_output(result)

                    if response_text.startswith("❌ 任务失败:"):
                        self._save_failed_task(agent_input_cmd,user_input, response_text)

                    return response_text

                timeout = AGENT_CONFIG.get("timeout", 60)

                with concurrent.futures.ThreadPoolExecutor() as executor:
                    future = executor.submit(agent_call)
                    response_text = future.result(timeout=timeout)

                    self.task_end_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
                    print(f"任务结束时间: {self.task_end_time}")
                    print("Agent 处理完成")

                    self._save_task_execution_report(agent_input_cmd,user_input, response_text)

                    self._publish_task_completion(response_text)

                    return response_text
                    
            except concurrent.futures.TimeoutError:
                if attempt < max_retries and RETRY_CONFIG.get("retry_on_timeout", True):
                    delay = min(base_delay * (backoff_factor ** attempt), max_delay)
                    print(f"⏱️ 处理超时，第 {attempt + 1} 次重试，将在 {delay} 秒后重试...")
                    time.sleep(delay)
                    continue
                else:
                    self.task_end_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
                    response_text = "抱歉，处理超时。请尝试简化您的请求。"
                    self._save_task_execution_report(agent_input_cmd,user_input, response_text)
                    self._publish_task_completion(response_text)
                    return response_text
                    
            except Exception as e:
                error_str = str(e)

                if self._is_rate_limit_error(error_str) and RETRY_CONFIG.get("retry_on_429", True):
                    if attempt < max_retries:
                        suggested_delay = self._extract_retry_delay(error_str)
                        backoff_delay = base_delay * (backoff_factor ** attempt)
                        delay = min(max(suggested_delay, backoff_delay), max_delay)

                        print(f"🚫 遇到速率限制错误 (429)，第 {attempt + 1} 次重试")
                        print(f"⏱️ 将在 {delay} 秒后重试...")
                        print(f"📝 错误详情: {error_str}")

                        time.sleep(delay)

                        continue
                    else:
                        self._save_failed_task(agent_input_cmd,user_input, error_str)
                        self.task_end_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
                        response_text = f"❌ 速率限制错误，已尝试 {max_retries} 次重试仍然失败。请稍后再试。\n💡 输入 'goon' 可以重试该任务。\n错误详情: {error_str}"
                        self._save_task_execution_report(agent_input_cmd,user_input, response_text)
                        self._publish_task_completion(response_text)
                        return response_text
                elif self._is_server_error(error_str) and RETRY_CONFIG.get("retry_on_500", True):
                    if attempt < max_retries:
                        backoff_delay = base_delay * (backoff_factor ** attempt)
                        delay = min(backoff_delay, max_delay)

                        print(f"🔧 遇到服务器内部错误 (500)，第 {attempt + 1} 次重试")
                        print(f"⏱️ 将在 {delay} 秒后重试...")
                        print(f"📝 错误详情: {error_str}")

                        time.sleep(delay)
                        continue
                    else:
                        self._save_failed_task(agent_input_cmd,user_input, error_str)
                        self.task_end_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
                        response_text = f"❌ 服务器内部错误，已尝试 {max_retries} 次重试仍然失败。请稍后再试。\n💡 输入 'goon' 可以重试该任务。\n错误详情: {error_str}"
                        self._save_task_execution_report(agent_input_cmd,user_input, response_text)
                        self._publish_task_completion(response_text)
                        return response_text
                else:
                    self._save_failed_task(agent_input_cmd,user_input, error_str)
                    self.task_end_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
                    response_text = f"Agent处理错误: {error_str}\n💡 输入 'goon' 可以重试该任务。"
                    self._save_task_execution_report(agent_input_cmd,user_input, response_text)
                    self._publish_task_completion(response_text)
                    return response_text

        self._save_failed_task(agent_input_cmd,user_input, "处理失败，已尝试所有重试")
        self.task_end_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
        response_text = f"❌ 处理失败，已尝试 {max_retries + 1} 次，请稍后再试。\n💡 输入 'goon' 可以重试该任务。"
        self._save_task_execution_report(agent_input_cmd,user_input, response_text)
        self._publish_task_completion(response_text)

        return response_text
    def _save_failed_task(self, task: str,user: str, error_message: str):
        """
        保存失败的任务信息
        
        Args:
            task: 失败的任务
            error_message: 错误信息
        """
        self.last_failed_task = task
        self.last_error_message = error_message
        try:
            self.last_task_context = self.scene_graph_manager.get_latest_scene_graph()
        except:
            self.last_task_context = None
        print(f"📝 已保存失败任务: {task}")
    
    def retry_last_task(self) -> str:
        """
        重试上一个失败的任务
        
        Returns:
            str: 重试结果
        """
        if not self.last_failed_task:
            return "❌ 没有可重试的任务。"
        
        print(f"🔄 正在重试任务: {self.last_failed_task}")
        if self.last_error_message:
            print(f"📋 上次错误: {self.last_error_message}")
        
        task_to_retry = self.last_failed_task
        self.last_failed_task = None
        self.last_error_message = None
        self.last_task_context = None
        
        return self.process_user_input(task_to_retry)
    
    def has_failed_task(self) -> bool:
        """
        检查是否有失败的任务可以重试
        
        Returns:
            bool: 是否有失败的任务
        """
        return self.last_failed_task is not None

    def _extract_agent_output(self, result) -> str:
        """
        提取 Agent 输出

        Args:
            result: Agent 返回结果

        Returns:
            str: 提取的输出
        """
        if isinstance(result, dict):
            if result.get("task_failed", False):
                failure_reason = result.get("task_failed_reason", "任务执行失败")
                failure_message = f"❌ 任务失败: {failure_reason}"

                if "messages" in result:
                    messages = result["messages"]
                    for msg in reversed(messages):
                        if hasattr(msg, 'name') and msg.name == "ValidateAndExecuteAction":
                            try:
                                import json
                                tool_result = json.loads(msg.content)
                                if tool_result.get("status") == "task_failed":
                                    detailed_reason = tool_result.get("error_reason", "")
                                    if detailed_reason and detailed_reason != failure_reason:
                                        failure_message += f"\n详细信息: {detailed_reason}"
                            except (json.JSONDecodeError, AttributeError):
                                if msg.content and msg.content.strip():
                                    failure_message += f"\n工具输出: {msg.content[:500]}{'...' if len(msg.content) > 500 else ''}"
                            break

                return failure_message

            if "output" in result:
                return result["output"]
            elif "messages" in result:
                messages = result["messages"]
                for msg in reversed(messages):
                    if isinstance(msg, AIMessage):
                        return msg.content
                for msg in reversed(messages):
                    if hasattr(msg, 'name') and msg.name == "ValidateAndExecuteAction":
                        return f"工具执行结果: {msg.content}"
            return "[未找到 output]"
        return str(result)

    def spin_once(self):
        """处理一次 ROS 消息"""
        if self.ros_manager.is_ros_available():
            self.ros_manager.spin_once()

    def get_system_status(self) -> Dict[str, Any]:
        """
        获取系统状态

        Returns:
            Dict: 系统状态信息
        """
        return {
            "is_ready": self.is_ready,
            "ros_status": self.ros_manager.get_status(),
            "scene_graph_stats": self.scene_graph_manager.get_scene_graph_stats(),
            "tool_stats": self.tool_manager.get_all_tools_stats(),
            "token_analyzer_stats": self.token_analyzer.get_token_stats()
        }

    def _on_task_received(self, task_content: str):
        """
        ROS任务指令回调函数
        
        Args:
            task_content: 从ROS话题接收的任务内容
        """
        try:
            print(f"🎯 Agent收到ROS任务指令: {task_content}")
            self.task_queue.put(task_content)
            print(f"📋 任务已加入队列，当前队列大小: {self.task_queue.qsize()}")
        except Exception as e:
            print(f"❌ 处理ROS任务指令时出错: {e}")
    
    def get_pending_task(self) -> Optional[str]:
        """
        获取待处理的任务
        
        Returns:
            Optional[str]: 待处理的任务，如果没有则返回None
        """
        try:
            return self.task_queue.get_nowait()
        except Empty:
            return None
    
    def has_pending_tasks(self) -> bool:
        """
        检查是否有待处理的任务
        
        Returns:
            bool: 是否有待处理的任务
        """
        return not self.task_queue.empty()
    
    def get_task_queue_size(self) -> int:
        """
        获取任务队列大小
        
        Returns:
            int: 队列中的任务数量
        """
        return self.task_queue.qsize()

    def shutdown(self):
        """关闭 Agent 系统"""
        print("正在关闭 Agent 系统...")
        self.ros_manager.shutdown()
        self.scene_graph_manager.reset_stability_tracking()
        self.tool_manager.reset_all_tools_stats()
        self.is_ready = False
        print("Agent 系统已关闭")

    def _is_rate_limit_error(self, error_str: str) -> bool:
        """
        检测是否为速率限制错误 (429)
        
        Args:
            error_str: 错误字符串
            
        Returns:
            bool: 是否为速率限制错误
        """
        error_indicators = [
            "429",
            "You exceeded your current quota",
            "rate limit", 
            "quota_metric",
            "GenerateRequestsPerMinutePerProjectPerModel",
            "retry_delay"
        ]
        error_lower = error_str.lower()
        return any(indicator.lower() in error_lower for indicator in error_indicators)
    
    def _is_server_error(self, error_str: str) -> bool:
        """
        检测是否为服务器内部错误 (500)
        
        Args:
            error_str: 错误字符串
            
        Returns:
            bool: 是否为服务器内部错误
        """
        error_indicators = [
            "500",
            "internal error",
            "internal server error",
            "provider api error",
            "an internal error has occurred"
        ]
        error_lower = error_str.lower()
        return any(indicator.lower() in error_lower for indicator in error_indicators)
    
    def _extract_retry_delay(self, error_str: str) -> int:
        """
        从错误信息中提取建议的重试延时
        
        Args:
            error_str: 错误字符串
            
        Returns:
            int: 建议的延时秒数，默认为配置的基础延时
        """
        retry_delay_match = re.search(r'retry_delay\s*\{\s*seconds:\s*(\d+)', error_str)
        if retry_delay_match:
            return int(retry_delay_match.group(1))
        
        return RETRY_CONFIG.get("base_delay", 15)

    def _save_task_execution_report(self, agent_input_cmd:str, user_input: str, agent_response: str):
        """
        保存任务执行报告到本地文件
        
        Args:
            user_input: 用户输入的指令
            agent_input_cmd: Agent的输入指令
            agent_response: Agent的响应
        """
        global call_model_count
        call_model_count=0
        self.last_call_message=None
        self.same_tool_count=0
        try:
            timestamp = datetime.now().strftime('%Y_%m_%d_%H_%M_%S')
            report_dir = "./agent_report/make_table"
            report_file = os.path.join(report_dir, f"{timestamp}_agent_report.txt")
            
            os.makedirs(report_dir, exist_ok=True)
            
            report_content = []
            report_content.append("=" * 80)
            report_content.append(f"任务执行报告 - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            report_content.append("=" * 80)
            
            report_content.append(f"\n【任务信息】")
            report_content.append(f"用户指令: {agent_input_cmd}")
            report_content.append(f"用户原始指令: {user_input}")
            report_content.append(f"任务开始时间: {self.task_start_time}")
            report_content.append(f"任务结束时间: {self.task_end_time}")
            
            if self.task_start_time and self.task_end_time:
                try:
                    start_dt = datetime.strptime(self.task_start_time, '%Y-%m-%d %H:%M:%S.%f')
                    end_dt = datetime.strptime(self.task_end_time, '%Y-%m-%d %H:%M:%S.%f')
                    total_duration = (end_dt - start_dt).total_seconds()
                    report_content.append(f"总耗时: {total_duration:.2f}秒")
                except ValueError:
                    try:
                        start_dt = datetime.strptime(self.task_start_time, '%Y-%m-%d %H:%M:%S')
                        end_dt = datetime.strptime(self.task_end_time, '%Y-%m-%d %H:%M:%S')
                        total_duration = (end_dt - start_dt).total_seconds()
                        report_content.append(f"总耗时: {total_duration:.2f}秒")
                    except ValueError:
                        report_content.append(f"总耗时: 无法计算（时间格式错误）")
            
            report_content.append(f"\n【执行序列】")
            report_content.append("执行顺序:")
            for i, record in enumerate(self.execution_records):
                if record["type"] == "call_model":
                    sequence_item = f"agent{record['count']}"
                elif record["type"] == "get_initial_info":
                    sequence_item = f"get_initial_info(GetSceneGraph, GetActionPlanRef)"
                elif record["type"] == "call_validate_execute":
                    tool_names = ", ".join(record["tools_called"]) if record["tools_called"] else "ValidateAndExecuteAction"
                    sequence_item = f"validate_execute({tool_names})"
                else:
                    tool_names = ", ".join(record["tools_called"]) if record["tools_called"] else "无工具调用"
                    sequence_item = f"tools({tool_names})"
                
                duration_info = f" (耗时: {record['duration']})" if 'duration' in record else ""
                
                report_content.append(f"  {sequence_item}{duration_info}")
                
                if i < len(self.execution_records) - 1:
                    report_content.append("  ↓")
            
            report_content.append(f"\n【详细执行记录】")
            for i, record in enumerate(self.execution_records, 1):
                report_content.append(f"\n--- 第{i}步: {record['type']} ---")
                report_content.append(f"开始时间: {record['start_time']}")
                report_content.append(f"结束时间: {record['end_time']}")
                report_content.append(f"耗时: {record['duration']}")
                
                if record["type"] == "call_model":
                    report_content.append(f"模型调用次数: 第{record['count']}次")
                    report_content.append(f"调用的工具: {', '.join(record['tool_calls']) if record['tool_calls'] else '无'}")
                    
                    model_output = record['model_output']
                    if (not model_output or model_output.strip() == '') and record.get('tool_calls_detail'):
                        tool_calls_info = []
                        for tool_call in record['tool_calls_detail']:
                            tool_info = f"工具调用: {tool_call}"
                            tool_calls_info.append(tool_info)
                        model_output = '\n'.join(tool_calls_info)
                    else:
                        if len(model_output) > 5000:
                            model_output = model_output[:5000] + "...(截断)"
                    
                    report_content.append(f"模型输出: {model_output}")
                    
                elif record["type"] == "call_tools":
                    report_content.append(f"调用的工具: {', '.join(record['tools_called']) if record['tools_called'] else '无'}")
                    for tool_name, result in record['tool_results'].items():
                        if len(result) > 5000:
                            result = result[:5000] + "...(截断)"
                        report_content.append(f"  {tool_name}: {result}")
                
                elif record["type"] == "get_initial_info":
                    report_content.append(f"执行类型: 并行信息获取")
                    report_content.append(f"调用的工具: {', '.join(record['tools_called'])}")
                    
                    if 'scene_graph_data' in record:
                        report_content.append(f"\n【GetSceneGraph信息】")
                        scene_data = record['scene_graph_data']
                        if len(scene_data) > 5000:
                            scene_data = scene_data[:5000] + "...(截断)"
                        report_content.append(scene_data)
                    
                    report_content.append(f"\n【GetActionPlanRef信息】")
                    report_content.append(f"信息长度: {record.get('action_ref_length', 0)} 字符")
                    report_content.append(f"状态: {record.get('action_ref_info', '信息已获取')}")
                    
                    report_content.append(f"\n总信息量: {record.get('total_info_size', 0)} 字符")
                
                elif record["type"] == "call_validate_execute":
                    report_content.append(f"执行类型: 动作验证执行")
                    report_content.append(f"调用的工具: {', '.join(record['tools_called']) if record['tools_called'] else '无'}")

                    if record.get("task_failed", False):
                        report_content.append(f"🆕 任务状态: 失败 ❌")
                        if record.get("task_failed_reason"):
                            report_content.append(f"🆕 失败原因: {record['task_failed_reason']}")
                    else:
                        report_content.append(f"🆕 任务状态: 成功 ✅")

                    for tool_name, result in record['tool_results'].items():
                        if len(result) > 5000:
                            result = result[:5000] + "...(截断)"
                        report_content.append(f"  {tool_name}: {result}")
            
            report_content.append(f"\n【Agent最终响应】")
            if agent_response.startswith("❌ 任务失败:"):
                report_content.append(f"🆕 最终结果: 任务失败")
            report_content.append(agent_response)

            validation_failure_reason = None
            for record in reversed(self.execution_records):
                if record.get("type") == "call_validate_execute":
                    tool_results = record.get("tool_results", {})
                    for tool_name, result in tool_results.items():
                        if tool_name == "ValidateAndExecuteAction":
                            try:
                                import json
                                result_json = json.loads(result)
                                status = result_json.get("status", "")

                                if status in ["validation_failed", "task_failed"]:
                                    error_reason = result_json.get("error_reason", "")
                                    if error_reason:
                                        validation_failure_reason = error_reason
                                        break
                            except (json.JSONDecodeError, TypeError):
                                if "is invalid, reason:" in result:
                                    match = re.search(r'is invalid, reason:\s*([^\n]+)', result)
                                    if match:
                                        validation_failure_reason = match.group(1).strip()
                                        break
                    break

            if validation_failure_reason:
                report_content.append(f"\n【失败原因】")
                report_content.append(f"校验工具返回错误: {validation_failure_reason}")

            report_content.append("\n" + "=" * 80 + "\n")
            
            with open(report_file, 'w', encoding='utf-8') as f:
                f.write('\n'.join(report_content))
            
            print(f"✅ 任务执行报告已保存到: {report_file}")
            
        except Exception as e:
            print(f"❌ 保存任务执行报告时出错: {e}")
    
    def _reset_execution_records(self):
        """重置执行记录，为下一个任务做准备"""
        self.execution_records = []
        self.task_start_time = None
        self.task_end_time = None

    def _publish_task_completion(self, agent_response: str):
        """
        发布任务完成通知，包含agent回复和当前scene graph
        
        Args:
            agent_response: Agent的回复内容
        """
        try:
            current_scene_graph = self.scene_graph_manager.get_latest_scene_graph()
            
            success = self.ros_manager.publish_task_completion(agent_response, current_scene_graph)
            
            if success:
                print("✅ 任务完成通知发布成功")
            else:
                print("⚠️ 任务完成通知发布失败")
                
        except Exception as e:
            print(f"❌ 发布任务完成通知时出错: {e}")

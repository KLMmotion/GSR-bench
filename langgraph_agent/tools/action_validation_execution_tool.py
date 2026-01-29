# -*- coding: utf-8 -*-
"""
动作验证执行工具：合并了验证和执行功能
Created: 2025-08-23
Updated: 2025-08-29
Author: kewei

将原来的两步操作合并为一个工具：
1. 先进行动作验证（基于场景图约束）
2. 如果验证通过，直接执行动作并通过订阅 /agent_trigger 话题判断完成
3. 如果验证失败，返回详细的错误信息供Agent重新规划

更新说明 (2025-08-29):
- 修改执行完成触发机制，从实时场景图分析改为订阅 /agent_trigger 话题
- 当 /agent_trigger 话题值为 true 时，等待0.5秒后返回最新场景图
- 保持其他验证和执行功能不变
"""

import json
import time
import sys
import os
from typing import Dict, Any, Optional, List

try:
    from .base_tool import BaseTool
    from config import STABILITY_CONFIG, ROS2_CONFIG
except ImportError:
    from langgraph_agent.tools.base_tool import BaseTool
    from langgraph_agent.config import STABILITY_CONFIG, ROS2_CONFIG

# ROS2 imports
try:
    import rclpy
    from std_msgs.msg import String, Bool
    from rclpy.qos import QoSProfile, HistoryPolicy, ReliabilityPolicy, DurabilityPolicy
    ROS2_AVAILABLE = True
except ImportError:
    print("ROS2 not available, action command publishing will be disabled")
    ROS2_AVAILABLE = False


class ActionValidationExecutionTool(BaseTool):
    """
    动作验证执行工具：集成验证和执行功能
    
    工作流程：
    1. 接收Agent规划的动作指令
    2. 基于当前场景图进行验证
    3. 如果验证失败：返回详细错误信息供重新规划
    4. 如果验证通过：直接执行动作并订阅 /agent_trigger 话题等待完成信号
    5. 当 /agent_trigger 值为 true 时，等待0.5秒后更新并返回最新场景图
    """

    def __init__(self, scene_graph_manager, scene_graph_getter=None, agent=None):
        super().__init__(
            name="ValidateAndExecuteAction",
            description="Call this with your planned action to validate and execute it. This tool first validates the action against current scene constraints. If valid, it executes the action and waits for completion. If invalid, it returns detailed feedback for replanning."
        )
        self.scene_graph_manager = scene_graph_manager
        self.scene_graph_getter = scene_graph_getter or (scene_graph_manager.get_latest_scene_graph if hasattr(scene_graph_manager, 'get_latest_scene_graph') else None)
        self.agent = agent
        self.init_raw_data = None
        self.init_scene_graph_data= None
        
        self.validation_cache = {}
        self.validation_count = 0
        self.success_count = 0
        
        self.consecutive_failures = 0
        self.max_consecutive_failures = 5
        
        self.action_cmd_publisher = None
        self.scene_graph_transmit_publisher = None
        self.init_raw_msg_publisher = None
        self.agent_trigger_subscriber = None
        self.trigger_received = False
        self._ros_node = None
        
        self.one_time_qos = QoSProfile(
            reliability=ReliabilityPolicy.RELIABLE,
            durability=DurabilityPolicy.VOLATILE,
            history=HistoryPolicy.KEEP_LAST,
            depth=1
        )
    

    def _smart_refresh_scene_graph(self):
        """
        智能刷新场景图：尝试获取最新ROS数据
        """
        try:
            agent = self.agent
            
            if not agent and hasattr(self.scene_graph_getter, '__self__'):
                scene_manager = self.scene_graph_getter.__self__
                if hasattr(scene_manager, '_agent'):
                    agent = scene_manager._agent
            
            if agent and hasattr(self.scene_graph_getter, '__self__'):
                scene_manager = self.scene_graph_getter.__self__
                if hasattr(scene_manager, 'force_refresh_from_ros'):
                    print("🔄 [GetSceneGraph] 正在刷新最新场景图数据...")
                    refreshed = scene_manager.force_refresh_from_ros(agent=agent)
                    if refreshed:
                        print("✅ [GetSceneGraph] 场景图数据已刷新")
                    else:
                        print("ℹ️ [GetSceneGraph] 场景图数据无变化")
                else:
                    print("ℹ️ [GetSceneGraph] SceneGraphManager不支持强制刷新")
            else:
                print("ℹ️ [GetSceneGraph] 无Agent实例，跳过智能刷新")
                
        except Exception as e:
            print(f"⚠️ [GetSceneGraph] 智能刷新失败: {e}")
    def execute(self, query: str = "") -> str:
        """
        执行验证和执行流程
        
        Args:
            query: 动作指令字符串，例如 "action type 1: move box3 to table"
            
        Returns:
            str: JSON格式的结果，包含验证结果或执行结果
        """
        self.validation_count += 1
        print(f"\n🔄 [ValidateAndExecute] 第 {self.validation_count} 次动作验证执行")
        
        if self.consecutive_failures >= self.max_consecutive_failures:
            print(f"❌ [ValidateAndExecute] 连续失败次数已达上限 ({self.consecutive_failures}/{self.max_consecutive_failures})，任务终止")
            
            self.consecutive_failures = 0
            
            return json.dumps({
                "status": "task_failed",
                "is_valid": False,
                "error_reason": f"Task terminated due to consecutive validation failures ({self.max_consecutive_failures} times). The task appears to be impossible to complete.",
                "validation_details": {
                    "format_valid": False,
                    "boxes_exist": False,
                    "boxes_movable": False,
                    "space_available": False,
                    "type_consistent": False
                },
                "suggestion": "Stop this task as it cannot be completed with current scene constraints. Please try a different approach or confirm if the goal is achievable.",
                "consecutive_failures": self.max_consecutive_failures,
                "current_scene_graph": self.init_scene_graph_data if hasattr(self, 'init_scene_graph_data') else None
            }, indent=2, ensure_ascii=False)
        if self.validation_count ==1:            
            self.init_raw_data,self.init_scene_graph_data = self.scene_graph_manager.get_current_raw_msg()
        else:
            print("🔄 [ValidateAndExecute] 使用上次动作后的最新场景图数据进行验证")
        
        
        if not isinstance(query, str):
            query = str(query) if query is not None else ""

        if not query.strip():

            return json.dumps({
                "status": "validation_failed",
                "is_valid": False,
                "error_reason": "No action command provided. Please provide a valid action in format 'action type X: move boxY to boxZ' or 'action type X: move boxY to table'",
                "validation_details": {
                    "format_valid": False,
                    "boxes_exist": False,
                    "boxes_movable": False,
                    "space_available": False,
                    "type_consistent": False
                },
                "suggestion": "Provide an action command to validate and execute",
                "example_formats": [
                    "action type 1: move box3 to table",
                    "action type 2: move box1 to box4",
                    "move box2 to table"
                ],
                
                "current_scene_graph": self.init_scene_graph_data
            }, indent=2, ensure_ascii=False)

        print(f"🔍 [ValidateAndExecute] 接收到动作指令: {query}")

        try:
            if not self.scene_graph_manager:
                return json.dumps({
                    "status": "validation_failed",
                    "is_valid": False,
                    "error_reason": "Scene graph manager not available. Cannot retrieve current scene state for validation.",
                    "validation_details": {},
                    "suggestion": "Ensure scene graph manager is properly initialized",
                    "current_scene_graph": None
                }, indent=2, ensure_ascii=False)
            # if self.agent:
            #         self.agent.spin_once()
            # scene_graph_data = self.scene_graph_manager.get_current_scene_graph()
            # self.init_raw_data,scene_graph_data = self.scene_graph_manager.get_current_raw_msg()
            # print(f"raw data: ")    
            # print(self.init_raw_data)
            
        except Exception as e:
            return json.dumps({
                "status": "validation_failed",
                "is_valid": False,
                "error_reason": f"Failed to get scene graph: {str(e)}",
                "validation_details": {},
                "suggestion": "Check scene graph manager connection and try again",
                "current_scene_graph": None
            }, indent=2, ensure_ascii=False)

        validation_result = self._validate_action_command(query, self.init_scene_graph_data)        
        if not validation_result.get("is_valid", False):
            print(f"❌ [ValidateAndExecute] 验证失败: {validation_result.get('error_reason', 'Unknown error')}")
            
            self.consecutive_failures += 1
            print(f"📊 [ValidateAndExecute] 连续失败计数: {self.consecutive_failures}/{self.max_consecutive_failures}")
            
            if self.agent:
                self.agent.spin_once()
            self._smart_refresh_scene_graph()
            self.init_raw_data,self.init_scene_graph_data = self.scene_graph_manager.get_current_raw_msg()
            validation_result["status"] = "validation_failed"
            validation_result["current_scene_graph"] = self.init_scene_graph_data
            validation_result["consecutive_failures"] = self.consecutive_failures
            return json.dumps(validation_result, indent=2, ensure_ascii=False)
        
        self.success_count += 1
        if self.consecutive_failures > 0:
            print(f"🔄 [ValidateAndExecute] 验证成功，重置连续失败计数器 (之前: {self.consecutive_failures})")
            self.consecutive_failures = 0
        print(f"✅ [ValidateAndExecute] 验证通过: {query}")
        print(f"📋 [验证成功] 准备执行动作: {query}")
        
        execution_result = self._execute_action(query, self.init_scene_graph_data)
        return execution_result

    def _validate_action_command(self, command: str, scene_graph_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        验证动作指令 - 基于场景图的物理可行性检查
        支持 move/put 和 open/close 动作
        """
        validation_details = {
            "objects_exist": False,
            "source_movable": False,
            "target_accessible": False,
            "action_valid": False
        }

        try:
            parsed_action = self._parse_flexible_action_command(command)
            if not parsed_action:
                return {
                    "is_valid": False,
                    "error_reason": f"Cannot parse action: {command}",
                    "validation_details": validation_details,
                    "suggested_format": "Use format: 'move object_name to target', 'move object_name in target', 'open object_name', or 'close object_name'"
                }

            action_type = parsed_action.get('action_type', 'move')
            
            if action_type in ['open', 'close']:
                return self._validate_open_close_action(parsed_action, scene_graph_data)
            
            source_object = parsed_action.get('source_object')
            target_location = parsed_action.get('target_location')

            scene_analysis = self._analyze_scene_graph(scene_graph_data)
            scene_analysis["scene_graph_data"] = scene_graph_data
            all_objects = scene_analysis["all_objects"]

            if source_object not in all_objects:
                return {
                    "is_valid": False,
                    "error_reason": f"Source object '{source_object}' not found in scene",
                    "validation_details": validation_details,
                    "available_objects": sorted(list(all_objects))
                }

            if target_location != 'table' and target_location not in all_objects:
                return {
                    "is_valid": False,
                    "error_reason": f"Target location '{target_location}' not found in scene",
                    "validation_details": validation_details,
                    "available_objects": sorted(list(all_objects))
                }

            validation_details["objects_exist"] = True

            if self._is_cube(source_object):
                print(f"🔍 [Critical Validation] 检测到立方体移动: {source_object}")
                
                source_accessible, source_reason = self._validate_cube_source_accessibility(source_object, scene_analysis)
                if not source_accessible:
                    return {
                        "is_valid": False,
                        "error_reason": f"Cannot move cube {source_object}: {source_reason}",
                        "validation_details": validation_details,
                        "suggestion": "Clear blocking objects from source container first, then retry cube movement"
                    }
                print(f"✅ [Cube Source Check] {source_object} 源位置可访问: {source_reason}")

            can_move_source, move_reason = self._can_move_object(source_object, scene_analysis)
            if not can_move_source:
                return {
                    "is_valid": False,
                    "error_reason": f"Cannot move {source_object}: {move_reason}",
                    "validation_details": validation_details,
                    "movable_objects": sorted(list(scene_analysis["movable_objects"]))
                }

            validation_details["source_movable"] = True

            if target_location != 'table':
                is_source_container = self._is_container(source_object)
                is_target_container = self._is_container(target_location)
                
                if is_source_container and is_target_container:
                    return {
                        "is_valid": False,
                        "error_reason": f"Cannot move container '{source_object}' into another container '{target_location}'. Containers cannot be placed inside other containers.",
                        "validation_details": validation_details,
                        "suggestion": f"Place '{source_object}' on the table or on a non-container object instead."
                    }

            if target_location != 'table':
                is_valid_target, target_reason = self._is_valid_target_location(target_location)
                if not is_valid_target:
                    return {
                        "is_valid": False,
                        "error_reason": target_reason,
                        "validation_details": validation_details,
                        "suggestion": "Choose a different target location that can support objects, such as a box or table."
                    }

            if target_location != 'table':
                can_access_target, access_reason = self._can_access_target(target_location, scene_analysis)
                if not can_access_target:
                    return {
                        "is_valid": False,
                        "error_reason": f"Cannot place on {target_location}: {access_reason}",
                        "validation_details": validation_details
                    }
                
                if self._is_cube(source_object):
                    can_place_cube, cube_placement_reason = self._can_place_cube_in_box(source_object, target_location, scene_analysis)
                    if not can_place_cube:
                        return {
                            "is_valid": False,
                            "error_reason": f"Cannot place cube {source_object} in {target_location}: {cube_placement_reason}",
                            "validation_details": validation_details
                        }
            else:
                table_status = scene_analysis["table_status"]
                if table_status == "F":
                    return {
                        "is_valid": False,
                        "error_reason": "Table is full (3 stacks maximum)",
                        "validation_details": validation_details,
                        "table_status": table_status,
                        "current_stacks": scene_analysis["stack_count"]
                    }

            validation_details["target_accessible"] = True

            already_completed, completion_reason = self._check_action_already_completed(
                source_object, target_location, parsed_action.get('relation', 'on'), scene_analysis
            )
            if already_completed:
                return {
                    "is_valid": False,
                    "error_reason": f"Action already completed: {completion_reason}",
                    "validation_details": validation_details,
                    "current_state": completion_reason,
                    "suggestion": "This action is not needed as the desired state already exists. Please plan a different action or confirm the goal."
                }

            validation_details["action_valid"] = True

            return {
                "is_valid": True,
                "error_reason": None,
                "validation_details": validation_details,
                "action_summary": {
                    "action": action_type,
                    "source": source_object,
                    "target": target_location,
                    "description": f"Move {source_object} to {target_location}"
                },
                "scene_context": {
                    "movable_objects": sorted(list(scene_analysis["movable_objects"])),
                    "blocked_objects": sorted(list(scene_analysis["blocked_objects"])),
                    "table_status": scene_analysis["table_status"],
                    "total_stacks": scene_analysis["stack_count"]
                },
                "message": f"✅ Action '{command}' is valid and ready for execution.",
            }

        except Exception as e:
            return {
                "is_valid": False,
                "error_reason": f"Validation error: {str(e)}",
                "validation_details": validation_details
            }

    def _execute_action(self, query: str, initial_scene_graph_data: Dict[str, Any]) -> str:
        """
        执行动作（通过订阅 /agent_trigger 话题判断完成）
        """
        print(f"🚀 [ValidateAndExecute] 开始执行动作: {query}")        
        self._publish_action_cmd(query)
        self._publish_init_raw_msg()
        initial_node_count = len(initial_scene_graph_data.get('nodes', []))
        print(f"📊 Initial state: {initial_node_count} nodes")
        print(f"📊 Initial edges: {initial_scene_graph_data.get('edges', [])}")
        print("💡 等待 /agent_trigger 话题触发完成信号...")

        if not self.action_cmd_publisher and ROS2_AVAILABLE:
            print("🔄 [ValidateAndExecute] 执行时延迟初始化ROS组件")
            self._initialize_ros_components_for_publishing()

        self.trigger_received = False
        
        max_wait_time = STABILITY_CONFIG.get("max_wait_time", 60)
        check_interval = 0.1

        start_time = time.time()

        try:
            while (time.time() - start_time) < max_wait_time:
                if self.agent:
                    self.agent.spin_once()
                elif self._ros_node:
                    import rclpy
                    rclpy.spin_once(self._ros_node, timeout_sec=0.01)
                
                if self.trigger_received:
                    elapsed_time = time.time() - start_time
                    print(f"✅ [ValidateAndExecute] 接收到agent_trigger信号，等待0.5秒后完成，耗时: {elapsed_time:.1f}s")
                    
                    time.sleep(1)
                    
                    if self.agent:
                        self.agent.spin_once()
                    self._smart_refresh_scene_graph()
                    self.init_raw_data,self.init_scene_graph_data = self.scene_graph_manager.get_current_raw_msg()                    
                    print(f"📊 Final state: {self.init_scene_graph_data} ")
                    return self._format_success_response(
                        initial_scene_graph_data,
                        self.init_scene_graph_data,
                        query
                    )

                elapsed_time = time.time() - start_time
                if int(elapsed_time) % 5 == 0 and elapsed_time > 0:
                    print(f"⏳ 等待 /agent_trigger 触发信号... {elapsed_time:.0f}s")

                time.sleep(check_interval)

            return self._format_timeout_response(initial_scene_graph_data)

        except Exception as e:
            return self._format_error_response(str(e), initial_scene_graph_data)

        finally:
            print("🔄 [ValidateAndExecute] 动作检测完成")
            self.trigger_received = False

    def _parse_flexible_action_command(self, command: str) -> Optional[Dict[str, Any]]:
        """
        更灵活地解析动作指令，支持多种格式
        包括：move/put 动作和 open/close 动作
        """
        import re

        command = command.strip().lower()

        # 1. "open short_cabinet/drawer_low"
        # 2. "close drawer_low"
        # 3. "open lid_box"
        # 4. "action type X: open object_name"
        open_close_patterns = [
            r'(open|close)\s+([a-zA-Z_][a-zA-Z0-9_/]*)',
            # Pattern 2: action type X: open/close object_name
            r'action\s+type\s+\d+\s*:\s*(open|close)\s+([a-zA-Z_][a-zA-Z0-9_/]*)'
        ]
        
        for pattern in open_close_patterns:
            match = re.match(pattern, command)
            if match:
                action_verb = match.group(1)  # 'open' or 'close'
                object_name = match.group(2)
                
                return {
                    'action_type': action_verb,  # 'open' or 'close'
                    'target_object': object_name,
                    'relation': None
                }

        # 1. "move red_cube in red_box" 
        # 2. "move red_cube to table"
        # 3. "move blue_box on yellow_box"
        # 4. "action type 1: move box1 to table"
        
        patterns = [
            # Pattern 1: move object_name relation target (extract relation)
            r'move\s+([a-zA-Z_][a-zA-Z0-9_/]*)\s+(in|into|to|on|upon)\s+([a-zA-Z_][a-zA-Z0-9_/]*|table)',
            # Pattern 2: action type X: move object relation target
            r'action\s+type\s+\d+\s*:\s*move\s+([a-zA-Z_][a-zA-Z0-9_/]*)\s+(in|into|to|on|upon)\s+([a-zA-Z_][a-zA-Z0-9_/]*|table)',
            # Pattern 3: put object_name relation target (extract relation)
            r'[Pp]ut\s+([a-zA-Z_][a-zA-Z0-9_/]*)\s+(in|into|to|on|upon)\s+([a-zA-Z_][a-zA-Z0-9_/]*|table)',
            # Pattern 4: action type X: put object relation target
            r'action\s+type\s+\d+\s*:\s*[Pp]ut\s+([a-zA-Z_][a-zA-Z0-9_/]*)\s+(in|into|to|on|upon)\s+([a-zA-Z_][a-zA-Z0-9_/]*|table)'
        ]

        for pattern in patterns:
            match = re.match(pattern, command)
            if match:
                source_object = match.group(1)
                relation = match.group(2)
                target_location = match.group(3)
                
                if relation in ['into']:
                    relation = 'in'
                elif relation in ['to', 'upon']:
                    relation = 'on'
                
                return {
                    'action_type': 'move',
                    'source_object': source_object,
                    'target_location': target_location,
                    'relation': relation
                }

        return None

    def _can_move_object(self, object_name: str, scene_analysis: Dict[str, Any]) -> tuple[bool, str]:
        """
        检查物体是否可以移动 - 更新以处理 (on)/(in) 格式的边
        """
        try:
            edges = scene_analysis.get("edges", [])
            print(f"🔍 [移动检查] 检查 {object_name} 是否可移动，当前边: {edges}")
            
            for edge in edges:
                if '(on)' in edge:
                    parts = edge.split('(on)')
                    if len(parts) == 2:
                        object_above = parts[0].strip()
                        target_object = parts[1].strip()
                        
                        print(f"🔍 [移动检查] 检查边 {edge}: {object_above} 在 {target_object} 上")
                        
                        if target_object == object_name:
                            print(f"🚫 [移动检查] {object_name} 被 {object_above} 阻挡（有物体在其上方）")
                            return False, f"{object_name} is blocked by {object_above} on top of it"
            
            object_container = None
            for edge in edges:
                if '(in)' in edge:
                    parts = edge.split('(in)')
                    if len(parts) == 2 and parts[0].strip() == object_name:
                        object_container = parts[1].strip()
                        break
            
            if object_container:
                print(f"🔍 [容器检查] {object_name} 在容器 {object_container} 中")
                
                container_state = self._get_object_state(object_container, scene_analysis)
                
                if container_state == 'closed':
                    print(f"🚫 [容器检查] 容器 {object_container} 是关闭状态")
                    return False, f"Cannot move {object_name} from {object_container} because the container is closed. Please open {object_container} first."
                
                if 'drawer' in object_container:
                    drawer_check_result, drawer_check_msg = self._check_drawer_constraints(object_container, scene_analysis)
                    if not drawer_check_result:
                        print(f"🚫 [抽屉检查] {drawer_check_msg}")
                        return False, drawer_check_msg
                
                for edge in edges:
                    if '(on)' in edge:
                        parts = edge.split('(on)')
                        if len(parts) == 2 and parts[1].strip() == object_container:
                            blocking_object = parts[0].strip()
                            print(f"🚫 [容器检查] {object_name} 的容器 {object_container} 被 {blocking_object} 阻挡")
                            return False, f"{object_name} cannot be moved because its container {object_container} is blocked by {blocking_object}"
            
            print(f"✅ [移动检查] {object_name} 可以移动（没有被阻挡）")
            return True, f"{object_name} can be moved (no objects blocking it)"
            
        except Exception as e:
            return False, f"Error checking movability: {str(e)}"

    def _can_access_target(self, target_name: str, scene_analysis: Dict[str, Any]) -> tuple[bool, str]:
        """
        检查目标位置是否可达 - 基于新的场景图格式 (on)/(in) 关系
        """
        try:
            edges = scene_analysis.get("edges", [])
            
            print(f"🔍 [目标检查] 检查 {target_name} 是否可访问，当前边: {edges}")
            
            blocking_objects = []
            
            for edge in edges:
                if '(on)' in edge:
                    parts = edge.split('(on)')
                    if len(parts) == 2:
                        object_above = parts[0].strip()
                        target_object = parts[1].strip()
                        
                        if target_object == target_name:
                            blocking_objects.append(object_above)
                            print(f"🚫 [目标检查] {target_name} 被 {object_above} 阻挡")
            
            if blocking_objects:
                blocking_list = ", ".join(blocking_objects)
                return False, f"{target_name} is blocked by objects on top: {blocking_list}. Must clear these objects first."
            
            if 'lid_box' in target_name or 'drawer' in target_name:
                target_state = self._get_object_state(target_name, scene_analysis)
                
                if target_state == 'closed':
                    print(f"🚫 [目标检查] 目标容器 {target_name} 是关闭状态")
                    return False, f"Cannot place objects in {target_name} because it is closed. Please open {target_name} first."
                
                if 'drawer' in target_name:
                    drawer_check_result, drawer_check_msg = self._check_drawer_constraints(target_name, scene_analysis)
                    if not drawer_check_result:
                        print(f"🚫 [抽屉检查] {drawer_check_msg}")
                        return False, drawer_check_msg
            
            print(f"✅ [目标检查] {target_name} 可访问（上方没有阻挡物体）")
            return True, f"{target_name} is accessible (no objects blocking from above)"
            
        except Exception as e:
            return False, f"Error checking target accessibility: {str(e)}"

    def _analyze_scene_graph(self, scene_graph_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        分析场景图数据 - 更新为新的场景图格式 (on)/(in) 关系
        
        新格式的边：
        - 'object(on)target' - 物体在目标上
        - 'object(in)target' - 物体在目标内  
        - '0=status' - 桌面状态
        """
        try:
            edges = scene_graph_data.get("edges", [])
            nodes = scene_graph_data.get("nodes", [])

            all_objects = set()
            
            for edge in edges:
                if '(on)' in edge or '(in)' in edge:
                    if '(on)' in edge:
                        parts = edge.split('(on)')
                    else:
                        parts = edge.split('(in)')
                    
                    if len(parts) == 2:
                        object_name = parts[0].strip()
                        target_name = parts[1].strip()
                        
                        object_name_clean = object_name.replace('(open)', '').replace('(closed)', '')
                        target_name_clean = target_name.replace('(open)', '').replace('(closed)', '')
                        
                        if object_name_clean != 'table':
                            all_objects.add(object_name_clean)
                        if target_name_clean != 'table':
                            all_objects.add(target_name_clean)
            
            for node in nodes:
                if node != 0:
                    if isinstance(node, str):
                        node_clean = node.replace('(open)', '').replace('(closed)', '')
                        if node_clean and node_clean != 'table':
                            all_objects.add(node_clean)

            movable_objects = set(all_objects)
            blocked_objects = set()
            table_status = "T"
            stack_count = 0

            objects_on_table = set()
            
            for edge in edges:
                if '=' in edge:
                    if edge.startswith("0="):
                        table_status = edge.split("=")[1]
                elif '(on)' in edge:
                    parts = edge.split('(on)')
                    if len(parts) == 2:
                        object_above = parts[0].strip()
                        target_object = parts[1].strip()
                        
                        object_above_clean = object_above.replace('(open)', '').replace('(closed)', '')
                        target_object_clean = target_object.replace('(open)', '').replace('(closed)', '')
                        
                        if target_object_clean == 'table':
                            objects_on_table.add(object_above_clean)
                        else:
                            blocked_objects.add(target_object_clean)
                            movable_objects.discard(target_object_clean)
                elif '(in)' in edge:
                    pass

            stack_count = len(objects_on_table)

            return {
                "all_objects": all_objects,
                "movable_objects": movable_objects,
                "blocked_objects": blocked_objects,
                "table_status": table_status,
                "stack_count": stack_count,
                "edges": edges,
                "objects_on_table": objects_on_table,
                "analysis_summary": f"Total objects: {len(all_objects)}, Movable: {len(movable_objects)}, Blocked: {len(blocked_objects)}, Table stacks: {stack_count}, Table status: {table_status}"
            }

        except Exception as e:
            return {
                "all_objects": set(),
                "movable_objects": set(),
                "blocked_objects": set(),
                "table_status": "T",
                "stack_count": 0,
                "edges": [],
                "objects_on_table": set(),
                "analysis_summary": f"Analysis failed: {str(e)}"
            }

    def _is_cube(self, object_name: str) -> bool:
        """
        检查物体是否为立方体
        
        Args:
            object_name: 物体名称
            
        Returns:
            bool: 是否为立方体
        """
        return object_name.endswith('_cube') or 'cube' in object_name.lower()
    
    def _is_mug(self, object_name: str) -> bool:
        """
        检查物体是否为杯子
        
        Args:
            object_name: 物体名称
            
        Returns:
            bool: 是否为杯子
        """
        return object_name.endswith('_mug') or 'mug' in object_name.lower()
    
    def _is_container(self, object_name: str) -> bool:
        """
        检查物体是否为容器（可以装其他物体的物体）

        容器包括：
        - drawer: 抽屉
        - lid_box: 带盖的盒子
        - box: 普通盒子（以 _box 结尾）

        非容器包括：
        - mug: 杯子（以 _mug 结尾）- 不能装其他物体
        - cube: 立方体（以 _cube 结尾）- 不能装其他物体

        Args:
            object_name: 物体名称

        Returns:
            bool: 是否为容器
        """
        object_name_lower = object_name.lower()

        if 'drawer' in object_name_lower:
            return True

        if 'lid_box' in object_name_lower:
            return True

        if object_name_lower.endswith('_box'):
            return True

        # if object_name_lower.endswith('_mug'):
        #     return True

        return False

    def _is_valid_target_location(self, target_location: str) -> tuple[bool, str]:
        """
        检查目标位置是否有效（不能是立方体或杯子）

        注意：
        - cube（立方体）不能作为支撑面
        - mug（杯子）不能作为支撑面
        - 容器（box、lid_box、drawer）可以作为目标位置用于装东西
        - 但不能把容器放在容器上（由容器冲突检查处理）

        Args:
            target_location: 目标位置名称

        Returns:
            tuple[bool, str]: (是否有效, 详细原因)
        """
        if self._is_cube(target_location):
            return False, f"Cannot place objects on cube '{target_location}'. Cubes cannot support other objects."

        if self._is_mug(target_location):
            return False, f"Cannot place objects on mug '{target_location}'. Mugs cannot support other objects."

        return True, f"Target location '{target_location}' is valid for placement"

    def _get_object_state(self, object_name: str, scene_analysis: Dict[str, Any]) -> Optional[str]:
        """
        获取物体的开关状态（open/closed）
        
        Args:
            object_name: 物体名称
            scene_analysis: 场景分析结果（包含 scene_graph_data）
            
        Returns:
            Optional[str]: 'open', 'closed', 或 None（无状态信息）
        """
        try:
            scene_graph_data = scene_analysis.get("scene_graph_data", {})
            nodes = scene_graph_data.get("nodes", [])
            edges = scene_graph_data.get("edges", [])
            
            print(f"🔍 [状态检查] 检查 {object_name} 的状态")
            print(f"🔍 [状态检查] 节点: {nodes}")
            print(f"🔍 [状态检查] 边: {edges}")
            
            for node in nodes:
                node_str = str(node)
                if node_str.startswith(f"{object_name}("):
                    if "(open)" in node_str:
                        print(f"✅ [状态检查] {object_name} 状态: open（从节点获取）")
                        return 'open'
                    elif "(closed)" in node_str:
                        print(f"✅ [状态检查] {object_name} 状态: closed（从节点获取）")
                        return 'closed'
            
            for edge in edges:
                if object_name in edge:
                    if f"{object_name}(open)" in edge:
                        print(f"✅ [状态检查] {object_name} 状态: open（从边获取）")
                        return 'open'
                    elif f"{object_name}(closed)" in edge:
                        print(f"✅ [状态检查] {object_name} 状态: closed（从边获取）")
                        return 'closed'
            
            print(f"⚠️ [状态检查] {object_name} 没有状态信息")
            return None
            
        except Exception as e:
            print(f"❌ [状态检查] 获取 {object_name} 状态时出错: {str(e)}")
            return None

    def _check_drawer_constraints(self, drawer_name: str, scene_analysis: Dict[str, Any]) -> tuple[bool, str]:
        """
        检查抽屉的约束条件
        
        规则：
        - short_cabinet/drawer_low: 需要自己是 open，且 middle 和 high 都是 closed
        - short_cabinet/drawer_middle: 需要自己是 open，且 high 是 closed
        - short_cabinet/drawer_high: 只需要自己是 open
        
        Args:
            drawer_name: 抽屉名称
            scene_analysis: 场景分析结果
            
        Returns:
            tuple[bool, str]: (是否满足约束, 详细信息)
        """
        try:
            print(f"🔍 [抽屉约束检查] 检查 {drawer_name} 的约束条件")
            
            current_state = self._get_object_state(drawer_name, scene_analysis)
            
            if current_state != 'open':
                return False, f"{drawer_name} is not open. Please open {drawer_name} first."
            
            if drawer_name == 'short_cabinet/drawer_low':
                middle_state = self._get_object_state('short_cabinet/drawer_middle', scene_analysis)
                high_state = self._get_object_state('short_cabinet/drawer_high', scene_analysis)
                
                if middle_state == 'open':
                    return False, f"Cannot access {drawer_name} because short_cabinet/drawer_middle is open. Please close short_cabinet/drawer_middle first."
                
                if high_state == 'open':
                    return False, f"Cannot access {drawer_name} because short_cabinet/drawer_high is open. Please close short_cabinet/drawer_high first."
                
                print(f"✅ [抽屉约束] {drawer_name} 满足约束（middle 和 high 都已关闭）")
                return True, f"{drawer_name} is accessible (middle and high drawers are closed)"
            
            elif drawer_name == 'short_cabinet/drawer_middle':
                high_state = self._get_object_state('short_cabinet/drawer_high', scene_analysis)
                
                if high_state == 'open':
                    return False, f"Cannot access {drawer_name} because short_cabinet/drawer_high is open. Please close short_cabinet/drawer_high first."
                
                print(f"✅ [抽屉约束] {drawer_name} 满足约束（high 已关闭）")
                return True, f"{drawer_name} is accessible (high drawer is closed)"
            
            elif drawer_name == 'short_cabinet/drawer_high':
                print(f"✅ [抽屉约束] {drawer_name} 满足约束（最上层，无额外约束）")
                return True, f"{drawer_name} is accessible (top drawer, no additional constraints)"
            
            else:
                print(f"✅ [抽屉约束] {drawer_name} 满足约束（非标准抽屉，仅检查开启状态）")
                return True, f"{drawer_name} is accessible"
            
        except Exception as e:
            print(f"❌ [抽屉约束检查] 检查 {drawer_name} 时出错: {str(e)}")
            return False, f"Error checking drawer constraints: {str(e)}"


    def _can_place_cube_in_box(self, cube_name: str, target_box: str, scene_analysis: Dict[str, Any]) -> tuple[bool, str]:
        """
        检查是否可以将立方体放入指定盒子 - 关键检查：立方体当前位置的容器是否被阻挡
        
        当立方体在容器中时，需要检查：
        1. 立方体当前所在容器是否可访问（没有被其他物体阻挡）
        2. 目标容器是否可访问
        3. 目标容器是否有容量
        
        Args:
            cube_name: 立方体名称
            target_box: 目标盒子名称
            scene_analysis: 场景分析结果
            
        Returns:
            tuple[bool, str]: (是否可以放置, 详细原因)
        """
        try:
            edges = scene_analysis.get("edges", [])
            
            cube_current_location = None
            cube_in_container = False
            
            for edge in edges:
                if f"{cube_name}(in)" in edge:
                    parts = edge.split('(in)')
                    if len(parts) == 2 and parts[0].strip() == cube_name:
                        cube_current_location = parts[1].strip()
                        cube_in_container = True
                        break
                elif f"{cube_name}(on)" in edge:
                    parts = edge.split('(on)')
                    if len(parts) == 2 and parts[0].strip() == cube_name:
                        cube_current_location = parts[1].strip()
                        cube_in_container = False
                        break
            
            if cube_in_container and cube_current_location:
                print(f"🔍 [Cube Validation] {cube_name} 在容器 {cube_current_location} 中，检查容器可达性...")
                
                container_blocked = False
                blocking_objects = []
                
                for edge in edges:
                    if '(on)' in edge and edge.endswith(f"(on){cube_current_location}"):
                        parts = edge.split('(on)')
                        if len(parts) == 2:
                            blocking_object = parts[0].strip()
                            blocking_objects.append(blocking_object)
                            container_blocked = True
                
                if container_blocked:
                    blocking_list = ", ".join(blocking_objects)
                    print(f"❌ [Cube Validation] 容器 {cube_current_location} 被阻挡: {blocking_list}")
                    return False, f"Cannot move {cube_name} from {cube_current_location} because container is blocked by: {blocking_list}. Must clear these objects first."
                
                print(f"✅ [Cube Validation] 容器 {cube_current_location} 可访问")
            
            target_blocked = False
            target_blocking_objects = []
            
            for edge in edges:
                if '(on)' in edge and edge.endswith(f"(on){target_box}"):
                    parts = edge.split('(on)')
                    if len(parts) == 2:
                        blocking_object = parts[0].strip()
                        target_blocking_objects.append(blocking_object)
                        target_blocked = True
            
            if target_blocked:
                target_blocking_list = ", ".join(target_blocking_objects)
                print(f"❌ [Cube Validation] 目标容器 {target_box} 被阻挡: {target_blocking_list}")
                return False, f"Cannot place {cube_name} in {target_box} because target container is blocked by: {target_blocking_list}. Must clear these objects first."
            
            cubes_in_target = 0
            for edge in edges:
                if '(in)' in edge and edge.endswith(f"(in){target_box}"):
                    parts = edge.split('(in)')
                    if len(parts) == 2:
                        object_in_target = parts[0].strip()
                        if self._is_cube(object_in_target):
                            cubes_in_target += 1
            
            if cubes_in_target >= 10:
                print(f"❌ [Cube Validation] 目标容器 {target_box} 已满 ({cubes_in_target}/3)")
                return False, f"Cannot place {cube_name} in {target_box} because container is at capacity ({cubes_in_target}/3 cubes)."
            
            print(f"✅ [Cube Validation] 立方体移动验证通过: {cube_name} → {target_box}")
            return True, f"Can move {cube_name} to {target_box}. Source accessible, target accessible, target has capacity ({cubes_in_target}/3)."
            
        except Exception as e:
            print(f"❌ [Cube Validation] 验证立方体移动时出错: {str(e)}")
            return False, f"Error validating cube placement: {str(e)}"

    def _check_action_already_completed(self, source_object: str, target_location: str, 
                                      relation: str, scene_analysis: Dict[str, Any]) -> tuple[bool, str]:
        """
        检查动作是否已经在期望的状态中
        
        Args:
            source_object: 源物体名称
            target_location: 目标位置
            relation: 关系类型 ('on' 或 'in')
            scene_analysis: 场景分析结果
            
        Returns:
            tuple[bool, str]: (是否已完成, 详细状态描述)
        """
        try:
            edges = scene_analysis.get("edges", [])
            
            expected_edge = f"{source_object}({relation}){target_location}"
            
            if expected_edge in edges:
                return True, f"{source_object} is already {relation} {target_location}"
            
            if target_location == 'table':
                table_edge = f"{source_object}(on)table"
                if table_edge in edges:
                    return True, f"{source_object} is already on table"
            
            return False, f"{source_object} is not yet {relation} {target_location}"
            
        except Exception as e:
            return False, f"Error checking action completion status: {str(e)}"

    def _validate_open_close_action(self, parsed_action: Dict[str, Any], scene_graph_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        验证 open/close 动作
        
        Args:
            parsed_action: 解析后的动作信息，包含 action_type ('open'/'close') 和 target_object
            scene_graph_data: 场景图数据
            
        Returns:
            Dict: 验证结果
        """
        action_type = parsed_action['action_type']  # 'open' or 'close'
        target_object = parsed_action['target_object']
        
        validation_details = {
            "object_exists": False,
            "state_valid": False,
            "action_valid": False
        }
        
        try:
            scene_analysis = self._analyze_scene_graph(scene_graph_data)
            all_objects = scene_analysis["all_objects"]
            edges = scene_graph_data.get('edges', [])
            nodes = scene_graph_data.get('nodes', [])
            
            print(f"🔍 [Open/Close Validation] 验证 {action_type} {target_object}")
            print(f"🔍 [Open/Close Validation] 场景中的节点: {nodes}")
            print(f"🔍 [Open/Close Validation] 场景中的边: {edges}")
            
            object_found = False
            current_state = None
            
            for node in nodes:
                node_str = str(node)
                if node_str == target_object:
                    object_found = True
                    current_state = None
                    break
                elif node_str.startswith(f"{target_object}("):
                    object_found = True
                    if "(open)" in node_str:
                        current_state = "open"
                    elif "(closed)" in node_str:
                        current_state = "closed"
                    break
            
            if not object_found:
                for edge in edges:
                    if target_object in edge:
                        object_found = True
                        if f"{target_object}(open)" in edge:
                            current_state = "open"
                        elif f"{target_object}(closed)" in edge:
                            current_state = "closed"
                        break
            
            if not object_found:
                return {
                    "is_valid": False,
                    "error_reason": f"Object '{target_object}' not found in scene graph",
                    "validation_details": validation_details,
                    "available_objects": sorted(list(all_objects)),
                    "suggestion": f"Please check if '{target_object}' exists in the scene. Available objects: {sorted(list(all_objects))}"
                }
            
            validation_details["object_exists"] = True
            print(f"✅ [Open/Close Validation] 物体 {target_object} 存在于场景中，当前状态: {current_state}")
            
            if current_state is None:
                return {
                    "is_valid": False,
                    "error_reason": f"Object '{target_object}' does not have open/close state information in scene graph",
                    "validation_details": validation_details,
                    "suggestion": f"The object '{target_object}' may not support open/close operations, or its state is not tracked in the scene graph"
                }
            
            if action_type == 'open' and current_state == 'open':
                return {
                    "is_valid": False,
                    "error_reason": f"Object '{target_object}' is already open. Cannot open an already opened object.",
                    "validation_details": validation_details,
                    "current_state": current_state,
                    "suggestion": f"The object '{target_object}' is already in 'open' state. You can 'close {target_object}' instead."
                }
            
            if action_type == 'close' and current_state == 'closed':
                return {
                    "is_valid": False,
                    "error_reason": f"Object '{target_object}' is already closed. Cannot close an already closed object.",
                    "validation_details": validation_details,
                    "current_state": current_state,
                    "suggestion": f"The object '{target_object}' is already in 'closed' state. You can 'open {target_object}' instead."
                }
            
            validation_details["state_valid"] = True
            validation_details["action_valid"] = True
            
            print(f"✅ [Open/Close Validation] 验证通过: {action_type} {target_object} (当前状态: {current_state})")
            
            return {
                "is_valid": True,
                "error_reason": None,
                "validation_details": validation_details,
                "action_summary": {
                    "action": action_type,
                    "target": target_object,
                    "current_state": current_state,
                    "expected_state": "open" if action_type == "open" else "closed",
                    "description": f"{action_type.capitalize()} {target_object} (current state: {current_state})"
                },
                "message": f"✅ Action '{action_type} {target_object}' is valid and ready for execution."
            }
            
        except Exception as e:
            print(f"❌ [Open/Close Validation] 验证过程出错: {str(e)}")
            return {
                "is_valid": False,
                "error_reason": f"Validation error: {str(e)}",
                "validation_details": validation_details
            }

    def _validate_cube_source_accessibility(self, cube_name: str, scene_analysis: Dict[str, Any]) -> tuple[bool, str]:
        """
        验证立方体源位置的可达性 - 专门检查立方体当前所在容器是否被阻挡
        
        Args:
            cube_name: 立方体名称
            scene_analysis: 场景分析结果
            
        Returns:
            tuple[bool, str]: (是否可访问, 详细原因)
        """
        try:
            edges = scene_analysis.get("edges", [])
            
            cube_current_location = None
            cube_in_container = False
            
            for edge in edges:
                if f"{cube_name}(in)" in edge:
                    parts = edge.split('(in)')
                    if len(parts) == 2 and parts[0].strip() == cube_name:
                        cube_current_location = parts[1].strip()
                        cube_in_container = True
                        break
                elif f"{cube_name}(on)" in edge:
                    parts = edge.split('(on)')
                    if len(parts) == 2 and parts[0].strip() == cube_name:
                        cube_current_location = parts[1].strip()
                        cube_in_container = (cube_current_location != 'table')
                        break
            
            if not cube_current_location:
                return False, f"Cannot determine current location of {cube_name}"
            
            if cube_current_location == 'table':
                return True, f"{cube_name} is on table, directly accessible"
            
            if cube_in_container:
                print(f"🔍 [Source Check] {cube_name} 位于 {cube_current_location}，检查容器阻挡情况...")
                
                blocking_objects = []
                
                for edge in edges:
                    if '(on)' in edge and edge.endswith(f"(on){cube_current_location}"):
                        parts = edge.split('(on)')
                        if len(parts) == 2:
                            blocking_object = parts[0].strip()
                            blocking_objects.append(blocking_object)
                
                if blocking_objects:
                    blocking_list = ", ".join(blocking_objects)
                    print(f"❌ [Source Check] 容器 {cube_current_location} 被阻挡: {blocking_list}")
                    return False, f"Container {cube_current_location} is blocked by: {blocking_list}. Must clear these objects first before accessing {cube_name}."
                
                print(f"✅ [Source Check] 容器 {cube_current_location} 可访问")
                return True, f"Container {cube_current_location} is accessible, can move {cube_name}"
            
            return True, f"{cube_name} appears to be accessible from {cube_current_location}"
            
        except Exception as e:
            print(f"❌ [Source Check] 验证立方体源可达性时出错: {str(e)}")
            return False, f"Error validating cube source accessibility: {str(e)}"

    def _initialize_ros_components_for_publishing(self):
        """
        初始化ROS组件（用于发布动作指令和订阅agent_trigger）
        """
        try:
            print("🔄 [ValidateAndExecute] 开始初始化ROS发布器")

            import rclpy
            if not rclpy.ok():
                print("⚠️ [ValidateAndExecute] ROS尚未初始化，跳过ROS组件初始化")
                return

            node = None

            if hasattr(self.agent, 'ros_manager') and hasattr(self.agent.ros_manager, 'node') and self.agent.ros_manager.node:
                node = self.agent.ros_manager.node
                print(f"🔍 [ValidateAndExecute] 使用Agent的ros_manager节点")
            elif hasattr(self.agent, 'node') and self.agent.node:
                node = self.agent.node
                print(f"🔍 [ValidateAndExecute] 使用Agent的直接节点")
            else:
                print("🔄 [ValidateAndExecute] 创建专用ROS节点")
                node = rclpy.create_node('validate_execute_tool')
                self._own_node = node

            if node:
                if not self.action_cmd_publisher:
                    qos_profile = QoSProfile(depth=10, reliability=ReliabilityPolicy.RELIABLE)
                    self.action_cmd_publisher = node.create_publisher(String, '/instruction', qos_profile)
                    print("✅ [ValidateAndExecute] instruction发布器初始化成功")

                if not self.init_raw_msg_publisher:
                    self.init_raw_msg_publisher = node.create_publisher(String, '/scene_graph_init', self.one_time_qos)
                    print("✅ [ValidateAndExecute] scene_graph_init发布器初始化成功（String类型）")

                if not self.agent_trigger_subscriber:
                    qos_profile = QoSProfile(depth=10, reliability=ReliabilityPolicy.RELIABLE)
                    self.agent_trigger_subscriber = node.create_subscription(
                        Bool, '/agent_trigger', self._agent_trigger_callback, qos_profile)
                    print("✅ [ValidateAndExecute] agent_trigger订阅器初始化成功")

                self._ros_node = node

            else:
                print("❌ [ValidateAndExecute] 无法获取或创建ROS节点")

        except Exception as e:
            print(f"❌ [ValidateAndExecute] 初始化ROS发布器失败: {e}")

    def _agent_trigger_callback(self, msg):
        """
        处理 /agent_trigger 话题的回调函数
        
        Args:
            msg: Bool类型消息
        """
        try:
            if msg.data:
                print("🔔 [ValidateAndExecute] 接收到agent_trigger信号: True")
                self.trigger_received = True
            else:
                print("🔔 [ValidateAndExecute] 接收到agent_trigger信号: False")
        except Exception as e:
            print(f"❌ [ValidateAndExecute] 处理agent_trigger回调时出错: {e}")

    def _publish_init_raw_msg(self):
        """
        发布初始化场景信息到ROS话题（/scene_graph_init）
        发布格式：String类型的JSON消息
        """
        try:
            if self.init_raw_data is None:
                print("⚠️ 初始场景图数据为空，跳过发布")
                return

            if hasattr(self.init_raw_data, 'data'):
                json_str = self.init_raw_data.data
            else:
                print(f"⚠️ init_raw_data格式异常: {type(self.init_raw_data)}")
                return

            if not self.init_raw_msg_publisher:
                print("⚠️ init_raw_msg发布器未初始化，跳过初始化信息发布")
                if ROS2_AVAILABLE and hasattr(self.agent, 'ros_manager') and self.agent.ros_manager.is_ros_available():
                    print("🔄 尝试重新初始化init_raw_msg发布器")
                    self._initialize_ros_components_for_publishing()
                    if not self.init_raw_msg_publisher:
                        print("❌ 重新初始化失败，无法发布初始化信息")
                        return
                else:
                    return

            msg = String()
            msg.data = json_str
            self.init_raw_msg_publisher.publish(msg)

            print(f"📡 已发布初始化场景图JSON到 /scene_graph_init 话题")

        except Exception as e:
            print(f"❌ 发布初始化场景图消息失败: {e}")
    
    def _publish_action_cmd(self, action: str):
        """
        发布action_cmd指令到ROS话题
        """
        try:
            if not self.action_cmd_publisher:
                print("⚠️ action_cmd发布器未初始化，跳过指令发布")
                if ROS2_AVAILABLE and hasattr(self.agent, 'ros_manager') and self.agent.ros_manager.is_ros_available():
                    print("🔄 尝试重新初始化action_cmd发布器")
                    self._initialize_ros_components_for_publishing()
                    if not self.action_cmd_publisher:
                        print("❌ 重新初始化失败，无法发布指令")
                        return
                else:
                    return

            clean_action = self._extract_core_action(action)

            msg = String()
            msg.data = clean_action

            self.action_cmd_publisher.publish(msg)
            print(f"📡 已发布instruction指令: {clean_action}")

        except Exception as e:
            print(f"❌ 发布action_cmd指令失败: {e}")

    def _extract_core_action(self, action: str) -> str:
        """
        提取核心动作指令，去掉action type前缀
        """
        import re

        patterns = [
            r'^action\s+type\s+\d+\s*:\s*(.+)$',
            r'^step\s+\d+\s*:\s*(.+)$'
        ]

        for pattern in patterns:
            match = re.match(pattern, action.strip(), re.IGNORECASE)
            if match:
                core_action = match.group(1).strip()
                return core_action

        return action.strip()

    def _parse_action_target_state(self, action_command: str) -> Dict[str, Any]:
        """
        解析动作指令的目标状态
        
        Args:
            action_command: 动作指令，如 "move red_cube in blue_box" 或 "move blue_box on table"
            
        Returns:
            目标状态描述字典
        """
        try:
            parsed_action = self._parse_flexible_action_command(action_command)
            if not parsed_action:
                return {"type": "unknown", "description": "无法解析的动作指令"}
            
            source_object = parsed_action['source_object']
            target_location = parsed_action['target_location']
            action_relation = parsed_action.get('relation', 'on')
            
            if target_location == 'table':
                return {
                    "type": "move_to_table",
                    "source_object": source_object,
                    "target_location": target_location,
                    "relation": action_relation,
                    "description": f"将{source_object}移动到{target_location}",
                    "expected_edge": f"{source_object}({action_relation}){target_location}"
                }
            else:
                if action_relation in ['in', 'into']:
                    return {
                        "type": "move_into_container",
                        "source_object": source_object,
                        "target_location": target_location,
                        "relation": "in",
                        "description": f"将{source_object}放入{target_location}",
                        "expected_edge": f"{source_object}(in){target_location}"
                    }
                else:
                    return {
                        "type": "move_on_surface",
                        "source_object": source_object,
                        "target_location": target_location,
                        "relation": "on",
                        "description": f"将{source_object}放到{target_location}上",
                        "expected_edge": f"{source_object}(on){target_location}"
                    }
                
        except Exception as e:
            return {"type": "error", "description": f"解析动作失败: {str(e)}"}
    
    def _check_action_completion(self, target_state: Dict[str, Any], 
                               current_scene_graph: Dict[str, Any],
                               initial_scene_graph: Dict[str, Any]) -> tuple[bool, str]:
        """
        检查动作是否完成 - 重写的统一检测逻辑
        
        支持的动作类型:
        1. move_to_table: 将物体移动到桌面上
        2. move_into_container: 将物体放入容器中 (使用in关系)
        3. move_on_surface: 将物体放到另一物体表面上 (使用on关系)
        
        Args:
            target_state: 目标状态描述
            current_scene_graph: 当前场景图
            initial_scene_graph: 初始场景图
            
        Returns:
            (是否完成, 检测详情)
        """
        try:
            action_type = target_state.get("type")
            expected_edge = target_state.get("expected_edge")
            source_object = target_state.get("source_object")
            target_location = target_state.get("target_location")
            relation = target_state.get("relation", "on")
            
            if not expected_edge or not source_object:
                return False, f"目标状态信息不完整: {target_state}"
                
            current_edges = current_scene_graph.get('edges', [])
            initial_edges = initial_scene_graph.get('edges', [])
            
            new_relation_found = expected_edge in current_edges
            
            completion_details = self._analyze_action_completion_by_type(
                action_type, source_object, target_location, relation, 
                initial_edges, current_edges
            )
            
            if new_relation_found:
                return True, f"{action_type}完成: {expected_edge}已建立。详情: {completion_details}"
            else:
                return False, f"{action_type}未完成: 期望关系{expected_edge}未出现。当前状态: {completion_details}"
                
        except Exception as e:
            return False, f"检测动作完成时出错: {str(e)}"

    def _check_source_object_removed_from_initial_position(self, source_object: str, 
                                                         initial_edges: List[str], 
                                                         current_edges: List[str]) -> bool:
        """
        检查源物体是否从初始位置移除
        
        Args:
            source_object: 源物体名称
            initial_edges: 初始边列表
            current_edges: 当前边列表
            
        Returns:
            bool: 是否从原位置移除
        """
        try:
            initial_relations = []
            for edge in initial_edges:
                if source_object in edge:
                    if (f"{source_object}(on)" in edge or 
                        f"{source_object}(in)" in edge):
                        initial_relations.append(edge)
            
            for initial_relation in initial_relations:
                if initial_relation in current_edges:
                    return False
            
            return len(initial_relations) > 0
            
        except Exception as e:
            print(f"⚠️ 检查源物体移除时出错: {str(e)}")
            return False
    
    def _analyze_action_completion_by_type(self, action_type: str, source_object: str, 
                                         target_location: str, relation: str,
                                         initial_edges: List[str], 
                                         current_edges: List[str]) -> str:
        """
        根据动作类型分析完成情况
        
        Args:
            action_type: 动作类型
            source_object: 源物体
            target_location: 目标位置
            relation: 关系类型
            initial_edges: 初始边
            current_edges: 当前边
            
        Returns:
            str: 分析详情
        """
        try:
            if action_type == "move_to_table":
                table_relations = [edge for edge in current_edges if f"{source_object}(on)table" in edge]
                return f"桌面关系: {table_relations}"
                
            elif action_type == "move_into_container":
                container_relations = [edge for edge in current_edges if f"{source_object}(in){target_location}" in edge]
                return f"容器关系: {container_relations}"
                
            elif action_type == "move_on_surface":
                surface_relations = [edge for edge in current_edges if f"{source_object}(on){target_location}" in edge]
                return f"表面关系: {surface_relations}"
                
            else:
                return f"未知动作类型: {action_type}"
                
        except Exception as e:
            return f"分析失败: {str(e)}"
    

    def _format_success_response(self, initial_scene_graph: Dict, final_scene_graph: Dict, intended_action: str = "") -> str:
        """
        格式化成功响应
        """
        initial_nodes = len(initial_scene_graph.get('nodes', []))
        final_nodes = len(final_scene_graph.get('nodes', []))

        change_analysis = self._analyze_scene_changes(
            initial_scene_graph, final_scene_graph, intended_action)

        result = {
            "status": "execution_success",
            "message": "Action validated and executed successfully. Environment updated and scene graph stabilized.",
            "intended_action": intended_action,
            "previous_nodes": initial_nodes,
            "current_nodes": final_nodes,
            "scene_graph": final_scene_graph,
            "change_analysis": change_analysis
        }

        print(f"✅ 动作执行完成. 场景图从 {initial_nodes} 节点变为 {final_nodes} 节点")
        if intended_action:
            print(f"🎯 执行的动作: {intended_action}")
        print(f"📊 变化分析: {change_analysis.get('description', 'No analysis available')}")
        print(f"✅ [工具返回] ValidateAndExecuteAction - 动作验证和执行成功")

        return json.dumps(result, indent=2)

    def _format_timeout_response(self, initial_scene_graph: Dict) -> str:
        """
        格式化超时响应
        """
        print("⏱️ 等待 /agent_trigger 触发信号超时")
        print("⚠️ [工具返回] ValidateAndExecuteAction - 等待 /agent_trigger 触发信号超时")

        result = {
            "status": "execution_timeout",
            "message": "Timed out waiting for /agent_trigger signal (value=true)",
            "current_scene_graph": self.scene_graph_manager.get_current_scene_graph()
        }

        return json.dumps(result, indent=2)

    def _format_error_response(self, error_msg: str, initial_scene_graph: Dict) -> str:
        """
        格式化错误响应
        """
        print(f"❌ [工具返回] ValidateAndExecuteAction - 发生错误: {error_msg[:100]}...")

        result = {
            "status": "execution_error",
            "message": f"Error during action execution: {error_msg}",
            "current_scene_graph": self.scene_graph_manager.get_current_scene_graph()
        }

        return json.dumps(result, indent=2)

    def _analyze_scene_changes(self, initial_scene_graph: Dict, final_scene_graph: Dict, intended_action: str = "") -> Dict:
        """
        分析场景图变化
        """
        try:
            initial_edges = set(initial_scene_graph.get('edges', []))
            final_edges = set(final_scene_graph.get('edges', []))

            added_edges = final_edges - initial_edges
            removed_edges = initial_edges - final_edges

            changes = {
                "edges_added": list(added_edges),
                "edges_removed": list(removed_edges),
                "has_changes": len(added_edges) > 0 or len(removed_edges) > 0,
                "intended_action": intended_action
            }

            if changes["has_changes"]:
                change_descriptions = []
                if added_edges:
                    change_descriptions.append(f"新增边: {list(added_edges)}")
                if removed_edges:
                    change_descriptions.append(f"移除边: {list(removed_edges)}")
                changes["description"] = "; ".join(change_descriptions)
            else:
                changes["description"] = "场景图没有发生变化"

            return changes

        except Exception as e:
            return {
                "error": f"分析场景图变化时发生错误: {str(e)}",
                "has_changes": False,
                "intended_action": intended_action
            }
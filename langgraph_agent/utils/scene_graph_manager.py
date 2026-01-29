# -*- coding: utf-8 -*-
"""
场景图管理器：管理场景图状态和更新检测
Created: 2024-01-05
"""

import json
import time
import sys
import os
import re
from typing import Dict, Any, List, Optional, Union

try:
    from config import STABILITY_CONFIG
except ImportError:
    from langgraph_agent.config import STABILITY_CONFIG
class SceneGraphManager:
    """
    场景图管理器：处理场景图的接收、存储和稳定性检测
    """
    
    def __init__(self):
        self.current_scene_graph = {}
        self.raw_msg = None
        
        self.scene_graph_history = []
        self.stable_frame_count = 0
        self.last_scene_graph = {}
        self.waiting_for_update = False
        
        self.stable_frame_threshold = STABILITY_CONFIG.get("stable_frame_threshold", 5)
        self.max_history_size = STABILITY_CONFIG.get("max_history_size", 5)
        self.parse_success_count = 0
        self.parse_error_count = 0
        

        self.verbose_logging = False  
    def update_scene_graph(self, raw_data: Union[str, Dict[str, Any]], raw_msg: Any = None):
        """
        更新场景图（支持新旧两种格式的智能转换）
        
        Args:
            raw_data: 原始场景图数据（新格式文本或旧格式JSON）
        """
        try:
            if isinstance(raw_data, str):
                parsed_data = self._parse_and_convert_scene_graph(raw_data)
            elif isinstance(raw_data, dict):
                parsed_data = raw_data 
            else:
                if self.verbose_logging:
                    print(f"⚠️ 不支持的数据类型: {type(raw_data)}")
                return
            
            if parsed_data:
                self.raw_msg = raw_msg
                self.current_scene_graph = parsed_data
                self.parse_success_count += 1
                
                if self.verbose_logging:
                    self._print_conversion_result(raw_data, parsed_data)
                
                if self.waiting_for_update:
                    self._check_stability(parsed_data)
            else:
                self.parse_error_count += 1
                if self.verbose_logging:
                    print(f"⚠️ 场景图解析失败，错误计数: {self.parse_error_count}")
                
        except Exception as e:
            self.parse_error_count += 1
            if self.verbose_logging:
                print(f"❌ 场景图更新失败: {e}")
                print(f"📝 原始数据: '{str(raw_data)[:200]}...'")
    def _parse_and_convert_scene_graph(self, raw_data: str) -> Optional[Dict[str, Any]]:
        """
        解析并转换场景图数据为标准JSON格式
        
        Args:
            raw_data: 原始数据字符串
            
        Returns:
            Dict: 转换为标准JSON格式的场景图数据
        """
        if not raw_data or not raw_data.strip():
            if self.verbose_logging:
                print("⚠️ 接收到空的场景图数据")
            return None
        
        try:
            json_data = json.loads(raw_data)
            if self.verbose_logging:
                if 'nodes' in json_data and 'edges' in json_data:
                    nodes = json_data.get('nodes', [])
                    if nodes and isinstance(nodes[0], str):
                        print("✅ 检测到JSON格式场景图（3D桌面模拟器格式）")
                    else:
                        print("✅ 检测到JSON格式场景图（旧格式）")
                else:
                    print("✅ 检测到JSON格式场景图")
            return json_data  
        except json.JSONDecodeError:
            pass
        
        try:
            if self.verbose_logging:
                print("🔄 检测到文本格式场景图，开始转换为JSON格式")
            return self._convert_text_to_json_format(raw_data)
        except Exception as e:
            if self.verbose_logging:
                print(f"❌ 文本格式转换失败: {e}")
            return None
    def _convert_text_to_json_format(self, text_data: str) -> Optional[Dict[str, Any]]:
        """
        将新格式文本转换为标准JSON格式
        支持两种格式：
        1. 旧格式: "Graph:\nNodes: 0, 1, 3, 4, 5, 6\nEdges: 0>3, 0>5, 0>6>4>1, 0=F"
        2. 新的3D桌面模拟器格式: 直接的关系描述文本
            
        Returns:
            Dict: 标准JSON格式的场景图数据
        """
        if "Nodes:" in text_data and "Edges:" in text_data:
            return self._convert_legacy_text_format(text_data)
        
        if self.verbose_logging:
            print("🔄 尝试解析3D桌面模拟器文本格式")
        
        return {
            "nodes": [],
            "edges": []
        }
    
    def _convert_legacy_text_format(self, text_data: str) -> Optional[Dict[str, Any]]:
        """
        将旧格式文本转换为标准JSON格式
        
        Args:
            text_data: 旧格式文本数据
            示例: "Graph:\nNodes: 0, 1, 3, 4, 5, 6\nEdges: 0>3, 0>5, 0>6>4>1, 0=F"
            
        Returns:
            Dict: 标准JSON格式的场景图数据，边格式为数组
        """
        nodes_match = re.search(r'Nodes:\s*([0-9,\s]+)', text_data)
        if not nodes_match:
            if self.verbose_logging:
                print(f"⚠️ 无法提取节点信息: {text_data}")
            return None
        
        nodes_str = nodes_match.group(1).strip()
        nodes = []
        if nodes_str:
            node_parts = [part.strip() for part in nodes_str.split(',')]
            nodes = [int(part) for part in node_parts if part.isdigit()]
        

        edges_match = re.search(r'Edges:\s*([^$]+)', text_data)
        edges = []
        if edges_match:
            edges_str = edges_match.group(1).strip()
            if edges_str:
                edge_parts = [part.strip() for part in edges_str.split(',')]
                
                for edge in edge_parts:
                    edge = edge.strip()
                    if edge:   
                        edges.append(edge)
                        
                        if self.verbose_logging:
                            print(f"🔍 添加边信息: {edge}")
        
        
        result = {
            "nodes": nodes,
            "edges": edges   
        }
        
        return result
    
    def _print_conversion_result(self, raw_data: Union[str, Dict], converted_data: Dict[str, Any]):
        """
        打印转换结果（仅在详细模式下）
        
        Args:
            raw_data: 原始数据
            converted_data: 转换后的数据
        """
        if not self.verbose_logging:
            return
            
        node_count = len(converted_data.get('nodes', []))
        edge_count = len(converted_data.get('edges', []))
        
        if isinstance(raw_data, str) and not raw_data.startswith('{'):
            print(f"✅ 格式转换成功: 新格式文本 -> JSON格式")
            print(f"📊 转换结果: 节点数={node_count}, 边数={edge_count}")
            print(f"🔍 边信息: {converted_data.get('edges', [])}")
        else:
            print(f"✅ 场景图更新成功: 节点数={node_count}, 边数={edge_count}")

    def get_current_scene_graph(self) -> Dict[str, Any]:
        """
        获取当前场景图
        
        Returns:
            Dict: 当前场景图数据（标准JSON格式）
        """
        return self.current_scene_graph.copy()
    def get_current_raw_msg(self) -> Any:
        """
        获取当前场景图的原始消息对象
        
        Returns:
            Any: 当前场景图的原始消息对象
        """
        return self.raw_msg,self.current_scene_graph.copy()
    def get_latest_scene_graph(self) -> str:
        """
        获取最新场景图的字符串表示（用于工具调用）
        
        Returns:
            str: 场景图字符串（标准JSON格式）
        """
        if not self.current_scene_graph:
            return "Scene graph is not available yet. Please wait for the update."
        return f"Current scene graph: {json.dumps(self.current_scene_graph, indent=2)}"
    
    def start_waiting_for_update(self, reference_scene_graph: Dict[str, Any]):
        """开始等待场景图更新"""
        self.waiting_for_update = True
        self.stable_frame_count = 0
        self.scene_graph_history = []
        self.last_scene_graph = reference_scene_graph.copy()
        if self.verbose_logging:
            print(f"📊 开始等待场景图更新，参考状态: {len(reference_scene_graph.get('nodes', []))} 个节点")
    
    def stop_waiting_for_update(self):
        """停止等待场景图更新"""
        self.waiting_for_update = False
        self.stable_frame_count = 0
        self.scene_graph_history = []
        self.last_scene_graph = {}
    
    def check_update_status(self) -> Dict[str, Any]:
        """检查更新状态"""
        if not self.waiting_for_update:
            return {
                "is_waiting": False,
                "is_stable": False,
                "has_real_change": False,
                "stable_scene_graph": None
            }
        
        is_stable = self.stable_frame_count >= self.stable_frame_threshold
        has_real_change = False
        stable_scene_graph = None
        
        if is_stable and self.scene_graph_history:
            stable_scene_graph = self.scene_graph_history[0]
            has_real_change = stable_scene_graph != self.last_scene_graph
        
        return {
            "is_waiting": True,
            "is_stable": is_stable,
            "has_real_change": has_real_change,
            "stable_scene_graph": stable_scene_graph,
            "stable_frame_count": self.stable_frame_count,
            "required_frames": self.stable_frame_threshold
        }
    
    def _check_stability(self, new_scene_graph: Dict[str, Any]):
        """检查场景图稳定性"""
        if len(self.scene_graph_history) == 0:
            self.scene_graph_history = [new_scene_graph]
            self.stable_frame_count = 1
            print(f"📊 场景图变化检测开始: 稳定帧计数 {self.stable_frame_count}/{self.stable_frame_threshold}")
        elif self.scene_graph_history[-1] == new_scene_graph:
            self.stable_frame_count += 1
            if len(self.scene_graph_history) < self.max_history_size:
                self.scene_graph_history.append(new_scene_graph)
            # if self.stable_frame_count >= self.stable_frame_threshold:
        else:
            self.stable_frame_count = 1
            self.scene_graph_history = [new_scene_graph]
    
    def get_scene_graph_stats(self) -> Dict[str, Any]:
        """获取场景图统计信息"""
        return {
            "current_node_count": len(self.current_scene_graph.get('nodes', [])),
            "current_edge_count": len(self.current_scene_graph.get('edges', [])),
            "is_waiting_for_update": self.waiting_for_update,
            "stable_frame_count": self.stable_frame_count,
            "required_stable_frames": self.stable_frame_threshold,
            "history_size": len(self.scene_graph_history),
            "parse_success_count": self.parse_success_count,
            "parse_error_count": self.parse_error_count
        }
    
    def force_refresh_from_ros(self, ros_manager=None, agent=None):
        """
        强制从ROS刷新最新场景图数据
        
        Args:
            ros_manager: ROS管理器实例
            agent: Agent实例（用于调用spin_once）
        
        Returns:
            bool: 是否成功刷新到新数据
        """
        if not ros_manager and not agent:
            if self.verbose_logging:
                print("⚠️ 无法执行强制刷新：缺少ROS管理器或Agent实例")
            return False
        old_scene_graph = self.current_scene_graph.copy()
        old_parse_count = self.parse_success_count
        
        if self.verbose_logging:
            print("🔄 开始强制刷新场景图数据...")
        
        refresh_attempts = 10  
        refresh_interval = 0.05  

        import time
        for i in range(refresh_attempts):
            if agent and hasattr(agent, 'spin_once'):
                agent.spin_once()
            elif ros_manager and hasattr(ros_manager, 'spin_once'):
                ros_manager.spin_once()

            if self.parse_success_count > old_parse_count:
                if self.verbose_logging:
                    print(f"✅ 在第{i+1}次尝试中获取到新场景图数据")
                break
                
            time.sleep(refresh_interval)

        refreshed = (self.current_scene_graph != old_scene_graph or 
                    self.parse_success_count > old_parse_count)
        
        if self.verbose_logging:
            if refreshed:
                print(f"✅ 强制刷新成功：场景图已更新")
                new_edges = self.current_scene_graph.get('edges', [])
                print(f"🔍 最新边信息: {new_edges}")
            else:
                print("ℹ️ 强制刷新完成：场景图无变化（可能已是最新）")
        
        return refreshed

    def reset_stability_tracking(self):
        """重置稳定性跟踪状态"""
        self.scene_graph_history = []
        self.stable_frame_count = 0
        self.last_scene_graph = {}
        self.waiting_for_update = False
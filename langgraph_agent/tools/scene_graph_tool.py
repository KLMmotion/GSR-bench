# -*- coding: utf-8 -*-
"""
场景图工具：获取当前场景图信息
Created: 2024-01-05
"""

import json
import sys
import os
from typing import Dict, Any, Optional

try:
    from .base_tool import BaseTool
except ImportError:
    from langgraph_agent.tools.base_tool import BaseTool


class SceneGraphTool(BaseTool):
    """
    场景图工具：获取当前场景图信息并进行可访问性分析
    """
    
    def __init__(self, scene_graph_getter: callable, agent=None):
        super().__init__(
            name="GetSceneGraph",
            description="Call this to get current scene information. Use when you need to understand the current state before planning or answering scene-related questions"
        )
        self.scene_graph_getter = scene_graph_getter
        self.agent = agent
        
    def execute(self, query: str = "") -> str:
        """
        执行场景图获取和分析（带智能刷新）
        
        Args:
            query: 查询参数（可选）
            
        Returns:
            str: 场景图信息字符串
        """
        self._smart_refresh_scene_graph()
        
        raw_result = self.scene_graph_getter()
        
        if "Scene graph is not available" in raw_result:
            return raw_result
        
        try:
            scene_data = json.loads(raw_result.replace("Current scene graph: ", ""))
            
            analysis = self._analyze_scene_graph(scene_data)
            
            self._print_scene_analysis(analysis)
            
            return raw_result
            
        except (json.JSONDecodeError, ValueError) as e:
            print(f"场景图解析失败: {e}")
            return raw_result
    
    def _analyze_scene_graph(self, scene_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        分析场景图数据（支持3D桌面模拟器和旧格式）
        
        Args:
            scene_data: 场景图数据
            
        Returns:
            Dict: 分析结果
        """
        nodes = scene_data.get('nodes', [])
        edges = scene_data.get('edges', [])
        
        is_3d_desktop_format = self._is_3d_desktop_format(nodes, edges)
        
        if is_3d_desktop_format:
            return self._analyze_3d_desktop_scene_graph(scene_data)
        else:
            return self._analyze_legacy_scene_graph(scene_data)
    
    def _is_3d_desktop_format(self, nodes: list, edges: list) -> bool:
        """
        判断是否为3D桌面模拟器格式
        
        Args:
            nodes: 节点列表
            edges: 边列表
            
        Returns:
            bool: 是否为3D桌面模拟器格式
        """
        desktop_objects = ['table', 'red_box', 'yellow_box', 'blue_box', 'red_cube', 'yellow_cube', 'blue_cube']
        
        if not nodes:
            return False
            
        if isinstance(nodes[0], str):
            return any(obj in nodes for obj in desktop_objects)
        
        if edges:
            for edge in edges:
                if isinstance(edge, str) and ('(on)' in edge or '(in)' in edge):
                    return True
        
        return False
    
    def _analyze_3d_desktop_scene_graph(self, scene_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        分析 3D桌面模拟器场景图数据
        
        Args:
            scene_data: 3D桌面模拟器格式的场景图数据
            
        Returns:
            Dict: 分析结果
        """
        nodes = scene_data.get('nodes', [])
        edges = scene_data.get('edges', [])
        
        node_count = len(nodes)
        node_ids = [str(node) for node in nodes]
        
        edge_list = []
        for edge in edges:
            if isinstance(edge, str):
                edge_list.append(edge)
        
        accessibility = self._analyze_3d_desktop_accessibility(edges)
        
        return {
            "node_count": node_count,
            "node_ids": node_ids,
            "edge_list": edge_list,
            "accessibility": accessibility,
            "format_type": "3d_desktop"
        }
    
    def _analyze_legacy_scene_graph(self, scene_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        分析传统格式场景图数据
        
        Args:
            scene_data: 传统格式的场景图数据
            
        Returns:
            Dict: 分析结果
        """
        nodes = scene_data.get('nodes', [])
        edges = scene_data.get('edges', [])
        
        node_count = len(nodes)
        
        node_ids = []
        for node in nodes:
            if isinstance(node, dict):
                node_ids.append(node.get('id', 'N/A'))
            else:
                node_ids.append(str(node))
        
        edge_list = []
        if edges:
            for edge in edges:
                if isinstance(edge, dict):
                    edge_list.append(f"{edge.get('from', 'N/A')}->{edge.get('to', 'N/A')}")
                elif isinstance(edge, str):
                    edge_list.append(edge.replace('>', '->'))
        
        accessibility = self._analyze_accessibility(edges)
        
        return {
            "node_count": node_count,
            "node_ids": node_ids,
            "edge_list": edge_list,
            "accessibility": accessibility,
            "format_type": "legacy"
        }
    
    def _analyze_3d_desktop_accessibility(self, edges: list) -> Dict[str, Any]:
        """
        分析 3D桌面模拟器中的可访问性
        
        Args:
            edges: 边关系列表（格式如 "red_box(on)table", "yellow_cube(in)red_box"）
            
        Returns:
            Dict: 可访问性分析结果
        """
        boxes = {'red_box', 'yellow_box', 'blue_box'}
        cubes = {'red_cube', 'yellow_cube', 'blue_cube'}
        
        on_table = set()
        on_box = {}
        in_box = {}
        
        for edge in edges:
            if not isinstance(edge, str):
                continue
                
            if '(on)' in edge:
                parts = edge.split('(on)')
                if len(parts) == 2:
                    obj, target = parts[0].strip(), parts[1].strip()
                    if target == 'table':
                        on_table.add(obj)
                    elif target in boxes:
                        if target not in on_box:
                            on_box[target] = []
                        on_box[target].append(obj)
                        
            elif '(in)' in edge:
                parts = edge.split('(in)')
                if len(parts) == 2:
                    obj, target = parts[0].strip(), parts[1].strip()
                    if target in boxes:
                        if target not in in_box:
                            in_box[target] = []
                        in_box[target].append(obj)
        
        accessible_boxes = []
        blocked_boxes = []
        placement_locations = []
        
        for box in boxes:
            has_objects_on_top = box in on_box and len(on_box[box]) > 0
            
            if has_objects_on_top:
                blocked_boxes.append(box)
            else:
                objects_in_box = in_box.get(box, [])
                if len(objects_in_box) < 3:
                    accessible_boxes.append(box)
                    placement_locations.append(f"{box}(内部,已有{len(objects_in_box)}/3)")
                else:
                    blocked_boxes.append(box)
        
        placement_locations.insert(0, "table(表面)")
        
        for box in boxes:
            if box not in blocked_boxes:
                placement_locations.append(f"{box}(表面)")
        
        return {
            "accessible_boxes": sorted(accessible_boxes),
            "blocked_boxes": sorted(blocked_boxes), 
            "placement_locations": placement_locations,
            "table_has_space": True,
            "object_relationships": {
                "on_table": sorted(list(on_table)),
                "on_boxes": {k: sorted(v) for k, v in on_box.items()},
                "in_boxes": {k: sorted(v) for k, v in in_box.items()}
            }
        }
        """
        分析盒子的可访问性
        
        Args:
            edges: 边关系列表（支持字符串格式如 "0>1"、"0=F"/"0=T" 或字典格式）
            
        Returns:
            Dict: 可访问性分析结果
        """
        accessible_boxes = []
        blocked_boxes = []
        table_has_space = True
        
        if not edges:
            return {
                "accessible_boxes": accessible_boxes,
                "blocked_boxes": blocked_boxes,
                "placement_locations": ["table(0)"],
                "table_has_space": table_has_space
            }
        
        edge_chains = []
        for edge in edges:
            if isinstance(edge, dict):
                from_id = edge.get('from', '')
                to_id = edge.get('to', '')
                if from_id and to_id:
                    edge_chains.append(f"{from_id}>{to_id}")
            elif isinstance(edge, str):
                if '=' in edge and edge.startswith('0='):
                    table_status = edge.split('=')[1].strip()
                    table_has_space = (table_status.upper() == 'T')
                    continue
                elif '>' in edge:
                    edge_chains.append(edge)
        
        for chain in edge_chains:
            boxes_in_chain = chain.split('>')
            if len(boxes_in_chain) > 1:
                last_box = boxes_in_chain[-1]
                if last_box != '0' and last_box not in accessible_boxes:
                    accessible_boxes.append(last_box)
                
                for i in range(1, len(boxes_in_chain) - 1):
                    box = boxes_in_chain[i]
                    if box != '0' and box not in blocked_boxes:
                        blocked_boxes.append(box)
        
        placement_locations = []
        if table_has_space:
            placement_locations.append("table(0)")
        if accessible_boxes:
            placement_locations.extend(accessible_boxes)
        
        return {
            "accessible_boxes": sorted(accessible_boxes) if accessible_boxes else [],
            "blocked_boxes": sorted(blocked_boxes) if blocked_boxes else [],
            "placement_locations": placement_locations,
            "table_has_space": table_has_space
        }
    
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
    
    def _print_scene_analysis(self, analysis: Dict[str, Any]):
        """
        打印场景图分析结果（支持3D桌面和传统格式）
        
        Args:
            analysis: 分析结果
        """
        print("=" * 50)
        format_type = analysis.get('format_type', 'unknown')
        if format_type == '3d_desktop':
            print("📊 当前3D桌面场景图详情:")
        else:
            print("📊 当前场景图详情:")
            
        print(f"🔸 节点总数: {analysis['node_count']}")
        
        if analysis['node_ids']:
            print(f"🔸 节点列表: {analysis['node_ids']}")
        
        if analysis['edge_list']:
            print(f"🔸 关系列表: {analysis['edge_list']}")
        else:
            print("🔸 关系列表: 无")
        
        accessibility = analysis['accessibility']
        print("🔸 可访问性分析:")
        
        if format_type == '3d_desktop':
            print(f"   - 可放入物体的盒子: {accessibility['accessible_boxes'] if accessibility['accessible_boxes'] else '无'}")
            print(f"   - 被阻挡的盒子: {accessibility['blocked_boxes'] if accessibility['blocked_boxes'] else '无'}")
            print(f"   - 可放置位置: {accessibility['placement_locations']}")
            
            if 'object_relationships' in accessibility:
                relationships = accessibility['object_relationships']
                print("🔸 物体关系详情:")
                if relationships['on_table']:
                    print(f"   - 在桌子上: {relationships['on_table']}")
                if relationships['on_boxes']:
                    for box, objects in relationships['on_boxes'].items():
                        print(f"   - 在{box}上面: {objects}")
                if relationships['in_boxes']:
                    for box, objects in relationships['in_boxes'].items():
                        print(f"   - 在{box}里面: {objects}")
        else:
            print(f"   - 可移动的盒子: {accessibility['accessible_boxes'] if accessibility['accessible_boxes'] else '无'}")
            print(f"   - 被阻挡的盒子: {accessibility['blocked_boxes'] if accessibility['blocked_boxes'] else '无'}")
            print(f"   - 可放置位置: {accessibility['placement_locations']}")
            
            table_status = "有空位" if accessibility.get('table_has_space', True) else "已满"
            print(f"   - 桌子状态: {table_status}")
        
        print("=" * 50)
        print(f"📊 [工具返回] GetSceneGraph - 成功获取{format_type}格式场景图，包含 {analysis['node_count']} 个节点")

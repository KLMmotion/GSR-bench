#!/usr/bin/env python3
"""
Script to extract key data from report files and determine task completion using rule-based approach.
"""
import json
import re
import os
import shutil
from typing import Dict, List, Optional, Any
import argparse
from datetime import datetime


class ReportProcessor:
    def __init__(self):
        pass

    def classify_task_type(self, task_goal: str) -> int:
        """
        Classify the task into Type 1 or Type 2.

        Type 1: "move A into B" pattern
          - A: color_type (red_cubes), type (cubes), or items on table
          - B: (color_)box, (color_)lid_box, or drawer_*

        Type 2: Three fixed task patterns
          - (1) "place the milk, the popcorn, and the book into different drawer layers"
          - (2) "put all the mugs and cubes into their corresponding colored boxes"
          - (3) "put all the cubes and mugs into the drawers by color"

        Returns: 1, 2, or 0 (unknown)
        """
        task_goal_lower = task_goal.lower()

        # Type 2: Check for three fixed task patterns first

        # Type 2(3): "by color" + "drawer" + "cubes and mugs"
        if "by color" in task_goal_lower and "drawer" in task_goal_lower:
            if "cube" in task_goal_lower and "mug" in task_goal_lower:
                return 2  # Will be handled as type 2 sub-task 3

        # Type 2(2): "corresponding colored boxes" + "cubes and mugs"
        if "corresponding" in task_goal_lower or "corresponding colored boxes" in task_goal_lower:
            if "cube" in task_goal_lower and "mug" in task_goal_lower:
                return 2  # Will be handled as type 2 sub-task 2

        # Type 2(1): "different drawer layers" + specific items (milk, popcorn, book)
        if "different drawer" in task_goal_lower:
            # Check for specific items: milk, popcorn, book
            specific_items = ["milk", "popcorn", "book"]
            if any(item in task_goal_lower for item in specific_items):
                return 2  # Will be handled as type 2 sub-task 1

        # Type 1: "move A into B" pattern
        # This is the default for all other tasks
        # Includes:
        # - move red_cubes into red_box
        # - move all cubes into drawer_low
        # - move all items on table into X
        return 1


    def extract_task_goal(self, content: str) -> str:
        """Extract the main task goal from the report."""
        match = re.search(r'用户指令:\s*(.+)', content)
        if match:
            return match.group(1).strip()
        return ""

    def extract_user_input(self, content: str) -> str:
        """Extract the original user input (with config number) from the report."""
        match = re.search(r'用户原始指令:\s*(.+)', content)
        if match:
            return match.group(1).strip()
        return ""

    def extract_config_number(self, user_input: str) -> str:
        """Extract config number from user input (e.g., "配置_17" from "配置_17: move ..."")."""
        if not user_input:
            return ""
        # Match patterns like "配置_17", "配置 #17", "配置 17", etc.
        match = re.match(r'(配置[_\s]*#?\s*\d+)', user_input)
        if match:
            return match.group(1).strip()
        return ""

    def extract_fail_reason(self, content: str) -> str:
        """Extract the failure reason from the report if present."""
        # Match pattern: 【失败原因】 followed by content until next 【 or end
        match = re.search(r'【失败原因】\s*([^\【]*?)(?=【|$)', content, re.DOTALL)
        if match:
            fail_reason = match.group(1).strip()
            # Clean up extra whitespace and newlines
            fail_reason = re.sub(r'\s+', ' ', fail_reason)
            return fail_reason
        return ""

    def extract_step_blocks(self, content: str) -> List[Dict]:
        """Extract step blocks and all related data from each step."""
        steps_data = []
        
        # Find the detailed execution records section
        start_pattern = r'【详细执行记录】'
        end_pattern = r'【Agent最终响应】'
        start_match = re.search(start_pattern, content)
        end_match = re.search(end_pattern, content)
        
        if not start_match or not end_match:
            return steps_data
        
        detailed_content = content[start_match.end():end_match.start()]
        
        # Split into step blocks using the pattern
        step_blocks = re.split(r'--- 第(\d+)步:', detailed_content)
        
        # Process each step (first element is empty, so start from index 1)
        for i in range(1, len(step_blocks), 2):
            if i + 1 < len(step_blocks):
                step_number = step_blocks[i]
                step_content = step_blocks[i + 1]
                
                step_info = {
                    "step_number": int(step_number),
                    "content": step_content,
                    "scene_graph": None,
                    "execution_status": None,
                    "model_output": None
                }
                
                # Extract scene graph from this step
                if 'get_initial_info' in step_content:
                    scene_graph_match = re.search(r'Current scene graph:\s*(\{.*?\})', step_content, re.DOTALL)
                    if scene_graph_match:
                        try:
                            raw_json = scene_graph_match.group(1)
                            # 去除以#开头的注释行，保证JSON可解析
                            cleaned = "\n".join(
                                line for line in raw_json.splitlines()
                                if not re.match(r'^\s*#', line)
                            )
                            step_info["scene_graph"] = json.loads(cleaned)
                        except json.JSONDecodeError:
                            print(f"Failed to parse scene graph in step {step_number}")
                else:
                    # Try both scene_graph and current_scene_graph
                    scene_graph_match = re.search(r'["\']?(scene_graph|current_scene_graph)["\']?\s*:\s*(\{.*?\})', step_content, re.DOTALL)
                    if scene_graph_match:
                        try:
                            raw_json = scene_graph_match.group(2)
                            cleaned = "\n".join(
                                line for line in raw_json.splitlines()
                                if not re.match(r'^\s*#', line)
                            )
                            step_info["scene_graph"] = json.loads(cleaned)
                        except json.JSONDecodeError:
                            print(f"Failed to parse scene graph in step {step_number}")
                
                # Extract execution status from this step
                status_match = re.search(r'"status":\s*"([^"]+)"', step_content)
                if status_match:
                    step_info["execution_status"] = status_match.group(1)
                
                # Extract model output from this step
                output_match = re.search(r'模型输出:\s*(.+)', step_content, re.DOTALL)
                if output_match:
                    output_content = output_match.group(1).strip()
                    # Clean up the output (remove trailing newlines or extra spaces)
                    step_info["model_output"] = output_content
                
                steps_data.append(step_info)
        
        return steps_data
    
    def extract_scene_graphs(self, content: str) -> List[Dict]:
        """Extract scene graph data from odd steps."""
        scene_graphs = []
        steps_data = self.extract_step_blocks(content)
        
        for step_info in steps_data:
            if step_info["step_number"] % 2 == 1 and step_info["scene_graph"]:
                scene_graphs.append(step_info["scene_graph"])
        
        return scene_graphs
    
    def extract_execution_statuses(self, content: str) -> List[str]:
        """Extract execution statuses from all steps."""
        statuses = []
        steps_data = self.extract_step_blocks(content)
        
        for step_info in steps_data:
            if step_info["execution_status"]:
                statuses.append(step_info["execution_status"])
        
        return statuses
    
    def extract_model_outputs(self, content: str) -> List[str]:
        """Extract model outputs from all steps."""
        outputs = []
        steps_data = self.extract_step_blocks(content)
        
        for step_info in steps_data:
            if step_info["model_output"]:
                outputs.append(step_info["model_output"])
        
        return outputs


    def judge_type_2_all_items_to_container(self, final_scene: Dict, task_goal: str) -> tuple:
        """
        Judge Type 2 tasks: Move all items to a single container.
        Returns: (is_successful, progress_info, error_message, response_message)
        progress_info format: {"correct": X, "total": Y}
        """
        nodes = final_scene.get("nodes", [])
        edges = final_scene.get("edges", [])

        # Extract target container from task goal
        # Patterns: "move all items from X into Y", "move all items on table into Y"
        task_goal_lower = task_goal.lower()

        target_container = None
        # Extract target container
        if " into " in task_goal_lower:
            parts = task_goal_lower.split(" into ")
            if len(parts) == 2:
                # Get the container name (first word after "into")
                target_container = parts[1].strip().split()[0].replace("_", "")

        # If no target found in goal, try to find from nodes
        if not target_container:
            # Look for containers in the scene
            for node in nodes:
                if "box" in node.lower() or "drawer" in node.lower():
                    target_container = node.replace("_", "")
                    break

        if not target_container:
            return False, {"correct": 0, "total": 0}, "Could not determine target container from task goal", "Target container unclear"

        # Count all items that should be moved
        all_items = set()
        # Find all items (exclude containers like table, box, drawer, cabinet)
        container_keywords = ["table", "box", "drawer", "cabinet", "lid_box", "container"]
        for node in nodes:
            node_lower = node.lower()
            # Check if this is a container (not an item to be moved)
            is_container = any(keyword in node_lower for keyword in container_keywords)
            if not is_container:
                all_items.add(node)

        # Check how many items are in the target container
        correct_items = 0
        misplaced_items = []

        for edge in edges:
            # Parse edge format like "item(in)container"
            match = re.match(r'(\w+)\((in|on)\)([\w\/]+)', edge)
            if match:
                item_name = match.group(1)
                relation = match.group(2)
                location = match.group(3)

                # Normalize location for comparison
                location_normalized = location.replace("_", "")

                if item_name in all_items:
                    if location_normalized == target_container or (
                        relation == "in" and target_container in location_normalized):
                        correct_items += 1
                    elif relation == "on" and location == "table":
                        misplaced_items.append(f"{item_name} still on table")
                    else:
                        misplaced_items.append(f"{item_name} in {location}")

        total_items = len(all_items)

        if correct_items == total_items:
            return True, {"correct": total_items, "total": total_items}, "", f"All {total_items} items correctly placed in {target_container}"
        else:
            error_msg = f"Only {correct_items}/{total_items} items in target container"
            if misplaced_items:
                error_msg += f": {', '.join(misplaced_items[:5])}"  # Show first 5
                if len(misplaced_items) > 5:
                    error_msg += "..."
            return False, {"correct": correct_items, "total": total_items}, error_msg, error_msg

    def judge_drawer_task_by_layers(self, final_scene: Dict, task_goal: str) -> tuple:
        """
        Judge drawer tasks with layer-based scoring system.
        
        Scoring Rules:
        - Total: 6 objects should be placed into 3 drawer layers (2 objects per layer, max 2 points per layer)
        - Each correct object in correct drawer: +points
        - Per layer: 
          * 2 correct objects in layer (no unrelated items): 2 points
          * 1 correct object in layer (no unrelated items): 1 point
          * 0 correct objects or unrelated items present: 0 points for that layer
        - If unrelated items are in a layer, that layer gets 0 points
        
        Returns: (is_successful, progress_info, error_message, response_message)
        progress_info format: {"correct": X, "total": 6, "layer_scores": {...}, "details": "..."}
        """
        nodes = final_scene.get("nodes", [])
        edges = final_scene.get("edges", [])
        
        # Extract all cubes and mugs (expected objects)
        cubes = {}   # name -> location
        mugs = {}    # name -> location
        
        for node in nodes:
            if "_cube" in node:
                cubes[node] = None
            elif "mug" in node:
                mugs[node] = None
        
        # Parse edges to get locations
        for edge in edges:
            match = re.match(r'([\w_]+)\((in|on)\)([\w\/]+)', edge)
            if match:
                obj_name = match.group(1)
                location = match.group(3)
                
                if obj_name in cubes:
                    cubes[obj_name] = location
                elif obj_name in mugs:
                    mugs[obj_name] = location
        
        # Define standard drawer layers
        drawer_layers = [
            "short_cabinet/drawer_low",
            "short_cabinet/drawer_middle", 
            "short_cabinet/drawer_high"
        ]
        
        # Expected total objects
        total_objects = len(cubes) + len(mugs)
        all_objects = {**cubes, **mugs}  # Combined dict
        
        # Check each layer
        layer_scores = {}  # drawer -> {"correct": count, "unrelated": count, "score": points}
        total_correct = 0
        total_score = 0.0
        
        # Build list of allowed items (cubes and mugs only)
        allowed_items = set(cubes.keys()) | set(mugs.keys())
        
        for drawer in drawer_layers:
            layer_correct_count = 0
            layer_unrelated_count = 0
            layer_objects = []
            
            # Count correct objects in this layer
            for obj_name, location in all_objects.items():
                if location == drawer:
                    layer_objects.append(obj_name)
                    layer_correct_count += 1
                    total_correct += 1
            
            # Check for unrelated items in this layer
            for edge in edges:
                match = re.match(r'([\w_]+)\((in|on)\)([\w\/]+)', edge)
                if match:
                    item_name = match.group(1)
                    location = match.group(3)
                    
                    if location == drawer and item_name not in allowed_items:
                        layer_unrelated_count += 1
            
            # Calculate layer score
            if layer_unrelated_count > 0:
                # If any unrelated items, layer gets 0 points
                layer_score = 0
                score_reason = "unrelated items present"
            elif layer_correct_count == 2:
                # Both objects correct: 2 points
                layer_score = 2
                score_reason = "2/2 correct objects"
            elif layer_correct_count == 1:
                # One object correct: 1 point
                layer_score = 1
                score_reason = "1/2 correct objects"
            else:
                # No correct objects: 0 points
                layer_score = 0
                score_reason = "no correct objects"
            
            total_score += layer_score
            layer_scores[drawer] = {
                "correct": layer_correct_count,
                "unrelated": layer_unrelated_count,
                "score": layer_score,
                "reason": score_reason,
                "objects": layer_objects
            }
        
        # Build detail string for each layer
        layer_details = []
        for drawer in drawer_layers:
            info = layer_scores[drawer]
            drawer_name = drawer.split('/')[-1]  # e.g., "drawer_low"
            layer_details.append(
                f"{drawer_name}: {info['correct']}/2 correct, "
                f"{info['unrelated']} unrelated, score={info['score']} ({info['reason']})"
            )
        
        detail_str = "; ".join(layer_details)
        
        # Determine success
        is_successful = total_score == 6 and total_correct == total_objects
        
        # Build progress info
        progress_info = {
            "correct": int(total_score),
            "total": 6,
            "layer_scores": {
                "low": layer_scores["short_cabinet/drawer_low"]["score"],
                "middle": layer_scores["short_cabinet/drawer_middle"]["score"],
                "high": layer_scores["short_cabinet/drawer_high"]["score"]
            },
            "details": detail_str
        }
        
        if is_successful:
            response_msg = f"Perfect! All 6 objects correctly placed: {detail_str}"
            error_msg = ""
        else:
            error_msg = f"Score: {int(total_score)}/6 - {detail_str}"
            response_msg = error_msg
        
        return is_successful, progress_info, error_msg, response_msg

    def judge_type_3_items_to_different_drawers(self, final_scene: Dict, task_goal: str) -> tuple:
        """
        Judge Type 3 tasks: Place specific items into different drawer layers.
        Example: "place the milk, the popcorn, and the book into different drawer layers"
        Returns: (is_successful, progress_info, error_message, response_message)
        """
        nodes = final_scene.get("nodes", [])
        edges = final_scene.get("edges", [])

        # Extract item names from task goal
        # Pattern: "place the X, the Y, and the Z into different drawer layers"
        items_to_place = []

        # Try to extract items like "milk", "popcorn", "book"
        # Look for pattern: "place the [items] into different drawer"
        match = re.search(r'place (?:the )?(.+?) into different drawer', task_goal.lower())
        if match:
            items_text = match.group(1)
            # Parse items separated by ", and" or ","
            items_list = re.split(r',?\s+and\s+|,\s*', items_text)
            for item in items_list:
                item = item.strip().replace("the ", "").replace(".", "")
                if item:
                    items_to_place.append(item.lower())
        else:
            # Alternative: try to find common items in the task
            common_items = ["milk", "popcorn", "book", "apple", "banana", "orange", "bread", "cheese"]
            for item in common_items:
                if item in task_goal.lower():
                    items_to_place.append(item)

        if not items_to_place:
            return False, {"correct": 0, "total": 0}, "Could not extract target items from task goal", "Target items unclear"

        # Find drawer layers (from nodes and edges)
        drawer_layers = set()

        # First, check nodes for drawer names
        for node in nodes:
            if "drawer" in node.lower():
                drawer_layers.add(node)

        # Also extract drawer locations from edges (supports path format like "cabinet/drawer_xxx")
        for edge in edges:
            match = re.match(r'(\w+)\((in|on)\)([\w\/]+)', edge)
            if match:
                location = match.group(3)
                # Check if location contains "drawer"
                if "drawer" in location.lower():
                    drawer_layers.add(location)

        if len(drawer_layers) < 2:
            return False, {"correct": 0, "total": len(items_to_place)}, f"Expected multiple drawer layers, found {len(drawer_layers)}", "Insufficient drawer layers"

        # Check which items are in which drawers
        items_in_drawers = {}  # drawer -> list of items
        items_locations = {}   # item -> drawer location

        # Build a mapping from base item name to actual node names
        # Example: "book" -> ["book", "yellow_book", "red_book"]
        item_name_mapping = {}  # base_name -> [actual_names]
        for node in nodes:
            node_lower = node.lower()
            for base_item in items_to_place:
                # Check if node is the base item or starts with color_base format
                # Example: node="yellow_book", base="book" -> match
                #          node="book", base="book" -> match
                if node_lower == base_item or node_lower.endswith('_' + base_item):
                    if base_item not in item_name_mapping:
                        item_name_mapping[base_item] = []
                    item_name_mapping[base_item].append(node_lower)

        for edge in edges:
            match = re.match(r'(\w+)\((in|on)\)([\w\/]+)', edge)
            if match:
                item_name = match.group(1).lower()
                relation = match.group(2)
                location = match.group(3).lower()

                # Check if this item matches any of the items to place
                matched_base_item = None
                for base_item in items_to_place:
                    # Direct match or color_prefix match
                    if item_name == base_item or item_name.endswith('_' + base_item):
                        matched_base_item = base_item
                        break

                if matched_base_item and "drawer" in location:
                    if location not in items_in_drawers:
                        items_in_drawers[location] = []
                    items_in_drawers[location].append(item_name)
                    items_locations[matched_base_item] = location

        # 额外严格检查：如果任务只涉及指定物品，则抽屉中不应出现与目标无关的其他物品（仅统计 in 关系）
        allowed_actual_items = set()
        for names in item_name_mapping.values():
            for n in names:
                allowed_actual_items.add(n)

        unrelated_in_drawer = []
        for edge in edges:
            m = re.match(r'([\w_]+)\((in|on)\)([\w\/]+)', edge)
            if m:
                item = m.group(1).lower()
                loc = m.group(3).lower()
                if "drawer" in loc and item not in allowed_actual_items:
                    unrelated_in_drawer.append(item)

        if unrelated_in_drawer:
            err = f"Unrelated items in drawers: {', '.join(unrelated_in_drawer[:3])}"
            return False, {"correct": 0, "total": len(items_to_place)}, err, err

        # Check if items are in DIFFERENT drawer layers
        # New scoring rules:
        # - Item in its own drawer (alone): 1.0 point per item
        # - Items sharing a drawer: 0.5 points TOTAL for all items in that drawer
        # - Special case: all items in one drawer = 0.8 points total (not 0.5)
        # - Item not in any drawer: 0 points

        total_required = len(items_to_place)
        total_score = 0.0
        misplaced_items = []

        # Group items by drawer location
        drawer_to_items = {}  # drawer -> list of items
        for item, location in items_locations.items():
            if location not in drawer_to_items:
                drawer_to_items[location] = []
            drawer_to_items[location].append(item)

        # Special case: all items in one drawer
        if len(drawer_to_items) == 1 and len(drawer_to_items[list(drawer_to_items.keys())[0]]) == total_required:
            # All items in the same drawer
            return False, {"correct": 0.8, "total": total_required}, \
                   f"All items placed in single drawer (expected {total_required} different drawers)", \
                   f"All {total_required} items in one drawer"

        # Calculate score based on drawer occupation
        for drawer, items_in_drawer in drawer_to_items.items():
            items_count = len(items_in_drawer)
            if items_count == 1:
                # Item alone in drawer: 1.0 point
                total_score += 1.0
            else:
                # Multiple items sharing drawer: 0.5 points total for this drawer
                total_score += 0.5

        # Items not in any drawer get 0 points (implicitly)
        for item in items_to_place:
            if item not in items_locations:
                misplaced_items.append(f"{item} not in any drawer")

        # Determine success and error message
        items_in_drawers = len(items_locations)
        unique_drawers = len(drawer_to_items)

        if total_score == total_required and unique_drawers == total_required:
            # All items in separate drawers (1 point each)
            return True, {"correct": total_required, "total": total_required}, "", f"All {total_required} items correctly placed in different drawer layers"
        else:
            # Build detailed error message
            error_msg = f"Task incomplete: {total_score:.1f}/{total_required} items correctly placed"

            # Add details about issues
            issues = []
            if items_in_drawers < total_required:
                not_in_drawer = total_required - items_in_drawers
                issues.append(f"{not_in_drawer} not in drawers")

            shared_drawers = sum(1 for items in drawer_to_items.values() if len(items) > 1)
            if shared_drawers > 0:
                issues.append(f"{shared_drawers} drawer{'s' if shared_drawers > 1 else ''} have multiple items")

            if issues:
                error_msg += "; " + "; ".join(issues)

            if unique_drawers < total_required and items_in_drawers > 0:
                error_msg += f" (only {unique_drawers} different drawer{'s' if unique_drawers > 1 else ''} used)"

            if misplaced_items:
                error_msg += f": {', '.join(misplaced_items[:3])}"

            return False, {"correct": total_score, "total": total_required}, error_msg, error_msg


    def judge_type_4_color_sorted_to_drawers(self, final_scene: Dict, task_goal: str) -> tuple:
        """
        Judge Type 4 tasks: Sort cubes and mugs by color into different drawer layers.
        Example: "Put all the cubes and mugs into the drawers by color—one color per drawer level"
        Returns: (is_successful, progress_info, error_message, response_message)
        """
        nodes = final_scene.get("nodes", [])
        edges = final_scene.get("edges", [])

        # Find all cubes and mugs
        cubes = {}   # name -> location
        mugs = {}    # name -> location

        for node in nodes:
            if "_cube" in node:
                cubes[node] = None
            elif "_mug" in node:
                mugs[node] = None

        # Parse edges to get locations
        for edge in edges:
            match = re.match(r'(\w+_\w+\d*)\((in|on)\)([\w\/]+)', edge)
            if match:
                obj_name = match.group(1)
                relation = match.group(2)
                location = match.group(3)

                if obj_name in cubes:
                    cubes[obj_name] = location
                elif obj_name in mugs:
                    mugs[obj_name] = location

        # Group objects by color
        color_groups = {}  # color -> {cubes: [...], mugs: [...], all: [...]}
        all_objects = list(cubes.keys()) + list(mugs.keys())

        for obj in all_objects:
            color_match = re.match(r'(\w+)_(cube|mug)\d*', obj)
            if color_match:
                color = color_match.group(1)
                obj_type = color_match.group(2)

                if color not in color_groups:
                    color_groups[color] = {"cubes": [], "mugs": [], "all": []}

                color_groups[color]["all"].append(obj)
                if obj_type == "cube":
                    color_groups[color]["cubes"].append(obj)
                else:
                    color_groups[color]["mugs"].append(obj)

        # Check if each color group is in a single drawer
        total_colors = len(color_groups)
        correctly_grouped_colors = 0
        total_objects = len(all_objects)
        correctly_placed_objects = 0
        errors = []

        for color, group_data in color_groups.items():
            obj_locations = {}
            for obj in group_data["all"]:
                location = cubes.get(obj) or mugs.get(obj)
                obj_locations[obj] = location

            # Get unique locations (drawers) for this color
            unique_locations = set(loc for loc in obj_locations.values() if loc and "drawer" in loc)

            if len(unique_locations) == 1:
                # All objects of this color are in the same drawer
                correctly_grouped_colors += 1
                correctly_placed_objects += len(group_data["all"])
            elif len(unique_locations) == 0:
                # None of this color's objects are in drawers
                errors.append(f"{color} objects not in any drawer")
            else:
                # Objects of this color are scattered across multiple drawers
                errors.append(f"{color} objects scattered across {len(unique_locations)} drawers")

        if correctly_grouped_colors == total_colors and correctly_placed_objects == total_objects:
            return True, {"correct": total_objects, "total": total_objects}, "", f"All {total_objects} objects correctly sorted by color into {total_colors} drawer levels"
        else:
            error_msg = f"{correctly_placed_objects}/{total_objects} objects correctly sorted"
            if errors:
                error_msg += f": {'; '.join(errors[:3])}"
            return False, {"correct": correctly_placed_objects, "total": total_objects}, error_msg, error_msg

    def judge_type_2_2_corresponding_boxes(self, final_scene: Dict, task_goal: str) -> tuple:
        """
        Judge Type 2(2) tasks: Put all the mugs and cubes into their corresponding colored boxes.
        Check if (color)_cube* and (color)_mug* are in (color)_box

        Returns: (is_successful, progress_info, error_message, response_message)
        progress_info format: {"correct": X, "total": Y}
        """
        nodes = final_scene.get("nodes", [])
        edges = final_scene.get("edges", [])

        # Extract all cubes and mugs with their locations
        cubes = {}   # name -> location
        mugs = {}    # name -> location
        boxes = set()

        # Parse nodes for boxes
        for node in nodes:
            if "_cube" in node:
                cubes[node] = None
            elif "mug" in node:  # Changed to catch all mugs including porcelain_mug, red_coffee_mug, etc.
                mugs[node] = None
            elif "_box" in node:
                # Remove state suffixes like (open), (closed)
                base_box_name = re.sub(r'\(.*?\)', '', node).strip()
                boxes.add(base_box_name)

        # Parse edges to get locations
        for edge in edges:
            # Updated regex to match various mug naming patterns
            match = re.match(r'([\w_]+)\((in|on)\)([\w\/]+)', edge)
            if match:
                obj_name = match.group(1)
                location = match.group(3)

                if obj_name in cubes:
                    cubes[obj_name] = location
                elif obj_name in mugs:
                    mugs[obj_name] = location

        # Check each color's cubes and mugs - only count those with corresponding boxes
        correct_count = 0
        total_count = 0  # Only count objects that SHOULD be in colored boxes
        errors = []

        # Common colors: red, blue, yellow
        colors = ["red", "blue", "yellow"]

        for color in colors:
            color_box = f"{color}_box"

            # Check cubes of this color
            cube_pattern = re.compile(rf'^{color}_cube\d*$')
            color_cubes = [obj for obj in cubes.keys() if cube_pattern.match(obj)]

            # Check mugs of this color (standard naming: color_mug*)
            mug_pattern = re.compile(rf'^{color}_mug\d*$')
            color_mugs = [obj for obj in mugs.keys() if mug_pattern.match(obj)]

            # Add to total count
            total_count += len(color_cubes) + len(color_mugs)

            # Check if they are in the corresponding box
            for obj in color_cubes + color_mugs:
                obj_location = cubes.get(obj) or mugs.get(obj)
                if obj_location == color_box:
                    correct_count += 1
                else:
                    if obj_location == "table":
                        errors.append(f"{obj} should be in {color_box} but is on table")
                    elif obj_location:
                        errors.append(f"{obj} should be in {color_box} but is in {obj_location}")
                    else:
                        errors.append(f"{obj} location not found")

        if correct_count == total_count:
            return True, {"correct": total_count, "total": total_count}, "", f"All {total_count} objects correctly placed in corresponding colored boxes"
        else:
            error_msg = f"{correct_count}/{total_count} objects correctly placed in corresponding colored boxes"
            if errors:
                error_msg += f": {'; '.join(errors[:3])}"
            return False, {"correct": correct_count, "total": total_count}, error_msg, error_msg

    def judge_type_2_3_by_color_to_drawers(self, final_scene: Dict, task_goal: str) -> tuple:
        """
        Judge Type 2(3) tasks: Put all the cubes and mugs into the drawers by color—one color per drawer level.

        Progress format: P1/P2/P3/S
        - P1: 1 if drawers only contain cubes/mugs, 0 if other items present
        - P2: count of cubes/mugs in drawers
        - P3: 0.2 (1 layer), 0.5 (2 layers), or 1.0 (3 layers) based on color separation
        - S: total count of cubes and mugs in scene

        Returns: (is_successful, progress_info, error_message, response_message)
        progress_info format: {"correct": "P1/P2/P3/S", "total": "S"}
        """
        nodes = final_scene.get("nodes", [])
        edges = final_scene.get("edges", [])

        # Find all cubes and mugs
        cubes = {}   # name -> location
        mugs = {}    # name -> location

        for node in nodes:
            if "_cube" in node:
                cubes[node] = None
            elif "mug" in node:  # Changed to catch all mugs including porcelain_mug, red_coffee_mug, etc.
                mugs[node] = None

        # Parse edges to get locations
        for edge in edges:
            # Updated regex to match various mug naming patterns
            match = re.match(r'([\w_]+)\((in|on)\)([\w\/]+)', edge)
            if match:
                obj_name = match.group(1)
                location = match.group(3)

                if obj_name in cubes:
                    cubes[obj_name] = location
                elif obj_name in mugs:
                    mugs[obj_name] = location

        # S: Total count of cubes and mugs
        S = len(cubes) + len(mugs)

        # P2: Count cubes/mugs in drawers (any of the three levels)
        drawer_layers = ["short_cabinet/drawer_low", "short_cabinet/drawer_middle", "short_cabinet/drawer_high"]
        P2 = 0
        items_in_drawers = {}  # item -> drawer location

        for obj_name, location in cubes.items():
            if "drawer" in location:
                P2 += 1
                items_in_drawers[obj_name] = location

        for obj_name, location in mugs.items():
            if "drawer" in location:
                P2 += 1
                items_in_drawers[obj_name] = location

        # P1: 抽屉中仅包含方块与杯子（严格），否则失败
        non_cube_mug_items = []
        allowed_items = set(cubes.keys()) | set(mugs.keys())
        for edge in edges:
            match = re.match(r'([\w_]+)\((in|on)\)([\w\/]+)', edge)
            if match:
                item_name = match.group(1)
                location = match.group(3)

                if "drawer" in location and item_name not in allowed_items:
                    non_cube_mug_items.append(item_name)

        P1 = 1 if len(non_cube_mug_items) == 0 else 0

        # P3: Count layers with cubes/mugs and check color consistency
        drawer_items = {}  # drawer -> list of items
        for obj_name, location in items_in_drawers.items():
            if location not in drawer_items:
                drawer_items[location] = []
            drawer_items[location].append(obj_name)

        # Count how many drawer layers have items
        layers_with_items = len(drawer_items)

        # Check how many layers have color-consistent items
        layers_with_consistent_colors = 0
        
        # Known standard colors for matching
        standard_colors = {"red", "blue", "yellow", "green", "white"}
        
        for drawer, items in drawer_items.items():
            # Extract colors from all items in this drawer
            colors_in_drawer = set()
            for item in items:
                # Extract color from item name
                # Standard: "red_cube1" -> "red", "blue_mug2" -> "blue"
                # Special mugs: "red_coffee_mug" -> "red", "porcelain_mug" -> "porcelain", "white_yellow_mug" -> "white"
                
                extracted_color = None
                
                # Try standard cube pattern first (color_cube\d*)
                color_match = re.match(r'^(\w+)_cube\d*$', item)
                if color_match:
                    extracted_color = color_match.group(1)
                # Try standard mug pattern (color_mug\d*)
                elif re.match(r'^(\w+)_mug\d*$', item):
                    color_match = re.match(r'^(\w+)_mug\d*$', item)
                    extracted_color = color_match.group(1)
                # Special case: mug with complex name (e.g., red_coffee_mug, white_yellow_mug)
                elif 'mug' in item:
                    # Extract the first word and check if it's a standard color
                    parts = item.split('_')
                    first_word = parts[0]
                    
                    if first_word in standard_colors:
                        extracted_color = first_word
                    else:
                        # Not a standard color (e.g., "porcelain")
                        extracted_color = first_word
                
                if extracted_color:
                    colors_in_drawer.add(extracted_color)
            
            # If all items in this drawer have the same color, count it
            if len(colors_in_drawer) == 1:
                layers_with_consistent_colors += 1

        # Calculate P3 based on layers with color consistency
        if layers_with_consistent_colors == 1:
            P3 = 0.2
        elif layers_with_consistent_colors == 2:
            P3 = 0.5
        elif layers_with_consistent_colors == 3:
            P3 = 1.0
        else:
            P3 = 0.0

        # Build progress string
        progress_str = f"{P1}/{P2}/{P3}/{S}"

        # 成功判定：所有方块/杯子都在抽屉中，三层按颜色一致，且抽屉中不含其他物品
        if P1 == 1 and P2 == S and P3 == 1.0:
            return True, {"correct": P2, "total": S, "progress_detail": progress_str}, "", f"Perfect: all {S} cubes and mugs in drawers, separated by color across 3 levels"
        else:
            error_parts = []
            # 抽屉包含其它物品为失败原因
            if P1 == 0 and non_cube_mug_items:
                error_parts.append(f"unrelated items in drawers ({', '.join(non_cube_mug_items[:3])})")

            if P2 < S:
                error_parts.append(f"only {P2}/{S} objects in drawers")

            if P3 < 1.0:
                if layers_with_consistent_colors < 3:
                    error_parts.append(f"color-consistent separation across {layers_with_consistent_colors} layer{'s' if layers_with_consistent_colors != 1 else ''} (need 3)")
                else:
                    error_parts.append(f"items in {layers_with_items} layer{'s' if layers_with_items > 1 else ''} but color not consistent in all")

            error_msg = f"Progress: {progress_str}"
            if error_parts:
                error_msg += "; " + "; ".join(error_parts)

            return False, {"correct": P2, "total": S, "progress_detail": progress_str}, error_msg, error_msg


    def parse_type_1_task_requirements(self, task_goal: str) -> Dict:
        """
        Parse Type 1 task requirements from the goal description.
        Returns: {
            "object_types": ["cube"],  # or ["mug"], or ["cube", "mug"]
            "target_colors": {"yellow"},  # specific colors mentioned
            "target_boxes": {"yellow_box"},  # specific target boxes
            "is_corresponding": False  # whether it's "corresponding colored boxes" mode
        }
        """
        task_goal_lower = task_goal.lower()

        requirements = {
            "object_types": [],
            "target_colors": set(),
            "target_boxes": set(),
            "is_corresponding": False
        }

        # Check if it's "corresponding colored boxes" mode
        if "corresponding" in task_goal_lower:
            requirements["is_corresponding"] = True
            # In this mode, both cubes and mugs are checked
            requirements["object_types"] = ["cube", "mug"]
            return requirements

        # Pattern 1: "move all {color}_{type} into {color}_box" (with "all")
        # Example: "move all red_cubes into blue_box", "move all yellow_mugs into yellow_box"
        match1 = re.match(r'move\s+all\s+(\w+)_(cubes|mugs)\s+into\s+(\w+)_box', task_goal_lower)
        if match1:
            source_color = match1.group(1)
            obj_type_plural = match1.group(2)
            target_color = match1.group(3)

            # Convert to singular
            obj_type = obj_type_plural.rstrip('s')  # cubes -> cube, mugs -> mug
            requirements["object_types"] = [obj_type]
            requirements["target_colors"].add(source_color)
            requirements["target_boxes"].add(f"{target_color}_box")
            return requirements

        # Pattern 2: "move all {color}_{type} into {color}_lid_box" (with "all")
        match2 = re.match(r'move\s+all\s+(\w+)_(cubes|mugs)\s+into\s+(\w+)_lid_box', task_goal_lower)
        if match2:
            source_color = match2.group(1)
            obj_type_plural = match2.group(2)
            target_color = match2.group(3)

            obj_type = obj_type_plural.rstrip('s')
            requirements["object_types"] = [obj_type]
            requirements["target_colors"].add(source_color)
            requirements["target_boxes"].add(f"{target_color}_lid_box")
            return requirements

        # Pattern 3: "move {color}_{type} into {color}_box" (without "all")
        # Example: "move yellow_cubes into yellow_box", "move red_mugs into yellow_box"
        match3 = re.match(r'move\s+(?!all\s+)(\w+)_(cubes|mugs)\s+into\s+(\w+)_box', task_goal_lower)
        if match3:
            source_color = match3.group(1)
            obj_type_plural = match3.group(2)
            target_color = match3.group(3)

            # Convert to singular
            obj_type = obj_type_plural.rstrip('s')  # cubes -> cube, mugs -> mug
            requirements["object_types"] = [obj_type]
            requirements["target_colors"].add(source_color)
            requirements["target_boxes"].add(f"{target_color}_box")
            return requirements

        # Pattern 4: "put all the {types} into {color}_box"
        # Example: "put all the cubes into red_box", "put all the mugs into blue_box"
        match4 = re.match(r'put\s+all\s+the\s+(\w+)\s+into\s+(\w+)_box', task_goal_lower)
        if match4:
            obj_type_plural = match4.group(1)
            target_color = match4.group(2)
            obj_type = obj_type_plural.rstrip('s')  # cubes -> cube, mugs -> mug
            requirements["object_types"] = [obj_type]
            requirements["target_boxes"].add(f"{target_color}_box")
            return requirements

        # Pattern 5: "move all the {types} into {color}_box"
        # Example: "move all the cubes into red_box"
        match5 = re.match(r'move\s+all\s+the\s+(\w+)\s+into\s+(\w+)_box', task_goal_lower)
        if match5:
            obj_type_plural = match5.group(1)
            target_color = match5.group(2)
            obj_type = obj_type_plural.rstrip('s')  # cubes -> cube, mugs -> mug
            requirements["object_types"] = [obj_type]
            requirements["target_boxes"].add(f"{target_color}_box")
            return requirements

        # Pattern 6: Mention both cubes and mugs explicitly
        # Example: "move all the cubes and mugs into red_box"
        if "cube" in task_goal_lower and "mug" in task_goal_lower:
            requirements["object_types"] = ["cube", "mug"]
            # Try to extract target color/box
            box_match = re.search(r'into\s+(\w+)_box', task_goal_lower)
            if box_match:
                target_color = box_match.group(1)
                requirements["target_boxes"].add(f"{target_color}_box")
            return requirements

        # Pattern 7: Only mentions cubes or mugs, with specific box
        # Example: "move cubes into red_box"
        if "cube" in task_goal_lower and "mug" not in task_goal_lower:
            requirements["object_types"] = ["cube"]
        elif "mug" in task_goal_lower and "cube" not in task_goal_lower:
            requirements["object_types"] = ["mug"]
        else:
            # Default: check both
            requirements["object_types"] = ["cube", "mug"]

        # Try to extract target box
        box_match = re.search(r'into\s+(\w+)_box', task_goal_lower)
        if box_match:
            target_color = box_match.group(1)
            requirements["target_boxes"].add(f"{target_color}_box")
            # Only add target_colors if a specific source color was mentioned
            # Don't add target_colors for "all mugs" or "all cubes" type tasks
            # Check if the task goal explicitly mentions a source color
            color_pattern = re.match(r'move\s+all\s+(\w+)_(cubes|mugs)', task_goal_lower)
            if color_pattern:
                # Has explicit source color
                source_color = color_pattern.group(1)
                requirements["target_colors"].add(source_color)

        return requirements

    def rule_based_task_success_judge(self, final_scene: Dict, task_goal: str = "") -> tuple:
        """
        Type 1: "move A into B" pattern - Complete rewrite

        A types (3 categories):
        1. all (color)_mugs/cubes - e.g., "move all red_cubes"
        2. all mugs/cubes - e.g., "move all cubes"
        3. all items on table - e.g., "move all items on table into X"

        B types (3 categories):
        1. (color)_box - e.g., red_box, yellow_box
        2. (color)_lid_box - e.g., red_lid_box
        3. drawer_* - e.g., short_cabinet/drawer_low

        Returns: (is_successful, progress_info, error_message, response_message)
        progress_info format: {"correct": X, "total": Y}
        """
        if not task_goal:
            return False, {"correct": 0, "total": 0}, "No task goal provided", "Missing task goal"

        task_goal_lower = task_goal.lower()
        nodes = final_scene.get("nodes", [])
        edges = final_scene.get("edges", [])

        # ===== Step 1: Identify A (items to move) =====
        items_to_move = []  # List of (item_name, location)
        container_keywords = ["table", "box", "drawer", "cabinet", "lid_box", "container",
                            "short_cabinet"]  # Containers to exclude

        # A-Type 1: all (color)_mugs/cubes (with or without "all", with or without "the")
        # Matches: "move all red_cubes into", "move red_cubes in", "move all the red_cubes in"
        # Support both "into" and " in "
        match = re.match(r'move\s+(?:all\s+)?(?:the\s+)?(\w+)_(cubes|mugs)\s+(?:into|in)\s+', task_goal_lower)
        if match:
            color = match.group(1)
            obj_type = match.group(2).rstrip('s')  # cubes -> cube, mugs -> mug

            # Find all objects matching color and type
            pattern = re.compile(rf'^{color}_{obj_type}\d*$')
            for node in nodes:
                if pattern.match(node):
                    # Find location from edges
                    location = None
                    for edge in edges:
                        edge_match = re.match(rf'^{re.escape(node)}\((in|on)\)([\w\/]+)', edge)
                        if edge_match:
                            location = edge_match.group(2)
                            break
                    if location is None:
                        location = "table"  # Assume on table if not found
                    items_to_move.append((node, location))

        # A-Type 2: all mugs/cubes (no color specified)
        # Matches: "move all cubes into", "move all mugs in", "put all mugs in blue_box"
        # Support both "into" and " in "
        elif re.match(r'(move|put)\s+all\s+(?:the\s+)?(cubes|mugs)\s+(?:into|in)\s+', task_goal_lower):
            obj_type = re.search(r'(cubes|mugs)', task_goal_lower).group(1).rstrip('s')

            # Find all objects matching type (any color)
            # Pattern matches: red_cube1, blue_mug2, porcelain_mug, red_coffee_mug, white_yellow_mug, etc.
            all_mugs_and_cubes = []
            for node in nodes:
                node_lower = node.lower()
                # Check if node contains the object type
                if obj_type == "cube" and "_cube" in node_lower:
                    all_mugs_and_cubes.append(node)
                elif obj_type == "mug" and "mug" in node_lower:
                    # This will match: red_mug1, porcelain_mug, red_coffee_mug, white_yellow_mug
                    all_mugs_and_cubes.append(node)
            
            # Get locations for all matched objects
            for node in all_mugs_and_cubes:
                location = None
                for edge in edges:
                    edge_match = re.match(rf'^{re.escape(node)}\((in|on)\)([\w\/]+)', edge)
                    if edge_match:
                        location = edge_match.group(2)
                        break
                if location is None:
                    location = "table"
                items_to_move.append((node, location))

        # A-Type 3: all items on table
        # elif "items on table" in task_goal_lower or "items on the table" in task_goal_lower:
        #     # Find all items on table (excluding containers)
        #     for edge in edges:
        #         match = re.match(r'(\w+)\((on)\)table', edge)
        #         if match:
        #             item_name = match.group(1)
        #             # Check if it's a container
        #             is_container = any(keyword in item_name.lower() for keyword in container_keywords)
        #             if not is_container and item_name != "table":
        #                 items_to_move.append((item_name, "table"))
                # A-Type 3: all items on table
        elif "items on table" in task_goal_lower or "items on the table" in task_goal_lower:
            # For "move all items on table" tasks, we need to identify what items were originally on the table.
            # Since we only have the final scene, we reconstruct by finding:
            # 1. Items still on table in final scene (failed to move)
            # 2. Items in the target location (successfully moved from table)
            
            # First, extract target location from task goal early
            temp_target = None
            if "into" in task_goal_lower or " in " in task_goal_lower:
                parts = re.split(r'\s+(?:into|in)\s+', task_goal_lower, 1)
                if len(parts) == 2:
                    temp_target = parts[1].strip().split()[0]
                    temp_target = re.sub(r'[.,!?;:\s]+$', '', temp_target)
                    
                    if temp_target.endswith("_box") or temp_target.endswith("_lid_box"):
                        temp_target = temp_target
                    elif "drawer" in temp_target:
                        # Try to find drawer in nodes or construct full path
                        for node in nodes:
                            node_lower = node.lower()
                            if temp_target in node_lower or node_lower.endswith(temp_target):
                                temp_target = re.sub(r'\(open\)|\(closed\)$', '', node)
                                break
                        else:
                            if not temp_target.startswith("short_cabinet/"):
                                temp_target = f"short_cabinet/{temp_target}"
            
            # Collect all non-container items that are either:
            # 1. Currently on table (failed to move), OR  
            # 2. Currently in target location (successfully moved)
            all_items_from_table = set()
            
            # Find items still on table
            for edge in edges:
                match = re.match(r'(\w+)\((on)\)table', edge)
                if match:
                    item_name = match.group(1)
                    is_container = any(keyword in item_name.lower() for keyword in container_keywords)
                    if not is_container and item_name != "table":
                        all_items_from_table.add(item_name)
            
            # Find items that were moved to target location (if target is known)
            if temp_target:
                for edge in edges:
                    match = re.match(r'(\w+)\((in|on)\)([\w\/]+)', edge)
                    if match:
                        item_name = match.group(1)
                        location = match.group(3)
                        if location == temp_target:
                            is_container = any(keyword in item_name.lower() for keyword in container_keywords)
                            if not is_container:
                                all_items_from_table.add(item_name)
            
            # Convert to items_to_move list with current locations
            for item_name in all_items_from_table:
                # Find current location of each item
                current_location = None
                for edge in edges:
                    edge_match = re.match(rf'^{re.escape(item_name)}\((in|on)\)([\w\/]+)', edge)
                    if edge_match:
                        current_location = edge_match.group(2)
                        break
                if current_location is None:
                    current_location = "table"  # Default assumption
                items_to_move.append((item_name, current_location))
        # ===== Step 2: Identify B (target location) =====
        target_location = None

        # Extract target from task goal
        # Support both "into" and " in " (but not as part of other words like "inside")
        if "into" in task_goal_lower or " in " in task_goal_lower:
            # Split by "into" or " in " (using regex to match word boundaries)
            parts = re.split(r'\s+(?:into|in)\s+', task_goal_lower, 1)
            if len(parts) == 2:
                target = parts[1].strip().split()[0]  # First word after "into" or "in"
                # Clean up trailing punctuation (.,!? etc.)
                target = re.sub(r'[.,!?;:\s]+$', '', target)

                # B-Type 1 & 2: (color_)box or (color_)lid_box
                if target.endswith("_box") or target.endswith("_lid_box"):
                    target_location = target

                # B-Type 3: drawer_*
                elif "drawer" in target:
                    # Try to match drawer in nodes/edges
                    # Target might be "drawer_low" or "short_cabinet/drawer_low"
                    # Note: drawer nodes may have state suffixes like "(open)" or "(closed)"
                    # But edges do NOT have state suffixes. We must remove state for comparison.
                    # First, try to find exact match or partial match in nodes
                    for node in nodes:
                        node_lower = node.lower()
                        # Check if node contains target (e.g., "drawer_low" matches "short_cabinet/drawer_low")
                        if target in node_lower or node_lower.endswith(target):
                            # Remove state suffix (open/closed) from drawer node
                            # Edge format: "item(in)short_cabinet/drawer_low" (no state)
                            # Node format: "short_cabinet/drawer_low(open)" or "short_cabinet/drawer_low(closed)"
                            # We need to remove the (open)/(closed) part for matching
                            clean_node = re.sub(r'\(open\)|\(closed\)$', '', node)
                            target_location = clean_node
                            break

                    # If not found in nodes, construct full path
                    if not target_location:
                        # Common patterns: drawer_low, drawer_middle, drawer_high
                        # are typically in short_cabinet
                        if not target.startswith("short_cabinet/"):
                            target_location = f"short_cabinet/{target}"
                        else:
                            target_location = target

        if not target_location:
            return False, {"correct": 0, "total": 0}, "Could not determine target location from task goal", "Target unclear"

        # ===== Step 3: Check if all items in A are in B =====
        correct_count = 0
        total_count = len(items_to_move)
        errors = []

        for item_name, current_location in items_to_move:
            # Check if item is in target location
            if current_location == target_location:
                correct_count += 1
            else:
                if current_location == "table":
                    errors.append(f"{item_name} should be in {target_location} but is on table")
                else:
                    errors.append(f"{item_name} should be in {target_location} but is in {current_location}")

        # ===== Step 4: Determine success =====
        if correct_count == total_count:
            return True, {"correct": total_count, "total": total_count}, "", f"All {total_count} objects correctly placed in {target_location}"
        else:
            error_msg = f"Task incomplete: {correct_count}/{total_count} objects correctly placed"
            if errors:
                error_msg += "; " + "; ".join(errors[:3])
            return False, {"correct": correct_count, "total": total_count}, error_msg, error_msg

    def judge_task_success_with_error(self, final_scene: Dict, task_goal: str = "") -> tuple:
        """
        Judge if the task was successfully completed using rule-based approach.
        Automatically classifies task type and uses appropriate judge.
        Returns: (is_successful, progress_info, error_message, response_message)
        """
        try:
            if not task_goal:
                return False, {"correct": 0, "total": 0}, "No task goal provided", "Missing task goal"
            
            task_goal_lower = task_goal.lower()
            
            # ===== NEW: Check for drawer layer-based scoring task (6 objects / 3 layers) =====
            # Pattern: task mentions cubes/mugs + multiple drawers + "layer/level/different"
            # AND does NOT mention specific items like milk, popcorn, book (which use different scoring)
            if ("cube" in task_goal_lower and "mug" in task_goal_lower) and \
               "drawer" in task_goal_lower and \
               ("layer" in task_goal_lower or "level" in task_goal_lower or "different" in task_goal_lower):
                # Exclude the specific 3-item variant (milk, popcorn, book)
                specific_items = ["milk", "popcorn", "book", "apple", "orange", "banana"]
                if not any(item in task_goal_lower for item in specific_items):
                    # This is a drawer layer-based task (6 objects / 3 layers)
                    # Check if it matches the pattern and has reasonable object count
                    nodes = final_scene.get("nodes", [])
                    
                    # Count cubes and mugs in the scene
                    cube_count = sum(1 for node in nodes if "_cube" in node)
                    mug_count = sum(1 for node in nodes if "mug" in node)
                    total_count = cube_count + mug_count
                    
                    # If we have around 6 objects (±1), use the new layer-based scoring
                    if 4 <= total_count <= 8:
                        return self.judge_drawer_task_by_layers(final_scene, task_goal)
            
            # Classify task type
            task_type = self.classify_task_type(task_goal)

            # Route to appropriate judge based on task type
            if task_type == 2:
                # Type 2 has three sub-tasks, determine which one
                task_goal_lower = task_goal.lower()

                # Type 2(3): "by color" + "drawer" + "cubes and mugs"
                if "by color" in task_goal_lower and "drawer" in task_goal_lower:
                    return self.judge_type_2_3_by_color_to_drawers(final_scene, task_goal)

                # Type 2(2): "corresponding colored boxes"
                elif "corresponding" in task_goal_lower or "corresponding colored boxes" in task_goal_lower:
                    return self.judge_type_2_2_corresponding_boxes(final_scene, task_goal)

                # Type 2(1): "different drawer layers" with specific items
                elif "different drawer" in task_goal_lower:
                    return self.judge_type_3_items_to_different_drawers(final_scene, task_goal)

                # Fallback for Type 2
                else:
                    return self.judge_type_2_all_items_to_container(final_scene, task_goal)

            elif task_type == 1:
                # Type 1: "move A into B" pattern
                return self.rule_based_task_success_judge(final_scene, task_goal)

            else:
                # Unknown type, default to Type 1
                return self.rule_based_task_success_judge(final_scene, task_goal)
        except Exception as e:
            print(f"Error in rule-based task success judgment: {e}")
            return False, {"correct": 0, "total": 0}, f"Error in rule-based judgment: {str(e)}", ""

    def process_report(self, report_path: str) -> Optional[Dict]:
        """Process a single report file."""
        if not os.path.exists(report_path):
            print(f"Report file not found: {report_path}")
            return None

        with open(report_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Extract data
        task_goal = self.extract_task_goal(content)
        user_input = self.extract_user_input(content)
        config_number = self.extract_config_number(user_input)
        fail_reason = self.extract_fail_reason(content)
        scene_graphs = self.extract_scene_graphs(content)
        execution_statuses = self.extract_execution_statuses(content)
        model_outputs = self.extract_model_outputs(content)

        if not scene_graphs:
            print("No scene graphs found in the report")
            return None

        # Classify task type
        task_type = self.classify_task_type(task_goal)

        # Judge task success with new return format
        is_successful, progress_info, rule_error, rule_response = self.judge_task_success_with_error(
            scene_graphs[-1], task_goal
        )

        # Prepare result
        result = {
            "task_goal": task_goal,
            "user_input": user_input,  # 新增：用户原始指令
            "config_number": config_number,  # 新增：配置序号
            "fail_reason": fail_reason,  # 新增：失败原因（如果有）
            "task_type": task_type,
            "scene_graphs": scene_graphs,
            "execution_statuses": execution_statuses,
            "model_outputs": model_outputs,
            "is_successful": is_successful,
            "progress_info": progress_info,
            "rule_error": rule_error,
            "rule_response": rule_response
        }

        return result
    
    def save_result(self, result: Dict, output_path: str, original_report_path: str = None):
        """Save the result to a JSON file and copy original report to success folder if task is successful."""
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        print(f"Result saved to: {output_path}")

        # If task is successful and original report path is provided, copy report to success folder
        if result.get("is_successful", False) and original_report_path and os.path.exists(original_report_path):
            self.copy_successful_report(original_report_path, output_path)

    def copy_successful_report(self, original_report_path: str, json_output_path: str):
        """Copy the original report file to a success folder alongside the JSON output."""
        try:
            # Create success directory in the same directory as the JSON output
            output_dir = os.path.dirname(json_output_path)
            success_dir = os.path.join(output_dir, "success")
            os.makedirs(success_dir, exist_ok=True)

            # Get the original report filename
            report_filename = os.path.basename(original_report_path)
            success_report_path = os.path.join(success_dir, report_filename)

            # Copy the original report file
            shutil.copy2(original_report_path, success_report_path)
            print(f"Original report copied to: {success_report_path}")

        except Exception as e:
            print(f"Error copying report to success folder: {e}")
            # Don't raise the exception, just log it since the main processing should continue
    
    def create_log_entry(self, filename: str, is_successful: bool,
                        output_path: str = "", rule_error: str = "", rule_response: str = "",
                        final_scene_graph: str = "", progress_info: Dict = None,
                        task_type: int = 0, config_number: str = "", fail_reason: str = "") -> tuple:
        """
        Create a log entry for processing result.
        Returns: (config_sort_key, log_entry_string)
        config_sort_key: integer for sorting (extracted from config number, or large number if no config)
        """
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Format config number prefix
        config_prefix = ""
        config_sort_key = 999999  # Default large number for entries without config

        if config_number:
            config_prefix = f"{config_number} | "
            # Extract number for sorting: "配置_35" -> 35
            match = re.search(r'\d+', config_number)
            if match:
                config_sort_key = int(match.group())

        # Format progress info
        progress_str = ""
        if progress_info and isinstance(progress_info, dict):
            correct = progress_info.get("correct", 0)
            total = progress_info.get("total", 0)
            progress_detail = progress_info.get("progress_detail", None)
            if total > 0:
                if progress_detail:
                    # Type 2(3) special format
                    progress_str = f" | Progress: {progress_detail}"
                else:
                    # Normal format
                    progress_str = f" | Progress: {correct}/{total}"

        # Format task type
        task_type_str = f" | Type: {task_type}" if task_type > 0 else ""

        # Format fail reason
        fail_reason_str = f" | Fail_reason: {fail_reason}" if fail_reason else ""

        if rule_error:
            status = "ERROR"
            log_entry = (f"[{timestamp}] {config_prefix}File: {filename} | Status: {status}{task_type_str}{progress_str} | "
                        f"Error: {rule_error} | Rule Response: {rule_response}{fail_reason_str}\n")
        elif not is_successful:
            status = "FAILED"
            log_entry = (f"[{timestamp}] {config_prefix}File: {filename} | Status: {status}{task_type_str}{progress_str} | "
                        f"Response: {rule_response}{fail_reason_str}\n")
        else:
            status = "SUCCESS"
            log_entry = f"[{timestamp}] {config_prefix}File: {filename} | Status: {status}{task_type_str}{progress_str} | Output: {output_path}{fail_reason_str}\n"

        return (config_sort_key, log_entry)

    def log_result(self, log_file_path: str, filename: str, is_successful: bool,
                   output_path: str = "", rule_error: str = "", rule_response: str = "",
                   final_scene_graph: str = "", progress_info: Dict = None,
                   task_type: int = 0, config_number: str = "", fail_reason: str = ""):
        """Log processing result to log file (deprecated, kept for compatibility)."""
        _, log_entry = self.create_log_entry(filename, is_successful, output_path, rule_error,
                                             rule_response, final_scene_graph, progress_info,
                                             task_type, config_number, fail_reason)
        with open(log_file_path, 'a', encoding='utf-8') as f:
            f.write(log_entry)
    
    def find_report_files(self, root_dir: str) -> List[str]:
        """Find all *agent_report.txt files recursively."""
        report_files = []
        for root, _, files in os.walk(root_dir):
            for file in files:
                if file.endswith('agent_report.txt'):
                    report_files.append(os.path.join(root, file))
        return report_files

def main():
    parser = argparse.ArgumentParser(description="Process report files to extract key data")
    parser.add_argument("--report_dir", default="/path/to/report_dir",
                       help="Directory containing report files")
    parser.add_argument("--output-dir", default="/path/to/output_dir",
                       help="Output directory for JSON files")
    args = parser.parse_args()

    # Ensure output directory exists
    os.makedirs(args.output_dir, exist_ok=True)

    processor = ReportProcessor()

    # Find all report files
    report_files = processor.find_report_files(args.report_dir)
    print(f"Found {len(report_files)} report files")

    # Statistics
    stats = {
        "total_files": len(report_files),
        "successful_files": 0,
        "failed_files": 0,
        "skipped_files": 0
    }

    # Collect all log entries for sorted output later
    log_entries = []  # List of (config_sort_key, log_entry_string)

    # Process each report file
    for i, report_path in enumerate(report_files, 1):
        print(f"\n[{i}/{len(report_files)}] Processing: {report_path}")

        result = processor.process_report(report_path)

        if result:
            print(f"Task Goal: {result['task_goal'][:100]}...")
            print(f"Task Type: {result.get('task_type', 0)}")
            print(f"Scene Graphs: {len(result['scene_graphs'])}")
            print(f"Execution Statuses: {len(result['execution_statuses'])}")
            print(f"Model Outputs: {len(result['model_outputs'])}")

            # Print progress info if available
            if result.get('progress_info'):
                progress = result['progress_info']
                correct = progress.get('correct', 0)
                total = progress.get('total', 0)
                progress_detail = progress.get('progress_detail', None)

                if total > 0:
                    if progress_detail:
                        # Type 2(3) has special format P1/P2/P3/S
                        print(f"Progress: {progress_detail} ({correct}/{total} objects in drawers)")
                    else:
                        # Normal format
                        print(f"Progress: {correct}/{total} objects correctly placed")

            print(f"Task Successful: {result['is_successful']}")

            if result["is_successful"] and not result["rule_error"]:
                # Generate output filename
                report_name = os.path.basename(report_path)
                output_name = os.path.splitext(report_name)[0] + ".json"
                output_path = os.path.join(args.output_dir, output_name)

                processor.save_result(result, output_path, report_path)
                # Create log entry and add to list
                log_entry = processor.create_log_entry(
                    report_name, True, output_path,
                    progress_info=result.get('progress_info'),
                    task_type=result.get('task_type', 0),
                    config_number=result.get('config_number', ''),
                    fail_reason=result.get('fail_reason', ''))
                log_entries.append(log_entry)
                stats["successful_files"] += 1
            elif result["rule_error"]:
                # Create log entry and add to list
                log_entry = processor.create_log_entry(
                    os.path.basename(report_path), False,
                    rule_error=result["rule_error"],
                    rule_response=result["rule_response"],
                    progress_info=result.get('progress_info'),
                    task_type=result.get('task_type', 0),
                    config_number=result.get('config_number', ''),
                    fail_reason=result.get('fail_reason', ''))
                log_entries.append(log_entry)
                stats["rule_error_files"] = stats.get("rule_error_files", 0) + 1
                print(f"Rule error occurred: {result['rule_error'][:100]}...")
            else:
                # Create log entry and add to list
                log_entry = processor.create_log_entry(
                    os.path.basename(report_path), False,
                    rule_response=result["rule_response"],
                    progress_info=result.get('progress_info'),
                    task_type=result.get('task_type', 0),
                    config_number=result.get('config_number', ''),
                    fail_reason=result.get('fail_reason', ''))
                log_entries.append(log_entry)
                stats["failed_files"] += 1
                print("Task was not successful")
        else:
            # Create log entry and add to list
            log_entry = processor.create_log_entry(
                os.path.basename(report_path), False,
                config_number=result.get('config_number', '') if result else '',
                fail_reason=result.get('fail_reason', '') if result else '')
            log_entries.append(log_entry)
            stats["skipped_files"] += 1
            print("Processing failed")

    # Sort log entries by config number and write to log file
    log_file_path = os.path.join(args.output_dir, "processing_log.txt")
    with open(log_file_path, 'w', encoding='utf-8') as f:
        # Write header
        f.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Starting batch processing\n")

        # Sort log entries by config_sort_key (config number)
        log_entries.sort(key=lambda x: x[0])

        # Write all sorted log entries
        for _, log_entry in log_entries:
            f.write(log_entry)

        # Write footer
        f.write(f"\n[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Processing completed\n")

    # Final statistics
    print("\n" + "="*50)
    print("FINAL PROCESSING STATISTICS")
    print("="*50)
    print(f"Total files found: {stats['total_files']}")
    print(f"Successfully processed: {stats['successful_files']}")
    print(f"Failed processing: {stats['failed_files']}")
    print(f"Rule error files: {stats.get('rule_error_files', 0)}")
    print(f"Skipped files: {stats['skipped_files']}")

    success_rate = (stats['successful_files'] / stats['total_files'] * 100) if stats['total_files'] > 0 else 0
    print(f"Success rate: {success_rate:.2f}%")

    # Append statistics to log file
    with open(log_file_path, 'a', encoding='utf-8') as f:
        f.write(f"Total files: {stats['total_files']}, Successful: {stats['successful_files']}, Failed: {stats['failed_files']}, Rule errors: {stats.get('rule_error_files', 0)}, Skipped: {stats['skipped_files']}\n")
        f.write(f"Success rate: {success_rate:.2f}%\n")

    print(f"\nLog file saved to: {log_file_path}")
    print(f"Log entries sorted by configuration number")


def test_drawer_layer_scoring():
    """
    Test the new drawer layer-based scoring system.
    This function demonstrates how the layer-based scoring works.
    """
    processor = ReportProcessor()
    
    # Example 1: Perfect score (6/6)
    scene1 = {
        "nodes": [
            "red_cube1", "red_cube2",
            "blue_mug1", "blue_mug2",
            "yellow_cube3", "yellow_mug3"
        ],
        "edges": [
            "red_cube1(in)short_cabinet/drawer_low",
            "red_cube2(in)short_cabinet/drawer_low",
            "blue_mug1(in)short_cabinet/drawer_middle",
            "blue_mug2(in)short_cabinet/drawer_middle",
            "yellow_cube3(in)short_cabinet/drawer_high",
            "yellow_mug3(in)short_cabinet/drawer_high"
        ]
    }
    
    print("=" * 70)
    print("TEST 1: Perfect Score (6/6)")
    print("=" * 70)
    is_success, progress, error, response = processor.judge_drawer_task_by_layers(
        scene1, "Place cubes and mugs into drawers"
    )
    print(f"Success: {is_success}")
    print(f"Progress: {progress}")
    print(f"Response: {response}\n")
    
    # Example 2: Partial score - missing one object per layer (3/6)
    scene2 = {
        "nodes": [
            "red_cube1",
            "blue_mug1",
            "yellow_cube3"
        ],
        "edges": [
            "red_cube1(in)short_cabinet/drawer_low",
            "blue_mug1(in)short_cabinet/drawer_middle",
            "yellow_cube3(in)short_cabinet/drawer_high"
        ]
    }
    
    print("=" * 70)
    print("TEST 2: Partial Score (3/6) - One object per layer")
    print("=" * 70)
    is_success, progress, error, response = processor.judge_drawer_task_by_layers(
        scene2, "Place cubes and mugs into drawers"
    )
    print(f"Success: {is_success}")
    print(f"Progress: {progress}")
    print(f"Response: {response}\n")
    
    # Example 3: Layer with unrelated item (0/6)
    scene3 = {
        "nodes": [
            "red_cube1", "red_cube2",
            "blue_mug1", "blue_mug2",
            "yellow_cube3", "yellow_mug3",
            "table"
        ],
        "edges": [
            "red_cube1(in)short_cabinet/drawer_low",
            "red_cube2(in)short_cabinet/drawer_low",
            "table(in)short_cabinet/drawer_low",  # Unrelated item!
            "blue_mug1(in)short_cabinet/drawer_middle",
            "blue_mug2(in)short_cabinet/drawer_middle",
            "yellow_cube3(in)short_cabinet/drawer_high",
            "yellow_mug3(in)short_cabinet/drawer_high"
        ]
    }
    
    print("=" * 70)
    print("TEST 3: Unrelated Item in Low Drawer (4/6)")
    print("=" * 70)
    is_success, progress, error, response = processor.judge_drawer_task_by_layers(
        scene3, "Place cubes and mugs into drawers"
    )
    print(f"Success: {is_success}")
    print(f"Progress: {progress}")
    print(f"Response: {response}\n")
    
    # Example 4: All objects on table (0/6)
    scene4 = {
        "nodes": [
            "red_cube1", "red_cube2",
            "blue_mug1", "blue_mug2",
            "yellow_cube3", "yellow_mug3"
        ],
        "edges": [
            "red_cube1(on)table",
            "red_cube2(on)table",
            "blue_mug1(on)table",
            "blue_mug2(on)table",
            "yellow_cube3(on)table",
            "yellow_mug3(on)table"
        ]
    }
    
    print("=" * 70)
    print("TEST 4: All Objects on Table (0/6)")
    print("=" * 70)
    is_success, progress, error, response = processor.judge_drawer_task_by_layers(
        scene4, "Place cubes and mugs into drawers"
    )
    print(f"Success: {is_success}")
    print(f"Progress: {progress}")
    print(f"Response: {response}\n")


if __name__ == "__main__":
    import sys
    
    # Check if test mode is requested
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        test_drawer_layer_scoring()
    else:
        main()

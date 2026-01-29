#!/usr/bin/env python3
"""
Analyze success rates from processing log with 4-way classification
- True Success: SUCCESS status without Fail_reason
- False Positive: SUCCESS status with Fail_reason
- Goal Error: FAILED/ERROR status without Fail_reason
- Planning Error: FAILED/ERROR status with Fail_reason
"""

import re
import os
from collections import defaultdict

# Define category ranges
CATEGORIES = {
    "obj-general": (17, 26),
    "obj-medium": (27, 36),
    "obj-difficult": (57, 66),
    "spatial-general": (37, 46),
    "spatial-medium": (47, 56),
    "spatial-difficult": (67, 76),
    "goal-general": (87, 96),
    "goal-medium": (77, 86),
    "goal-difficult": (97, 106),
}

class ResultType:
    """Result type constants"""
    TRUE_SUCCESS = "True Success"       # SUCCESS + no Fail_reason
    FALSE_POSITIVE = "False Positive"   # SUCCESS + has Fail_reason
    GOAL_ERROR = "Goal Error"           # FAILED/ERROR + no Fail_reason
    PLANNING_ERROR = "Planning Error"   # FAILED/ERROR + has Fail_reason

def parse_progress(progress_str):
    """
    Parse progress string and return (correct, total, percentage)
    Supports formats:
    - "3/3" -> (3, 3, 100.0) [normal format]
    - "2/3" -> (2, 3, 66.7) [normal format]
    - "0.8/3" -> (0.8, 3, 26.7) [normal format]
    - "0/6" -> (0, 6, 0.0) [normal format]
    - "1/2/0.2/6" -> (2, 6, 33.3) [Type 2(3) format: P1/P2/P3/S]
      P1: drawers contain only cubes/mugs (1=yes, 0=no)
      P2: count of cubes/mugs in drawers
      P3: color separation progress (0.2=1 layer, 0.5=2 layers, 1.0=3 layers)
      S: total count of cubes and mugs
      Percentage = P2/S
    Returns: (correct, total, percentage) or (None, None, None) if parsing fails
    """
    if not progress_str:
        return None, None, None

    try:
        # Check for Type 2(3) format: P1/P2/P3/S (4 parts)
        parts = progress_str.strip().split('/')
        if len(parts) == 4:
            P1 = float(parts[0])  # Not used for percentage calculation
            P2 = float(parts[1])  # Count of objects in drawers
            P3 = float(parts[2])  # Color separation progress
            S = int(parts[3])     # Total objects

            if S > 0:
                # Use P2/S as the percentage
                percentage = (P2 / S) * 100
                return P2, S, round(percentage, 1)

        # Match normal X/Y or X.Y/Y format
        match = re.match(r'([\d\.]+)/(\d+)', progress_str.strip())
        if match:
            correct = float(match.group(1))
            total = int(match.group(2))
            if total > 0:
                percentage = (correct / total) * 100
                return correct, total, round(percentage, 1)
    except (ValueError, ZeroDivisionError):
        pass

    return None, None, None

def parse_log_file(log_path):
    """Parse log file and extract detailed results by config number"""
    results = {}

    with open(log_path, 'r', encoding='utf-8') as f:
        for line in f:
            # Skip non-result lines
            if "配置_" not in line or "File:" not in line:
                continue

            # Match pattern: 配置_XX | File: ... | Status: SUCCESS/ERROR/FAILED
            config_match = re.search(r'配置_(\d+)', line)
            status_match = re.search(r'Status:\s*(SUCCESS|ERROR|FAILED)', line)
            file_match = re.search(r'File:\s*([\d_]+_agent_report\.txt)', line)
            # Match progress: can be X/Y or P1/P2/P3/S (4 parts)
            progress_match = re.search(r'Progress:\s*([\d\.]+(?:/[\d\.]+)+)', line)

            if not (config_match and status_match and file_match):
                continue

            config_num = int(config_match.group(1))
            status = status_match.group(1)
            filename = file_match.group(1)

            # Extract progress
            progress_str = progress_match.group(1) if progress_match else None
            correct, total, percentage = parse_progress(progress_str) if progress_str else (None, None, None)

            # Check for Fail_reason (optional)
            fail_reason_match = re.search(r'Fail_reason:\s*(.+?)(?:\s=\{|$)', line)
            has_fail_reason = fail_reason_match is not None
            fail_reason = fail_reason_match.group(1).strip() if fail_reason_match else ""

            # Determine result type
            if status == "SUCCESS":
                if has_fail_reason:
                    result_type = ResultType.FALSE_POSITIVE
                else:
                    result_type = ResultType.TRUE_SUCCESS
            else:  # ERROR or FAILED
                if has_fail_reason:
                    result_type = ResultType.PLANNING_ERROR
                else:
                    result_type = ResultType.GOAL_ERROR

            results[config_num] = {
                "status": status,
                "result_type": result_type,
                "has_fail_reason": has_fail_reason,
                "fail_reason": fail_reason,
                "filename": filename,
                "progress_str": progress_str,
                "progress_correct": correct,
                "progress_total": total,
                "progress_percentage": percentage
            }

    return results

def extract_section_from_report(report_path, section_start, section_end=None):
    """Extract a section from report file between start and end markers"""
    try:
        with open(report_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Find section start
        start_idx = content.find(section_start)
        if start_idx == -1:
            return None

        # Find section end if provided
        if section_end:
            end_idx = content.find(section_end, start_idx)
            if end_idx == -1:
                # If end marker not found, go to end of file or next major section
                next_section = content.find("\n【", start_idx + len(section_start))
                end_idx = next_section if next_section != -1 else len(content)
        else:
            # Go to next major section or end of file
            next_section = content.find("\n【", start_idx + len(section_start))
            end_idx = next_section if next_section != -1 else len(content)

        # Extract section content
        section_content = content[start_idx:end_idx].strip()

        return section_content
    except Exception as e:
        print(f"Error reading report {report_path}: {e}")
        return None

def generate_detailed_report(log_path, results):
    """Generate detailed report with information from source files"""
    from datetime import datetime

    # Determine the parent directory (two levels up from raw_out)
    log_dir = os.path.dirname(log_path)
    parent_dir = os.path.dirname(log_dir)  # Go up one level (raw_out -> test_8B_report)

    detailed_report_path = os.path.join(log_dir, "detailed_records.txt")

    lines = []
    lines.append("=" * 100)
    lines.append(f"DETAILED RECORDS - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append("=" * 100)
    lines.append("")

    # Sort results by config number
    sorted_configs = sorted(results.items(), key=lambda x: x[0])

    for config_num, result_info in sorted_configs:
        filename = result_info.get("filename")
        if not filename:
            continue

        report_path = os.path.join(parent_dir, filename)

        # Check if report file exists
        if not os.path.exists(report_path):
            lines.append(f"{'='*100}")
            lines.append(f"配置_{config_num} | File: {filename}")
            lines.append(f"ERROR: Report file not found at {report_path}")
            lines.append("")
            continue

        # Extract information from report
        lines.append(f"{'='*100}")
        lines.append(f"配置_{config_num} | File: {filename}")
        lines.append(f"Result Type: {result_info['result_type']}")
        lines.append("")

        # 0. Add progress information
        progress_str = result_info.get('progress_str')
        progress_pct = result_info.get('progress_percentage')
        progress_correct = result_info.get('progress_correct')
        progress_total = result_info.get('progress_total')

        if progress_str is not None:
            lines.append("【Progress信息】")
            lines.append(f"原始数据: {progress_str}")

            # Display based on format
            if progress_pct is not None:
                lines.append(f"完成度: {progress_correct}/{progress_total} = {progress_pct}%")
            else:
                lines.append("完成度: 无法计算（无效数据）")
            lines.append("")

        user_input = extract_section_from_report(report_path, "用户原始指令:", "\n")
        if user_input:
            # Clean up - only take the first line
            user_input = user_input.split('\n')[0].strip()
            lines.append(f"【用户原始指令】")
            lines.append(user_input)
            lines.append("")

        # 2. Extract initial scene graph
        initial_scene_start = "【GetSceneGraph信息】\nCurrent scene graph:"
        initial_scene = extract_section_from_report(report_path, initial_scene_start, "\n\n【")
        if initial_scene:
            lines.append("【初始Scene Graph】")
            # Take first 20 lines to avoid too long output
            scene_lines = initial_scene.split('\n')[:100]
            lines.extend(scene_lines)
            if len(initial_scene.split('\n')) > 100:
                lines.append("... (truncated)")
            lines.append("")

        with open(report_path, 'r', encoding='utf-8') as f:
            content = f.read()

            # Try both possible patterns for final scene graph
            final_scene_match = None
            pattern_used = None

            # Pattern 1: "current_scene_graph":
            idx = 0
            while True:
                idx = content.find('"current_scene_graph":', idx)
                if idx == -1:
                    break
                final_scene_match = idx
                pattern_used = '"current_scene_graph":'
                idx += 1

            # Pattern 2: "scene_graph": (only if pattern 1 not found)
            if final_scene_match is None:
                idx = 0
                while True:
                    idx = content.find('"scene_graph":', idx)
                    if idx == -1:
                        break
                    final_scene_match = idx
                    pattern_used = '"scene_graph":'
                    idx += 1

            if final_scene_match is not None:
                # Extract from pattern to the end of this JSON object
                # Find the opening brace
                brace_start = content.find('{', final_scene_match)
                if brace_start != -1:
                    # Find matching closing brace
                    brace_count = 0
                    i = brace_start
                    while i < len(content):
                        if content[i] == '{':
                            brace_count += 1
                        elif content[i] == '}':
                            brace_count -= 1
                            if brace_count == 0:
                                # Found the closing brace
                                final_scene = content[final_scene_match:i+1].strip()
                                break
                        i += 1

                    lines.append("【最终Scene Graph】")
                    scene_lines = final_scene.split('\n')[:100]
                    lines.extend(scene_lines)
                    if len(final_scene.split('\n')) > 100:
                        lines.append("... (truncated)")
                    lines.append("")

        # 4. Extract agent final response
        agent_response = extract_section_from_report(report_path, "【Agent最终响应】")
        if agent_response:
            lines.append("【Agent最终响应】")
            # Take first 15 lines
            response_lines = agent_response.split('\n')[:100]
            lines.extend(response_lines)
            if len(agent_response.split('\n')) > 100:
                lines.append("... (truncated)")
            lines.append("")

        # 5. Extract failure reason if exists
        fail_reason = extract_section_from_report(report_path, "【失败原因】")
        if fail_reason:
            lines.append("【失败原因】")
            lines.append(fail_reason[:200])  # Limit to 200 chars
            if len(fail_reason) > 200:
                lines.append("... (truncated)")
            lines.append("")

        lines.append("")

    # Write to file
    with open(detailed_report_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    print(f"✓ Detailed records saved to: {detailed_report_path}")
    return detailed_report_path

def find_log_entry_for_config(log_path, config_num):
    """Find the log entry for a specific config number"""
    try:
        with open(log_path, 'r', encoding='utf-8') as f:
            for line in f:
                if f"配置_{config_num}" in line:
                    return line.strip()
        return None
    except Exception as e:
        print(f"Error reading log file: {e}")
        return None

def categorize_results(results):
    """Categorize results into hierarchical structure with 4-way classification"""
    categorized = {
        "obj-general": {ResultType.TRUE_SUCCESS: 0, ResultType.FALSE_POSITIVE: 0,
                       ResultType.GOAL_ERROR: 0, ResultType.PLANNING_ERROR: 0, "total": 0},
        "obj-medium": {ResultType.TRUE_SUCCESS: 0, ResultType.FALSE_POSITIVE: 0,
                      ResultType.GOAL_ERROR: 0, ResultType.PLANNING_ERROR: 0, "total": 0},
        "obj-difficult": {ResultType.TRUE_SUCCESS: 0, ResultType.FALSE_POSITIVE: 0,
                         ResultType.GOAL_ERROR: 0, ResultType.PLANNING_ERROR: 0, "total": 0},
        "spatial-general": {ResultType.TRUE_SUCCESS: 0, ResultType.FALSE_POSITIVE: 0,
                           ResultType.GOAL_ERROR: 0, ResultType.PLANNING_ERROR: 0, "total": 0},
        "spatial-medium": {ResultType.TRUE_SUCCESS: 0, ResultType.FALSE_POSITIVE: 0,
                          ResultType.GOAL_ERROR: 0, ResultType.PLANNING_ERROR: 0, "total": 0},
        "spatial-difficult": {ResultType.TRUE_SUCCESS: 0, ResultType.FALSE_POSITIVE: 0,
                             ResultType.GOAL_ERROR: 0, ResultType.PLANNING_ERROR: 0, "total": 0},
        "goal-general": {ResultType.TRUE_SUCCESS: 0, ResultType.FALSE_POSITIVE: 0,
                        ResultType.GOAL_ERROR: 0, ResultType.PLANNING_ERROR: 0, "total": 0},
        "goal-medium": {ResultType.TRUE_SUCCESS: 0, ResultType.FALSE_POSITIVE: 0,
                       ResultType.GOAL_ERROR: 0, ResultType.PLANNING_ERROR: 0, "total": 0},
        "goal-difficult": {ResultType.TRUE_SUCCESS: 0, ResultType.FALSE_POSITIVE: 0,
                          ResultType.GOAL_ERROR: 0, ResultType.PLANNING_ERROR: 0, "total": 0},
    }

    # Categorize each result
    for config_num, result_info in results.items():
        result_type = result_info["result_type"]
        for category, (start, end) in CATEGORIES.items():
            if start <= config_num <= end:
                categorized[category][result_type] += 1
                categorized[category]["total"] += 1
                break

    return categorized

def calculate_statistics(categorized):
    """Calculate statistics for all levels with 4-way classification"""
    stats = {}

    # Helper function to calculate stats for a category
    def calc_stats(cat_data):
        total = cat_data["total"]
        return {
            ResultType.TRUE_SUCCESS: cat_data[ResultType.TRUE_SUCCESS],
            ResultType.FALSE_POSITIVE: cat_data[ResultType.FALSE_POSITIVE],
            ResultType.GOAL_ERROR: cat_data[ResultType.GOAL_ERROR],
            ResultType.PLANNING_ERROR: cat_data[ResultType.PLANNING_ERROR],
            "total": total,
            "true_success_rate": (cat_data[ResultType.TRUE_SUCCESS] / total * 100) if total > 0 else 0,
            "false_positive_rate": (cat_data[ResultType.FALSE_POSITIVE] / total * 100) if total > 0 else 0,
            "goal_error_rate": (cat_data[ResultType.GOAL_ERROR] / total * 100) if total > 0 else 0,
            "planning_error_rate": (cat_data[ResultType.PLANNING_ERROR] / total * 100) if total > 0 else 0,
        }

    # Calculate for each sub-category
    for category, data in categorized.items():
        stats[category] = calc_stats(data)

    # Calculate for main levels (obj, spatial, goal)
    for level in ["obj", "spatial", "goal"]:
        level_key = f"{level} (all)"
        combined_data = {
            ResultType.TRUE_SUCCESS: sum(categorized[f"{level}-{diff}"][ResultType.TRUE_SUCCESS] for diff in ["general", "medium", "difficult"]),
            ResultType.FALSE_POSITIVE: sum(categorized[f"{level}-{diff}"][ResultType.FALSE_POSITIVE] for diff in ["general", "medium", "difficult"]),
            ResultType.GOAL_ERROR: sum(categorized[f"{level}-{diff}"][ResultType.GOAL_ERROR] for diff in ["general", "medium", "difficult"]),
            ResultType.PLANNING_ERROR: sum(categorized[f"{level}-{diff}"][ResultType.PLANNING_ERROR] for diff in ["general", "medium", "difficult"]),
            "total": sum(categorized[f"{level}-{diff}"]["total"] for diff in ["general", "medium", "difficult"]),
        }
        stats[level_key] = calc_stats(combined_data)

    # Calculate for difficulty levels
    for diff in ["general", "medium", "difficult"]:
        diff_key = f"{diff} (all levels)"
        combined_data = {
            ResultType.TRUE_SUCCESS: sum(categorized[f"{level}-{diff}"][ResultType.TRUE_SUCCESS] for level in ["obj", "spatial", "goal"]),
            ResultType.FALSE_POSITIVE: sum(categorized[f"{level}-{diff}"][ResultType.FALSE_POSITIVE] for level in ["obj", "spatial", "goal"]),
            ResultType.GOAL_ERROR: sum(categorized[f"{level}-{diff}"][ResultType.GOAL_ERROR] for level in ["obj", "spatial", "goal"]),
            ResultType.PLANNING_ERROR: sum(categorized[f"{level}-{diff}"][ResultType.PLANNING_ERROR] for level in ["obj", "spatial", "goal"]),
            "total": sum(categorized[f"{level}-{diff}"]["total"] for level in ["obj", "spatial", "goal"]),
        }
        stats[diff_key] = calc_stats(combined_data)

    # Calculate overall
    overall_data = {
        ResultType.TRUE_SUCCESS: sum(data[ResultType.TRUE_SUCCESS] for data in categorized.values()),
        ResultType.FALSE_POSITIVE: sum(data[ResultType.FALSE_POSITIVE] for data in categorized.values()),
        ResultType.GOAL_ERROR: sum(data[ResultType.GOAL_ERROR] for data in categorized.values()),
        ResultType.PLANNING_ERROR: sum(data[ResultType.PLANNING_ERROR] for data in categorized.values()),
        "total": sum(data["total"] for data in categorized.values()),
    }
    stats["OVERALL"] = calc_stats(overall_data)

    return stats

def calculate_progress_statistics(results):
    """Calculate progress statistics (average percentage) for all categories"""
    progress_stats = {}

    # Helper function to calculate progress stats
    def calc_progress_stats(config_nums):
        """Calculate average progress for given config numbers"""
        percentages = []
        for config_num in config_nums:
            if config_num in results:
                pct = results[config_num].get("progress_percentage")
                if pct is not None:
                    percentages.append(pct)

        if not percentages:
            return {
                "count": 0,
                "avg_progress": 0.0,
                "min_progress": 0.0,
                "max_progress": 0.0
            }

        return {
            "count": len(percentages),
            "avg_progress": round(sum(percentages) / len(percentages), 1),
            "min_progress": round(min(percentages), 1),
            "max_progress": round(max(percentages), 1)
        }

    # Calculate for each sub-category
    for category, (start, end) in CATEGORIES.items():
        config_nums = list(range(start, end + 1))
        progress_stats[category] = calc_progress_stats(config_nums)

    # Calculate for main levels (obj, spatial, goal)
    for level in ["obj", "spatial", "goal"]:
        level_key = f"{level} (all)"
        # Collect all config nums for this level
        config_nums = []
        for diff in ["general", "medium", "difficult"]:
            start, end = CATEGORIES[f"{level}-{diff}"]
            config_nums.extend(range(start, end + 1))
        progress_stats[level_key] = calc_progress_stats(config_nums)

    # Calculate for difficulty levels
    for diff in ["general", "medium", "difficult"]:
        diff_key = f"{diff} (all levels)"
        # Collect all config nums for this difficulty
        config_nums = []
        for level in ["obj", "spatial", "goal"]:
            start, end = CATEGORIES[f"{level}-{diff}"]
            config_nums.extend(range(start, end + 1))
        progress_stats[diff_key] = calc_progress_stats(config_nums)

    # Calculate overall
    all_config_nums = list(results.keys())
    progress_stats["OVERALL"] = calc_progress_stats(all_config_nums)

    return progress_stats

def print_report(stats):
    """Print formatted report with 4-way classification"""
    print("=" * 100)
    print("4-WAY CLASSIFICATION ANALYSIS REPORT")
    print("=" * 100)
    print()
    print("Legend:")
    print("  ✓ True Success     : SUCCESS status without Fail_reason (genuine success)")
    print("  ✗ False Positive   : SUCCESS status with Fail_reason (incorrectly marked as success)")
    print("  ⚠ Goal Error       : FAILED/ERROR status without Fail_reason (goal judgment error)")
    print("  ✹ Planning Error   : FAILED/ERROR status with Fail_reason (execution planning error)")
    print()

    # Print overall summary first
    print("=" * 100)
    print("OVERALL SUMMARY")
    print("=" * 100)
    overall = stats["OVERALL"]
    print(f"{'True Success':20} | {overall[ResultType.TRUE_SUCCESS]:3}/{overall['total']:3} | {overall['true_success_rate']:5.1f}%")
    print(f"{'False Positive':20} | {overall[ResultType.FALSE_POSITIVE]:3}/{overall['total']:3} | {overall['false_positive_rate']:5.1f}%")
    print(f"{'Goal Error':20} | {overall[ResultType.GOAL_ERROR]:3}/{overall['total']:3} | {overall['goal_error_rate']:5.1f}%")
    print(f"{'Planning Error':20} | {overall[ResultType.PLANNING_ERROR]:3}/{overall['total']:3} | {overall['planning_error_rate']:5.1f}%")
    print("-" * 100)
    print(f"{'TOTAL':20} | {overall['total']:3}/{overall['total']:3} | 100.0%")
    print("=" * 100)
    print()

    # Print by main levels
    print("## BY MAIN LEVELS (OBJ, SPATIAL, GOAL)")
    print("-" * 100)
    print(f"{'LEVEL':20} | {'TRUE SUCCESS':>14} | {'FALSE POSITIVE':>16} | {'GOAL ERROR':>12} | {'PLANNING ERROR':>16}")
    print("-" * 100)

    for level in ["obj (all)", "spatial (all)", "goal (all)"]:
        data = stats[level]
        print(f"{level.upper():20} | {data[ResultType.TRUE_SUCCESS]:3}/{data['total']:3} ({data['true_success_rate']:4.1f}%) | "
              f"{data[ResultType.FALSE_POSITIVE]:3}/{data['total']:3} ({data['false_positive_rate']:4.1f}%) | "
              f"{data[ResultType.GOAL_ERROR]:3}/{data['total']:3} ({data['goal_error_rate']:4.1f}%) | "
              f"{data[ResultType.PLANNING_ERROR]:3}/{data['total']:3} ({data['planning_error_rate']:4.1f}%)")
    print()

    # Print by difficulty
    print("## BY DIFFICULTY (across all levels)")
    print("-" * 100)
    print(f"{'DIFFICULTY':20} | {'TRUE SUCCESS':>14} | {'FALSE POSITIVE':>16} | {'GOAL ERROR':>12} | {'PLANNING ERROR':>16}")
    print("-" * 100)

    for difficulty in ["general (all levels)", "medium (all levels)", "difficult (all levels)"]:
        data = stats[difficulty]
        print(f"{difficulty.upper():20} | {data[ResultType.TRUE_SUCCESS]:3}/{data['total']:3} ({data['true_success_rate']:4.1f}%) | "
              f"{data[ResultType.FALSE_POSITIVE]:3}/{data['total']:3} ({data['false_positive_rate']:4.1f}%) | "
              f"{data[ResultType.GOAL_ERROR]:3}/{data['total']:3} ({data['goal_error_rate']:4.1f}%) | "
              f"{data[ResultType.PLANNING_ERROR]:3}/{data['total']:3} ({data['planning_error_rate']:4.1f}%)")
    print()

    # Print detailed breakdown
    print("## DETAILED BREAKDOWN BY CATEGORY")
    print("-" * 100)
    print(f"{'CATEGORY':20} | {'TRUE SUCCESS':>14} | {'FALSE POSITIVE':>16} | {'GOAL ERROR':>12} | {'PLANNING ERROR':>16}")
    print("-" * 100)

    # Print in hierarchical order
    for level in ["obj", "spatial", "goal"]:
        print(f"\n{level.upper()}:")
        for diff in ["general", "medium", "difficult"]:
            category = f"{level}-{diff}"
            if category in stats:
                data = stats[category]
                print(f"  {category:18} | {data[ResultType.TRUE_SUCCESS]:3}/{data['total']:3} ({data['true_success_rate']:4.1f}%) | "
                      f"{data[ResultType.FALSE_POSITIVE]:3}/{data['total']:3} ({data['false_positive_rate']:4.1f}%) | "
                      f"{data[ResultType.GOAL_ERROR]:3}/{data['total']:3} ({data['goal_error_rate']:4.1f}%) | "
                      f"{data[ResultType.PLANNING_ERROR]:3}/{data['total']:3} ({data['planning_error_rate']:4.1f}%)")
        # Print total for this level
        total_key = f"{level} (all)"
        total_data = stats[total_key]
        print(f"  {'─':18} | {'─':>14} | {'─':>16} | {'─':>12} | {'─':>16}")
        print(f"  {total_key:18} | {total_data[ResultType.TRUE_SUCCESS]:3}/{total_data['total']:3} ({total_data['true_success_rate']:4.1f}%) | "
              f"{total_data[ResultType.FALSE_POSITIVE]:3}/{total_data['total']:3} ({total_data['false_positive_rate']:4.1f}%) | "
              f"{total_data[ResultType.GOAL_ERROR]:3}/{total_data['total']:3} ({total_data['goal_error_rate']:4.1f}%) | "
              f"{total_data[ResultType.PLANNING_ERROR]:3}/{total_data['total']:3} ({total_data['planning_error_rate']:4.1f}%)")
        print()

    print("=" * 100)

def save_report_to_file(stats, output_path):
    """Save the analysis report to a file"""
    from datetime import datetime

    lines = []
    lines.append(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] 4-WAY Classification Analysis")
    lines.append("=" * 100)
    lines.append("4-WAY CLASSIFICATION ANALYSIS REPORT")
    lines.append("=" * 100)
    lines.append("")
    lines.append("Legend:")
    lines.append("  ✓ True Success     : SUCCESS status without Fail_reason (genuine success)")
    lines.append("  ✗ False Positive   : SUCCESS status with Fail_reason (incorrectly marked as success)")
    lines.append("  ⚠ Goal Error       : FAILED/ERROR status without Fail_reason (goal judgment error)")
    lines.append("  ✹ Planning Error   : FAILED/ERROR status with Fail_reason (execution planning error)")
    lines.append("")

    # Overall summary
    lines.append("=" * 100)
    lines.append("OVERALL SUMMARY")
    lines.append("=" * 100)
    overall = stats["OVERALL"]
    lines.append(f"{'True Success':20} | {overall[ResultType.TRUE_SUCCESS]:3}/{overall['total']:3} | {overall['true_success_rate']:5.1f}%")
    lines.append(f"{'False Positive':20} | {overall[ResultType.FALSE_POSITIVE]:3}/{overall['total']:3} | {overall['false_positive_rate']:5.1f}%")
    lines.append(f"{'Goal Error':20} | {overall[ResultType.GOAL_ERROR]:3}/{overall['total']:3} | {overall['goal_error_rate']:5.1f}%")
    lines.append(f"{'Planning Error':20} | {overall[ResultType.PLANNING_ERROR]:3}/{overall['total']:3} | {overall['planning_error_rate']:5.1f}%")
    lines.append("-" * 100)
    lines.append(f"{'TOTAL':20} | {overall['total']:3}/{overall['total']:3} | 100.0%")
    lines.append("=" * 100)
    lines.append("")

    # By main levels
    lines.append("## BY MAIN LEVELS (OBJ, SPATIAL, GOAL)")
    lines.append("-" * 100)
    lines.append(f"{'LEVEL':20} | {'TRUE SUCCESS':>14} | {'FALSE POSITIVE':>16} | {'GOAL ERROR':>12} | {'PLANNING ERROR':>16}")
    lines.append("-" * 100)

    for level in ["obj (all)", "spatial (all)", "goal (all)"]:
        data = stats[level]
        lines.append(f"{level.upper():20} | {data[ResultType.TRUE_SUCCESS]:3}/{data['total']:3} ({data['true_success_rate']:4.1f}%) | "
                   f"{data[ResultType.FALSE_POSITIVE]:3}/{data['total']:3} ({data['false_positive_rate']:4.1f}%) | "
                   f"{data[ResultType.GOAL_ERROR]:3}/{data['total']:3} ({data['goal_error_rate']:4.1f}%) | "
                   f"{data[ResultType.PLANNING_ERROR]:3}/{data['total']:3} ({data['planning_error_rate']:4.1f}%)")
    lines.append("")

    # By difficulty
    lines.append("## BY DIFFICULTY (across all levels)")
    lines.append("-" * 100)
    lines.append(f"{'DIFFICULTY':20} | {'TRUE SUCCESS':>14} | {'FALSE POSITIVE':>16} | {'GOAL ERROR':>12} | {'PLANNING ERROR':>16}")
    lines.append("-" * 100)

    for difficulty in ["general (all levels)", "medium (all levels)", "difficult (all levels)"]:
        data = stats[difficulty]
        lines.append(f"{difficulty.upper():20} | {data[ResultType.TRUE_SUCCESS]:3}/{data['total']:3} ({data['true_success_rate']:4.1f}%) | "
                   f"{data[ResultType.FALSE_POSITIVE]:3}/{data['total']:3} ({data['false_positive_rate']:4.1f}%) | "
                   f"{data[ResultType.GOAL_ERROR]:3}/{data['total']:3} ({data['goal_error_rate']:4.1f}%) | "
                   f"{data[ResultType.PLANNING_ERROR]:3}/{data['total']:3} ({data['planning_error_rate']:4.1f}%)")
    lines.append("")

    # Detailed breakdown
    lines.append("## DETAILED BREAKDOWN BY CATEGORY")
    lines.append("-" * 100)
    lines.append(f"{'CATEGORY':20} | {'TRUE SUCCESS':>14} | {'FALSE POSITIVE':>16} | {'GOAL ERROR':>12} | {'PLANNING ERROR':>16}")
    lines.append("-" * 100)

    # Print in hierarchical order
    for level in ["obj", "spatial", "goal"]:
        lines.append(f"\n{level.upper()}:")
        for diff in ["general", "medium", "difficult"]:
            category = f"{level}-{diff}"
            if category in stats:
                data = stats[category]
                lines.append(f"  {category:18} | {data[ResultType.TRUE_SUCCESS]:3}/{data['total']:3} ({data['true_success_rate']:4.1f}%) | "
                           f"{data[ResultType.FALSE_POSITIVE]:3}/{data['total']:3} ({data['false_positive_rate']:4.1f}%) | "
                           f"{data[ResultType.GOAL_ERROR]:3}/{data['total']:3} ({data['goal_error_rate']:4.1f}%) | "
                           f"{data[ResultType.PLANNING_ERROR]:3}/{data['total']:3} ({data['planning_error_rate']:4.1f}%)")
        # Print total for this level
        total_key = f"{level} (all)"
        total_data = stats[total_key]
        lines.append(f"  {'─':18} | {'─':>14} | {'─':>16} | {'─':>12} | {'─':>16}")
        lines.append(f"  {total_key:18} | {total_data[ResultType.TRUE_SUCCESS]:3}/{total_data['total']:3} ({total_data['true_success_rate']:4.1f}%) | "
                   f"{total_data[ResultType.FALSE_POSITIVE]:3}/{total_data['total']:3} ({total_data['false_positive_rate']:4.1f}%) | "
                   f"{total_data[ResultType.GOAL_ERROR]:3}/{total_data['total']:3} ({total_data['goal_error_rate']:4.1f}%) | "
                   f"{total_data[ResultType.PLANNING_ERROR]:3}/{total_data['total']:3} ({total_data['planning_error_rate']:4.1f}%)")
        lines.append("")

    lines.append("=" * 100)
    lines.append(f"\nGenerated at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    # Write to file
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    print(f"✓ Report saved to: {output_path}")

def print_progress_report(progress_stats):
    """Print formatted progress report"""
    print("\n" + "=" * 100)
    print("PROGRESS ANALYSIS REPORT")
    print("=" * 100)
    print()
    print("Legend:")
    print("  Avg Progress : Average completion percentage (correct/total * 100)")
    print("  Min Progress : Minimum progress percentage in category")
    print("  Max Progress : Maximum progress percentage in category")
    print("  Count       : Number of configurations with valid progress data")
    print()

    # Print overall summary first
    print("=" * 100)
    print("OVERALL SUMMARY")
    print("=" * 100)
    overall = progress_stats["OVERALL"]
    print(f"{'Average Progress':20} | {overall['avg_progress']:5.1f}%")
    print(f"{'Min Progress':20} | {overall['min_progress']:5.1f}%")
    print(f"{'Max Progress':20} | {overall['max_progress']:5.1f}%")
    print(f"{'Count':20} | {overall['count']:3}")
    print("=" * 100)
    print()

    # Print by main levels
    print("## BY MAIN LEVELS (OBJ, SPATIAL, GOAL)")
    print("-" * 100)
    print(f"{'LEVEL':20} | {'AVG PROGRESS':>14} | {'MIN PROGRESS':>14} | {'MAX PROGRESS':>14} | {'COUNT':>6}")
    print("-" * 100)

    for level in ["obj (all)", "spatial (all)", "goal (all)"]:
        data = progress_stats[level]
        print(f"{level.upper():20} | {data['avg_progress']:5.1f}% | {data['min_progress']:5.1f}% | {data['max_progress']:5.1f}% | {data['count']:3}")
    print()

    # Print by difficulty
    print("## BY DIFFICULTY (across all levels)")
    print("-" * 100)
    print(f"{'DIFFICULTY':20} | {'AVG PROGRESS':>14} | {'MIN PROGRESS':>14} | {'MAX PROGRESS':>14} | {'COUNT':>6}")
    print("-" * 100)

    for difficulty in ["general (all levels)", "medium (all levels)", "difficult (all levels)"]:
        data = progress_stats[difficulty]
        print(f"{difficulty.upper():20} | {data['avg_progress']:5.1f}% | {data['min_progress']:5.1f}% | {data['max_progress']:5.1f}% | {data['count']:3}")
    print()

    # Detailed breakdown
    print("## DETAILED BREAKDOWN BY CATEGORY")
    print("-" * 100)
    print(f"{'CATEGORY':20} | {'AVG PROGRESS':>14} | {'MIN PROGRESS':>14} | {'MAX PROGRESS':>14} | {'COUNT':>6}")
    print("-" * 100)

    # Print in hierarchical order
    for level in ["obj", "spatial", "goal"]:
        print(f"\n{level.upper()}:")
        for diff in ["general", "medium", "difficult"]:
            category = f"{level}-{diff}"
            if category in progress_stats:
                data = progress_stats[category]
                print(f"  {category:18} | {data['avg_progress']:5.1f}% | {data['min_progress']:5.1f}% | {data['max_progress']:5.1f}% | {data['count']:3}")
        # Print total for this level
        total_key = f"{level} (all)"
        total_data = progress_stats[total_key]
        print(f"  {'─':18} | {'─':>14} | {'─':>14} | {'─':>14} | {'─':>6}")
        print(f"  {total_key:18} | {total_data['avg_progress']:5.1f}% | {total_data['min_progress']:5.1f}% | {total_data['max_progress']:5.1f}% | {total_data['count']:3}")
        print()

    print("=" * 100)

def save_progress_report_to_file(progress_stats, output_path):
    """Save the progress analysis report to a file"""
    from datetime import datetime

    lines = []
    lines.append(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Progress Analysis")
    lines.append("=" * 100)
    lines.append("PROGRESS ANALYSIS REPORT")
    lines.append("=" * 100)
    lines.append("")
    lines.append("Legend:")
    lines.append("  Avg Progress : Average completion percentage (correct/total * 100)")
    lines.append("  Min Progress : Minimum progress percentage in category")
    lines.append("  Max Progress : Maximum progress percentage in category")
    lines.append("  Count       : Number of configurations with valid progress data")
    lines.append("")

    # Overall summary
    lines.append("=" * 100)
    lines.append("OVERALL SUMMARY")
    lines.append("=" * 100)
    overall = progress_stats["OVERALL"]
    lines.append(f"{'Average Progress':20} | {overall['avg_progress']:5.1f}%")
    lines.append(f"{'Min Progress':20} | {overall['min_progress']:5.1f}%")
    lines.append(f"{'Max Progress':20} | {overall['max_progress']:5.1f}%")
    lines.append(f"{'Count':20} | {overall['count']:3}")
    lines.append("=" * 100)
    lines.append("")

    # By main levels
    lines.append("## BY MAIN LEVELS (OBJ, SPATIAL, GOAL)")
    lines.append("-" * 100)
    lines.append(f"{'LEVEL':20} | {'AVG PROGRESS':>14} | {'MIN PROGRESS':>14} | {'MAX PROGRESS':>14} | {'COUNT':>6}")
    lines.append("-" * 100)

    for level in ["obj (all)", "spatial (all)", "goal (all)"]:
        data = progress_stats[level]
        lines.append(f"{level.upper():20} | {data['avg_progress']:5.1f}% | {data['min_progress']:5.1f}% | {data['max_progress']:5.1f}% | {data['count']:3}")
    lines.append("")

    # By difficulty
    lines.append("## BY DIFFICULTY (across all levels)")
    lines.append("-" * 100)
    lines.append(f"{'DIFFICULTY':20} | {'AVG PROGRESS':>14} | {'MIN PROGRESS':>14} | {'MAX PROGRESS':>14} | {'COUNT':>6}")
    lines.append("-" * 100)

    for difficulty in ["general (all levels)", "medium (all levels)", "difficult (all levels)"]:
        data = progress_stats[difficulty]
        lines.append(f"{difficulty.upper():20} | {data['avg_progress']:5.1f}% | {data['min_progress']:5.1f}% | {data['max_progress']:5.1f}% | {data['count']:3}")
    lines.append("")

    # Detailed breakdown
    lines.append("## DETAILED BREAKDOWN BY CATEGORY")
    lines.append("-" * 100)
    lines.append(f"{'CATEGORY':20} | {'AVG PROGRESS':>14} | {'MIN PROGRESS':>14} | {'MAX PROGRESS':>14} | {'COUNT':>6}")
    lines.append("-" * 100)

    # Print in hierarchical order
    for level in ["obj", "spatial", "goal"]:
        lines.append(f"\n{level.upper()}:")
        for diff in ["general", "medium", "difficult"]:
            category = f"{level}-{diff}"
            if category in progress_stats:
                data = progress_stats[category]
                lines.append(f"  {category:18} | {data['avg_progress']:5.1f}% | {data['min_progress']:5.1f}% | {data['max_progress']:5.1f}% | {data['count']:3}")
        # Print total for this level
        total_key = f"{level} (all)"
        total_data = progress_stats[total_key]
        lines.append(f"  {'─':18} | {'─':>14} | {'─':>14} | {'─':>14} | {'─':>6}")
        lines.append(f"  {total_key:18} | {total_data['avg_progress']:5.1f}% | {total_data['min_progress']:5.1f}% | {total_data['max_progress']:5.1f}% | {total_data['count']:3}")
        lines.append("")

    lines.append("=" * 100)
    lines.append(f"\nGenerated at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    # Write to file
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    print(f"✓ Progress report saved to: {output_path}")

def main():
    log_path = "/path/to/processing_log.txt"
    log_dir = os.path.dirname(log_path)
    output_path=os.path.join(log_dir, "success_rate.txt")
    progress_output_path=os.path.join(log_dir, "progress_report.txt")


    print(f"Reading log file: {log_path}")
    results = parse_log_file(log_path)
    print(f"Found {len(results)} configuration results")
    print()

    # 4-way classification analysis
    categorized = categorize_results(results)
    stats = calculate_statistics(categorized)

    # Print success rate report to console
    print_report(stats)

    # Save success rate report to file
    save_report_to_file(stats, output_path)

    # Progress analysis
    print()
    progress_stats = calculate_progress_statistics(results)

    # Print progress report to console
    print_progress_report(progress_stats)

    # Save progress report to file
    save_progress_report_to_file(progress_stats, progress_output_path)

    # Generate detailed records from source files
    print()
    print("Generating detailed records from source files...")
    generate_detailed_report(log_path, results)

if __name__ == "__main__":
    main()

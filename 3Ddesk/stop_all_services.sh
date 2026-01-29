#!/bin/bash

# =============================================================================
# 3D Desktop Organizer - 停止所有服务脚本
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/modular_project"

echo "🛑 Stopping all 3D Desktop Organizer services..."
echo ""

# 从 PID 文件读取并停止服务
if [ -f "$SCRIPT_DIR/.web_server.pid" ]; then
    WEB_PID=$(cat "$SCRIPT_DIR/.web_server.pid")
    echo "Stopping Web Server (PID: $WEB_PID)..."
    kill $WEB_PID 2>/dev/null
    rm -f "$SCRIPT_DIR/.web_server.pid"
fi

if [ -f "$SCRIPT_DIR/.config_server.pid" ]; then
    CONFIG_PID=$(cat "$SCRIPT_DIR/.config_server.pid")
    echo "Stopping Configuration Server (PID: $CONFIG_PID)..."
    kill $CONFIG_PID 2>/dev/null
    rm -f "$SCRIPT_DIR/.config_server.pid"
fi

if [ -f "$SCRIPT_DIR/.scene_graph_republisher.pid" ]; then
    REPUBLISHER_PID=$(cat "$SCRIPT_DIR/.scene_graph_republisher.pid")
    echo "Stopping Scene Graph Republisher (PID: $REPUBLISHER_PID)..."
    kill $REPUBLISHER_PID 2>/dev/null
    rm -f "$SCRIPT_DIR/.scene_graph_republisher.pid"
fi

if [ -f "$SCRIPT_DIR/.ros_bridge.pid" ]; then
    ROS_PID=$(cat "$SCRIPT_DIR/.ros_bridge.pid")
    echo "Stopping ROS Bridge (PID: $ROS_PID)..."
    kill $ROS_PID 2>/dev/null
    rm -f "$SCRIPT_DIR/.ros_bridge.pid"
fi

# 强制清理任何残留进程
echo "Cleaning up any remaining processes..."
pkill -f "config_server.py" 2>/dev/null
pkill -f "scene_graph_republisher_node" 2>/dev/null
pkill -f "rosbridge_websocket" 2>/dev/null
pkill -f "python3 -m http.server 8000" 2>/dev/null

# 释放端口
for port in 8000 8080 9090; do
    if lsof -i :$port > /dev/null 2>&1; then
        echo "Freeing port $port..."
        lsof -ti:$port | xargs kill -9 2>/dev/null || true
    fi
done

echo ""
echo "✅ All services stopped"
echo ""
echo "📝 Log files available in: $SCRIPT_DIR/logs/"
echo "   tail -f $SCRIPT_DIR/logs/web_server.log"
echo "   tail -f $SCRIPT_DIR/logs/config_server.log"
echo "   tail -f $SCRIPT_DIR/logs/ros_bridge.log"
echo "   tail -f $SCRIPT_DIR/logs/scene_graph_republisher.log"
echo ""
echo "🧹 To clean up log files:"
echo "   rm -f $SCRIPT_DIR/logs/*.log"
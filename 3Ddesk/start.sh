#!/bin/bash

# =============================================================================
# 3D Desktop Organizer - 模块化项目一键启动脚本
# =============================================================================
#
# 此脚本启动以下服务:
# 1. ROS Bridge WebSocket Server (ws://localhost:9090) - ROS2通信
# 2. Configuration Server (http://localhost:8080) - 配置保存/加载
# 3. Web Server (http://localhost:8000) - 前端页面服务
#
# 注意: Scene Graph Republisher 和 visualworld_ros 已禁用
#
# 使用方法: ./start.sh
# 停止服务: 按 Ctrl+C
# =============================================================================

set -e

# 脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/modular_project"
SERVER_SETTING_DIR="$SCRIPT_DIR/server_setting"

# 日志目录
LOG_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOG_DIR"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 打印带颜色的消息
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[✓]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[✗]${NC} $1"; }

# 清理函数
cleanup() {
    echo ""
    log_warning "正在停止所有服务..."
    
    # 停止Web服务器
    if [ -n "$WEB_PID" ] && kill -0 $WEB_PID 2>/dev/null; then
        kill $WEB_PID 2>/dev/null
        log_info "Web服务器已停止 (PID: $WEB_PID)"
    fi
    
    # 停止配置服务器
    if [ -n "$CONFIG_PID" ] && kill -0 $CONFIG_PID 2>/dev/null; then
        kill $CONFIG_PID 2>/dev/null
        log_info "配置服务器已停止 (PID: $CONFIG_PID)"
    fi
    
    # 停止Scene Graph Republisher (已禁用)
    # if [ -f "$SCRIPT_DIR/.scene_graph_republisher.pid" ]; then
    #     REPUBLISHER_PID=$(cat "$SCRIPT_DIR/.scene_graph_republisher.pid")
    #     if kill -0 $REPUBLISHER_PID 2>/dev/null; then
    #         kill $REPUBLISHER_PID 2>/dev/null
    #         log_info "Scene Graph Republisher已停止 (PID: $REPUBLISHER_PID)"
    #     fi
    #     rm -f "$SCRIPT_DIR/.scene_graph_republisher.pid"
    # fi

    # 停止ROS Bridge
    if [ -n "$ROS_PID" ] && kill -0 $ROS_PID 2>/dev/null; then
        kill $ROS_PID 2>/dev/null
        log_info "ROS Bridge已停止 (PID: $ROS_PID)"
    fi

    # 清理PID文件
    rm -f "$SCRIPT_DIR/.web_server.pid"
    rm -f "$SCRIPT_DIR/.config_server.pid"
    rm -f "$SCRIPT_DIR/.ros_bridge.pid"
    rm -f "$SCRIPT_DIR/.scene_graph_republisher.pid"  # Scene Graph Republisher PID文件 (已禁用)
    
    log_success "所有服务已停止"
    exit 0
}

# 设置信号处理
trap cleanup SIGINT SIGTERM EXIT

# 检查端口是否被占用
check_port() {
    local port=$1
    if lsof -i :$port > /dev/null 2>&1; then
        return 0  # 端口被占用
    else
        return 1  # 端口空闲
    fi
}

# 释放端口
free_port() {
    local port=$1
    if check_port $port; then
        log_warning "端口 $port 被占用，正在释放..."
        lsof -ti:$port | xargs kill -9 2>/dev/null || true
        sleep 2
    fi
}

# =============================================================================
# 主程序
# =============================================================================

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     3D Desktop Organizer - 模块化项目启动器                       ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# 检查并退出conda环境
if [ -n "$CONDA_DEFAULT_ENV" ]; then
    log_warning "检测到当前在conda环境中: $CONDA_DEFAULT_ENV"
    log_info "正在退出conda环境..."

    # 尝试使用conda deactivate（如果可用）
    if type conda >/dev/null 2>&1; then
        conda deactivate 2>/dev/null || true
        # 如果还有嵌套的conda环境，继续退出
        if [ -n "$CONDA_DEFAULT_ENV" ]; then
            conda deactivate 2>/dev/null || true
        fi
    fi

    # 如果conda deactivate失败，直接移除conda环境变量
    if [ -n "$CONDA_DEFAULT_ENV" ]; then
        log_info "使用直接方式退出conda环境..."
        # 移除conda相关的环境变量
        unset CONDA_DEFAULT_ENV
        unset CONDA_PREFIX
        unset CONDA_PROMPT_MODIFIER
        unset CONDA_EXE
        unset CONDA_SHLVL

        # 从PATH中移除conda路径
        if [ -n "$CONDA_PREFIX" ]; then
            export PATH=$(echo "$PATH" | sed -e "s|$CONDA_PREFIX/bin:||g")
        fi
    fi

    if [ -z "$CONDA_DEFAULT_ENV" ]; then
        log_success "已成功退出conda环境"
    else
        log_warning "conda环境可能未完全退出，请手动检查"
    fi
    echo ""
fi

# 检查并释放端口
log_info "检查端口可用性..."
free_port 8000
free_port 8080
free_port 9090

# 检查端口是否全部可用
all_ports_available=true
for port in 8000 8080 9090; do
    if check_port $port; then
        log_error "端口 $port 仍被占用，请手动检查: lsof -i :$port"
        all_ports_available=false
    else
        log_success "端口 $port 可用"
    fi
done

if [ "$all_ports_available" = false ]; then
    log_error "部分端口不可用，启动失败"
    exit 1
fi

echo ""

# =============================================================================
# 1. 启动ROS Bridge (可选，如果没有ROS2也能运行)
# =============================================================================
log_info "1️⃣  启动 ROS Bridge WebSocket Server..."

ROS_AVAILABLE=false

# 检查ROS2是否已source
if [ -z "$ROS_DISTRO" ]; then
    # 尝试source ROS2
    for ros_setup in /opt/ros/humble/setup.bash /opt/ros/foxy/setup.bash /opt/ros/galactic/setup.bash; do
        if [ -f "$ros_setup" ]; then
            source "$ros_setup"
            break
        fi
    done
fi

if [ -n "$ROS_DISTRO" ]; then
    # Source custom message packages (已禁用)
    # WORKSPACE_PATH="$SCRIPT_DIR/visualworld_ros"
    # if [ -f "$WORKSPACE_PATH/install/setup.bash" ]; then
    #     log_info "Sourcing custom message workspace: $WORKSPACE_PATH"
    #     source $WORKSPACE_PATH/install/setup.bash
    # else
    #     log_warning "Custom message workspace not found at $WORKSPACE_PATH"
    # fi

    # 检查rosbridge_server是否安装
    if ros2 pkg list 2>/dev/null | grep -q rosbridge_server; then
        # 启动Scene Graph Republisher (已禁用)
        # log_info "启动 Scene Graph Republisher..."
        # if ros2 pkg list 2>/dev/null | grep -q scene_graph_republisher; then
        #     nohup ros2 run scene_graph_republisher scene_graph_republisher_node > "$LOG_DIR/scene_graph_republisher.log" 2>&1 &
        #     REPUBLISHER_PID=$!
        #     echo "$REPUBLISHER_PID" > "$SCRIPT_DIR/.scene_graph_republisher.pid"
        #     sleep 2
        #
        #     if kill -0 $REPUBLISHER_PID 2>/dev/null; then
        #         log_success "Scene Graph Republisher 已启动 (PID: $REPUBLISHER_PID)"
        #     else
        #         log_warning "Scene Graph Republisher 启动失败"
        #     fi
        # else
        #     log_warning "scene_graph_republisher 包未找到"
        # fi

        # 启动ROS Bridge - 使用env确保没有conda环境干扰
        log_info "启动 ROS Bridge (使用系统Python环境)..."
        env -u CONDA_DEFAULT_ENV -u CONDA_PREFIX -u CONDA_PROMPT_MODIFIER -u CONDA_EXE -u CONDA_SHLVL \
            PATH="/opt/ros/humble/bin:/usr/local/bin:/usr/bin:/bin" \
            ros2 launch rosbridge_server rosbridge_websocket_launch.xml > "$LOG_DIR/ros_bridge.log" 2>&1 &
        ROS_PID=$!
        echo "$ROS_PID" > "$SCRIPT_DIR/.ros_bridge.pid"

        # 等待启动
        sleep 3

        if kill -0 $ROS_PID 2>/dev/null; then
            log_success "ROS Bridge 已启动 (ws://localhost:9090, PID: $ROS_PID)"
            ROS_AVAILABLE=true
        else
            log_warning "ROS Bridge 启动失败，继续运行但ROS功能不可用"
        fi
    else
        log_warning "rosbridge_server 未安装"
        log_info "安装命令: sudo apt install ros-$ROS_DISTRO-rosbridge-suite"
    fi
else
    log_warning "未检测到ROS2环境，跳过ROS Bridge启动"
    log_info "应用将在无ROS模式下运行（3D场景可用，ROS通信不可用）"
fi

echo ""

# =============================================================================
# 2. 启动配置服务器
# =============================================================================
log_info "2️⃣  启动配置服务器..."

cd "$SERVER_SETTING_DIR"
python3 config_server.py 8080 > "$LOG_DIR/config_server.log" 2>&1 &
CONFIG_PID=$!
echo "$CONFIG_PID" > "$SCRIPT_DIR/.config_server.pid"

sleep 2

if kill -0 $CONFIG_PID 2>/dev/null; then
    log_success "配置服务器已启动 (http://localhost:8080, PID: $CONFIG_PID)"
else
    log_error "配置服务器启动失败"
    cat "$LOG_DIR/config_server.log"
    exit 1
fi

echo ""

# =============================================================================
# 3. 启动Web服务器
# =============================================================================
log_info "3️⃣  启动Web服务器..."

cd "$PROJECT_DIR"
python3 -m http.server 8000 > "$LOG_DIR/web_server.log" 2>&1 &
WEB_PID=$!
echo "$WEB_PID" > "$SCRIPT_DIR/.web_server.pid"

sleep 2

if kill -0 $WEB_PID 2>/dev/null; then
    log_success "Web服务器已启动 (http://localhost:8000, PID: $WEB_PID)"
else
    log_error "Web服务器启动失败"
    cat "$LOG_DIR/web_server.log"
    exit 1
fi

echo ""

# =============================================================================
# 启动完成信息
# =============================================================================
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}所有服务已启动！${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}🌐 应用地址:${NC}"
echo "   http://localhost:8000"
echo ""
echo -e "${BLUE}📋 服务状态:${NC}"
echo "   Web服务器:      http://localhost:8000 (PID: $WEB_PID)"
echo "   配置服务器:     http://localhost:8080 (PID: $CONFIG_PID)"
if [ "$ROS_AVAILABLE" = true ]; then
    echo "   ROS Bridge:     ws://localhost:9090 (PID: $ROS_PID)"
    # Scene Graph Republisher已禁用
    # if [ -f "$SCRIPT_DIR/.scene_graph_republisher.pid" ]; then
    #     REPUBLISHER_PID=$(cat "$SCRIPT_DIR/.scene_graph_republisher.pid")
    #     if kill -0 $REPUBLISHER_PID 2>/dev/null; then
    #         echo "   Scene Graph:    /scene_graph 话题 (PID: $REPUBLISHER_PID)"
    #     else
    #         echo -e "   Scene Graph:    ${YELLOW}启动失败${NC}"
    #     fi
    # else
    #     echo -e "   Scene Graph:    ${YELLOW}未启动${NC}"
    # fi
else
    echo -e "   ROS Bridge:     ${YELLOW}未启动 (ROS功能不可用)${NC}"
    # Scene Graph Republisher已禁用
    # echo -e "   Scene Graph:    ${YELLOW}未启动 (ROS功能不可用)${NC}"
fi
echo ""
echo -e "${BLUE}🎮 功能说明:${NC}"
echo "   - 鼠标拖拽物体"
echo "   - 滚轮缩放视角"
echo "   - ROS2指令控制 (/instruction 话题)"
# 场景图发布功能已禁用
# echo "   - 场景图发布 (/scene_graph 话题)"
echo "   - 配置保存/加载/管理"
echo ""
echo -e "${BLUE}📝 日志文件:${NC}"
echo "   tail -f $LOG_DIR/web_server.log"
echo "   tail -f $LOG_DIR/config_server.log"
if [ "$ROS_AVAILABLE" = true ]; then
    echo "   tail -f $LOG_DIR/ros_bridge.log"
    # Scene Graph Republisher已禁用
    # echo "   tail -f $LOG_DIR/scene_graph_republisher.log"
fi
echo ""
echo -e "${YELLOW}按 Ctrl+C 停止所有服务${NC}"
echo ""

# 保持脚本运行
while true; do
    sleep 1
done

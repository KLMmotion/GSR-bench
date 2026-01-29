# Server Setting 目录说明

此目录包含3D Desktop Organizer模块化项目的服务器组件。

## 文件说明

### 核心文件

- **config_server.py** - 配置管理服务器
  - 监听端口：8080
  - 功能：保存、加载、删除场景配置
  - API端点：
    - `GET /list_configs` - 获取所有配置列表
    - `GET /load_config/{number}` - 加载指定配置
    - `POST /save_config` - 保存新配置
    - `DELETE /delete_config/{number}` - 删除指定配置

- **stop_all_services.sh** - 停止所有运行中的服务
  - 停止配置服务器
  - 停止ROS Bridge
  - 停止Web服务器
  - 清理PID文件

## 启动项目

**不要在此目录直接启动服务！**

请使用项目根目录的启动脚本：

```bash
cd /home/kewei/3Ddesk（复件）/modular_project
./start.sh
```

该脚本会自动启动所有需要的服务：
1. ROS Bridge WebSocket Server (端口 9090)
2. Configuration Server (端口 8080) - 调用此目录的config_server.py
3. Web Server (端口 8000)

## 配置文件

配置数据保存在：
```
/home/kewei/3Ddesk（复件）/saved_configs.yaml
```

## 日志文件

运行时日志保存在模块化项目目录：
```
/home/kewei/3Ddesk（复件）/modular_project/logs/
├── config_server.log
├── ros_bridge.log
└── web_server.log
```

## 依赖项

- Python 3.x
- PyYAML (`pip install pyyaml`)
- ROS2 (可选，用于ROS Bridge)
- rosbridge_suite (可选，`sudo apt install ros-<distro>-rosbridge-suite`)

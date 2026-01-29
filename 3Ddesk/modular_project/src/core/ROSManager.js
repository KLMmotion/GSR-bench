

import { state, setRos, setIsRosConnected, setSceneGraphTopic, setActionCommandSubscriber, setTaskQueryPublisher, setAgentOverSubscriber, setAgentTriggerPublisher, setPublishInterval } from './GlobalState.js';
import { config } from './Config.js';
import { addLogEntry, updateCurrentCommandDisplay } from '../ui/UIManager.js';
import { publishSceneGraph } from '../systems/SceneGraphAnalyzer.js';
import { executeActionCommand } from '../systems/CommandExecutor.js';
import { handleAgentOver } from '../systems/AutoTest.js';


export function initROS() {
    try {
        const ros = new ROSLIB.Ros({
            url: config.rosUrl
        });
        setRos(ros);
        
        ros.on('connection', function() {
            console.log('Connected to ROS bridge');
            setIsRosConnected(true);
            updateRosStatus('Connected', true);
            addLogEntry('ROS2连接成功', 'success');
            
            const sceneGraphTopic = new ROSLIB.Topic({
                ros: ros,
                name: '/scene_graph',
                messageType: 'std_msgs/String'
            });
            setSceneGraphTopic(sceneGraphTopic);
            
            const actionCommandSubscriber = new ROSLIB.Topic({
                ros: ros,
                name: '/instruction',
                messageType: 'std_msgs/String',
                queue_size: 1,
                qos: {
                    reliability: 'reliable'
                }
            });
            setActionCommandSubscriber(actionCommandSubscriber);
            
            actionCommandSubscriber.subscribe(function(message) {
                console.log('Received action command:', message.data);
                addLogEntry(`收到指令: ${message.data}`, 'command');
                updateCurrentCommandDisplay(message.data, 'command');
                
                setTimeout(() => {
                    updateCurrentCommandDisplay(`正在执行: ${message.data}`, 'info');
                    
                    try {
                        executeActionCommand(message.data);
                        addLogEntry(`Succeed: ${message.data}`, 'success');
                        
                        updateCurrentCommandDisplay(`Succeed: ${message.data}`, 'success');
                        setTimeout(() => {
                            updateCurrentCommandDisplay('Thinking...', 'info');
                        }, 2000);
                        
                    } catch (error) {
                        console.error('Error executing command:', error);
                        addLogEntry(`指令执行错误: ${error.message}`, 'error');
                        
                        updateCurrentCommandDisplay(`指令执行错误: ${error.message}`, 'error');
                        setTimeout(() => {
                            updateCurrentCommandDisplay('Thinking...', 'info');
                        }, 3000);
                    }
                }, 1500);
            });
            
            const taskQueryPublisher = new ROSLIB.Topic({
                ros: ros,
                name: '/task_cmd',
                messageType: 'std_msgs/String',
                queue_size: 10,
                qos: {
                    history: 'keep_last',
                    depth: 10,
                    reliability: 'reliable',
                    durability: 'volatile'
                }
            });
            setTaskQueryPublisher(taskQueryPublisher);
            
            const agentOverSubscriber = new ROSLIB.Topic({
                ros: ros,
                name: '/agent_over',
                messageType: 'std_msgs/String',
                queue_size: 10,
                qos: {
                    history: 'keep_last',
                    depth: 10,
                    reliability: 'reliable',
                    durability: 'volatile'
                }
            });
            setAgentOverSubscriber(agentOverSubscriber);
            
            agentOverSubscriber.subscribe(function(message) {
                console.log('Received agent over:', message.data);
                addLogEntry(`收到代理完成信号: ${message.data}`, 'success');
                
                const taskStatusElement = document.getElementById('task-status-text');
                taskStatusElement.textContent = 'Task over!';
                taskStatusElement.style.color = '#90EE90';
                
                handleAgentOver();
            });
            
            const agentTriggerPublisher = new ROSLIB.Topic({
                ros: ros,
                name: '/agent_trigger',
                messageType: 'std_msgs/Bool',
                queue_size: 1,
                qos: {
                    reliability: 'reliable'
                }
            });
            setAgentTriggerPublisher(agentTriggerPublisher);
            
            if (state.publishInterval) clearInterval(state.publishInterval);
            const interval = setInterval(publishSceneGraph, 100);
            setPublishInterval(interval);
        });
        
        ros.on('error', function(error) {
            console.log('Error connecting to ROS bridge:', error);
            setIsRosConnected(false);
            updateRosStatus('Error: ' + error.message, false);
            addLogEntry(`ROS2连接错误: ${error.message}`, 'error');
        });
        
        ros.on('close', function() {
            console.log('Connection to ROS bridge closed');
            setIsRosConnected(false);
            updateRosStatus('Disconnected', false);
            addLogEntry('ROS2连接断开', 'error');
            if (state.publishInterval) {
                clearInterval(state.publishInterval);
                setPublishInterval(null);
            }
        });
    } catch (error) {
        console.log('Failed to initialize ROS connection:', error);
        updateRosStatus('Failed to connect', false);
    }
}


export function updateRosStatus(status, connected) {
    const statusElement = document.getElementById('ros-connection-status');
    const indicatorElement = document.getElementById('ros-indicator');
    
    statusElement.textContent = status;
    indicatorElement.className = 'status-indicator ' + (connected ? 'connected' : 'disconnected');
}


export function publishAgentTrigger() {
    if (!state.isRosConnected || !state.agentTriggerPublisher) {
        console.warn('Cannot publish agent trigger: ROS not connected or publisher not initialized');
        return;
    }
    
    try {
        const message = new ROSLIB.Message({
            data: true
        });
        
        state.agentTriggerPublisher.publish(message);
        console.log('Published agent trigger: true');
        addLogEntry('发布代理触发信号', 'success');
        
    } catch (error) {
        console.error('Error publishing agent trigger:', error);
        addLogEntry(`发布代理触发信号失败: ${error.message}`, 'error');
    }
}


export function publishTaskQuery(taskQuery, configName = '') {
    console.log('🚀 [ROSManager] publishTaskQuery 被调用');
    console.log('  - taskQuery:', taskQuery);
    console.log('  - configName:', configName);
    console.log('  - isRosConnected:', state.isRosConnected);
    console.log('  - taskQueryPublisher:', state.taskQueryPublisher);

    if (!state.isRosConnected || !state.taskQueryPublisher) {
        console.error('❌ [ROSManager] 无法发布: ROS2未连接或publisher未初始化');
        addLogEntry('无法发布任务查询: ROS2未连接', 'error');
        return;
    }

    if (taskQuery === undefined || taskQuery === null) {
        console.error('❌ [ROSManager] taskQuery 参数为 undefined/null，拒绝发布');
        addLogEntry('无法发布任务查询: task_query 为空', 'error');
        return;
    }

    let queryStr = String(taskQuery).trim();
    if (queryStr === '' || queryStr === 'undefined' || queryStr === 'null') {
        console.error('❌ [ROSManager] taskQuery 为空字符串或无效值:', taskQuery);
        addLogEntry('无法发布任务查询: task_query 无效', 'error');
        return;
    }

    try {

        // const message = new ROSLIB.Message({
        //     data: "task:" + queryStr
        // });

        let message;
        if (configName) {
            message = new ROSLIB.Message({
                data: configName + ": " + queryStr
            });
        } else {
            message = new ROSLIB.Message({
                data: "task:" + queryStr
            });
        }

        // =======================================================

        state.taskQueryPublisher.publish(message);

        console.log('✅ [ROSManager] 消息已发布到 /task_cmd');
        console.log('  - 消息内容:', message.data);

        const taskStatusElement = document.getElementById('task-status-text');
        if (configName && message.data.startsWith(configName)) {
            addLogEntry(`发布任务查询: ${configName}: ${queryStr}`, 'command');
            taskStatusElement.textContent = `${configName}: ${queryStr}`;
        } else {
            addLogEntry(`发布任务查询: task:${queryStr}`, 'command');
            taskStatusElement.textContent = `task:${queryStr}`;
        }
        taskStatusElement.style.color = '#FFA500';
    } catch (error) {
        console.error('❌ [ROSManager] 发布失败:', error);
        addLogEntry(`发布任务查询失败: ${error.message}`, 'error');
    }
}

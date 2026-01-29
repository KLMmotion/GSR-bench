

import { state } from '../core/GlobalState.js';


export function addLogEntry(message, type = 'info') {
    const commandLog = document.getElementById('command-log');
    if (!commandLog) return;
    
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    
    const now = new Date();
    const timestamp = now.toLocaleTimeString();
    entry.textContent = `[${timestamp}] ${message}`;
    
    state.allCommandLog.push({
        timestamp: now.toLocaleString(),
        message: message,
        type: type,
        isAutoTesting: state.isAutoTesting,
        configIndex: state.currentConfigIndex,
        configName: state.availableTestConfigs[state.currentConfigIndex]?.name || null
    });
    
    commandLog.appendChild(entry);
    
    while (commandLog.children.length > 20) {
        commandLog.removeChild(commandLog.firstChild);
    }
    
    commandLog.scrollTop = commandLog.scrollHeight;
}


export function updateCurrentCommandDisplay(message, type = 'info') {
    const displayElement = document.getElementById('current-command-text');
    if (!displayElement) return;
    
    if (type === 'command') {
        displayElement.style.color = '#87CEEB';
    } else if (type === 'success') {
        displayElement.style.color = '#90EE90';
    } else if (type === 'error') {
        displayElement.style.color = '#FFB6C1';
    } else {
        displayElement.style.color = 'white';
    }
    
    displayElement.textContent = message;
}


export function updateTaskStatusDisplay(message, show = true) {
    const displayElement = document.getElementById('task-status-display');
    const textElement = document.getElementById('task-status-text');
    
    if (displayElement && textElement) {
        textElement.textContent = message;
        displayElement.style.display = show ? 'block' : 'none';
    }
}


export function updateRosStatus(status, connected) {
    const statusElement = document.getElementById('ros-connection-status');
    const indicator = document.getElementById('ros-indicator');
    
    if (statusElement) {
        statusElement.textContent = status;
    }
    
    if (indicator) {
        indicator.className = `status-indicator ${connected ? 'connected' : 'disconnected'}`;
    }
}


export function updateSceneGraphInfo(info) {
    const element = document.getElementById('scene-graph-info');
    if (element) {
        element.textContent = info;
    }
}


export function toggleAutoTestButtons(isTesting) {
    const startBtn = document.getElementById('auto-test-btn');
    const stopBtn = document.getElementById('stop-test-btn');
    
    if (startBtn) startBtn.style.display = isTesting ? 'none' : 'inline-block';
    if (stopBtn) stopBtn.style.display = isTesting ? 'inline-block' : 'none';
}


export function showCurrentTestConfig(show, configName = '') {
    const element = document.getElementById('current-test-config');
    if (element) {
        element.style.display = show ? 'block' : 'none';
        if (configName) {
            element.textContent = `当前测试: ${configName}`;
        }
    }
}


export function clearCommandLog() {
    const commandLog = document.getElementById('command-log');
    if (commandLog) {
        commandLog.innerHTML = '<div class="log-entry">Thinking...</div>';
    }
}

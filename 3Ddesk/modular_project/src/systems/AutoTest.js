

import { state, setAvailableTestConfigs, setCurrentConfigIndex, setIsAutoTesting, setAutoTestStartTime, setAutoTestTimeout } from '../core/GlobalState.js';
import { publishTaskQuery } from '../core/ROSManager.js';
import { addLogEntry } from '../ui/UIManager.js';
import { getConfigurationList, applyConfiguration } from './ConfigManager.js';


export function startAutoTest() {
    if (!state.isRosConnected) {
        addLogEntry('ROS2未连接，无法开始自动测试', 'error');
        alert('请确保ROS2连接正常后再开始自动测试');
        return;
    }
    
    getConfigurationList()
        .then(configs => {
            if (!configs || configs.length === 0) {
                addLogEntry('没有可用的配置进行测试', 'error');
                alert('没有保存的配置可供测试');
                return;
            }
            
            const sortedConfigs = configs.sort((a, b) => a.number - b.number);
            setAvailableTestConfigs(sortedConfigs);
            setCurrentConfigIndex(0);
            setIsAutoTesting(true);
            setAutoTestStartTime(new Date());
            
            document.getElementById('auto-test-btn').style.display = 'none';
            document.getElementById('stop-test-btn').style.display = 'inline-block';
            document.getElementById('current-test-config').style.display = 'block';
            document.getElementById('task-status-display').style.display = 'block';
            
            addLogEntry(`开始自动测试，共${sortedConfigs.length}个配置`, 'success');
            
            loadNextTestConfig();
        })
        .catch(error => {
            addLogEntry(`获取配置列表失败: ${error.message}`, 'error');
        });
}


export function stopAutoTest() {
    setIsAutoTesting(false);
    setCurrentConfigIndex(0);
    setAvailableTestConfigs([]);
    
    if (state.autoTestTimeout) {
        clearTimeout(state.autoTestTimeout);
        setAutoTestTimeout(null);
    }
    
    document.getElementById('auto-test-btn').style.display = 'inline-block';
    document.getElementById('stop-test-btn').style.display = 'none';
    document.getElementById('current-test-config').style.display = 'none';
    document.getElementById('task-status-display').style.display = 'none';
    
    addLogEntry('自动测试已停止', 'info');
}


export function updateCurrentTestConfigDisplay() {
    const availableTestConfigs = state.availableTestConfigs;
    const currentConfigIndex = state.currentConfigIndex;
    
    if (!state.isAutoTesting || currentConfigIndex >= availableTestConfigs.length) {
        return;
    }
    
    const config = availableTestConfigs[currentConfigIndex];
    const displayElement = document.getElementById('current-test-config');
    displayElement.textContent = `当前测试: 配置 ${config.number}`;
}


export function loadNextTestConfig() {
    const availableTestConfigs = state.availableTestConfigs;
    const currentConfigIndex = state.currentConfigIndex;
    
    if (!state.isAutoTesting) return;
    
    if (currentConfigIndex >= availableTestConfigs.length) {
        addLogEntry('所有配置测试完成', 'success');
        stopAutoTest();
        return;
    }
    
    const config = availableTestConfigs[currentConfigIndex];
    addLogEntry(`加载配置 #${config.number}: ${config.name}`, 'info');
    
    updateCurrentTestConfigDisplay();
    
    applyConfiguration(config);

    setTimeout(() => {
        console.log('🔍 [AutoTest] 准备发布任务查询...');
        console.log('  - task_query:', config.task_query);
        console.log('  - config.name:', config.name);
        console.log('  - ROS connected:', state.isRosConnected);
        console.log('  - Task publisher:', state.taskQueryPublisher);

        publishTaskQuery(config.task_query, config.name);

        console.log('✅ [AutoTest] publishTaskQuery 已调用');
    }, 2000);
}


export function handleAgentOver() {
    if (!state.isAutoTesting) return;
    
    addLogEntry('代理任务完成，1秒后加载下一个配置', 'info');
    
    const timeout = setTimeout(() => {
        setCurrentConfigIndex(state.currentConfigIndex + 1);
        loadNextTestConfig();
    }, 1000);
    
    setAutoTestTimeout(timeout);
}


export function saveCommandLog() {
    try {
        const allCommandLog = state.allCommandLog;
        const availableTestConfigs = state.availableTestConfigs;
        const currentConfigIndex = state.currentConfigIndex;
        const autoTestStartTime = state.autoTestStartTime;
        
        let reportContent = "=".repeat(80) + "\n";
        reportContent += "3D Desktop Organizer - 指令状态报告\n";
        reportContent += "=".repeat(80) + "\n";
        reportContent += `生成时间: ${new Date().toLocaleString()}\n`;
        
        if (autoTestStartTime) {
            reportContent += `自动测试开始时间: ${autoTestStartTime.toLocaleString()}\n`;
            const duration = Math.round((new Date() - autoTestStartTime) / 1000);
            reportContent += `测试持续时间: ${duration}秒\n`;
        }
        
        reportContent += `总日志条目: ${allCommandLog.length}\n`;
        reportContent += `当前连接状态: ${state.isRosConnected ? '已连接' : '未连接'}\n`;
        reportContent += `自动测试状态: ${state.isAutoTesting ? '进行中' : '未进行'}\n`;
        
        if (availableTestConfigs.length > 0) {
            reportContent += `测试配置总数: ${availableTestConfigs.length}\n`;
            reportContent += `当前配置索引: ${currentConfigIndex + 1}/${availableTestConfigs.length}\n`;
        }
        
        reportContent += "\n" + "=".repeat(80) + "\n";
        reportContent += "详细日志记录\n";
        reportContent += "=".repeat(80) + "\n\n";
        
        let currentConfig = null;
        allCommandLog.forEach((logEntry, index) => {
            if (logEntry.isAutoTesting && logEntry.configName !== currentConfig) {
                if (currentConfig !== null) {
                    reportContent += "\n" + "-".repeat(60) + "\n";
                }
                currentConfig = logEntry.configName;
                reportContent += `配置: ${logEntry.configName || '未知'} (索引: ${logEntry.configIndex + 1})\n`;
                reportContent += "-".repeat(60) + "\n";
            }
            
            const typeLabel = {
                'info': '[信息]',
                'success': '[成功]', 
                'error': '[错误]',
                'command': '[指令]'
            }[logEntry.type] || '[其他]';
            
            reportContent += `${String(index + 1).padStart(4)}. [${logEntry.timestamp}] ${typeLabel} ${logEntry.message}\n`;
        });
        
        reportContent += "\n" + "=".repeat(80) + "\n";
        reportContent += "报告结束\n";
        reportContent += "=".repeat(80) + "\n";
        
        const blob = new Blob([reportContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `3Ddesk_指令状态_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        addLogEntry(`指令状态已保存到文件: ${link.download}`, 'success');
        
    } catch (error) {
        addLogEntry(`保存指令状态失败: ${error.message}`, 'error');
        console.error('Error saving command log:', error);
    }
}

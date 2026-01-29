

import * as CANNON from 'cannon-es';
import { state, clearBoxes, clearBoxesWithLid, clearMugs, clearCubes, clearInHandStates, setConfigManagerOpen, setAvailableConfigs, setSelectedConfigNumber, setIsCheckingSceneStability, setSceneStabilityCheckId, objectsInHand, objectsBeingAnimated } from '../core/GlobalState.js';
import { addLogEntry } from '../ui/UIManager.js';
import { analyzeScene } from './SceneGraphAnalyzer.js';
import { createBoxesFromConfig } from '../objects/Box.js';
import { createBoxWithLidFromConfig } from '../objects/BoxWithLid.js';
import { createMugsFromConfig } from '../objects/Mug.js';
import { createCubesFromConfig } from '../objects/Cube.js';
import { updateObjectNameMapping } from '../utils/ObjectNaming.js';
import { extractYRotation } from '../core/PhysicsEngine.js';
import { unmarkAssetLoaded } from '../objects/AssetLoader.js';


export function saveCurrentConfiguration() {
    openTaskQueryDialog();
}


export function performConfigurationSave(taskQuery) {
    try {
        const boxes = state.boxes;
        const boxesWithLid = state.boxesWithLid;
        const mugs = state.mugs;
        const cubes = state.cubes;
        const liberoAssets = state.liberoAssets;
        
        const config = {
            id: Date.now(),
            number: 0,
            name: `配置_${new Date().toLocaleDateString()}`,
            created: new Date().toLocaleString(),
            boxes: [],
            boxes_with_lid: [],
            mugs: [],
            cubes: [],
            libero_assets: [],
            scene_graph: analyzeScene(),
            task_query: taskQuery
        };
        
        boxes.forEach((box, index) => {
            const body = box.userData.physicsBody;
            const yRotation = extractYRotation(body.quaternion);
            
            config.boxes.push({
                position: {
                    x: body.position.x,
                    y: body.position.y,
                    z: body.position.z
                },
                rotation: yRotation,
                colorIndex: box.userData.colorIndex,
                isStacked: box.userData.isStacked || false,
                stackedOn: box.userData.stackedOn || null
            });
        });
        
        boxesWithLid.forEach((box, index) => {
            const body = box.userData.body;
            const yRotation = extractYRotation(body.quaternion);
            
            const colorMap = [0xff4444, 0xffdd44, 0x4488ff];
            const colorValue = colorMap[box.userData.colorIndex] || 0xff4444;
            const colorHex = '#' + colorValue.toString(16).padStart(6, '0');
            
            config.boxes_with_lid.push({
                name: box.name,
                position: {
                    x: body.position.x,
                    y: body.position.y,
                    z: body.position.z
                },
                rotation: yRotation,
                color: colorHex,
                colorIndex: box.userData.colorIndex,
                isOpen: box.userData.isOpen || false
            });
        });
        
        mugs.forEach((mug, index) => {
            const body = mug.userData.physicsBody;
            const yRotation = extractYRotation(body.quaternion);
            
            config.mugs.push({
                position: {
                    x: body.position.x,
                    y: body.position.y,
                    z: body.position.z
                },
                rotation: yRotation,
                colorIndex: mug.userData.colorIndex,
                placement: mug.userData.placement || 'on_table',
                targetBoxIndex: mug.userData.targetBoxIndex || null
            });
        });
        
        cubes.forEach((cube, index) => {
            const body = cube.userData.physicsBody;
            const yRotation = extractYRotation(body.quaternion);
            
            config.cubes.push({
                position: {
                    x: body.position.x,
                    y: body.position.y,
                    z: body.position.z
                },
                rotation: yRotation,
                colorIndex: cube.userData.colorIndex,
                placement: cube.userData.placement || 'on_table',
                targetBoxIndex: cube.userData.targetBoxIndex || null
            });
        });
        
        liberoAssets.forEach((asset, index) => {
            const body = asset.userData.physicsBody || asset.userData.body;
            if (!body) return;
            
            const yRotation = extractYRotation(body.quaternion);
            
            const assetConfig = {
                assetId: asset.userData.assetId,
                category: asset.userData.category,
                position: {
                    x: body.position.x,
                    y: body.position.y,
                    z: body.position.z
                },
                rotation: yRotation
            };
            
            if (asset.userData.isArticulated && asset.userData.partObjects) {
                assetConfig.drawers = [];
                
                asset.userData.partObjects.forEach(part => {
                    if (part.userData.isDrawer) {
                        assetConfig.drawers.push({
                            partName: part.userData.partName,
                            isOpen: part.userData.isOpen || false
                        });
                    }
                });
            }
            
            config.libero_assets.push(assetConfig);
        });
        
        fetch('http://localhost:8080/save_config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                addLogEntry(`配置保存成功 (#${data.number}) - 任务: ${taskQuery}`, 'success');
                console.log('Configuration saved successfully:', data);
            } else {
                addLogEntry(`配置保存失败: ${data.error}`, 'error');
                console.error('Failed to save configuration:', data.error);
            }
        })
        .catch(error => {
            addLogEntry(`配置保存错误: ${error.message}`, 'error');
            console.error('Error saving configuration:', error);
        });
        
    } catch (error) {
        addLogEntry(`配置保存失败: ${error.message}`, 'error');
        console.error('Error creating configuration:', error);
    }
}


export function loadConfiguration(configNumber) {
    fetch(`http://localhost:8080/load_config/${configNumber}`)
        .then(response => response.json())
        .then(data => {
            if (data.success && data.config) {
                addLogEntry(`加载配置 #${configNumber}`, 'info');
                applyConfiguration(data.config);
            } else {
                addLogEntry(`配置加载失败: ${data.error}`, 'error');
                console.error('Failed to load configuration:', data.error);
            }
        })
        .catch(error => {
            addLogEntry(`配置加载错误: ${error.message}`, 'error');
            console.error('Error loading configuration:', error);
        });
}


export function createObjectsFromConfig(config) {
    console.log('Creating objects from configuration:', config);

    if (state.isCheckingSceneStability) {
        console.log('🛑 [createObjectsFromConfig] 检测到正在进行的场景稳定性检查，取消它...');
        setIsCheckingSceneStability(false);
        setSceneStabilityCheckId(state.sceneStabilityCheckId + 1);
    }

    if (state.objectsInHand.size > 0 || state.objectsBeingAnimated.size > 0) {
        console.log('🧹 [createObjectsFromConfig] 清空物体状态:', {
            objectsInHand: Array.from(state.objectsInHand),
            objectsBeingAnimated: Array.from(state.objectsBeingAnimated)
        });
        clearInHandStates();
    }
    
    clearAllObjects();
    
    const scene = state.scene;
    const world = state.world;
    
    if (config.boxes && config.boxes.length > 0) {
        createBoxesFromConfig(scene, world, config.boxes);
    }
    
    if (config.boxes_with_lid && config.boxes_with_lid.length > 0) {
        config.boxes_with_lid.forEach(boxConfig => {
            createBoxWithLidFromConfig(scene, world, boxConfig);
        });
    }
    
    if (config.mugs && config.mugs.length > 0) {
        createMugsFromConfig(scene, world, config.mugs);
    }
    
    if (config.cubes && config.cubes.length > 0) {
        createCubesFromConfig(scene, world, config.cubes);
    }
    
    if (config.libero_assets && config.libero_assets.length > 0) {
        import('../objects/AssetLoader.js').then(async ({ createAsset }) => {
            const articulatedAssets = [];
            const regularAssets = [];
            
            config.libero_assets.forEach(assetConfig => {
                if (assetConfig.category === 'articulated') {
                    articulatedAssets.push(assetConfig);
                } else {
                    regularAssets.push(assetConfig);
                }
            });
            
            for (const assetConfig of articulatedAssets) {
                const position = {
                    x: assetConfig.position.x,
                    y: assetConfig.position.y,
                    z: assetConfig.position.z
                };
                
                const asset = await createAsset(
                    scene, 
                    world, 
                    assetConfig.category, 
                    assetConfig.assetId, 
                    position
                );
                
                if (asset && assetConfig.rotation !== undefined) {
                    const body = asset.userData.physicsBody || asset.userData.body;
                    if (body) {
                        const quaternion = new CANNON.Quaternion();
                        quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), assetConfig.rotation);
                        body.quaternion.copy(quaternion);
                    }
                }
                
                if (asset && assetConfig.drawers && asset.userData.partObjects) {
                    const { toggleDrawer } = await import('../objects/AssetLoader.js');
                    
                    asset.userData.partObjects.forEach(part => {
                        if (part.userData.isDrawer) {
                            const drawerConfig = assetConfig.drawers.find(d => d.partName === part.userData.partName);
                            if (drawerConfig && drawerConfig.isOpen !== part.userData.isOpen) {
                                console.log(`🔄 Restoring drawer ${part.userData.partName} to ${drawerConfig.isOpen ? 'open' : 'closed'}`);
                                toggleDrawer(part);
                            }
                        }
                    });
                }
                
                updateObjectNameMapping();
            }
            
            for (const assetConfig of regularAssets) {
                const position = {
                    x: assetConfig.position.x,
                    y: assetConfig.position.y,
                    z: assetConfig.position.z
                };
                
                const asset = await createAsset(
                    scene, 
                    world, 
                    assetConfig.category, 
                    assetConfig.assetId, 
                    position
                );
                
                if (asset && assetConfig.rotation !== undefined) {
                    const body = asset.userData.physicsBody || asset.userData.body;
                    if (body) {
                        const quaternion = new CANNON.Quaternion();
                        quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), assetConfig.rotation);
                        body.quaternion.copy(quaternion);
                    }
                }
                updateObjectNameMapping();
            }
        });
    }
    
    updateObjectNameMapping();
    
    console.log(`Created ${state.boxes.length} boxes, ${state.boxesWithLid.length} boxes with lid, ${state.mugs.length} mugs, ${state.cubes.length} cubes, and ${state.liberoAssets.length} LIBERO assets from configuration`);
}


export function clearAllObjects() {
    const scene = state.scene;
    const world = state.world;
    
    state.boxes.forEach(box => {
        scene.remove(box);
        if (box.userData.physicsBody) {
            world.removeBody(box.userData.physicsBody);
        }
    });
    
    state.boxesWithLid.forEach(box => {
        scene.remove(box);
        if (box.userData.body) {
            world.removeBody(box.userData.body);
        }
        if (box.userData.hinge) {
            world.removeConstraint(box.userData.hinge);
        }
        if (box.userData.lid) {
            scene.remove(box.userData.lid);
            if (box.userData.lidBody) {
                world.removeBody(box.userData.lidBody);
            }
        }
    });
    
    state.mugs.forEach(mug => {
        scene.remove(mug);
        if (mug.userData.physicsBody) {
            world.removeBody(mug.userData.physicsBody);
        }
    });
    
    state.cubes.forEach(cube => {
        scene.remove(cube);
        if (cube.userData.physicsBody) {
            world.removeBody(cube.userData.physicsBody);
        }
    });
    
    state.liberoAssets.forEach(asset => {
        scene.remove(asset);
        
        if (asset.userData.isArticulated) {
            asset.traverse(child => {
                if (child.userData.physicsBody) {
                    world.removeBody(child.userData.physicsBody);
                }
            });
        }
        
        const body = asset.userData.physicsBody || asset.userData.body;
        if (body) {
            world.removeBody(body);
        }
        
        if (asset.userData.assetId) {
            unmarkAssetLoaded(asset.userData.assetId);
        }
    });
    
    clearBoxes();
    clearBoxesWithLid();
    clearMugs();
    clearCubes();
    state.liberoAssets.length = 0;
    clearInHandStates();
    
    console.log('All objects cleared from scene');
}


export function applyConfiguration(config) {
    let world = null;
    let originalStep = null;
    
    try {
        console.log('Applying configuration:', config);
        console.log('Config keys:', Object.keys(config));
        console.log('Task query raw value:', config.task_query);
        console.log('Task query type:', typeof config.task_query);
        
        if (config.task_query !== undefined && config.task_query !== null) {
            if (typeof config.task_query !== 'string') {
                console.log('Converting task_query to string...');
                config.task_query = String(config.task_query);
            }
            
            if (typeof config.task_query.replace === 'function') {
                config.task_query = config.task_query
                    .replace(/\n/g, ' ')
                    .replace(/\r/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                console.log('Cleaned task_query:', config.task_query);
            } else {
                console.warn('task_query does not have replace method, type:', typeof config.task_query);
                config.task_query = String(config.task_query || '').trim();
            }
        }
        
        world = state.world;
        originalStep = world.step;
        world.step = function() {};
        
        console.log('About to create objects from config...');
        createObjectsFromConfig(config);
        console.log('Objects created successfully');
        
        setTimeout(() => {
            world.step = originalStep;
            
            console.log('Verifying physics bodies...');
            console.log(`Boxes: ${state.boxes.length}, Mugs: ${state.mugs.length}, Cubes: ${state.cubes.length}, BoxesWithLid: ${state.boxesWithLid.length}, LiberoAssets: ${state.liberoAssets ? state.liberoAssets.length : 0}`);
            
            addLogEntry('配置加载完成', 'success');
            console.log('Configuration applied successfully');
        }, 300);
        
    } catch (error) {
        addLogEntry(`配置应用失败: ${error.message}`, 'error');
        console.error('Error applying configuration:', error);
        console.error('Error stack:', error.stack);
        
        if (world && originalStep) {
            world.step = originalStep;
            console.log('Restored physics world after error');
        }
    }
}


export function deleteConfiguration(configNumber) {
    if (confirm(`确定要删除配置 #${configNumber} 吗？`)) {
        fetch(`http://localhost:8080/delete_config/${configNumber}`, {
            method: 'DELETE'
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                addLogEntry(`配置 #${configNumber} 删除成功`, 'success');
                if (state.configManagerOpen) {
                    refreshConfigList();
                }
            } else {
                addLogEntry(`配置删除失败: ${data.error}`, 'error');
            }
        })
        .catch(error => {
            addLogEntry(`配置删除错误: ${error.message}`, 'error');
            console.error('Error deleting configuration:', error);
        });
    }
}


export function getConfigurationList() {
    return fetch('http://localhost:8080/list_configs')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                return data.configs;
            } else {
                throw new Error(data.error);
            }
        });
}


export function openConfigManager() {
    const manager = document.getElementById('config-manager');
    manager.style.display = 'block';
    setConfigManagerOpen(true);
    window.configManagerOpen = true;
    
    refreshConfigList();
}


export function closeConfigManager() {
    const manager = document.getElementById('config-manager');
    manager.style.display = 'none';
    setConfigManagerOpen(false);
    window.configManagerOpen = false;
}


export function refreshConfigList() {
    getConfigurationList()
        .then(configs => {
            setAvailableConfigs(configs);
            displayConfigurationList(configs);
            updateConfigSlider(configs);
        })
        .catch(error => {
            addLogEntry(`获取配置列表失败: ${error.message}`, 'error');
            console.error('Error loading configurations:', error);
        });
}


export function displayConfigurationList(configs) {
    const configList = document.getElementById('config-list');
    
    if (!configs || configs.length === 0) {
        configList.innerHTML = '<div style="text-align: center; color: #666; margin: 20px 0;">暂无保存的配置</div>';
        return;
    }
    
    configList.innerHTML = configs.map(config => {
        const safeName = String(config.name || `配置_${config.number}`);
        const safeCreated = String(config.created || '未知');
        const safeTaskQuery = config.task_query ? String(config.task_query) : '';
        
        return `
        <div class="config-item">
            <div class="config-header">
                <div class="config-title">${safeName}</div>
                <div class="config-number">#${config.number}</div>
            </div>
            <div class="config-details">
                创建时间: ${safeCreated}<br>
                盒子数量: ${config.boxes ? config.boxes.length : 0} | 杯子数量: ${config.mugs ? config.mugs.length : 0} | 小方块数量: ${config.cubes ? config.cubes.length : 0}<br>
                场景图边: ${config.scene_graph && config.scene_graph.edges ? config.scene_graph.edges.length : 0}<br>
                ${safeTaskQuery ? `<span style="color: #87CEEB; font-weight: bold;">任务: </span><span style="color: #90EE90;">${safeTaskQuery}</span>` : '<span style="color: #666;">无任务描述</span>'}
            </div>
            <div class="config-actions">
                <button class="config-button load-button" onclick="loadConfiguration(${config.number})">加载</button>
                <button class="config-button delete-button" onclick="deleteConfigurationFromList(${config.number})">删除</button>
            </div>
        </div>
    `;
    }).join('');
}


export function updateConfigSlider(configs) {
    const slider = document.getElementById('config-slider');
    const display = document.getElementById('selected-config-display');
    
    if (!configs || configs.length === 0) {
        slider.style.display = 'none';
        display.textContent = '暂无配置';
        return;
    }
    
    slider.style.display = 'block';
    slider.min = 1;
    slider.max = configs.length;
    slider.value = Math.min(state.selectedConfigNumber, configs.length);
    
    updateSelectedConfig(slider.value);
}


export function updateSelectedConfig(value) {
    setSelectedConfigNumber(parseInt(value));
    const display = document.getElementById('selected-config-display');
    const availableConfigs = state.availableConfigs;
    
    if (availableConfigs && availableConfigs.length > 0) {
        const configIndex = state.selectedConfigNumber - 1;
        if (configIndex >= 0 && configIndex < availableConfigs.length) {
            const config = availableConfigs[configIndex];
            display.textContent = `${config.name || `配置_${config.number}`} (#${config.number})`;
        } else {
            display.textContent = `配置 #${state.selectedConfigNumber}`;
        }
    } else {
        display.textContent = `配置 #${state.selectedConfigNumber}`;
    }
}


export function loadSelectedConfiguration() {
    const availableConfigs = state.availableConfigs;
    
    if (availableConfigs && availableConfigs.length > 0) {
        const configIndex = state.selectedConfigNumber - 1;
        if (configIndex >= 0 && configIndex < availableConfigs.length) {
            const config = availableConfigs[configIndex];
            loadConfiguration(config.number);
            closeConfigManager();
        } else {
            addLogEntry('无效的配置选择', 'error');
        }
    } else {
        addLogEntry('没有可用的配置', 'error');
    }
}


export function deleteConfigurationFromList(configNumber) {
    deleteConfiguration(configNumber);
    setTimeout(() => {
        refreshConfigList();
    }, 500);
}

let pendingConfigurationData = null;


export function openTaskQueryDialog() {
    const dialog = document.getElementById('task-query-dialog');
    const input = document.getElementById('task-query-input');
    
    input.value = '';
    dialog.style.display = 'block';
    
    setTimeout(() => input.focus(), 100);
}


export function closeTaskQueryDialog() {
    const dialog = document.getElementById('task-query-dialog');
    dialog.style.display = 'none';
    pendingConfigurationData = null;
}


export function selectDefaultOption(optionText) {
    const input = document.getElementById('task-query-input');
    input.value = optionText;
    input.focus();
}


export function cancelTaskQuery() {
    closeTaskQueryDialog();
}


export function confirmTaskQuery() {
    const input = document.getElementById('task-query-input');
    const taskQuery = input.value.trim();
    
    if (!taskQuery) {
        alert('请输入任务描述或选择默认选项！');
        return;
    }
    
    closeTaskQueryDialog();
    performConfigurationSave(taskQuery);
}

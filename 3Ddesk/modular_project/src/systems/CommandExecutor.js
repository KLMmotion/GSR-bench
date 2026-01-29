

import * as THREE from 'three';
import { state, clearBoxes, clearBoxesWithLid, clearMugs, clearCubes, clearLiberoAssets, setIsCheckingSceneStability, setSceneStabilityCheckId } from '../core/GlobalState.js';
import { addLogEntry, updateCurrentCommandDisplay } from '../ui/UIManager.js';
import { publishAgentTrigger } from '../core/ROSManager.js';
import { analyzeScene, findContainedObjects, findOccupiedPositionsInBox, isLidOpen } from './SceneGraphAnalyzer.js';
import { boxGridPlacement } from './BoxGridPlacement.js';
import { findSafeTablePositionWithGrid } from './TableGridPlacement.js';
import { animateObjectMovement, animateObjectMovementWithRotation } from './AnimationSystem.js';
import { drawerGridPlacement } from './DrawerGridPlacement.js';
import { createAllBoxes } from '../objects/BoxFactory.js';
import { createMugsWithSafePositions } from '../objects/Mug.js';
import { createCubesWithSafePositions } from '../objects/Cube.js';
import { updateObjectNameMapping, findDrawerByName } from '../utils/ObjectNaming.js';
import { openLid, closeLid, toggleLid } from '../objects/BoxWithLid.js';
import { unmarkAssetLoaded } from '../objects/AssetLoader.js';


function getPhysicsBody(object) {
    if (!object || !object.userData) return null;
    return object.userData.physicsBody || object.userData.body;
}


export function executeActionCommand(command) {
    const cmd = command.toLowerCase().trim();
    console.log('Executing command:', cmd);
    
    const lidActionMatch = cmd.match(/(open|close)\s+([\w\/]+)/i);
    if (lidActionMatch) {
        const [, action, objectName] = lidActionMatch;
        
        const targetObject = findObjectByName(objectName);
        
        if (!targetObject) {
            const errorMsg = `未找到对象: ${objectName}`;
            console.error(errorMsg);
            addLogEntry(errorMsg, 'error');
            throw new Error(errorMsg);
        }
        
        if (targetObject.userData.type === 'box_with_lid') {
            executeLidAction(action, objectName);
        } else if (targetObject.userData.isDrawer) {
            executeDrawerAction(action, objectName);
        } else {
            const errorMsg = `${objectName} 既不是带盖子的盒子，也不是抽屉，无法执行 ${action} 操作`;
            console.error(errorMsg);
            addLogEntry(errorMsg, 'error');
            throw new Error(errorMsg);
        }
        return;
    }
    
    const moveMatch = cmd.match(/(move|put)\s+(\w+)\s+(on|to|up|upon|in|into)\s+([\w\/]+)/i);
    if (!moveMatch) {
        const errorMsg = `无效的指令格式: ${command}`;
        console.error(errorMsg);
        addLogEntry(errorMsg, 'error');
        throw new Error(errorMsg);
    }

    const [, verb, objectName, action, targetName] = moveMatch;
    
    const sourceObject = findObjectByName(objectName);
    const targetObject = findObjectByName(targetName);
    
    if (!sourceObject) {
        const errorMsg = `未找到源对象: ${objectName}`;
        console.error(errorMsg);
        addLogEntry(errorMsg, 'error');
        updateCurrentCommandDisplay(errorMsg, 'error');
        setTimeout(() => {
            updateCurrentCommandDisplay('Thinking...', 'info');
        }, 3000);
        throw new Error(errorMsg);
    }
    
    if (!targetObject && targetName !== 'table') {
        const errorMsg = `未找到目标对象: ${targetName}`;
        console.error(errorMsg);
        addLogEntry(errorMsg, 'error');
        updateCurrentCommandDisplay(errorMsg, 'error');
        setTimeout(() => {
            updateCurrentCommandDisplay('Thinking...', 'info');
        }, 3000);
        throw new Error(errorMsg);
    }
    
    addLogEntry(`开始执行: ${verb} ${objectName} ${action} ${targetName}`, 'info');
    
    let actualTargetObject = targetObject;
    let actualTargetName = targetName;
    
    if (targetName.includes('/') && ['in', 'into'].includes(action)) {
        const parts = targetName.split('/');
        const cabinetName = parts[0];
        const drawerName = parts[1];
        
        console.log(`🔍 Detected drawer path: ${cabinetName}/${drawerName}`);
        console.log(`   Extracted drawerName: "${drawerName}"`);
        
        const drawer = findDrawerByName(drawerName);
        
        if (drawer && drawer.userData.isDrawer) {
            console.log(`✅ Found drawer directly: ${drawerName}`);
            actualTargetObject = drawer;
            actualTargetName = drawerName;
        } else {
            console.warn(`⚠️ Could not find drawer: ${drawerName}, falling back to cabinet`);
        }
    }
    
    if (['in', 'into'].includes(action)) {
        if (actualTargetName === 'table') {
            moveObjectToTable(sourceObject);
        } else {
            moveObjectIntoContainer(sourceObject, actualTargetObject);
        }    
    } else if (['on', 'to', 'up', 'upon'].includes(action)) {
        if (actualTargetName === 'table') {
            moveObjectToTable(sourceObject);
        } else {
            moveObjectOnTop(sourceObject, actualTargetObject);
        }
    }
}


export function executeLidAction(action, objectName) {
    console.log(`Executing lid action: ${action} ${objectName}`);
    
    const targetObject = findObjectByName(objectName);
    
    if (!targetObject) {
        const errorMsg = `未找到对象: ${objectName}`;
        console.error(errorMsg);
        addLogEntry(errorMsg, 'error');
        updateCurrentCommandDisplay(errorMsg, 'error');
        setTimeout(() => {
            updateCurrentCommandDisplay('Thinking...', 'info');
        }, 3000);
        throw new Error(errorMsg);
    }
    
    if (targetObject.userData.type !== 'box_with_lid') {
        const errorMsg = `${objectName} 不是带盖子的盒子，无法执行 ${action} 操作`;
        console.error(errorMsg);
        addLogEntry(errorMsg, 'error');
        updateCurrentCommandDisplay(errorMsg, 'error');
        setTimeout(() => {
            updateCurrentCommandDisplay('Thinking...', 'info');
        }, 3000);
        throw new Error(errorMsg);
    }
    
    if (action === 'open') {
        const currentlyOpen = isLidOpen(targetObject);
        if (currentlyOpen) {
            const msg = `${objectName} 的盖子已经是打开的`;
            console.log(msg);
            addLogEntry(msg, 'info');
            updateCurrentCommandDisplay(msg, 'info');
            setTimeout(() => {
                updateCurrentCommandDisplay('Thinking...', 'info');
            }, 2000);
        } else {
            openLid(targetObject);
            addLogEntry(`正在打开 ${objectName} 的盖子`, 'success');
            updateCurrentCommandDisplay(`正在打开 ${objectName}`, 'success');
            console.log(`Opening lid of ${objectName}`);
        }
    } else if (action === 'close') {
        const currentlyOpen = isLidOpen(targetObject);
        if (!currentlyOpen) {
            const msg = `${objectName} 的盖子已经是关闭的`;
            console.log(msg);
            addLogEntry(msg, 'info');
            updateCurrentCommandDisplay(msg, 'info');
            setTimeout(() => {
                updateCurrentCommandDisplay('Thinking...', 'info');
            }, 2000);
        } else {
            closeLid(targetObject);
            addLogEntry(`正在关闭 ${objectName} 的盖子`, 'success');
            updateCurrentCommandDisplay(`正在关闭 ${objectName}`, 'success');
            console.log(`Closing lid of ${objectName}`);
        }
    }
    
    setTimeout(() => {
        updateCurrentCommandDisplay('Thinking...', 'info');
        waitForSceneStabilization();
    }, 2000);
}


export function findObjectByName(name) {
    console.log(`🔎 findObjectByName called with name: "${name}"`);
    
    const objectNameMap = state.objectNameMap;
    const boxes = state.boxes;
    const boxesWithLid = state.boxesWithLid;
    const mugs = state.mugs;
    const cubes = state.cubes;
    const liberoAssets = state.liberoAssets;
    
    console.log(`📋 Current objectNameMap:`, objectNameMap);
    console.log(`📦 Available LIBERO assets:`, liberoAssets?.length || 0);
    if (liberoAssets && liberoAssets.length > 0) {
        console.log(`  Asset details:`, liberoAssets.map(a => ({ 
            assetId: a.userData?.assetId, 
            type: a.userData?.type 
        })));
    }
    
    for (const [objectKey, objectName] of Object.entries(objectNameMap)) {
        console.log(`  Checking entry: "${objectKey}" -> "${objectName}" (looking for "${name}")`);
        if (objectName === name) {
            console.log(`✅ Found match! objectKey: "${objectKey}"`);
            if (objectKey.startsWith('lid_box_')) {
                const index = parseInt(objectKey.split('_')[2]);
                return boxesWithLid[index] || null;
            } else if (objectKey.startsWith('box_')) {
                const index = parseInt(objectKey.split('_')[1]);
                return boxes[index] || null;
            } else if (objectKey.startsWith('mug_')) {
                const index = parseInt(objectKey.split('_')[1]);
                return mugs[index] || null;
            } else if (objectKey.startsWith('cube_')) {
                const index = parseInt(objectKey.split('_')[1]);
                return cubes[index] || null;
            } else {
                console.log(`  Searching for LIBERO asset with objectKey: "${objectKey}"`);
                const asset = liberoAssets?.find(a => a.userData?.assetId === objectKey);
                if (asset) {
                    console.log(`✅ Found LIBERO asset:`, asset.userData);
                    return asset;
                } else {
                    console.warn(`⚠️ No LIBERO asset found for objectKey: "${objectKey}"`);
                }
            }
        }
    }
    
    console.log(`  Trying to find drawer with name: "${name}"`);
    const drawer = findDrawerByName(name);
    if (drawer) {
        console.log(`✅ Found drawer:`, drawer.userData);
        return drawer;
    }
    
    console.warn(`❌ No object found for name: "${name}"`);
    return null;
}


export function moveObjectIntoContainer(sourceObject, targetBox) {
    console.log(`🔵 moveObjectIntoContainer called`);
    console.log(`  Source:`, sourceObject.userData);
    console.log(`  Target:`, targetBox.userData);
    
    const targetType = targetBox.userData.type;
    const targetAssetId = targetBox.userData.assetId;
    
    console.log(`  Debug: targetType="${targetType}", targetAssetId="${targetAssetId}"`);
    
    const isDrawer = targetBox.userData.isDrawer === true;
    
    if (isDrawer) {
        console.log(`🚪 Target is drawer: ${targetBox.userData.partName}`);
        moveObjectIntoDrawer(sourceObject, targetBox);
        return;
    }
    
    const isBowlOrPlate = targetAssetId && 
        (targetAssetId.includes('bowl') || targetAssetId.includes('plate'));
    
    console.log(`  Debug: isBowlOrPlate=${isBowlOrPlate}`);
    
    if (isBowlOrPlate) {
        console.log(`🥣 Target is ${targetAssetId}, using simplified placement`);
        moveObjectIntoBowlOrPlate(sourceObject, targetBox, targetAssetId);
        return;
    }
    
    if (targetType !== 'box' && targetType !== 'box_with_lid') {
        console.error('Target must be a box, bowl, or plate for "in" operation');
        return;
    }
    
    const isBoxWithLid = targetType === 'box_with_lid';
    
    if (isBoxWithLid) {
        if (!isLidOpen(targetBox)) {
            console.warn('Box with lid is closed, cannot place objects inside');
            addLogEntry('盖子是关的，无法放入物体', 'error');
            updateCurrentCommandDisplay('盖子是关的，无法放入物体', 'error');
            setTimeout(() => {
                updateCurrentCommandDisplay('Thinking...', 'info');
            }, 3000);
            return;
        }
        console.log('Target is a box with lid, and it is open');
    }
    
    const targetBody = getPhysicsBody(targetBox);
    
    if (!targetBody) {
        console.error('Cannot get physics body from target box');
        addLogEntry('目标盒子物理体错误', 'error');
        return;
    }
    
    console.log(`📍 开始检查盒子内的物体...`);
    const occupiedPositions = findOccupiedPositionsInBox(targetBox);
    console.log(`📍 检查完成，找到 ${occupiedPositions.length} 个物体`);
    
    const sourceType = sourceObject.userData.type === 'libero_asset' ? 'mug' : sourceObject.userData.type;
    const objectDisplayName = sourceObject.userData.assetId || sourceType;
    
    console.log(`Box contains ${occupiedPositions.length} objects:`, occupiedPositions.map(pos => ({
        object: pos.mug?.name || pos.mug?.userData?.assetId || 'unknown',
        world: {x: pos.x.toFixed(1), z: pos.z.toFixed(1)},
        local: {x: pos.localX?.toFixed(1), z: pos.localZ?.toFixed(1)}
    })));
    addLogEntry(`盒子内已有 ${occupiedPositions.length} 个物体`, 'info');
    
    if (occupiedPositions.length >= 7) {
        console.warn('Target box is full (7 objects maximum), placing on table instead');
        addLogEntry(`盒子已满(最多7个物体)，将${objectDisplayName}放到桌子上`, 'error');
        updateCurrentCommandDisplay(`盒子已满(最多7个物体)，将${objectDisplayName}放到桌子上`, 'error');
        setTimeout(() => {
            updateCurrentCommandDisplay('Thinking...', 'info');
        }, 3000);
        moveObjectToTable(sourceObject);
        return;
    }
    
    const quat = targetBody.quaternion;
    const yRotation = Math.asin(2*(quat.w*quat.y - quat.x*quat.z));
    
    console.log(`使用boxGridPlacement系统为${objectDisplayName}寻找最佳位置...`);
    addLogEntry('使用智能栅格系统寻找盒子内的最佳位置', 'info');
    
    const bestPlacement = boxGridPlacement.findBestPlacement(sourceType, targetBox, targetBody.position.x, targetBody.position.z, yRotation);
    
    if (!bestPlacement) {
        console.warn('boxGridPlacement系统未找到合适位置，放到桌子上');
        addLogEntry(`盒子内没有可用位置，将${objectDisplayName}放到桌子上`, 'error');
        updateCurrentCommandDisplay(`盒子内没有可用位置，将${objectDisplayName}放到桌子上`, 'error');
        setTimeout(() => {
            updateCurrentCommandDisplay('Thinking...', 'info');
        }, 3000);
        moveObjectToTable(sourceObject);
        return;
    }
    
    const sourceHeight = getObjectHeight(sourceObject);
    const verticalOffset = sourceHeight / 2 + 1;
    
    const targetPosition = {
        x: bestPlacement.x,
        y: targetBody.position.y + verticalOffset,
        z: bestPlacement.z
    };
    
    console.log(`boxGridPlacement找到最佳位置: x=${targetPosition.x.toFixed(1)}, y=${targetPosition.y.toFixed(1)}, z=${targetPosition.z.toFixed(1)}`);
    console.log(`🎯 准备执行动画移动 from (${sourceObject.position.x.toFixed(1)}, ${sourceObject.position.y.toFixed(1)}, ${sourceObject.position.z.toFixed(1)}) to (${targetPosition.x.toFixed(1)}, ${targetPosition.y.toFixed(1)}, ${targetPosition.z.toFixed(1)})`);
    addLogEntry(`在盒子内找到最佳放置位置`, 'success');
    
    const containedObjects = findContainedObjects(sourceObject);
    console.log(`📦 物体包含的对象数量: ${containedObjects.length}`);
    
    console.log(`🚀 调用 animateObjectMovement...`);
    animateObjectMovement(sourceObject, targetPosition, containedObjects);
    console.log(`✅ animateObjectMovement 调用完成`);
}


function moveObjectIntoBowlOrPlate(sourceObject, container, containerAssetId) {
    console.log(`🥣 Moving object into ${containerAssetId}`);
    
    const allObjects = [
        ...state.mugs,
        ...state.cubes,
        ...(state.liberoAssets || []).filter(asset => asset !== container)
    ];
    
    const containerBody = getPhysicsBody(container);
    if (!containerBody) {
        console.error('Cannot get physics body from container');
        addLogEntry('容器物理体错误', 'error');
        return;
    }
    
    const containerPos = containerBody.position;
    const containerQuat = containerBody.quaternion;
    
    const threeQuat = new THREE.Quaternion(
        containerQuat.x,
        containerQuat.y,
        containerQuat.z,
        containerQuat.w
    );
    const inverseQuat = threeQuat.clone().invert();
    
    const isBowl = containerAssetId.includes('bowl');
    const radius = 2.5;
    const bounds = {
        radius: radius,
        minY: isBowl ? -1.5 : -0.5,
        maxY: isBowl ? 3.0 : 1.5
    };
    
    let objectsInContainer = 0;
    for (const obj of allObjects) {
        if (obj === sourceObject) continue;
        
        const objBody = getPhysicsBody(obj);
        if (!objBody) continue;
        
        const objPos = objBody.position;
        
        if (objPos.y <= containerPos.y + bounds.minY || 
            objPos.y >= containerPos.y + bounds.maxY) {
            continue;
        }
        
        const relativePos = new THREE.Vector3(
            objPos.x - containerPos.x,
            objPos.y - containerPos.y,
            objPos.z - containerPos.z
        ).applyQuaternion(inverseQuat);
        
        const distanceXZ = Math.sqrt(relativePos.x * relativePos.x + relativePos.z * relativePos.z);
        const isInside = distanceXZ < bounds.radius && 
                        relativePos.y >= bounds.minY && 
                        relativePos.y < bounds.maxY;
        
        if (isInside) {
            objectsInContainer++;
        }
    }
    
    if (objectsInContainer >= 1) {
        console.warn(`❌ ${containerAssetId} 已满，只能放置一个物体`);
        addLogEntry(`${containerAssetId}已满，只能放置一个物体`, 'error');
        updateCurrentCommandDisplay(`${containerAssetId}已满，只能放置一个物体`, 'error');
        setTimeout(() => {
            updateCurrentCommandDisplay('Thinking...', 'info');
        }, 3000);
        return;
    }
    
    const targetLocalPos = new THREE.Vector3(
        0,
        isBowl ? 1.0 : 0.5,
        0
    );
    
    const targetWorldPos = targetLocalPos.clone();
    targetWorldPos.applyQuaternion(threeQuat);
    targetWorldPos.add(new THREE.Vector3(containerPos.x, containerPos.y, containerPos.z));
    
    console.log(`🎯 目标位置（${containerAssetId}中心）: x=${targetWorldPos.x.toFixed(1)}, y=${targetWorldPos.y.toFixed(1)}, z=${targetWorldPos.z.toFixed(1)}`);
    addLogEntry(`将物体放入${containerAssetId}中心`, 'success');
    
    const containedObjects = findContainedObjects(sourceObject);
    console.log(`🚀 调用 animateObjectMovement...`);
    animateObjectMovement(sourceObject, targetWorldPos, containedObjects);
    console.log(`✅ animateObjectMovement 调用完成`);
}


export function moveObjectOnTop(sourceObject, targetObject) {
    const targetBody = getPhysicsBody(targetObject);
    const sourceBody = getPhysicsBody(sourceObject);
    
    if (!targetBody) {
        console.error('Cannot get physics body from target object');
        addLogEntry('目标物体物理体错误', 'error');
        return;
    }
    
    let heightOffset = 9;
    
    const targetHeight = getObjectHeight(targetObject);
    const sourceHeight = sourceBody ? getObjectHeight(sourceObject) : 5;
    
    heightOffset = targetHeight / 2 + sourceHeight / 2 + 0.5;
    
    console.log(`📏 Placing object on top: target height=${targetHeight.toFixed(2)}, source height=${sourceHeight.toFixed(2)}, offset=${heightOffset.toFixed(2)}`);
    
    const targetPosition = {
        x: targetBody.position.x,
        y: targetBody.position.y + heightOffset,
        z: targetBody.position.z
    };
    
    const containedObjects = findContainedObjects(sourceObject);
    
    animateObjectMovement(sourceObject, targetPosition, containedObjects);
}


function getObjectHeight(object) {
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    box.getSize(size);
    return size.y || 8;
}


export function moveObjectToTable(sourceObject) {
    const objectType = sourceObject.userData.type;
    console.log(`使用栅格系统为${objectType}寻找桌面位置`);
    
    const safePosition = findSafeTablePositionWithGrid(objectType);
    
    console.log(`${objectType}的目标位置:`, safePosition);
    addLogEntry(`将${objectType === 'box' ? '盒子' : '杯子'}放置到桌面 (${safePosition.x.toFixed(1)}, ${safePosition.z.toFixed(1)})`, 'info');
    
    const containedObjects = findContainedObjects(sourceObject);
    
    animateObjectMovementWithRotation(sourceObject, safePosition, containedObjects);
}


export function waitForSceneStabilization() {
    if (state.isCheckingSceneStability) {
        console.log('⚠️ [waitForSceneStabilization] 已有稳定性检查在运行，跳过此次调用');
        return;
    }

    const newId = state.sceneStabilityCheckId + 1;
    setSceneStabilityCheckId(newId);
    const checkId = newId;
    setIsCheckingSceneStability(true);

    console.log(`🔍 [waitForSceneStabilization#${checkId}] 开始场景稳定性检查`);

    function checkSceneGraph() {
        if (checkId !== state.sceneStabilityCheckId) {
            console.log(`🛑 [checkSceneGraph#${checkId}] 检查已过期，当前ID: ${state.sceneStabilityCheckId}`);
            return;
        }

        try {
            const sceneData = analyzeScene();

            const hasInHandRelations = sceneData.edges.some(edge => edge.includes('(in)hand'));
            const hasOuttableRelations = sceneData.edges.some(edge => edge.includes('(out)table'));

            if (hasInHandRelations || hasOuttableRelations) {
                console.log(`⏳ [checkSceneGraph#${checkId}] 场景图中仍有 (in)hand 或 (out)table 关系，等待中...`);
                setTimeout(() => {
                    if (checkId === state.sceneStabilityCheckId) {
                        checkSceneGraph();
                    }
                }, 100);
            } else {
                console.log(`✅ [checkSceneGraph#${checkId}] 场景已稳定，未发现 (in)hand 关系`);

                const timestamp = new Date().toISOString();
                const logMessage = `[${timestamp}] Scene graph stabilized - Final state: nodes=[${sceneData.nodes.join(', ')}], edges=[${sceneData.edges.join(', ')}]`;
                console.log(logMessage);
                addLogEntry(`场景稳定，最终状态: ${sceneData.edges.length} 个关系`, 'success');

                setTimeout(() => {
                    if (checkId === state.sceneStabilityCheckId) {
                        console.log(`🚀 [checkSceneGraph#${checkId}] 发布 agent trigger`);
                        publishAgentTrigger();
                        setIsCheckingSceneStability(false);
                    }
                }, 50);
            }
        } catch (error) {
            console.error(`❌ [checkSceneGraph#${checkId}] 检查场景图时出错:`, error);
            setTimeout(() => {
                if (checkId === state.sceneStabilityCheckId) {
                    console.log(`🔄 [checkSceneGraph#${checkId}] 出错后发布 agent trigger`);
                    publishAgentTrigger();
                    setIsCheckingSceneStability(false);
                }
            }, 200);
        }
    }

    checkSceneGraph();
}


export function randomReset() {
    console.log('Random reset started...');
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
    clearLiberoAssets();
    
    console.log('All objects cleared, creating new ones...');
    
    createAllBoxes(scene, world);
    createMugsWithSafePositions(scene, world);
    createCubesWithSafePositions(scene, world);
    
    if (typeof window.getGridPlacement === 'function') {
        const gridPlacement = window.getGridPlacement();
        if (gridPlacement && typeof gridPlacement.updateGrid === 'function') {
            gridPlacement.updateGrid();
        }
    }
    
    updateObjectNameMapping();
    
    console.log(`Random reset complete: ${state.boxes.length} boxes, ${state.boxesWithLid.length} boxes with lid, ${state.mugs.length} mugs, ${state.cubes.length} cubes`);
    addLogEntry('随机重置完成', 'success');
}


export function executeDrawerAction(action, drawerName) {
    console.log(`Executing drawer action: ${action} ${drawerName}`);
    
    import('../objects/AssetLoader.js').then(module => {
        const { toggleDrawer } = module;
        
        const drawer = findObjectByName(drawerName);
        
        if (!drawer) {
            const errorMsg = `未找到抽屉: ${drawerName}`;
            console.error(errorMsg);
            addLogEntry(errorMsg, 'error');
            updateCurrentCommandDisplay(errorMsg, 'error');
            setTimeout(() => {
                updateCurrentCommandDisplay('Thinking...', 'info');
            }, 3000);
            throw new Error(errorMsg);
        }
        
        if (!drawer.userData.isDrawer) {
            const errorMsg = `${drawerName} 不是抽屉，无法执行 ${action} 操作`;
            console.error(errorMsg);
            addLogEntry(errorMsg, 'error');
            updateCurrentCommandDisplay(errorMsg, 'error');
            setTimeout(() => {
                updateCurrentCommandDisplay('Thinking...', 'info');
            }, 3000);
            throw new Error(errorMsg);
        }
        
        const isOpen = drawer.userData.isOpen;
        
        if (action === 'open') {
            if (isOpen) {
                const msg = `${drawerName} 已经是打开的`;
                console.log(msg);
                addLogEntry(msg, 'info');
                updateCurrentCommandDisplay(msg, 'info');
                setTimeout(() => {
                    updateCurrentCommandDisplay('Thinking...', 'info');
                    waitForSceneStabilization();
                }, 2000);
            } else {
                toggleDrawer(drawer);
                addLogEntry(`正在打开 ${drawerName}`, 'success');
                updateCurrentCommandDisplay(`正在打开 ${drawerName}`, 'success');
                console.log(`Opening drawer ${drawerName}`);
                
                setTimeout(() => {
                    updateCurrentCommandDisplay('Thinking...', 'info');
                    waitForSceneStabilization();
                }, 2000);
            }
        } else if (action === 'close') {
            if (!isOpen) {
                const msg = `${drawerName} 已经是关闭的`;
                console.log(msg);
                addLogEntry(msg, 'info');
                updateCurrentCommandDisplay(msg, 'info');
                setTimeout(() => {
                    updateCurrentCommandDisplay('Thinking...', 'info');
                    waitForSceneStabilization();
                }, 2000);
            } else {
                toggleDrawer(drawer);
                addLogEntry(`正在关闭 ${drawerName}`, 'success');
                updateCurrentCommandDisplay(`正在关闭 ${drawerName}`, 'success');
                console.log(`Closing drawer ${drawerName}`);
                
                setTimeout(() => {
                    updateCurrentCommandDisplay('Thinking...', 'info');
                    waitForSceneStabilization();
                }, 2000);
            }
        }
    }).catch(error => {
        console.error('Failed to import toggleDrawer:', error);
        const errorMsg = `无法导入抽屉控制模块`;
        addLogEntry(errorMsg, 'error');
        throw new Error(errorMsg);
    });
}


function isDrawerReadyForPlacement(drawer) {
    if (!drawer.userData.isOpen) {
        return {
            ready: false,
            reason: 'drawer_closed',
            message: `${drawer.userData.partName} 是关着的，无法放入物体`
        };
    }
    
    if (drawer.userData.isAnimating) {
        return {
            ready: false,
            reason: 'drawer_animating',
            message: `${drawer.userData.partName} 正在移动，请稍后再试`
        };
    }
    
    return { ready: true };
}


function getDrawerHierarchy(drawer) {
    const cabinet = drawer.parent;
    if (!cabinet || !cabinet.userData.partObjects) {
        return null;
    }
    
    const drawers = cabinet.userData.partObjects
        .filter(part => part.userData.isDrawer)
        .sort((a, b) => {
            return a.userData.localPosition.y - b.userData.localPosition.y;
        });
    
    return {
        drawers: drawers,
        low: drawers[0],
        middle: drawers[1],
        high: drawers[2]
    };
}


function areUpperDrawersClosed(targetDrawer) {
    const hierarchy = getDrawerHierarchy(targetDrawer);
    if (!hierarchy) return { closed: true, openDrawers: [], requiredToClose: [] };
    
    const targetY = targetDrawer.userData.localPosition.y;
    const upperDrawers = hierarchy.drawers.filter(d => 
        d.userData.localPosition.y > targetY
    );
    
    const openUpperDrawers = upperDrawers.filter(d => d.userData.isOpen);
    
    return {
        closed: openUpperDrawers.length === 0,
        openDrawers: openUpperDrawers,
        requiredToClose: openUpperDrawers.map(d => d.userData.partName)
    };
}


export function moveObjectIntoDrawer(sourceObject, drawer) {
    console.log(`🚪 moveObjectIntoDrawer called`);
    console.log(`  Source:`, sourceObject.userData.assetId || sourceObject.userData.type);
    console.log(`  Target drawer:`, drawer.userData.partName);
    
    const drawerStatus = isDrawerReadyForPlacement(drawer);
    if (!drawerStatus.ready) {
        console.error(drawerStatus.message);
        addLogEntry(drawerStatus.message, 'error');
        updateCurrentCommandDisplay(drawerStatus.message, 'error');
        setTimeout(() => {
            updateCurrentCommandDisplay('Thinking...', 'info');
        }, 3000);
        throw new Error(drawerStatus.message);
    }
    
    const upperStatus = areUpperDrawersClosed(drawer);
    if (!upperStatus.closed) {
        const openList = upperStatus.requiredToClose.map(name => {
            const cabinet = drawer.parent.userData.assetId || 'cabinet';
            return `${cabinet}/${name}`;
        }).join(', ');
        const msg = `请先关闭上层抽屉: ${openList}`;
        console.error(msg);
        addLogEntry(msg, 'error');
        updateCurrentCommandDisplay(msg, 'error');
        setTimeout(() => {
            updateCurrentCommandDisplay('Thinking...', 'info');
        }, 3000);
        throw new Error(msg);
    }
    
    const drawerBody = drawer.userData.physicsBody;
    if (!drawerBody) {
        const msg = '抽屉物理体错误';
        console.error(msg);
        addLogEntry(msg, 'error');
        throw new Error(msg);
    }
    
    const drawerSize = drawer.userData.drawerSize;
    const drawerPos = drawerBody.position;
    
    console.log(`📏 Drawer size: (${drawerSize.x.toFixed(2)}, ${drawerSize.y.toFixed(2)}, ${drawerSize.z.toFixed(2)})`);
    console.log(`📍 Drawer position: (${drawerPos.x.toFixed(2)}, ${drawerPos.y.toFixed(2)}, ${drawerPos.z.toFixed(2)})`);
    
    const objectsInDrawer = findObjectsInDrawer(drawerBody, drawerSize);
    console.log(`📦 Drawer contains ${objectsInDrawer.length} objects`);
    
    const maxCapacity = 8;
    if (objectsInDrawer.length >= maxCapacity) {
        const msg = `抽屉已满(最多${maxCapacity}个物体)，无法放入更多`;
        console.warn(msg);
        addLogEntry(msg, 'error');
        updateCurrentCommandDisplay(msg, 'error');
        setTimeout(() => {
            updateCurrentCommandDisplay('Thinking...', 'info');
        }, 3000);
        throw new Error(msg);
    }
    
    console.log(`🔍 使用智能栅格系统为物体寻找最佳位置...`);
    addLogEntry('使用智能栅格系统寻找抽屉内的最佳位置', 'info');
    
    drawerGridPlacement.initFromDrawer(drawer);
    
    const bestPlacement = drawerGridPlacement.findBestPlacement(
        sourceObject,
        drawer,
        drawerPos.x,
        drawerPos.z,
        0
    );
    
    if (!bestPlacement) {
        const msg = '抽屉内没有足够空间放置该物体';
        console.warn(msg);
        addLogEntry(msg, 'error');
        updateCurrentCommandDisplay(msg, 'error');
        setTimeout(() => {
            updateCurrentCommandDisplay('Thinking...', 'info');
        }, 3000);
        throw new Error(msg);
    }
    
    const rotatedHeight = bestPlacement.rotatedSize ? bestPlacement.rotatedSize.height : getObjectHeight(sourceObject);
    const targetY = drawerPos.y - drawerSize.y/2 + rotatedHeight/2 + 0.5;
    
    const targetPosition = {
        x: bestPlacement.x,
        y: targetY,
        z: bestPlacement.z
    };
    
    if (bestPlacement.rotation !== 0 && bestPlacement.rotationAxis) {
        targetPosition.rotation = bestPlacement.rotation;
        targetPosition.rotationAxis = bestPlacement.rotationAxis;
    }
    
    console.log(`🎯 智能放置找到最佳位置: (${targetPosition.x.toFixed(2)}, ${targetPosition.y.toFixed(2)}, ${targetPosition.z.toFixed(2)})`);
    if (bestPlacement.rotation !== 0) {
        console.log(`🔄 物体将绕 ${bestPlacement.rotationAxis} 轴旋转 ${(bestPlacement.rotation * 180 / Math.PI).toFixed(0)} 度`);
    }
    addLogEntry(`将物体放入抽屉 ${drawer.userData.partName}`, 'success');
    
    const containedObjects = findContainedObjects(sourceObject);
    console.log(`🚀 Calling animateObjectMovement...`);
    
    if (bestPlacement.rotation !== 0) {
        animateObjectMovementWithRotation(sourceObject, targetPosition, containedObjects);
    } else {
        animateObjectMovement(sourceObject, targetPosition, containedObjects);
    }
    
    console.log(`✅ animateObjectMovement completed`);
}


function findObjectsInDrawer(drawerBody, drawerSize) {
    const boundObjects = [];
    const drawerPos = drawerBody.position;
    
    const sceneObjects = [];
    
    if (state.liberoAssets) {
        state.liberoAssets.forEach(asset => {
            if (asset.userData && asset.userData.physicsBody) {
                sceneObjects.push(asset);
            }
        });
    }
    
    if (state.cubes) {
        state.cubes.forEach(cube => sceneObjects.push(cube));
    }
    if (state.mugs) {
        state.mugs.forEach(mug => sceneObjects.push(mug));
    }
    if (state.boxes) {
        state.boxes.forEach(box => sceneObjects.push(box));
    }
    
    sceneObjects.forEach(obj => {
        if (!obj.userData.physicsBody) return;
        
        const objBody = obj.userData.physicsBody;
        const objPos = objBody.position;
        
        const dx = Math.abs(objPos.x - drawerPos.x);
        const dy = Math.abs(objPos.y - drawerPos.y);
        const dz = Math.abs(objPos.z - drawerPos.z);
        
        const halfSizeX = drawerSize.x / 2;
        const halfSizeY = drawerSize.y / 2;
        const halfSizeZ = drawerSize.z / 2;
        const tolerance = 1.0;
        
        if (dx < halfSizeX - tolerance &&
            dy < halfSizeY - tolerance &&
            dz < halfSizeZ - tolerance) {
            boundObjects.push(obj);
        }
    });
    
    return boundObjects;
}

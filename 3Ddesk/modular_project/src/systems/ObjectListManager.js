

import * as THREE from 'three';
import { state, setBoxes, setBoxesWithLid, setMugs, setCubes, setLiberoAssets } from '../core/GlobalState.js';
import { updateObjectNameMapping } from '../utils/ObjectNaming.js';
import { unmarkAssetLoaded } from '../objects/AssetLoader.js';


export function openObjectList() {
    const overlay = document.getElementById('object-list-overlay');
    const dialog = document.getElementById('object-list-dialog');
    
    overlay.style.display = 'block';
    dialog.style.display = 'block';
    
    refreshObjectList();
}


export function closeObjectList() {
    const overlay = document.getElementById('object-list-overlay');
    const dialog = document.getElementById('object-list-dialog');
    
    overlay.style.display = 'none';
    dialog.style.display = 'none';
}


function refreshObjectList() {
    const container = document.getElementById('object-list-container');
    if (!container) {
        console.error('❌ object-list-container not found!');
        return;
    }
    
    container.innerHTML = '';
    
    const objects = getAllSceneObjects();
    
    console.log(`🎯 Creating list items for ${objects.length} objects`);
    
    if (objects.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #888; padding: 20px;">场景中没有物体</div>';
        return;
    }
    
    objects.forEach((obj, index) => {
        console.log(`   Creating item ${index + 1}: ${obj.name} (${obj.type})`);
        const item = createObjectListItem(obj);
        container.appendChild(item);
        console.log(`   ✓ Item ${index + 1} added to container`);
    });
    
    console.log(`✅ Object list refreshed: ${objects.length} objects`);
    console.log(`   Container now has ${container.children.length} children`);
}


function getAllSceneObjects() {
    const objects = [];
    
    const boxes = state.boxes || [];
    const boxesWithLid = state.boxesWithLid || [];
    const mugs = state.mugs || [];
    const cubes = state.cubes || [];
    const liberoAssets = state.liberoAssets || [];
    
    console.log(`🔍 Getting scene objects:`, {
        boxes: boxes.length,
        boxesWithLid: boxesWithLid.length,
        mugs: mugs.length,
        cubes: cubes.length,
        liberoAssets: liberoAssets.length
    });
    
    boxes.forEach((box, index) => {
        const body = box.userData.body || box.userData.physicsBody;
        const position = body ? {
            x: body.position.x.toFixed(2),
            y: body.position.y.toFixed(2),
            z: body.position.z.toFixed(2)
        } : null;
        
        objects.push({
            id: `box_${index}`,
            name: box.name || box.userData.name || `box_${index}`,
            type: 'box',
            color: box.userData.color || 'unknown',
            position: position,
            object: box,
            body: body
        });
    });
    
    boxesWithLid.forEach((box, index) => {
        const body = box.userData.body || box.userData.physicsBody;
        const position = body ? {
            x: body.position.x.toFixed(2),
            y: body.position.y.toFixed(2),
            z: body.position.z.toFixed(2)
        } : null;
        
        objects.push({
            id: `box_with_lid_${index}`,
            name: box.name || box.userData.name || `box_with_lid_${index}`,
            type: 'box_with_lid',
            color: box.userData.color || 'unknown',
            isOpen: box.userData.isOpen || false,
            position: position,
            object: box,
            body: body
        });
    });
    
    mugs.forEach((mug, index) => {
        const body = mug.userData.body || mug.userData.physicsBody;
        const position = body ? {
            x: body.position.x.toFixed(2),
            y: body.position.y.toFixed(2),
            z: body.position.z.toFixed(2)
        } : null;
        
        objects.push({
            id: `mug_${index}`,
            name: mug.name || mug.userData.name || `mug_${index}`,
            type: 'mug',
            color: mug.userData.color || 'unknown',
            position: position,
            object: mug,
            body: body
        });
    });
    
    cubes.forEach((cube, index) => {
        const body = cube.userData.body || cube.userData.physicsBody;
        const position = body ? {
            x: body.position.x.toFixed(2),
            y: body.position.y.toFixed(2),
            z: body.position.z.toFixed(2)
        } : null;
        
        objects.push({
            id: `cube_${index}`,
            name: cube.name || cube.userData.name || `cube_${index}`,
            type: 'cube',
            color: cube.userData.color || 'unknown',
            position: position,
            object: cube,
            body: body
        });
    });
    
    liberoAssets.forEach((asset, index) => {
        const body = asset.userData.body || asset.userData.physicsBody;
        const position = body ? {
            x: body.position.x.toFixed(2),
            y: body.position.y.toFixed(2),
            z: body.position.z.toFixed(2)
        } : null;
        
        const isArticulated = asset.userData.isArticulated || false;
        const assetId = asset.userData.assetId || 'unknown';
        
        objects.push({
            id: `libero_asset_${index}`,
            name: asset.name || asset.userData.name || assetId,
            type: isArticulated ? 'articulated_object' : 'libero_asset',
            assetId: assetId,
            position: position,
            object: asset,
            body: body
        });
    });
    
    return objects;
}


function createObjectListItem(objData) {
    const item = document.createElement('div');
    item.className = 'object-item';
    
    const infoDiv = document.createElement('div');
    infoDiv.className = 'object-info';
    
    const nameDiv = document.createElement('div');
    nameDiv.className = 'object-name';
    nameDiv.textContent = objData.name;
    infoDiv.appendChild(nameDiv);
    
    const typeDiv = document.createElement('div');
    typeDiv.className = 'object-type';
    let typeText = objData.type;
    if (objData.color && objData.color !== 'unknown') {
        typeText += ` (${objData.color})`;
    }
    if (objData.isOpen !== undefined) {
        typeText += objData.isOpen ? ' [打开]' : ' [关闭]';
    }
    typeDiv.textContent = typeText;
    infoDiv.appendChild(typeDiv);
    
    if (objData.position) {
        const posDiv = document.createElement('div');
        posDiv.className = 'object-position';
        posDiv.textContent = `位置: (${objData.position.x}, ${objData.position.y}, ${objData.position.z})`;
        infoDiv.appendChild(posDiv);
    }
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'object-delete-btn';
    deleteBtn.textContent = '删除';
    deleteBtn.onclick = () => deleteObject(objData);
    
    item.appendChild(infoDiv);
    item.appendChild(deleteBtn);
    
    return item;
}


export function deleteObject(objData) {
    if (!confirm(`确定要删除 "${objData.name}" 吗?`)) {
        return;
    }
    
    try {
        const obj = objData.object;
        const body = objData.body;
        
        console.log(`🗑️ Deleting object: ${objData.name}`, objData);
        
        if (objData.type === 'box_with_lid') {
            if (obj.userData.lidBody) {
                state.world.removeBody(obj.userData.lidBody);
                console.log(`   ✓ Removed lid physics body`);
            }
            
            if (obj.userData.hinge) {
                state.world.removeConstraint(obj.userData.hinge);
                console.log(`   ✓ Removed hinge constraint`);
            }
            
            if (obj.userData.lid) {
                if (obj.userData.lid.parent) {
                    obj.userData.lid.parent.remove(obj.userData.lid);
                } else if (state.scene) {
                    state.scene.remove(obj.userData.lid);
                }
                console.log(`   ✓ Removed lid visual model`);
            }
        }
        
        if (body) {
            state.world.removeBody(body);
            console.log(`   ✓ Removed main physics body`);
        }
        
        if (obj.parent) {
            obj.parent.remove(obj);
            console.log(`   ✓ Removed from parent`);
        } else if (state.scene) {
            state.scene.remove(obj);
            console.log(`   ✓ Removed from scene`);
        }
        
        const type = objData.type;
        if (type === 'box') {
            const newBoxes = state.boxes.filter(b => b !== obj);
            setBoxes(newBoxes);
            console.log(`   ✓ Updated boxes array: ${newBoxes.length} remaining`);
        } else if (type === 'box_with_lid') {
            const newBoxesWithLid = state.boxesWithLid.filter(b => b !== obj);
            setBoxesWithLid(newBoxesWithLid);
            console.log(`   ✓ Updated boxesWithLid array: ${newBoxesWithLid.length} remaining`);
        } else if (type === 'mug') {
            const newMugs = state.mugs.filter(m => m !== obj);
            setMugs(newMugs);
            console.log(`   ✓ Updated mugs array: ${newMugs.length} remaining`);
        } else if (type === 'cube') {
            const newCubes = state.cubes.filter(c => c !== obj);
            setCubes(newCubes);
            console.log(`   ✓ Updated cubes array: ${newCubes.length} remaining`);
        } else if (type === 'libero_asset' || type === 'articulated_object') {
            if (obj.userData.isArticulated) {
                obj.traverse(child => {
                    if (child.userData.physicsBody) {
                        state.world.removeBody(child.userData.physicsBody);
                    }
                });
                console.log(`   ✓ Removed articulated object physics bodies`);
            }
            
            if (obj.userData.assetId) {
                unmarkAssetLoaded(obj.userData.assetId);
                console.log(`   ✓ Unmarked asset: ${obj.userData.assetId}`);
            }
            
            const newLiberoAssets = state.liberoAssets.filter(a => a !== obj);
            setLiberoAssets(newLiberoAssets);
            console.log(`   ✓ Updated liberoAssets array: ${newLiberoAssets.length} remaining`);
        }
        
        updateObjectNameMapping();
        refreshObjectList();
        
        console.log(`✅ Successfully deleted: ${objData.name}`);
        
        if (state.sceneGraphTopic) {
            publishSceneGraph();
        }
        
    } catch (error) {
        console.error(`❌ Failed to delete object ${objData.name}:`, error);
        alert(`删除失败: ${error.message}\n\n请查看Console获取详细信息`);
    }
}


function publishSceneGraph() {
    if (!state.sceneGraphTopic) return;
    
    const sceneGraphString = generateSceneGraphString();
    
    try {
        const message = new ROSLIB.Message({
            data: sceneGraphString
        });
        state.sceneGraphTopic.publish(message);
        console.log('📡 Scene graph published after object deletion');
    } catch (error) {
        console.warn('⚠️ Failed to publish scene graph:', error);
    }
}


function generateSceneGraphString() {
    const edges = [];
    
    function analyzeObject(obj, parentName = null) {
        if (!obj || !obj.userData) return;
        
        let objName = null;
        let objType = null;
        
        if (obj.userData.name) {
            objName = obj.userData.name;
        } else if (obj.userData.assetId) {
            objName = obj.userData.assetId;
            objType = 'asset';
        } else if (obj.userData.color) {
            objType = obj.userData.type || 'object';
            objName = `${objType}_${obj.userData.color}`;
        }
        
        if (!objName) return;
        
        const body = obj.userData.body || obj.userData.physicsBody;
        if (!body) return;
        
        const objPos = body.position;
        const objPosVec3 = new THREE.Vector3(objPos.x, objPos.y, objPos.z);
        
        const isInHand = state.objectsInHand && state.objectsInHand.has(obj);
        
        if (isInHand) {
            edges.push(`${objName}(in)gripper`);
        }
        
        if (parentName) {
            edges.push(`${objName}(in)${parentName}`);
        } else {
            const onTable = isOnTable(objPosVec3);
            if (onTable) {
                edges.push(`${objName}(on)table`);
            } else {
                edges.push(`${objName}(out)table`);
            }
        }
    }
    
    function isOnTable(position) {
        const tableHeight = 0;
        const threshold = 5;
        return Math.abs(position.y - tableHeight) < threshold && 
               Math.abs(position.x) < 110 && 
               Math.abs(position.z) < 80;
    }
    
    if (state.boxes) {
        state.boxes.forEach(box => analyzeObject(box));
    }
    if (state.boxesWithLid) {
        state.boxesWithLid.forEach(box => analyzeObject(box));
    }
    if (state.mugs) {
        state.mugs.forEach(mug => analyzeObject(mug));
    }
    if (state.cubes) {
        state.cubes.forEach(cube => analyzeObject(cube));
    }
    if (state.liberoAssets) {
        state.liberoAssets.forEach(asset => {
            if (asset.userData.isArticulated) {
                analyzeObject(asset);
            } else {
                analyzeObject(asset);
            }
        });
    }
    
    const sceneGraphStr = edges.join(', ');
    return sceneGraphStr || 'empty scene';
}

export { deleteObject as deleteObjectById };

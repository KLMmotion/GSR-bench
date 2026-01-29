

import * as THREE from 'three';
import { state } from '../core/GlobalState.js';


function getPhysicsBody(object) {
    return object.userData.physicsBody || object.userData.body;
}


export function isLidOpen(boxWithLid) {
    if (!boxWithLid || boxWithLid.userData.type !== 'box_with_lid') {
        return false;
    }
    
    const lidBody = boxWithLid.userData.lidBody;
    if (!lidBody) {
        return false;
    }
    
    const quat = lidBody.quaternion;
    
    const angle = 2 * Math.asin(Math.max(-1, Math.min(1, quat.x)));
    
    const angleDegrees = Math.abs(angle * 180 / Math.PI);
    
    const threshold = 30;
    const isOpen = angleDegrees > threshold;
    
    boxWithLid.userData.isOpen = isOpen;
    
    return isOpen;
}


export function isOnTable(position, objectHeight = 0) {
    const tableTop = 2;
    const tolerance = 6;

    const objectBottom = objectHeight > 0 ? position.y - objectHeight / 2 : position.y;
    const objectTop = objectHeight > 0 ? position.y + objectHeight / 2 : position.y;

    const withinBounds = (
        Math.abs(position.x) < 88 &&
        Math.abs(position.z) < 43
    );

    const onSurface = objectBottom >= tableTop - 1 && objectBottom <= tableTop + 3;

    return withinBounds && onSurface;
}


export function isMugInBox(mug, box) {
    if (!mug.userData.physicsBody || !box.userData.physicsBody) return false;
    
    const mugPos = mug.userData.physicsBody.position;
    const boxPos = box.userData.physicsBody.position;
    
    const boxHalfWidth = 12.5;
    const boxHalfDepth = 8.5;
    const boxHeight = 8;
    const mugHeight = 5;
    
    const horizontallyInside = (
        Math.abs(mugPos.x - boxPos.x) < boxHalfWidth - 0.2 &&
        Math.abs(mugPos.z - boxPos.z) < boxHalfDepth - 0.2
    );
    
    const boxBottom = boxPos.y - boxHeight/2;
    const boxTop = boxPos.y + boxHeight/2;
    const mugBottom = mugPos.y - mugHeight/2;
    const mugTop = mugPos.y + mugHeight/2;
    
    const verticallyInside = (
        mugBottom > boxBottom - 1 &&
        mugPos.y < boxTop + 2 &&
        mugTop < boxTop + 3
    );
    
    return horizontallyInside && verticallyInside;
}


export function isBoxOnBox(box1, box2) {
    if (!box1.userData.physicsBody || !box2.userData.physicsBody) return false;
    
    const pos1 = box1.userData.physicsBody.position;
    const pos2 = box2.userData.physicsBody.position;
    
    const boxHalfWidth = 12.5;
    const boxHalfDepth = 8.5;
    const boxHeight = 9;
    
    const xOverlap = Math.max(0, Math.min(pos1.x + boxHalfWidth, pos2.x + boxHalfWidth) - 
                                Math.max(pos1.x - boxHalfWidth, pos2.x - boxHalfWidth));
    const zOverlap = Math.max(0, Math.min(pos1.z + boxHalfDepth, pos2.z + boxHalfDepth) - 
                                Math.max(pos1.z - boxHalfDepth, pos2.z - boxHalfDepth));
    
    const box2Top = pos2.y + boxHeight/2;
    const box1Bottom = pos1.y - boxHeight/2;
    const verticalContact = Math.abs(box1Bottom - box2Top) < 2;
    
    return (xOverlap > 5 && zOverlap > 5 && verticalContact && pos1.y > pos2.y);
}


export function isOnBoxWithLid(object, boxWithLid, objectHeight = 0) {
    const objectBody = object.userData.physicsBody || object.userData.body;
    const boxBody = boxWithLid.userData.body;
    
    if (!objectBody || !boxBody) return false;
    
    const objectPos = objectBody.position;
    const boxPos = boxBody.position;
    
    const boxHalfWidth = 13;
    const boxHalfDepth = 9;
    const boxHeight = 9;
    const lidHeight = 1.5;
    
    const isClosed = !isLidOpen(boxWithLid);
    
    if (!isClosed) {
        return false;
    }
    
    const withinBounds = (
        Math.abs(objectPos.x - boxPos.x) < boxHalfWidth - 1 &&
        Math.abs(objectPos.z - boxPos.z) < boxHalfDepth - 1
    );
    
    const topSurface = boxPos.y + boxHeight/2 + lidHeight/2;
    const objectBottom = objectHeight > 0 ? objectPos.y - objectHeight / 2 : objectPos.y;
    
    const verticalContact = Math.abs(objectBottom - topSurface) < 2;
    
    return withinBounds && verticalContact && objectPos.y > boxPos.y;
}


export function isInBoxWithLid(object, boxWithLid, objectHeight = 0) {
    const objectBody = object.userData.physicsBody || object.userData.body;
    const boxBody = boxWithLid.userData.body;
    
    if (!objectBody || !boxBody) return false;
    
    const objectPos = objectBody.position;
    const boxPos = boxBody.position;
    
    const boxHalfWidth = 12.5;
    const boxHalfDepth = 8.5;
    const boxHeight = 8;
    
    const height = objectHeight > 0 ? objectHeight : 
                  object.userData.type === 'mug' ? 5 : 
                  object.userData.type === 'cube' ? 3 : 8;
    
    const horizontallyInside = (
        Math.abs(objectPos.x - boxPos.x) < boxHalfWidth - 0.2 &&
        Math.abs(objectPos.z - boxPos.z) < boxHalfDepth - 0.2
    );
    
    const boxBottom = boxPos.y - boxHeight/2;
    const boxTop = boxPos.y + boxHeight/2;
    const objectBottom = objectPos.y - height/2;
    const objectTop = objectPos.y + height/2;
    
    const verticallyInside = (
        objectBottom > boxBottom - 1 &&
        objectPos.y < boxTop + 2 &&
        objectTop < boxTop + 3
    );
    
    return horizontallyInside && verticallyInside;
}


export function isBoxWithLidOnBox(boxWithLid, box) {
    const boxWithLidBody = boxWithLid.userData.body;
    const boxBody = box.userData.physicsBody;
    
    if (!boxWithLidBody || !boxBody) return false;
    
    const pos1 = boxWithLidBody.position;
    const pos2 = boxBody.position;
    
    const boxHalfWidth = 12.5;
    const boxHalfDepth = 8.5;
    const boxHeight = 9;
    
    const xOverlap = Math.max(0, Math.min(pos1.x + boxHalfWidth, pos2.x + boxHalfWidth) - 
                                Math.max(pos1.x - boxHalfWidth, pos2.x - boxHalfWidth));
    const zOverlap = Math.max(0, Math.min(pos1.z + boxHalfDepth, pos2.z + boxHalfDepth) - 
                                Math.max(pos1.z - boxHalfDepth, pos2.z - boxHalfDepth));
    
    const box2Top = pos2.y + boxHeight/2;
    const box1Bottom = pos1.y - boxHeight/2;
    const verticalContact = Math.abs(box1Bottom - box2Top) < 2;
    
    return (xOverlap > 5 && zOverlap > 5 && verticalContact && pos1.y > pos2.y);
}


export function isBoxWithLidOnBoxWithLid(boxWithLid1, boxWithLid2) {
    const body1 = boxWithLid1.userData.body;
    const body2 = boxWithLid2.userData.body;
    
    if (!body1 || !body2) return false;
    
    const pos1 = body1.position;
    const pos2 = body2.position;
    
    const boxHalfWidth = 12.5;
    const boxHalfDepth = 8.5;
    const boxHeight = 9;
    const lidHeight = 1.5;
    
    const xOverlap = Math.max(0, Math.min(pos1.x + boxHalfWidth, pos2.x + boxHalfWidth) - 
                                Math.max(pos1.x - boxHalfWidth, pos2.x - boxHalfWidth));
    const zOverlap = Math.max(0, Math.min(pos1.z + boxHalfDepth, pos2.z + boxHalfDepth) - 
                                Math.max(pos1.z - boxHalfDepth, pos2.z - boxHalfDepth));
    
    const box2Closed = !isLidOpen(boxWithLid2);
    const box2Top = pos2.y + boxHeight/2 + (box2Closed ? lidHeight/2 : 0);
    const box1Bottom = pos1.y - boxHeight/2;
    const verticalContact = Math.abs(box1Bottom - box2Top) < 2;
    
    return (xOverlap > 5 && zOverlap > 5 && verticalContact && pos1.y > pos2.y);
}


export function isBoxOnBoxWithLid(box, boxWithLid) {
    const boxBody = box.userData.physicsBody;
    const boxWithLidBody = boxWithLid.userData.body;
    
    if (!boxBody || !boxWithLidBody) return false;
    
    const pos1 = boxBody.position;
    const pos2 = boxWithLidBody.position;
    
    const boxHalfWidth = 12.5;
    const boxHalfDepth = 8.5;
    const boxHeight = 9;
    const lidHeight = 1.5;
    
    const xOverlap = Math.max(0, Math.min(pos1.x + boxHalfWidth, pos2.x + boxHalfWidth) - 
                                Math.max(pos1.x - boxHalfWidth, pos2.x - boxHalfWidth));
    const zOverlap = Math.max(0, Math.min(pos1.z + boxHalfDepth, pos2.z + boxHalfDepth) - 
                                Math.max(pos1.z - boxHalfDepth, pos2.z - boxHalfDepth));
    
    const isClosed = !isLidOpen(boxWithLid);
    const box2Top = pos2.y + boxHeight/2 + (isClosed ? lidHeight/2 : 0);
    const box1Bottom = pos1.y - boxHeight/2;
    const verticalContact = Math.abs(box1Bottom - box2Top) < 2;
    
    return (xOverlap > 5 && zOverlap > 5 && verticalContact && pos1.y > pos2.y);
}


export function isMugOnBox(mug, box) {
    if (!mug.userData.physicsBody || !box.userData.physicsBody) return false;
    
    const mugPos = mug.userData.physicsBody.position;
    const boxPos = box.userData.physicsBody.position;
    
    const boxHalfWidth = 12.5;
    const boxHalfDepth = 8.5;
    const boxHeight = 8;
    const mugHeight = 5;
    
    const withinBounds = (
        Math.abs(mugPos.x - boxPos.x) < boxHalfWidth - 1 &&
        Math.abs(mugPos.z - boxPos.z) < boxHalfDepth - 1
    );
    
    const boxTop = boxPos.y + boxHeight/2;
    const mugBottom = mugPos.y - mugHeight/2;
    const verticalContact = Math.abs(mugBottom - boxTop) < 2;
    
    return withinBounds && verticalContact && mugPos.y > boxPos.y;
}


export function isBoxOnMug(box, mug) {
    const boxBody = getPhysicsBody(box);
    const mugBody = getPhysicsBody(mug);
    
    if (!boxBody || !mugBody) return false;
    
    const boxPos = boxBody.position;
    const mugPos = mugBody.position;
    
    const mugRadius = 2.5;
    const mugHeight = 5;
    const boxHeight = 8;
    
    const horizontalDistance = Math.sqrt(
        Math.pow(boxPos.x - mugPos.x, 2) + 
        Math.pow(boxPos.z - mugPos.z, 2)
    );
    
    const mugTop = mugPos.y + mugHeight/2;
    const boxBottom = boxPos.y - boxHeight/2;
    const verticalContact = Math.abs(boxBottom - mugTop) < 2;
    
    return horizontalDistance < mugRadius && verticalContact && boxPos.y > mugPos.y;
}


export function isCubeInBox(cube, box) {
    if (!cube.userData.physicsBody || !box.userData.physicsBody) return false;
    
    const cubePos = cube.userData.physicsBody.position;
    const boxPos = box.userData.physicsBody.position;
    
    const boxHalfWidth = 12.5;
    const boxHalfDepth = 8.5;
    const boxHeight = 8;
    const cubeSize = 3;
    
    const horizontallyInside = (
        Math.abs(cubePos.x - boxPos.x) < boxHalfWidth - 0.2 &&
        Math.abs(cubePos.z - boxPos.z) < boxHalfDepth - 0.2
    );
    
    const boxBottom = boxPos.y - boxHeight/2;
    const boxTop = boxPos.y + boxHeight/2;
    const cubeBottom = cubePos.y - cubeSize/2;
    const cubeTop = cubePos.y + cubeSize/2;
    
    const verticallyInside = (
        cubeBottom > boxBottom - 1 &&
        cubePos.y < boxTop + 2 &&
        cubeTop < boxTop + 3
    );
    
    return horizontallyInside && verticallyInside;
}


export function isCubeOnBox(cube, box) {
    if (!cube.userData.physicsBody || !box.userData.physicsBody) return false;
    
    const cubePos = cube.userData.physicsBody.position;
    const boxPos = box.userData.physicsBody.position;
    
    const boxHalfWidth = 12.5;
    const boxHalfDepth = 8.5;
    const boxHeight = 8;
    const cubeSize = 3;
    
    const withinBounds = (
        Math.abs(cubePos.x - boxPos.x) < boxHalfWidth - 1 &&
        Math.abs(cubePos.z - boxPos.z) < boxHalfDepth - 1
    );
    
    const boxTop = boxPos.y + boxHeight/2;
    const cubeBottom = cubePos.y - cubeSize/2;
    const verticalContact = Math.abs(cubeBottom - boxTop) < 2;
    
    return withinBounds && verticalContact && cubePos.y > boxPos.y;
}


export function analyzeScene() {
    const boxes = state.boxes;
    const boxesWithLid = state.boxesWithLid;
    const mugs = state.mugs;
    const cubes = state.cubes;
    const objectNameMap = state.objectNameMap;
    const objectsInHand = state.objectsInHand;
    
    const nodes = ['table'];
    
    const getNodeNameWithState = (baseName, obj) => {
        if (obj && obj.userData && obj.userData.type === 'box_with_lid') {
            const state = isLidOpen(obj) ? 'open' : 'closed';
            return `${baseName}(${state})`;
        }
        if (obj && obj.userData && obj.userData.isDrawer) {
            const state = obj.userData.isOpen ? 'open' : 'closed';
            return `${baseName}(${state})`;
        }
        return baseName;
    };
    
    Object.entries(objectNameMap).forEach(([key, name]) => {
        if (name === 'table') return;
        
        if (key.startsWith('drawer_')) {
            let drawerObj = null;
            if (state.liberoAssets) {
                state.liberoAssets.forEach(asset => {
                    if (asset.userData?.isArticulated && asset.userData?.partObjects) {
                        const drawer = asset.userData.partObjects.find(
                            part => part.userData?.isDrawer && part.userData?.partName === key
                        );
                        if (drawer) drawerObj = drawer;
                    }
                });
            }
            
            const nodeName = getNodeNameWithState(name, drawerObj);
            nodes.push(nodeName);
            return;
        }
        
        let obj = null;
        if (key.startsWith('lid_box_')) {
            const index = parseInt(key.split('_')[2]);
            obj = boxesWithLid[index];
        } else if (key.startsWith('box_')) {
            const index = parseInt(key.split('_')[1]);
            obj = boxes[index];
        } else if (key.startsWith('mug_')) {
            const index = parseInt(key.split('_')[1]);
            obj = mugs[index];
        } else if (key.startsWith('cube_')) {
            const index = parseInt(key.split('_')[1]);
            obj = cubes[index];
        } else if (state.liberoAssets) {
            obj = state.liberoAssets.find(asset => asset.userData?.assetId === key);
        }
        
        const nodeName = getNodeNameWithState(name, obj);
        nodes.push(nodeName);
    });
    
    const edges = [];
    
    boxes.forEach((box, index) => {
        const boxName = objectNameMap[`box_${index}`];
        const boxPos = box.userData.physicsBody.position;
        
        if (objectsInHand.has(box)) {
            edges.push(`${boxName}(in)hand`);
            return;
        }
        
        if (isOnTable(boxPos, 8)) {
            edges.push(`${boxName}(on)table`);
        } else {
            let isOnSomething = false;
            
            boxes.forEach((otherBox, otherIndex) => {
                if (index !== otherIndex && isBoxOnBox(box, otherBox)) {
                    const otherBoxName = objectNameMap[`box_${otherIndex}`];
                    edges.push(`${boxName}(on)${otherBoxName}`);
                    isOnSomething = true;
                }
            });
            
            boxesWithLid.forEach((boxWithLid, lidIndex) => {
                if (isBoxOnBoxWithLid(box, boxWithLid)) {
                    const lidBoxName = objectNameMap[`lid_box_${lidIndex}`];
                    edges.push(`${boxName}(on)${lidBoxName}`);
                    isOnSomething = true;
                }
            });
            
            mugs.forEach((mug, mugIndex) => {
                if (isBoxOnMug(box, mug)) {
                    const mugName = objectNameMap[`mug_${mugIndex}`];
                    edges.push(`${boxName}(on)${mugName}`);
                    isOnSomething = true;
                }
            });
            
            if (!isOnSomething) {
                edges.push(`${boxName}(out)table`);
            }
        }
    });
    
    mugs.forEach((mug, index) => {
        const mugName = objectNameMap[`mug_${index}`];
        const mugPos = mug.userData.physicsBody.position;
        
        if (objectsInHand.has(mug)) {
            edges.push(`${mugName}(in)hand`);
            return;
        }
        
        let closestDrawer = null;
        let minDrawerDistance = Infinity;
        
        state.liberoAssets.forEach(asset => {
            if (asset.userData?.assetId === 'short_cabinet') {
                asset.traverse(child => {
                    if (child.userData?.isDrawer) {
                        const drawerKey = child.userData.partName;
                        const drawerName = objectNameMap[drawerKey];
                        const drawerBody = child.userData?.physicsBody;
                        
                        if (!drawerBody || !drawerName) return;
                        
                        const mugBody = mug.userData.physicsBody;
                        const mugPos_check = mugBody.position;
                        const drawerPos = drawerBody.position;
                        const drawerSize = child.userData.drawerSize;
                        
                        const halfWidth = drawerSize.x / 2;
                        const halfDepth = drawerSize.z / 2;
                        const halfHeight = drawerSize.y / 2;
                        
                        const horizontallyInside = (
                            Math.abs(mugPos_check.x - drawerPos.x) < halfWidth - 1 &&
                            Math.abs(mugPos_check.z - drawerPos.z) < halfDepth - 1
                        );
                        
                        const drawerBottom = drawerPos.y - halfHeight;
                        const drawerTop = drawerPos.y + halfHeight;
                        const mugBottom = mugPos_check.y - 2.5;
                        const mugTop = mugPos_check.y + 2.5;
                        
                        const verticallyInside = (
                            mugBottom > drawerBottom - 1 &&
                            mugTop < drawerTop + 2
                        );
                        
                        if (horizontallyInside && verticallyInside) {
                            const distance = Math.sqrt(
                                Math.pow(mugPos_check.x - drawerPos.x, 2) +
                                Math.pow(mugPos_check.y - drawerPos.y, 2) +
                                Math.pow(mugPos_check.z - drawerPos.z, 2)
                            );
                            
                            if (distance < minDrawerDistance) {
                                minDrawerDistance = distance;
                                closestDrawer = drawerName;
                            }
                        }
                    }
                });
            }
        });
        
        if (closestDrawer) {
            edges.push(`${mugName}(in)${closestDrawer}`);
            return;
        }
        
        let directContainer = null;
        let minDistance = Infinity;
        let containerType = null; // 'box', 'box_with_lid', 'bowl', 'plate'
        
        boxes.forEach((box, boxIndex) => {
            if (isMugInBox(mug, box)) {
                const boxPos = box.userData.physicsBody.position;
                const distance = Math.sqrt(
                    Math.pow(mugPos.x - boxPos.x, 2) + 
                    Math.pow(mugPos.y - boxPos.y, 2) + 
                    Math.pow(mugPos.z - boxPos.z, 2)
                );
                
                if (distance < minDistance) {
                    minDistance = distance;
                    directContainer = boxIndex;
                    containerType = 'box';
                }
            }
        });
        
        boxesWithLid.forEach((boxWithLid, lidIndex) => {
            if (isInBoxWithLid(mug, boxWithLid)) {
                const boxPos = boxWithLid.userData.body.position;
                const distance = Math.sqrt(
                    Math.pow(mugPos.x - boxPos.x, 2) + 
                    Math.pow(mugPos.y - boxPos.y, 2) + 
                    Math.pow(mugPos.z - boxPos.z, 2)
                );
                
                if (distance < minDistance) {
                    minDistance = distance;
                    directContainer = lidIndex;
                    containerType = 'box_with_lid';
                }
            }
        });
        
        state.liberoAssets.forEach((containerAsset, containerIndex) => {
            const containerAssetId = containerAsset.userData?.assetId;
            if (!containerAssetId) return;
            
            if (!containerAssetId.includes('bowl') && !containerAssetId.includes('plate')) {
                return;
            }
            
            if (isInBowlOrPlate(mug, containerAsset)) {
                const containerBody = getPhysicsBody(containerAsset);
                if (!containerBody) return;
                
                const containerPos = containerBody.position;
                const distance = Math.sqrt(
                    Math.pow(mugPos.x - containerPos.x, 2) + 
                    Math.pow(mugPos.y - containerPos.y, 2) + 
                    Math.pow(mugPos.z - containerPos.z, 2)
                );
                
                if (distance < minDistance) {
                    minDistance = distance;
                    directContainer = containerIndex;
                    containerType = containerAssetId.includes('bowl') ? 'bowl' : 'plate';
                }
            }
        });
        
        if (directContainer !== null) {
            if (containerType === 'box') {
                const boxName = objectNameMap[`box_${directContainer}`];
                edges.push(`${mugName}(in)${boxName}`);
            } else if (containerType === 'box_with_lid') {
                const lidBoxName = objectNameMap[`lid_box_${directContainer}`];
                edges.push(`${mugName}(in)${lidBoxName}`);
            } else if (containerType === 'bowl' || containerType === 'plate') {
                const containerAsset = state.liberoAssets[directContainer];
                const containerAssetId = containerAsset.userData?.assetId;
                const containerName = objectNameMap[containerAssetId] || containerAssetId;
                edges.push(`${mugName}(in)${containerName}`);
            }
        } else {
            if (isOnTable(mugPos)) {
                edges.push(`${mugName}(on)table`);
            } else {
                let isOnSomething = false;
                
                boxes.forEach((box, boxIndex) => {
                    if (isMugOnBox(mug, box)) {
                        const boxName = objectNameMap[`box_${boxIndex}`];
                        edges.push(`${mugName}(on)${boxName}`);
                        isOnSomething = true;
                    }
                });
                
                boxesWithLid.forEach((boxWithLid, lidIndex) => {
                    if (isOnBoxWithLid(mug, boxWithLid)) {
                        const lidBoxName = objectNameMap[`lid_box_${lidIndex}`];
                        edges.push(`${mugName}(on)${lidBoxName}`);
                        isOnSomething = true;
                    }
                });
                
                state.liberoAssets.forEach((containerAsset, containerIndex) => {
                    const containerAssetId = containerAsset.userData?.assetId;
                    if (!containerAssetId) return;
                    
                    if (!containerAssetId.includes('bowl') && !containerAssetId.includes('plate')) {
                        return;
                    }
                    
                    if (isOnBowlOrPlate(mug, containerAsset)) {
                        const containerName = objectNameMap[containerAssetId] || containerAssetId;
                        edges.push(`${mugName}(on)${containerName}`);
                        isOnSomething = true;
                    }
                });
                
                if (!isOnSomething) {
                    edges.push(`${mugName}(out)table`);
                }
            }
        }
    });
    
    cubes.forEach((cube, index) => {
        const cubeName = objectNameMap[`cube_${index}`];
        const cubePos = cube.userData.physicsBody.position;
        
        if (objectsInHand.has(cube)) {
            edges.push(`${cubeName}(in)hand`);
            return;
        }
        
        let closestDrawer = null;
        let minDrawerDistance = Infinity;
        
        state.liberoAssets.forEach(asset => {
            if (asset.userData?.assetId === 'short_cabinet') {
                asset.traverse(child => {
                    if (child.userData?.isDrawer) {
                        const drawerKey = child.userData.partName;
                        const drawerName = objectNameMap[drawerKey];
                        const drawerBody = child.userData?.physicsBody;
                        
                        if (!drawerBody || !drawerName) return;
                        
                        const cubeBody = cube.userData.physicsBody;
                        const cubePos_check = cubeBody.position;
                        const drawerPos = drawerBody.position;
                        const drawerSize = child.userData.drawerSize;
                        
                        const halfWidth = drawerSize.x / 2;
                        const halfDepth = drawerSize.z / 2;
                        const halfHeight = drawerSize.y / 2;
                        
                        const horizontallyInside = (
                            Math.abs(cubePos_check.x - drawerPos.x) < halfWidth - 1 &&
                            Math.abs(cubePos_check.z - drawerPos.z) < halfDepth - 1
                        );
                        
                        const drawerBottom = drawerPos.y - halfHeight;
                        const drawerTop = drawerPos.y + halfHeight;
                        const cubeBottom = cubePos_check.y - 1.5;
                        const cubeTop = cubePos_check.y + 1.5;
                        
                        const verticallyInside = (
                            cubeBottom > drawerBottom - 1 &&
                            cubeTop < drawerTop + 2
                        );
                        
                        if (horizontallyInside && verticallyInside) {
                            const distance = Math.sqrt(
                                Math.pow(cubePos_check.x - drawerPos.x, 2) +
                                Math.pow(cubePos_check.y - drawerPos.y, 2) +
                                Math.pow(cubePos_check.z - drawerPos.z, 2)
                            );
                            
                            if (distance < minDrawerDistance) {
                                minDrawerDistance = distance;
                                closestDrawer = drawerName;
                            }
                        }
                    }
                });
            }
        });
        
        if (closestDrawer) {
            edges.push(`${cubeName}(in)${closestDrawer}`);
            return;
        }
        
        let directContainer = null;
        let minDistance = Infinity;
        let containerType = null; // 'box', 'box_with_lid', 'bowl', 'plate'
        
        boxes.forEach((box, boxIndex) => {
            if (isCubeInBox(cube, box)) {
                const boxPos = box.userData.physicsBody.position;
                const distance = Math.sqrt(
                    Math.pow(cubePos.x - boxPos.x, 2) + 
                    Math.pow(cubePos.y - boxPos.y, 2) + 
                    Math.pow(cubePos.z - boxPos.z, 2)
                );
                
                if (distance < minDistance) {
                    minDistance = distance;
                    directContainer = boxIndex;
                    containerType = 'box';
                }
            }
        });
        
        boxesWithLid.forEach((boxWithLid, lidIndex) => {
            if (isInBoxWithLid(cube, boxWithLid)) {
                const boxPos = boxWithLid.userData.body.position;
                const distance = Math.sqrt(
                    Math.pow(cubePos.x - boxPos.x, 2) + 
                    Math.pow(cubePos.y - boxPos.y, 2) + 
                    Math.pow(cubePos.z - boxPos.z, 2)
                );
                
                if (distance < minDistance) {
                    minDistance = distance;
                    directContainer = lidIndex;
                    containerType = 'box_with_lid';
                }
            }
        });
        
        state.liberoAssets.forEach((containerAsset, containerIndex) => {
            const containerAssetId = containerAsset.userData?.assetId;
            if (!containerAssetId) return;
            
            if (!containerAssetId.includes('bowl') && !containerAssetId.includes('plate')) {
                return;
            }
            
            if (isInBowlOrPlate(cube, containerAsset)) {
                const containerBody = getPhysicsBody(containerAsset);
                if (!containerBody) return;
                
                const containerPos = containerBody.position;
                const distance = Math.sqrt(
                    Math.pow(cubePos.x - containerPos.x, 2) + 
                    Math.pow(cubePos.y - containerPos.y, 2) + 
                    Math.pow(cubePos.z - containerPos.z, 2)
                );
                
                if (distance < minDistance) {
                    minDistance = distance;
                    directContainer = containerIndex;
                    containerType = containerAssetId.includes('bowl') ? 'bowl' : 'plate';
                }
            }
        });
        
        if (directContainer !== null) {
            if (containerType === 'box') {
                const boxName = objectNameMap[`box_${directContainer}`];
                edges.push(`${cubeName}(in)${boxName}`);
            } else if (containerType === 'box_with_lid') {
                const lidBoxName = objectNameMap[`lid_box_${directContainer}`];
                edges.push(`${cubeName}(in)${lidBoxName}`);
            } else if (containerType === 'bowl' || containerType === 'plate') {
                const containerAsset = state.liberoAssets[directContainer];
                const containerAssetId = containerAsset.userData?.assetId;
                const containerName = objectNameMap[containerAssetId] || containerAssetId;
                edges.push(`${cubeName}(in)${containerName}`);
            }
        } else {
            if (isOnTable(cubePos)) {
                edges.push(`${cubeName}(on)table`);
            } else {
                let isOnSomething = false;
                
                boxes.forEach((box, boxIndex) => {
                    if (isCubeOnBox(cube, box)) {
                        const boxName = objectNameMap[`box_${boxIndex}`];
                        edges.push(`${cubeName}(on)${boxName}`);
                        isOnSomething = true;
                    }
                });
                
                boxesWithLid.forEach((boxWithLid, lidIndex) => {
                    if (isOnBoxWithLid(cube, boxWithLid)) {
                        const lidBoxName = objectNameMap[`lid_box_${lidIndex}`];
                        edges.push(`${cubeName}(on)${lidBoxName}`);
                        isOnSomething = true;
                    }
                });
                
                state.liberoAssets.forEach((containerAsset, containerIndex) => {
                    const containerAssetId = containerAsset.userData?.assetId;
                    if (!containerAssetId) return;
                    
                    if (!containerAssetId.includes('bowl') && !containerAssetId.includes('plate')) {
                        return;
                    }
                    
                    if (isOnBowlOrPlate(cube, containerAsset)) {
                        const containerName = objectNameMap[containerAssetId] || containerAssetId;
                        edges.push(`${cubeName}(on)${containerName}`);
                        isOnSomething = true;
                    }
                });
                
                if (!isOnSomething) {
                    edges.push(`${cubeName}(out)table`);
                }
            }
        }
    });
    
    state.liberoAssets.forEach((asset, index) => {
        const assetId = asset.userData?.assetId;
        if (!assetId) {
            console.warn(`LIBERO asset at index ${index} missing assetId`);
            return;
        }
        
        const assetName = objectNameMap[assetId] || assetId;
        const assetBody = getPhysicsBody(asset);
        if (!assetBody) return;
        
        const assetPos = assetBody.position;
        
        if (objectsInHand.has(asset)) {
            edges.push(`${assetName}(in)hand`);
            return;
        }
        
        if (asset.userData?.isArticulated) {
            let assetHeight = 0;
            try {
                const box = new THREE.Box3().setFromObject(asset);
                const size = new THREE.Vector3();
                box.getSize(size);
                assetHeight = size.y;
            } catch (error) {
                assetHeight = 0;
            }
            
            if (isOnTable(assetPos, assetHeight)) {
                edges.push(`${assetName}(on)table`);
            } else {
                edges.push(`${assetName}(out)table`);
            }
            return;
        }
        
        if (assetId === 'short_cabinet') return;
        
        let closestDrawer = null;
        let minDrawerDistance = Infinity;
        
        state.liberoAssets.forEach(cabinetAsset => {
            if (cabinetAsset.userData?.assetId === 'short_cabinet') {
                cabinetAsset.traverse(child => {
                    if (child.userData?.isDrawer) {
                        const drawerKey = child.userData.partName;
                        const drawerName = objectNameMap[drawerKey];
                        const drawerBody = child.userData?.physicsBody;
                        
                        if (!drawerBody || !drawerName) return;
                        
                        const assetBody_check = asset.userData.physicsBody;
                        const assetPos_check = assetBody_check.position;
                        const drawerPos = drawerBody.position;
                        const drawerSize = child.userData.drawerSize;
                        
                        const halfWidth = drawerSize.x / 2;
                        const halfDepth = drawerSize.z / 2;
                        const halfHeight = drawerSize.y / 2;
                        
                        const horizontallyInside = (
                            Math.abs(assetPos_check.x - drawerPos.x) < halfWidth - 1 &&
                            Math.abs(assetPos_check.z - drawerPos.z) < halfDepth - 1
                        );
                        
                        const drawerBottom = drawerPos.y - halfHeight;
                        const drawerTop = drawerPos.y + halfHeight;
                        
                        let assetHeight = 0;
                        try {
                            const box = new THREE.Box3().setFromObject(asset);
                            const size = new THREE.Vector3();
                            box.getSize(size);
                            assetHeight = size.y;
                        } catch (error) {
                            assetHeight = 3;
                        }
                        
                        const assetBottom = assetPos_check.y - assetHeight / 2;
                        const assetTop = assetPos_check.y + assetHeight / 2;
                        
                        const verticallyInside = (
                            assetBottom > drawerBottom - 1 &&
                            assetTop < drawerTop + 2
                        );
                        
                        if (horizontallyInside && verticallyInside) {
                            const distance = Math.sqrt(
                                Math.pow(assetPos_check.x - drawerPos.x, 2) +
                                Math.pow(assetPos_check.y - drawerPos.y, 2) +
                                Math.pow(assetPos_check.z - drawerPos.z, 2)
                            );
                            
                            if (distance < minDrawerDistance) {
                                minDrawerDistance = distance;
                                closestDrawer = drawerName;
                            }
                        }
                    }
                });
            }
        });
        
        if (closestDrawer) {
            edges.push(`${assetName}(in)${closestDrawer}`);
            return;
        }
        
        let directContainer = null;
        let minDistance = Infinity;
        let containerType = null; // 'box', 'box_with_lid', 'bowl', 'plate'
        
        let assetHeight = 0;
        try {
            const box = new THREE.Box3().setFromObject(asset);
            const size = new THREE.Vector3();
            box.getSize(size);
            assetHeight = size.y;
        } catch (error) {
            assetHeight = 0;
        }
        
        boxes.forEach((box, boxIndex) => {
            if (isCubeInBox(asset, box)) {
                const boxPos = box.userData.physicsBody.position;
                const distance = Math.sqrt(
                    Math.pow(assetPos.x - boxPos.x, 2) + 
                    Math.pow(assetPos.y - boxPos.y, 2) + 
                    Math.pow(assetPos.z - boxPos.z, 2)
                );
                
                if (distance < minDistance) {
                    minDistance = distance;
                    directContainer = boxIndex;
                    containerType = 'box';
                }
            }
        });
        
        boxesWithLid.forEach((boxWithLid, lidIndex) => {
            if (isInBoxWithLid(asset, boxWithLid, assetHeight)) {
                const boxPos = boxWithLid.userData.body.position;
                const distance = Math.sqrt(
                    Math.pow(assetPos.x - boxPos.x, 2) + 
                    Math.pow(assetPos.y - boxPos.y, 2) + 
                    Math.pow(assetPos.z - boxPos.z, 2)
                );
                
                if (distance < minDistance) {
                    minDistance = distance;
                    directContainer = lidIndex;
                    containerType = 'box_with_lid';
                }
            }
        });
        
        state.liberoAssets.forEach((containerAsset, containerIndex) => {
            if (containerAsset === asset) return;
            
            const containerAssetId = containerAsset.userData?.assetId;
            if (!containerAssetId) return;
            
            if (!containerAssetId.includes('bowl') && !containerAssetId.includes('plate')) {
                return;
            }
            
            if (isInBowlOrPlate(asset, containerAsset)) {
                const containerBody = getPhysicsBody(containerAsset);
                if (!containerBody) return;
                
                const containerPos = containerBody.position;
                const distance = Math.sqrt(
                    Math.pow(assetPos.x - containerPos.x, 2) + 
                    Math.pow(assetPos.y - containerPos.y, 2) + 
                    Math.pow(assetPos.z - containerPos.z, 2)
                );
                
                if (distance < minDistance) {
                    minDistance = distance;
                    directContainer = containerIndex;
                    containerType = containerAssetId.includes('bowl') ? 'bowl' : 'plate';
                }
            }
        });
        
        if (directContainer !== null) {
            if (containerType === 'box') {
                const boxName = objectNameMap[`box_${directContainer}`];
                edges.push(`${assetName}(in)${boxName}`);
            } else if (containerType === 'box_with_lid') {
                const lidBoxName = objectNameMap[`lid_box_${directContainer}`];
                edges.push(`${assetName}(in)${lidBoxName}`);
            } else if (containerType === 'bowl' || containerType === 'plate') {
                const containerAsset = state.liberoAssets[directContainer];
                const containerAssetId = containerAsset.userData?.assetId;
                const containerName = objectNameMap[containerAssetId] || containerAssetId;
                edges.push(`${assetName}(in)${containerName}`);
            }
        } else {
            let assetHeight = 0;
            try {
                const box = new THREE.Box3().setFromObject(asset);
                const size = new THREE.Vector3();
                box.getSize(size);
                assetHeight = size.y;
            } catch (error) {
                assetHeight = 0;
            }
            
            if (isOnTable(assetPos, assetHeight)) {
                edges.push(`${assetName}(on)table`);
            } else {
                let isOnSomething = false;
                
                boxes.forEach((box, boxIndex) => {
                    if (isCubeOnBox(asset, box)) {
                        const boxName = objectNameMap[`box_${boxIndex}`];
                        edges.push(`${assetName}(on)${boxName}`);
                        isOnSomething = true;
                    }
                });
                
                boxesWithLid.forEach((boxWithLid, lidIndex) => {
                    if (isOnBoxWithLid(asset, boxWithLid, assetHeight)) {
                        const lidBoxName = objectNameMap[`lid_box_${lidIndex}`];
                        edges.push(`${assetName}(on)${lidBoxName}`);
                        isOnSomething = true;
                    }
                });
                
                state.liberoAssets.forEach((containerAsset, containerIndex) => {
                    const containerAssetId = containerAsset.userData?.assetId;
                    if (!containerAssetId) return;
                    
                    if (!containerAssetId.includes('bowl') && !containerAssetId.includes('plate')) {
                        return;
                    }
                    
                    if (containerAsset === asset) return;
                    
                    if (isOnBowlOrPlate(asset, containerAsset)) {
                        const containerName = objectNameMap[containerAssetId] || containerAssetId;
                        edges.push(`${assetName}(on)${containerName}`);
                        isOnSomething = true;
                    }
                });
                
                if (!isOnSomething) {
                    edges.push(`${assetName}(out)table`);
                }
            }
        }
    });
    
    boxesWithLid.forEach((boxWithLid, index) => {
        const boxName = objectNameMap[`lid_box_${index}`];
        const boxPos = boxWithLid.userData.body.position;
        
        if (objectsInHand.has(boxWithLid)) {
            edges.push(`${boxName}(in)hand`);
            return;
        }
        
        if (isOnTable(boxPos, 10.5)) {
            edges.push(`${boxName}(on)table`);
        } else {
            let isOnSomething = false;
            
            boxes.forEach((box, boxIndex) => {
                if (isBoxWithLidOnBox(boxWithLid, box)) {
                    const otherBoxName = objectNameMap[`box_${boxIndex}`];
                    edges.push(`${boxName}(on)${otherBoxName}`);
                    isOnSomething = true;
                }
            });
            
            boxesWithLid.forEach((otherBoxWithLid, otherIndex) => {
                if (index !== otherIndex && isBoxWithLidOnBoxWithLid(boxWithLid, otherBoxWithLid)) {
                    const otherBoxName = objectNameMap[`lid_box_${otherIndex}`];
                    edges.push(`${boxName}(on)${otherBoxName}`);
                    isOnSomething = true;
                }
            });
            
            mugs.forEach((mug, mugIndex) => {
                if (isBoxOnMug(boxWithLid, mug)) {
                    const mugName = objectNameMap[`mug_${mugIndex}`];
                    edges.push(`${boxName}(on)${mugName}`);
                    isOnSomething = true;
                }
            });
            
            if (!isOnSomething) {
                edges.push(`${boxName}(out)table`);
            }
        }
    });
    
    const checkObjectInDrawer = (object, objectName, objectBody, objectHeight) => {
        let closestDrawer = null;
        let minDistance = Infinity;
        
        state.liberoAssets.forEach(asset => {
            if (asset.userData?.assetId === 'short_cabinet') {
                asset.traverse(child => {
                    if (child.userData?.isDrawer) {
                        const drawerKey = child.userData.partName;
                        const drawerName = objectNameMap[drawerKey];
                        const drawerBody = child.userData?.physicsBody;
                        
                        if (!drawerBody || !drawerName) return;
                        
                        let objectPos;
                        if (object.userData.assetId) {
                            const worldPos = new THREE.Vector3();
                            object.getWorldPosition(worldPos);
                            objectPos = worldPos;
                        } else {
                            objectPos = objectBody.position;
                        }
                        
                        const drawerPos = drawerBody.position;
                        const drawerSize = child.userData.drawerSize;
                        
                        const drawerHalfWidth = drawerSize.x / 2;
                        const drawerHalfDepth = drawerSize.z / 2;
                        const horizontallyInside = (
                            Math.abs(objectPos.x - drawerPos.x) < drawerHalfWidth - 1 &&
                            Math.abs(objectPos.z - drawerPos.z) < drawerHalfDepth - 1
                        );
                        
                        const drawerBottom = drawerPos.y - drawerSize.y / 2;
                        const drawerTop = drawerPos.y + drawerSize.y / 2;
                        const objBottom = objectPos.y - objectHeight / 2;
                        const objTop = objectPos.y + objectHeight / 2;
                        const verticallyInside = (
                            objBottom > drawerBottom - 1 &&
                            objTop < drawerTop + 2
                        );
                        
                        if (horizontallyInside && verticallyInside) {
                            const distance = Math.sqrt(
                                Math.pow(objectPos.x - drawerPos.x, 2) +
                                Math.pow(objectPos.y - drawerPos.y, 2) +
                                Math.pow(objectPos.z - drawerPos.z, 2)
                            );
                            
                            if (distance < minDistance) {
                                minDistance = distance;
                                closestDrawer = drawerName;
                            }
                        }
                    }
                });
            }
        });
        
        if (closestDrawer) {
            edges.push(`${objectName}(in)${closestDrawer}`);
        }
    };
    
    
    
    return { nodes, edges };
}


export function publishSceneGraph() {
    if (!state.isRosConnected || !state.sceneGraphTopic) return;
    
    try {
        const sceneData = analyzeScene();
        
        const sceneGraphData = {
            timestamp: Date.now(),
            nodes: sceneData.nodes,
            edges: sceneData.edges
        };
        
        const message = new ROSLIB.Message({
            data: JSON.stringify(sceneGraphData)
        });
        
        state.sceneGraphTopic.publish(message);
        
        const sceneGraphInfo = document.getElementById('scene-graph-info');
        sceneGraphInfo.innerHTML = `Scene Graph: ${sceneData.nodes.length} nodes, ${sceneData.edges.length} edges<br>Edges: ${sceneData.edges.join(', ')}`;
        
    } catch (error) {
        console.error('Error publishing scene graph:', error);
    }
}


export function findOccupiedPositionsInBox(box) {
    const boxBody = getPhysicsBody(box);
    const occupiedPositions = [];
    
    if (!boxBody) {
        console.warn('findOccupiedPositionsInBox: No physics body found');
        return occupiedPositions;
    }
    
    const boxPos = boxBody.position;
    const quat = boxBody.quaternion;
    const yRotation = Math.atan2(2 * (quat.w * quat.y + quat.x * quat.z), 1 - 2 * (quat.y * quat.y + quat.z * quat.z));
    
    console.log(`📦 检查盒子: 位置(${boxPos.x.toFixed(1)}, ${boxPos.y.toFixed(1)}, ${boxPos.z.toFixed(1)}), 旋转: ${(yRotation * 180 / Math.PI).toFixed(1)}°`);
    
    const checkableObjects = [
        ...state.mugs,
        ...state.cubes,
        ...(state.liberoAssets || [])
    ];
    
    console.log(`🔍 待检查物体总数: mugs=${state.mugs.length}, cubes=${state.cubes.length}, libero=${state.liberoAssets?.length || 0}`);
    
    checkableObjects.forEach(obj => {
        const objBody = getPhysicsBody(obj);
        if (!objBody) {
            console.log(`  ⚠️ Object has no physics body:`, obj.name || obj.userData?.assetId);
            return;
        }
        
        const objPos = objBody.position;
        
        const relativePos = {
            x: objPos.x - boxPos.x,
            y: objPos.y - boxPos.y,
            z: objPos.z - boxPos.z
        };
        
        const localPos = {
            x: relativePos.x * Math.cos(-yRotation) - relativePos.z * Math.sin(-yRotation),
            y: relativePos.y,
            z: relativePos.x * Math.sin(-yRotation) + relativePos.z * Math.cos(-yRotation)
        };
        
        const xCheck = Math.abs(localPos.x) < 11;
        const zCheck = Math.abs(localPos.z) < 7;
        const yMinCheck = localPos.y >= -2.5;
        const yMaxCheck = localPos.y < 6;
        
        const isInside = xCheck && zCheck && yMinCheck && yMaxCheck;
        
        const objName = obj.userData.assetId || obj.name || 'unknown';
        
        if (Math.abs(Math.abs(localPos.x) - 11) < 2 || Math.abs(Math.abs(localPos.z) - 7) < 2 || !yMinCheck) {
            console.log(`  ${isInside ? '✅' : '❌'} ${objName}: world(${objPos.x.toFixed(1)}, ${objPos.y.toFixed(1)}, ${objPos.z.toFixed(1)}) local(${localPos.x.toFixed(1)}, ${localPos.y.toFixed(3)}, ${localPos.z.toFixed(1)}) [X:${xCheck} Z:${zCheck} Y:${yMinCheck}&&${yMaxCheck}]`);
        } else {
            console.log(`  ${isInside ? '✅' : '❌'} ${objName}: world(${objPos.x.toFixed(1)}, ${objPos.y.toFixed(1)}, ${objPos.z.toFixed(1)}) local(${localPos.x.toFixed(1)}, ${localPos.y.toFixed(1)}, ${localPos.z.toFixed(1)})`);
        }
        
        if (isInside) {
            occupiedPositions.push({
                x: objPos.x,
                z: objPos.z,
                localX: localPos.x,
                localZ: localPos.z,
                mug: obj
            });
        }
    });
    
    console.log(`📊 检测结果: 盒子内有 ${occupiedPositions.length} 个物体`);
    return occupiedPositions;
}


export function findContainedObjects(containerObject) {
    if (containerObject.userData.type !== 'box' && containerObject.userData.type !== 'box_with_lid') {
        return [];
    }
    
    const containedObjects = [];
    const containerBody = getPhysicsBody(containerObject);
    
    if (!containerBody) {
        console.warn('findContainedObjects: No physics body found');
        return containedObjects;
    }
    
    const containerPos = containerBody.position;
    
    const checkableObjects = [
        ...state.mugs,
        ...state.cubes,
        ...(state.liberoAssets || [])
    ];
    
    checkableObjects.forEach(obj => {
        const objBody = getPhysicsBody(obj);
        if (!objBody) return;
        
        const objPos = objBody.position;
        const isInside = (
            Math.abs(objPos.x - containerPos.x) < 15 && 
            Math.abs(objPos.z - containerPos.z) < 10 && 
            Math.abs(objPos.y - containerPos.y) < 8 &&
            objPos.y >= containerPos.y - 2.5 &&
            objPos.y < containerPos.y + 5
        );
        
        if (isInside) {
            containedObjects.push({
                object: obj,
                relativePosition: {
                    x: objPos.x - containerPos.x,
                    y: objPos.y - containerPos.y,
                    z: objPos.z - containerPos.z
                }
            });
        }
    });
    
    return containedObjects;
}


export function isInBowlOrPlate(object, container) {
    const objectBody = getPhysicsBody(object);
    const containerBody = getPhysicsBody(container);
    
    if (!objectBody || !containerBody) return false;
    
    const objectPos = objectBody.position;
    const containerPos = containerBody.position;
    const containerQuat = containerBody.quaternion;
    
    const containerAssetId = container.userData?.assetId || '';
    const isBowl = containerAssetId.includes('bowl');
    
    const radius = 2.5;
    const bounds = {
        radius: radius,
        minY: isBowl ? -1.5 : -0.5,
        maxY: isBowl ? 3.0 : 1.5
    };
    
    if (objectPos.y <= containerPos.y + bounds.minY || 
        objectPos.y >= containerPos.y + bounds.maxY) {
        return false;
    }
    
    const threeQuat = new THREE.Quaternion(
        containerQuat.x,
        containerQuat.y,
        containerQuat.z,
        containerQuat.w
    );
    const inverseQuat = threeQuat.clone().invert();
    
    const relativePos = new THREE.Vector3(
        objectPos.x - containerPos.x,
        objectPos.y - containerPos.y,
        objectPos.z - containerPos.z
    ).applyQuaternion(inverseQuat);
    
    const distanceXZ = Math.sqrt(relativePos.x * relativePos.x + relativePos.z * relativePos.z);
    const isInside = distanceXZ < bounds.radius && 
                    relativePos.y >= bounds.minY && 
                    relativePos.y < bounds.maxY;
    
    return isInside;
}

export function isOnBowlOrPlate(object, container) {
    const objectBody = getPhysicsBody(object);
    const containerBody = getPhysicsBody(container);
    
    if (!objectBody || !containerBody) return false;
    
    const objectPos = objectBody.position;
    const containerPos = containerBody.position;
    
    const containerAssetId = container.userData?.assetId || '';
    const isBowl = containerAssetId.includes('bowl');
    
    const radius = 2.5;
    const distanceXZ = Math.sqrt(
        Math.pow(objectPos.x - containerPos.x, 2) + 
        Math.pow(objectPos.z - containerPos.z, 2)
    );
    
    if (distanceXZ >= radius) {
        return false;
    }
    
    const yDiff = objectPos.y - containerPos.y;
    const minYDiff = isBowl ? 0.5 : 0.2;
    const maxYDiff = isBowl ? 2.0 : 1.5;
    
    console.log(`[isOnBowlOrPlate] ${containerAssetId}: yDiff=${yDiff.toFixed(2)}, distanceXZ=${distanceXZ.toFixed(2)}, minY=${minYDiff}, maxY=${maxYDiff}`);
    
    return yDiff >= minYDiff && yDiff <= maxYDiff;
}

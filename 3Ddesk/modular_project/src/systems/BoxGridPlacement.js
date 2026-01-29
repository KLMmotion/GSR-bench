

import * as THREE from 'three';
import { state } from '../core/GlobalState.js';


function getPhysicsBody(object) {
    return object.userData.physicsBody || object.userData.body;
}


export class BoxGridPlacement {
    constructor() {
        this.boxWidth = 23;
        this.boxDepth = 15;
        this.boxHeight = 8;
        this.maxSamplingAttempts = 10000;
        this.safetyMargin = 0.1;
        this.mug_dis = 0.08;
        
        this.objectSizes = {
            mug: { 
                width: 3.5,
                depth: 3.5,
                height: 5,
                radius: 2
            },
            cube: { 
                width: 3,
                depth: 3,
                height: 3,
                radius: 1.7
            },
            libero_asset: {
                width: 4,
                depth: 4,
                height: 6,
                radius: 2.5
            }
        };
    }
    
    
    getObjectType(object) {
        if (object.userData.type) {
            return object.userData.type;
        }
        if (object.userData.assetId) {
            return 'libero_asset';
        }
        return 'cube';
    }
    
    
    getObjectSize(object, objectType = null) {
        const type = objectType || this.getObjectType(object);
        
        if (type === 'libero_asset') {
            const box = new THREE.Box3().setFromObject(object);
            const size = new THREE.Vector3();
            box.getSize(size);
            
            return {
                width: size.x || 4,
                depth: size.z || 4,
                height: size.y || 6,
                radius: Math.max(size.x, size.z) / 2 || 2.5
            };
        }
        
        return this.objectSizes[type] || this.objectSizes.cube;
    }
    
    
    isObjectInBox(obj, box) {
        const objBody = getPhysicsBody(obj);
        const boxBody = getPhysicsBody(box);
        
        if (!objBody || !boxBody) return false;
        
        const objPos = objBody.position;
        const boxPos = boxBody.position;
        
        const dx = Math.abs(objPos.x - boxPos.x);
        const dz = Math.abs(objPos.z - boxPos.z);
        const dy = Math.abs(objPos.y - boxPos.y);
        
        return dx < 11.5 && dz < 7.5 && dy < 8;
    }
    
    worldToLocal(worldX, worldZ, boxCenterX, boxCenterZ, boxRotation) {
        const dx = worldX - boxCenterX;
        const dz = worldZ - boxCenterZ;
        
        const cos = Math.cos(-boxRotation);
        const sin = Math.sin(-boxRotation);
        
        return {
            z: dx * cos - dz * sin,
            x: dx * sin + dz * cos
        };
    }
    
    localToWorld(localX, localZ, boxCenterX, boxCenterZ, boxRotation) {
        const cos = Math.cos(boxRotation);
        const sin = Math.sin(boxRotation);
        
        return {
            x: boxCenterX + (localX * cos - localZ * sin),
            z: boxCenterZ + (localX * sin + localZ * cos)
        };
    }
    
    isPositionInsideBox(localX, localZ, objectType) {
        const size = this.objectSizes[objectType];
        const effectiveHalfWidth = this.boxWidth/2 - size.radius;
        const effectiveHalfDepth = this.boxDepth/2 - size.radius - this.safetyMargin;
        
        return Math.abs(localZ) < effectiveHalfWidth && Math.abs(localX) < effectiveHalfDepth;
    }
    
    isMugInBox(mug, box) {
        const mugBody = getPhysicsBody(mug);
        const boxBody = getPhysicsBody(box);
        
        if (!mugBody || !boxBody) return false;
        
        const mugPos = mugBody.position;
        const boxPos = boxBody.position;
        
        const dx = Math.abs(mugPos.x - boxPos.x);
        const dz = Math.abs(mugPos.z - boxPos.z);
        const dy = Math.abs(mugPos.y - boxPos.y);
        
        return dx < 11.5 && dz < 7.5 && dy < 8;
    }
    
    checkCircleCollision(pos1, radius1, pos2, radius2) {
        const dx = pos1.x - pos2.x;
        const dz = pos1.z - pos2.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        return distance < (radius1 + radius2 + this.mug_dis);
    }
    
    checkCollision(sampledPos, sampledRotation, objectType, box, boxCenterX, boxCenterZ, boxRotation) {
        const size = this.objectSizes[objectType];
        
        const localPos = this.worldToLocal(sampledPos.x, sampledPos.z, boxCenterX, boxCenterZ, boxRotation);
        
        if (!this.isPositionInsideBox(localPos.x, localPos.z, objectType)) {
            return true;
        }
        
        for (let mug of state.mugs) {
            if (this.isObjectInBox(mug, box)) {
                const mugBody = getPhysicsBody(mug);
                if (!mugBody) continue;
                
                const mugPos = mugBody.position;
                const mugSize = this.getObjectSize(mug);
                
                if (this.checkCircleCollision(
                    { x: sampledPos.x, z: sampledPos.z }, 
                    size.radius,
                    { x: mugPos.x, z: mugPos.z }, 
                    mugSize.radius
                )) {
                    return true;
                }
            }
        }
        
        for (let cube of state.cubes) {
            if (this.isObjectInBox(cube, box)) {
                const cubeBody = getPhysicsBody(cube);
                if (!cubeBody) continue;
                
                const cubePos = cubeBody.position;
                const cubeSize = this.getObjectSize(cube);
                
                if (this.checkCircleCollision(
                    { x: sampledPos.x, z: sampledPos.z }, 
                    size.radius,
                    { x: cubePos.x, z: cubePos.z }, 
                    cubeSize.radius
                )) {
                    return true;
                }
            }
        }
        
        if (state.liberoAssets) {
            for (let asset of state.liberoAssets) {
                if (this.isObjectInBox(asset, box)) {
                    const assetBody = getPhysicsBody(asset);
                    if (!assetBody) continue;
                    
                    const assetPos = assetBody.position;
                    const assetSize = this.getObjectSize(asset);
                    
                    if (this.checkCircleCollision(
                        { x: sampledPos.x, z: sampledPos.z }, 
                        size.radius,
                        { x: assetPos.x, z: assetPos.z }, 
                        assetSize.radius
                    )) {
                        return true;
                    }
                }
            }
        }
        
        return false;
    }
    
    sampleRandomPoseInBox(boxCenterX, boxCenterZ, boxRotation, objectType, objectSize = null) {
        const size = objectSize || this.objectSizes[objectType];
        
        const effectiveHalfWidth = this.boxWidth/2 - size.radius;
        const effectiveHalfDepth = this.boxDepth/2 - size.radius;
        
        const localZ = (Math.random() * 2 - 1) * effectiveHalfWidth;
        const localX = (Math.random() * 2 - 1) * effectiveHalfDepth;
        
        const rotation = 0;
        
        const worldPos = this.localToWorld(localX, localZ, boxCenterX, boxCenterZ, boxRotation);
        
        return {
            x: worldPos.x,
            z: worldPos.z,
            rotation: rotation
        };
    }
    
    findBestPlacement(objectType, box, boxCenterX, boxCenterZ, boxRotation) {
        let attempts = 0;
        const startTime = performance.now();
        
        console.log(`开始采样碰撞检测，最大尝试次数: ${this.maxSamplingAttempts}`);
        
        while (attempts < this.maxSamplingAttempts) {
            const sampledPose = this.sampleRandomPoseInBox(boxCenterX, boxCenterZ, boxRotation, objectType);
            
            const hasCollision = this.checkCollision(
                sampledPose, 
                sampledPose.rotation, 
                objectType, 
                box, 
                boxCenterX, 
                boxCenterZ, 
                boxRotation
            );
            
            if (!hasCollision) {
                const endTime = performance.now();
                const timeUsed = (endTime - startTime).toFixed(2);
                console.log(`采样成功找到安全位置，尝试次数: ${attempts + 1}, 耗时: ${timeUsed}ms`);
                
                return {
                    x: sampledPose.x,
                    z: sampledPose.z,
                    rotation: sampledPose.rotation,
                    score: 0
                };
            }
            
            attempts++;
            
            if (attempts % 100 === 0) {
                console.log(`采样进行中... 已尝试 ${attempts} 次`);
            }
        }
        
        const endTime = performance.now();
        const timeUsed = (endTime - startTime).toFixed(2);
        console.warn(`采样未找到安全位置，已达到最大尝试次数 ${this.maxSamplingAttempts}, 耗时: ${timeUsed}ms`);
        
        return null;
    }
    
    getAvailablePositionsCount(objectType, box, boxCenterX, boxCenterZ, boxRotation) {
        let validCount = 0;
        const testSampleSize = 100;
        
        for (let i = 0; i < testSampleSize; i++) {
            const sampledPose = this.sampleRandomPoseInBox(boxCenterX, boxCenterZ, boxRotation, objectType);
            
            const hasCollision = this.checkCollision(
                sampledPose, 
                sampledPose.rotation, 
                objectType, 
                box, 
                boxCenterX, 
                boxCenterZ, 
                boxRotation
            );
            
            if (!hasCollision) {
                validCount++;
            }
        }
        
        const estimatedRatio = validCount / testSampleSize;
        const totalPossiblePositions = Math.floor(
            (this.boxWidth - 2 * this.objectSizes[objectType].radius - 2 * this.safetyMargin) * 
            (this.boxDepth - 2 * this.objectSizes[objectType].radius - 2 * this.safetyMargin) / 4
        );
        
        return Math.floor(estimatedRatio * totalPossiblePositions);
    }
}

export const boxGridPlacement = new BoxGridPlacement();

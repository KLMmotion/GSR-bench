

import * as THREE from 'three';
import { state } from '../core/GlobalState.js';


function getPhysicsBody(object) {
    return object.userData.physicsBody || object.userData.body;
}


export class DrawerGridPlacement {
    constructor() {
        this.drawerWidth = null;
        this.drawerDepth = null;
        this.drawerHeight = null;
        
        this.maxSamplingAttempts = 10000;
        this.safetyMargin = 1;
        this.objectDistance = 0.2;
        
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
    
    
    initFromDrawer(drawer) {
        const size = drawer.userData.drawerSize;
        this.drawerWidth = size.x;
        this.drawerDepth = size.z;
        this.drawerHeight = size.y;
        
        console.log(`📐 DrawerGridPlacement initialized: ${this.drawerWidth.toFixed(2)} × ${this.drawerDepth.toFixed(2)}`);
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
    
    
    getObjectSize(object) {
        const type = this.getObjectType(object);
        
        if (type === 'libero_asset') {
            const box = new THREE.Box3().setFromObject(object);
            const size = new THREE.Vector3();
            box.getSize(size);
            
            return {
                width: size.x || 4,
                depth: size.z || 4,
                height: size.y || 6,
                radius: Math.max(size.x, size.z) / 2 || 2.5,
                original: new THREE.Vector3(size.x || 4, size.y || 6, size.z || 4)
            };
        }
        
        return this.objectSizes[type] || this.objectSizes.cube;
    }
    
    
    needsRotation(object, drawerHeight) {
        const size = this.getObjectSize(object);
        
        const exceedsHeight = size.height > drawerHeight * 0.8;
        
        if (exceedsHeight) {
            console.log(`📦 ${object.userData.assetId || object.userData.type} 高度 ${size.height.toFixed(2)} 超过抽屉高度 ${drawerHeight.toFixed(2)}，需要旋转`);
            return true;
        }
        
        return false;
    }
    
    
    getRotatedSize(originalSize, rotationAxis) {
        const size = originalSize.original || new THREE.Vector3(originalSize.width, originalSize.height, originalSize.depth);
        
        if (rotationAxis === 'x') {
            return {
                width: size.x,
                height: size.z,
                depth: size.y,
                radius: Math.max(size.x, size.y) / 2
            };
        } else if (rotationAxis === 'z') {
            return {
                width: size.y,
                height: size.z,
                depth: size.x,
                radius: Math.max(size.y, size.z) / 2
            };
        }
        
        return originalSize;
    }
    
    
    determineBestRotation(object, drawerHeight) {
        const size = this.getObjectSize(object);
        const original = size.original || new THREE.Vector3(size.width, size.height, size.depth);
        
        console.log(`📏 原始尺寸: ${original.x.toFixed(2)} × ${original.y.toFixed(2)} × ${original.z.toFixed(2)}`);
        console.log(`📏 抽屉高度: ${drawerHeight.toFixed(2)}`);
        
        const schemes = [
            {
                name: '不旋转',
                axis: null,
                rotation: 0,
                height: original.y,
                rotatedSize: size
            },
            {
                name: '绕X轴旋转 (height ↔ depth)',
                axis: 'x',
                rotation: Math.PI / 2,
                height: original.z,
                rotatedSize: this.getRotatedSize(size, 'x')
            },
            {
                name: '绕Z轴旋转 (height <-> width)',
                axis: 'z',
                rotation: Math.PI / 2,
                height: original.x,
                rotatedSize: this.getRotatedSize(size, 'z')
            }
        ];
        
        // const maxHeight = drawerHeight * 0.8;
        const maxHeight = drawerHeight;
        const validSchemes = schemes.filter(scheme => scheme.height <= maxHeight);
        
        if (validSchemes.length > 0) {
            validSchemes.sort((a, b) => {
                if (a.axis === null && b.axis !== null) return -1;
                if (a.axis !== null && b.axis === null) return 1;
                return a.height - b.height;
            });
            const best = validSchemes[0];
            
            if (best.axis === null) {
                console.log(`✅ 无需旋转，高度合适 (${best.height.toFixed(2)} <= ${maxHeight.toFixed(2)})`);
            } else {
                console.log(`🔄 ${best.name}: 新高度 = ${best.height.toFixed(2)}`);
            }
            
            return {
                needsRotate: best.axis !== null,
                rotationAxis: best.axis,
                rotation: best.rotation,
                rotatedSize: best.rotatedSize
            };
        }
        
        console.warn(`⚠️ 所有旋转方案都超过抽屉高度 (${maxHeight.toFixed(2)})，选择最接近的方案`);
        schemes.sort((a, b) => a.height - b.height);
        const best = schemes[0];
        
        console.log(`🔄 使用 ${best.name}: 新高度 = ${best.height.toFixed(2)} (仍超过 ${maxHeight.toFixed(2)})`);
        
        return {
            needsRotate: true,
            rotationAxis: best.axis,
            rotation: best.rotation,
            rotatedSize: best.rotatedSize
        };
    }
    
    worldToLocal(worldX, worldZ, drawerCenterX, drawerCenterZ, drawerRotation) {
        const dx = worldX - drawerCenterX;
        const dz = worldZ - drawerCenterZ;
        
        const cos = Math.cos(-drawerRotation);
        const sin = Math.sin(-drawerRotation);
        
        return {
            z: dx * cos - dz * sin,
            x: dx * sin + dz * cos
        };
    }
    
    localToWorld(localX, localZ, drawerCenterX, drawerCenterZ, drawerRotation) {
        const cos = Math.cos(drawerRotation);
        const sin = Math.sin(drawerRotation);
        
        return {
            x: drawerCenterX + (localX * cos - localZ * sin),
            z: drawerCenterZ + (localX * sin + localZ * cos)
        };
    }
    
    isPositionInsideDrawer(localX, localZ, objectRadius) {
        const effectiveHalfWidth = this.drawerWidth/2 - objectRadius - this.safetyMargin;
        const effectiveHalfDepth = this.drawerDepth/2 - objectRadius - this.safetyMargin;
        
        return Math.abs(localX) < effectiveHalfWidth && Math.abs(localZ) < effectiveHalfDepth;
    }
    
    isObjectInDrawer(obj, drawer) {
        const objBody = getPhysicsBody(obj);
        const drawerBody = getPhysicsBody(drawer);
        
        if (!objBody || !drawerBody) return false;
        
        const objPos = objBody.position;
        const drawerPos = drawerBody.position;
        
        const dx = Math.abs(objPos.x - drawerPos.x);
        const dy = Math.abs(objPos.y - drawerPos.y);
        const dz = Math.abs(objPos.z - drawerPos.z);
        
        const halfWidth = this.drawerWidth / 2;
        const halfDepth = this.drawerDepth / 2;
        const halfHeight = this.drawerHeight / 2;
        const tolerance = 1.0;
        
        return dx < halfWidth - tolerance && 
               dy < halfHeight - tolerance && 
               dz < halfDepth - tolerance;
    }
    
    checkCircleCollision(pos1, radius1, pos2, radius2) {
        const dx = pos1.x - pos2.x;
        const dz = pos1.z - pos2.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        return distance < (radius1 + radius2 + this.objectDistance);
    }
    
    checkCollision(sampledPos, objectType, object, drawer, drawerCenterX, drawerCenterZ, drawerRotation, size = null) {
        if (!size) {
            size = this.getObjectSize(object);
        }
        
        const localPos = this.worldToLocal(sampledPos.x, sampledPos.z, drawerCenterX, drawerCenterZ, drawerRotation);
        
        if (!this.isPositionInsideDrawer(localPos.x, localPos.z, size.radius)) {
            return true;
        }
        
        const allObjects = [
            ...(state.mugs || []),
            ...(state.cubes || []),
            ...(state.liberoAssets || []).filter(asset => asset !== object)
        ];
        
        for (let obj of allObjects) {
            if (!this.isObjectInDrawer(obj, drawer)) continue;
            
            const objBody = getPhysicsBody(obj);
            if (!objBody) continue;
            
            const objPos = objBody.position;
            const objSize = this.getObjectSize(obj);
            
            if (this.checkCircleCollision(
                { x: sampledPos.x, z: sampledPos.z }, 
                size.radius,
                { x: objPos.x, z: objPos.z }, 
                objSize.radius
            )) {
                return true;
            }
        }
        
        return false;
    }
    
    sampleRandomPoseInDrawer(drawerCenterX, drawerCenterZ, drawerRotation, object, size = null) {
        if (!size) {
            size = this.getObjectSize(object);
        }
        
        const effectiveHalfWidth = this.drawerWidth/2 - size.radius - this.safetyMargin;
        const effectiveHalfDepth = this.drawerDepth/2 - size.radius - this.safetyMargin;
        
        const localX = (Math.random() * 2 - 1) * effectiveHalfWidth;
        const localZ = (Math.random() * 2 - 1) * effectiveHalfDepth;
        
        const rotation = 0;
        
        const worldPos = this.localToWorld(localX, localZ, drawerCenterX, drawerCenterZ, drawerRotation);
        
        return {
            x: worldPos.x,
            z: worldPos.z,
            rotation: rotation
        };
    }
    
    findBestPlacement(object, drawer, drawerCenterX, drawerCenterZ, drawerRotation) {
        let attempts = 0;
        const startTime = performance.now();
        
        const objectType = this.getObjectType(object);
        
        const rotationInfo = this.determineBestRotation(object, this.drawerHeight);
        const size = rotationInfo.rotatedSize;
        
        console.log(`🔍 开始采样碰撞检测，物体类型: ${objectType}`);
        console.log(`   抽屉尺寸: ${this.drawerWidth.toFixed(2)} × ${this.drawerDepth.toFixed(2)} × ${this.drawerHeight.toFixed(2)}`);
        console.log(`   使用尺寸: ${size.width.toFixed(2)} × ${size.height.toFixed(2)} × ${size.depth.toFixed(2)}`);
        console.log(`   物体半径: ${size.radius.toFixed(2)}`);
        console.log(`   需要旋转: ${rotationInfo.needsRotate ? '是 (' + rotationInfo.rotationAxis + '轴)' : '否'}`);
        
        while (attempts < this.maxSamplingAttempts) {
            const sampledPose = this.sampleRandomPoseInDrawer(
                drawerCenterX, 
                drawerCenterZ, 
                drawerRotation, 
                object,
                size
            );
            
            const hasCollision = this.checkCollision(
                sampledPose, 
                objectType, 
                object, 
                drawer, 
                drawerCenterX, 
                drawerCenterZ, 
                drawerRotation,
                size
            );
            
            if (!hasCollision) {
                const endTime = performance.now();
                const timeUsed = (endTime - startTime).toFixed(2);
                console.log(`✅ 采样成功找到安全位置，尝试次数: ${attempts + 1}, 耗时: ${timeUsed}ms`);
                
                return {
                    x: sampledPose.x,
                    z: sampledPose.z,
                    rotation: rotationInfo.rotation,
                    rotationAxis: rotationInfo.rotationAxis,
                    score: 0,
                    rotatedSize: size
                };
            }
            
            attempts++;
            
            if (attempts % 1000 === 0) {
                console.log(`   采样进行中... 已尝试 ${attempts} 次`);
            }
        }
        
        const endTime = performance.now();
        const timeUsed = (endTime - startTime).toFixed(2);
        console.warn(`❌ 采样未找到安全位置，已达到最大尝试次数 ${this.maxSamplingAttempts}, 耗时: ${timeUsed}ms`);
        
        return null;
    }
}

export const drawerGridPlacement = new DrawerGridPlacement();

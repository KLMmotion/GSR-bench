

import * as THREE from 'three';
import { state } from '../core/GlobalState.js';


export class TableGridPlacement {
    constructor() {
        this.tableWidth = 180;
        this.tableDepth = 90;
        this.gridSize = 2;
        this.margin = 8;
        
        this.gridCols = Math.floor(this.tableWidth / this.gridSize);
        this.gridRows = Math.floor(this.tableDepth / this.gridSize);
        
        this.objectSizes = {
            box: { 
                width: 25, 
                depth: 17, 
                height: 9,
                rotations: [0, Math.PI/2, Math.PI, 3*Math.PI/2]
            },
            mug: { 
                width: 6, 
                depth: 6, 
                height: 5,
                rotations: [0]
            },
            cube: { 
                width: 4, 
                depth: 4, 
                height: 3,
                rotations: [0]
            }
        };
        
        this.initializeGrid();
    }
    
    initializeGrid() {
        this.grid = Array(this.gridRows).fill().map(() => Array(this.gridCols).fill(0));
    }
    
    worldToGrid(worldX, worldZ) {
        const gridX = Math.floor((worldX + this.tableWidth/2) / this.gridSize);
        const gridZ = Math.floor((worldZ + this.tableDepth/2) / this.gridSize);
        return { 
            x: Math.max(0, Math.min(this.gridCols - 1, gridX)), 
            z: Math.max(0, Math.min(this.gridRows - 1, gridZ)) 
        };
    }
    
    gridToWorld(gridX, gridZ) {
        const worldX = (gridX * this.gridSize) - this.tableWidth/2 + this.gridSize/2;
        const worldZ = (gridZ * this.gridSize) - this.tableDepth/2 + this.gridSize/2;
        return { x: worldX, z: worldZ };
    }
    
    getRotatedSize(objectType, rotation) {
        const baseSize = this.objectSizes[objectType];
        const cos = Math.abs(Math.cos(rotation));
        const sin = Math.abs(Math.sin(rotation));
        
        return {
            width: baseSize.width * cos + baseSize.depth * sin,
            depth: baseSize.width * sin + baseSize.depth * cos,
            height: baseSize.height
        };
    }
    
    updateGridWithExistingObjects() {
        this.initializeGrid();

        [...state.boxes, ...state.mugs, ...state.cubes, ...(state.liberoAssets || [])].forEach(obj => {
            this.markObjectInGrid(obj);
        });
    }
    
    markObjectInGrid(object) {
        const body = object.userData.physicsBody;
        const pos = body.position;
        const quat = body.quaternion;

        const rotation = Math.atan2(
            2 * (quat.w * quat.y + quat.x * quat.z),
            1 - 2 * (quat.y * quat.y + quat.z * quat.z)
        );

        const objectType = object.userData.type;

        let rotatedSize;
        if (this.objectSizes[objectType]) {
            rotatedSize = this.getRotatedSize(objectType, rotation);
        } else {
            const box = new THREE.Box3().setFromObject(object);
            const size = new THREE.Vector3();
            box.getSize(size);

            rotatedSize = {
                width: size.x,
                depth: size.z,
                height: size.y
            };
        }

        const centerGrid = this.worldToGrid(pos.x, pos.z);

        const safetyMargin = 2;
        const halfWidthGrid = Math.ceil((rotatedSize.width/2 + safetyMargin) / this.gridSize);
        const halfDepthGrid = Math.ceil((rotatedSize.depth/2 + safetyMargin) / this.gridSize);

        for (let x = centerGrid.x - halfWidthGrid; x <= centerGrid.x + halfWidthGrid; x++) {
            for (let z = centerGrid.z - halfDepthGrid; z <= centerGrid.z + halfDepthGrid; z++) {
                if (x >= 0 && x < this.gridCols && z >= 0 && z < this.gridRows) {
                    this.grid[z][x] = 1;
                }
            }
        }
    }
    
    canPlaceObject(worldX, worldZ, objectType, rotation) {
        const rotatedSize = this.getRotatedSize(objectType, rotation);
        const centerGrid = this.worldToGrid(worldX, worldZ);
        
        const safetyMargin = 1;
        const halfWidthGrid = Math.ceil((rotatedSize.width/2 + safetyMargin) / this.gridSize);
        const halfDepthGrid = Math.ceil((rotatedSize.depth/2 + safetyMargin) / this.gridSize);
        
        if (centerGrid.x - halfWidthGrid < 0 || centerGrid.x + halfWidthGrid >= this.gridCols ||
            centerGrid.z - halfDepthGrid < 0 || centerGrid.z + halfDepthGrid >= this.gridRows) {
            return false;
        }
        
        for (let x = centerGrid.x - halfWidthGrid; x <= centerGrid.x + halfWidthGrid; x++) {
            for (let z = centerGrid.z - halfDepthGrid; z <= centerGrid.z + halfDepthGrid; z++) {
                if (this.grid[z][x] === 1) {
                    return false;
                }
            }
        }
        
        return true;
    }
    
    findBestPlacement(objectType) {
        this.updateGridWithExistingObjects();
        
        const possibleRotations = this.objectSizes[objectType].rotations;
        const candidates = [];
        
        for (let gridX = 0; gridX < this.gridCols; gridX++) {
            for (let gridZ = 0; gridZ < this.gridRows; gridZ++) {
                const worldPos = this.gridToWorld(gridX, gridZ);
                
                for (let rotation of possibleRotations) {
                    if (this.canPlaceObject(worldPos.x, worldPos.z, objectType, rotation)) {
                        const distanceFromCenter = Math.sqrt(
                            Math.pow(worldPos.x, 2) + Math.pow(worldPos.z, 2)
                        );
                        
                        candidates.push({
                            x: worldPos.x,
                            z: worldPos.z,
                            rotation: rotation,
                            score: -distanceFromCenter
                        });
                    }
                }
            }
        }
        
        if (candidates.length === 0) {
            return null;
        }
        
        candidates.sort((a, b) => b.score - a.score);
        return candidates[0];
    }
    
    visualizeGrid() {
        console.log('当前栅格状态 (0=空闲, 1=占用):');
        for (let z = 0; z < this.gridRows; z++) {
            let row = '';
            for (let x = 0; x < this.gridCols; x++) {
                row += this.grid[z][x] ? '█' : '·';
            }
            console.log(row);
        }
    }
}

export const gridPlacement = new TableGridPlacement();


export function findSafeTablePositionWithGrid(objectType = 'mug') {
    try {
        const placement = gridPlacement.findBestPlacement(objectType);
        
        if (placement) {
            console.log(`栅格系统找到最佳位置: x=${placement.x.toFixed(1)}, z=${placement.z.toFixed(1)}, 旋转=${(placement.rotation * 180 / Math.PI).toFixed(1)}°`);
            
            return {
                x: placement.x,
                y: 7.8,
                z: placement.z,
                rotation: placement.rotation
            };
        } else {
            console.warn('栅格系统未找到合适位置，使用备用策略');
            return findSafeTablePositionFallback();
        }
    } catch (error) {
        console.error('栅格放置系统错误:', error);
        return findSafeTablePositionFallback();
    }
}


export function findSafeTablePositionFallback() {
    const fallbackPositions = [
        { x: -60, y: 7.8, z: 30, rotation: 0 },
        { x: 60, y: 7.8, z: 30, rotation: 0 },
        { x: 0, y: 7.8, z: 35, rotation: 0 },
        { x: -50, y: 7.8, z: -30, rotation: Math.PI/2 },
        { x: 50, y: 7.8, z: -30, rotation: Math.PI/2 }
    ];

    return fallbackPositions[0];
}


export function findSafeTablePosition() {
    return findSafeTablePositionWithGrid('mug');
}

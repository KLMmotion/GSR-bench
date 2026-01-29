

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { colors, physicsConfig } from '../core/Config.js';
import { state, addCube, setCubeColorCounts } from '../core/GlobalState.js';


export function getColorValues() {
    return [
        colors.red,
        colors.yellow,
        colors.blue,
        colors.green,
        colors.white
    ];
}


export function generateCubePlacementConfiguration(numCubes) {
    const config = [];
    const boxes = state.boxes;
    const availableBoxes = boxes.filter((box, index) => !box.userData.isStacked);
    
    const maxInBoxCubes = Math.min(availableBoxes.length * 3, Math.floor(numCubes * 0.5));
    const maxOnBoxCubes = Math.min(availableBoxes.length, Math.floor(numCubes * 0.2));
    
    let inBoxCount = Math.floor(Math.random() * (maxInBoxCubes + 1));
    let onBoxCount = Math.floor(Math.random() * (maxOnBoxCubes + 1));
    
    if (inBoxCount + onBoxCount > numCubes) {
        if (inBoxCount > onBoxCount) {
            inBoxCount = numCubes - onBoxCount;
        } else {
            onBoxCount = numCubes - inBoxCount;
        }
    }
    
    const onTableCount = numCubes - inBoxCount - onBoxCount;
    
    console.log(`Cube placement: ${inBoxCount} in boxes, ${onBoxCount} on boxes, ${onTableCount} on table`);
    
    let currentCube = 0;
    let cubesPerBox = {};
    
    for (let i = 0; i < inBoxCount; i++) {
        const boxIndex = Math.floor(Math.random() * availableBoxes.length);
        const actualBoxIndex = boxes.indexOf(availableBoxes[boxIndex]);
        
        if (!cubesPerBox[actualBoxIndex]) cubesPerBox[actualBoxIndex] = 0;
        
        config.push({
            cubeIndex: currentCube++,
            placement: 'in_box',
            boxIndex: actualBoxIndex,
            positionInBox: cubesPerBox[actualBoxIndex]++
        });
    }
    
    const availableForOnTop = availableBoxes.filter((box, index) => {
        const actualIndex = boxes.indexOf(box);
        return !cubesPerBox[actualIndex] || cubesPerBox[actualIndex] < 3;
    });
    
    for (let i = 0; i < onBoxCount && availableForOnTop.length > 0; i++) {
        const boxIndex = Math.floor(Math.random() * availableForOnTop.length);
        const actualBoxIndex = boxes.indexOf(availableForOnTop[boxIndex]);
        
        config.push({
            cubeIndex: currentCube++,
            placement: 'on_box',
            boxIndex: actualBoxIndex,
            positionInBox: null
        });
        
        availableForOnTop.splice(boxIndex, 1);
    }
    
    for (let i = currentCube; i < numCubes; i++) {
        config.push({
            cubeIndex: i,
            placement: 'on_table',
            boxIndex: null,
            positionInBox: null
        });
    }
    
    for (let i = config.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tempIndex = config[i].cubeIndex;
        config[i].cubeIndex = config[j].cubeIndex;
        config[j].cubeIndex = tempIndex;
    }
    
    config.sort((a, b) => a.cubeIndex - b.cubeIndex);
    
    return config;
}


export function createCubeGeometry(cubeColor) {
    const cubeSize = 3;
    
    const cubeGeometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
    const cubeMaterial = new THREE.MeshPhongMaterial({ 
        color: cubeColor,
        specular: 0x555555,
        shininess: 80
    });
    
    const cubeMesh = new THREE.Mesh(cubeGeometry, cubeMaterial);
    cubeMesh.castShadow = true;
    cubeMesh.receiveShadow = true;
    
    return cubeMesh;
}


export function createCubePhysicsBody(world, position, rotation) {
    const cubeSize = 3;
    const cubeShape = new CANNON.Box(new CANNON.Vec3(cubeSize/2, cubeSize/2, cubeSize/2));
    const cubeBody = new CANNON.Body({ 
        mass: physicsConfig.cubeMass || 80,
        fixedRotation: false,
        linearDamping: physicsConfig.linearDamping,
        angularDamping: physicsConfig.angularDamping
    });
    
    cubeBody.addShape(cubeShape);
    cubeBody.position.set(position.x, position.y, position.z);
    cubeBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotation);
    cubeBody.material = new CANNON.Material({ friction: 0.6, restitution: 0.1 });
    
    world.addBody(cubeBody);
    return cubeBody;
}


function extractYRotation(quaternion) {
    const q = quaternion;
    return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
}


export function createCubesWithSafePositions(scene, world) {
    const boxes = state.boxes;
    
    setCubeColorCounts({ red: 0, yellow: 0, blue: 0, green: 0, white: 0 });
    
    const numCubes = Math.floor(Math.random() * 3) + 1;
    
    console.log(`Creating ${numCubes} cubes with random colors`);
    
    const allColors = [0, 1, 2, 3, 4]; // red, yellow, blue, green, white
    const numColorTypes = Math.min(numCubes, Math.floor(Math.random() * 3) + 1);
    
    const shuffledColors = allColors.sort(() => Math.random() - 0.5);
    const availableColors = shuffledColors.slice(0, numColorTypes);
    
    console.log(`Using ${numColorTypes} color types for cubes:`, availableColors.map(i => ['red', 'yellow', 'blue', 'green', 'white'][i]));
    
    const cubeColorChoices = [];
    for (let i = 0; i < numCubes; i++) {
        const colorIndex = availableColors[Math.floor(Math.random() * availableColors.length)];
        cubeColorChoices.push(colorIndex);
    }
    
    const cubeColorValues = getColorValues();
    const placementConfig = generateCubePlacementConfiguration(numCubes);
    
    for (let i = 0; i < numCubes; i++) {
        const colorIndex = cubeColorChoices[i];
        const cubeColor = cubeColorValues[colorIndex];
        
        const cubeMesh = createCubeGeometry(cubeColor);
        cubeMesh.name = `cube_${i}`;
        
        const placementInfo = placementConfig[i];
        let cubePosition;
        
        if (placementInfo.placement === 'in_box') {
            const targetBox = boxes[placementInfo.boxIndex];
            const boxPos = targetBox.userData.physicsBody.position;
            const boxRotation = extractYRotation(targetBox.userData.physicsBody.quaternion);
            
            const localOffsets = [
                { x: -7, z: -4 }, { x: 0, z: -4 }, { x: 7, z: -4 },
                { x: -7, z: 0 },  { x: 0, z: 0 },  { x: 7, z: 0 },
                { x: -7, z: 4 },  { x: 0, z: 4 },  { x: 7, z: 4 }
            ];
            const offset = localOffsets[placementInfo.positionInBox % localOffsets.length];
            
            const worldX = boxPos.x + (offset.x * Math.cos(boxRotation) - offset.z * Math.sin(boxRotation));
            const worldZ = boxPos.z + (offset.x * Math.sin(boxRotation) + offset.z * Math.cos(boxRotation));
            
            cubePosition = {
                x: worldX,
                y: boxPos.y + 2.5,
                z: worldZ
            };
        } else if (placementInfo.placement === 'on_box') {
            const targetBox = boxes[placementInfo.boxIndex];
            const boxPos = targetBox.userData.physicsBody.position;
            
            const offsetX = (Math.random() - 0.5) * 15;
            const offsetZ = (Math.random() - 0.5) * 10;
            
            cubePosition = {
                x: boxPos.x + offsetX,
                y: boxPos.y + 6,
                z: boxPos.z + offsetZ
            };
        } else {
            let gridPlacement = null;
            let useGrid = false;

            if (typeof window !== 'undefined' && window.getGridPlacement) {
                gridPlacement = window.getGridPlacement();
                if (gridPlacement && typeof gridPlacement.findBestPlacement === 'function') {
                    useGrid = true;
                }
            }

            if (useGrid) {
                console.log(`🔍 Cube ${i}: Attempting to use grid system...`);
                const placement = gridPlacement.findBestPlacement('cube');
                if (placement) {
                    cubePosition = {
                        x: placement.x,
                        y: 7.8,
                        z: placement.z
                    };
                    console.log(`✅ Cube ${i} placed using grid system at (${cubePosition.x.toFixed(1)}, ${cubePosition.z.toFixed(1)})`);
                } else {
                    console.warn(`⚠️ Grid system returned null for cube ${i}, using fallback`);
                    cubePosition = {
                        x: (Math.random() - 0.5) * 160,
                        y: 3.5,
                        z: (Math.random() - 0.5) * 70
                    };
                }
            } else {
                console.warn(`⚠️ Grid system not available for cube ${i}, using safe random position`);
                cubePosition = {
                    x: (Math.random() - 0.5) * 160,
                    y: 3.5,
                    z: (Math.random() - 0.5) * 70
                };
                console.log(`📍 Cube ${i} fallback position: (${cubePosition.x.toFixed(1)}, ${cubePosition.z.toFixed(1)})`);
            }
        }
        
        cubeMesh.position.set(cubePosition.x, cubePosition.y, cubePosition.z);
        
        const cubeRotation = Math.random() * Math.PI * 2;
        cubeMesh.rotation.y = cubeRotation;
        
        scene.add(cubeMesh);
        addCube(cubeMesh);
        
        const cubeBody = createCubePhysicsBody(world, cubePosition, cubeRotation);
        
        cubeMesh.userData = { 
            physicsBody: cubeBody, 
            type: 'cube',
            colorIndex: colorIndex,
            placement: placementInfo.placement,
            targetBoxIndex: placementInfo.boxIndex
        };
        
        console.log(`Cube ${i} (${getColorNameFromIndex(colorIndex)}): ${placementInfo.placement}${placementInfo.boxIndex !== null ? ` on box ${placementInfo.boxIndex}` : ''}`);
    }
}


export function createCubesFromConfig(scene, world, cubeConfigs) {
    const colorValues = getColorValues();
    
    cubeConfigs.forEach((cubeConfig, index) => {
        const colorIndex = cubeConfig.colorIndex || 0;
        const cubeColor = colorValues[colorIndex];
        
        const cubeMesh = createCubeGeometry(cubeColor);
        cubeMesh.name = `cube_${index}`;
        
        cubeMesh.position.set(
            cubeConfig.position.x,
            cubeConfig.position.y,
            cubeConfig.position.z
        );
        cubeMesh.rotation.y = cubeConfig.rotation || 0;
        
        scene.add(cubeMesh);
        addCube(cubeMesh);
        
        const cubeBody = createCubePhysicsBody(world, cubeConfig.position, cubeConfig.rotation || 0);
        
        cubeMesh.userData = { 
            physicsBody: cubeBody, 
            type: 'cube',
            colorIndex: colorIndex,
            placement: cubeConfig.placement || 'on_table',
            targetBoxIndex: cubeConfig.targetBoxIndex || null
        };
    });
}


export function getColorNameFromIndex(colorIndex) {
    const colorNames = ['red', 'yellow', 'blue', 'green', 'white'];
    return colorNames[colorIndex] || 'unknown';
}

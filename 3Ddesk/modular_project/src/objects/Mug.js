

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { colors, physicsConfig } from '../core/Config.js';
import { state, addMug, setMugColorCounts } from '../core/GlobalState.js';


export function getColorValues() {
    return [colors.red, colors.yellow, colors.blue];
}


export function generateMugPlacementConfiguration(numMugs) {
    const config = [];
    const boxes = state.boxes;
    const availableBoxes = boxes.filter((box, index) => !box.userData.isStacked);
    
    const maxInBoxMugs = Math.min(availableBoxes.length * 2, Math.floor(numMugs * 0.4));
    const maxOnBoxMugs = Math.min(availableBoxes.length, Math.floor(numMugs * 0.2));
    
    let inBoxCount = Math.floor(Math.random() * (maxInBoxMugs + 1));
    let onBoxCount = Math.floor(Math.random() * (maxOnBoxMugs + 1));
    
    if (inBoxCount + onBoxCount > numMugs) {
        if (inBoxCount > onBoxCount) {
            inBoxCount = numMugs - onBoxCount;
        } else {
            onBoxCount = numMugs - inBoxCount;
        }
    }
    
    const onTableCount = numMugs - inBoxCount - onBoxCount;
    
    console.log(`Mug placement: ${inBoxCount} in boxes, ${onBoxCount} on boxes, ${onTableCount} on table`);
    
    let currentMug = 0;
    let mugsPerBox = {};
    
    for (let i = 0; i < inBoxCount; i++) {
        const boxIndex = Math.floor(Math.random() * availableBoxes.length);
        const actualBoxIndex = boxes.indexOf(availableBoxes[boxIndex]);
        
        if (!mugsPerBox[actualBoxIndex]) mugsPerBox[actualBoxIndex] = 0;
        
        config.push({
            mugIndex: currentMug++,
            placement: 'in_box',
            boxIndex: actualBoxIndex,
            positionInBox: mugsPerBox[actualBoxIndex]++
        });
    }
    
    const availableForOnTop = availableBoxes.filter((box, index) => {
        const actualIndex = boxes.indexOf(box);
        return !mugsPerBox[actualIndex] || mugsPerBox[actualIndex] < 2;
    });
    
    for (let i = 0; i < onBoxCount && availableForOnTop.length > 0; i++) {
        const boxIndex = Math.floor(Math.random() * availableForOnTop.length);
        const actualBoxIndex = boxes.indexOf(availableForOnTop[boxIndex]);
        
        config.push({
            mugIndex: currentMug++,
            placement: 'on_box',
            boxIndex: actualBoxIndex,
            positionInBox: null
        });
        
        availableForOnTop.splice(boxIndex, 1);
    }
    
    for (let i = currentMug; i < numMugs; i++) {
        config.push({
            mugIndex: i,
            placement: 'on_table',
            boxIndex: null,
            positionInBox: null
        });
    }
    
    for (let i = config.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tempIndex = config[i].mugIndex;
        config[i].mugIndex = config[j].mugIndex;
        config[j].mugIndex = tempIndex;
    }
    
    config.sort((a, b) => a.mugIndex - b.mugIndex);
    
    return config;
}


export function createMugGeometry(mugColor) {
    const mugGroup = new THREE.Group();
    
    const mugMaterial = new THREE.MeshPhongMaterial({ 
        color: mugColor,
        specular: 0x666666,
        shininess: 100,
        side: THREE.DoubleSide
    });
    
    const mugGeometry = new THREE.CylinderGeometry(2.2, 2.2, 5, 16, 1, true);
    const mugCylinder = new THREE.Mesh(mugGeometry, mugMaterial);
    mugCylinder.castShadow = true;
    mugGroup.add(mugCylinder);
    
    const bottomGeometry = new THREE.CircleGeometry(2.2, 16);
    const bottomMesh = new THREE.Mesh(bottomGeometry, mugMaterial);
    bottomMesh.rotation.x = -Math.PI / 2;
    bottomMesh.position.y = -2.5;
    bottomMesh.receiveShadow = true;
    mugGroup.add(bottomMesh);
    
    const handleGeometry = new THREE.TorusGeometry(1.2, 0.25, 8, 16);
    const handleMesh = new THREE.Mesh(handleGeometry, mugMaterial);
    handleMesh.position.set(3, 0, 0);
    handleMesh.rotation.z = Math.PI / 2;
    handleMesh.castShadow = true;
    mugGroup.add(handleMesh);
    
    return mugGroup;
}


export function createMugPhysicsBody(world, position, rotation) {
    const mugShape = new CANNON.Cylinder(2, 2, 5, 8);
    const mugBody = new CANNON.Body({ 
        mass: physicsConfig.mugMass,
        fixedRotation: true,
        linearDamping: physicsConfig.linearDamping,
        angularDamping: physicsConfig.angularDamping
    });
    
    mugBody.addShape(mugShape);
    mugBody.position.set(position.x, position.y, position.z);
    mugBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotation);
    mugBody.material = new CANNON.Material({ friction: 0.6, restitution: 0 });
    
    world.addBody(mugBody);
    return mugBody;
}


function extractYRotation(quaternion) {
    const q = quaternion;
    return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
}


export function createMugsWithSafePositions(scene, world) {
    const boxes = state.boxes;
    
    setMugColorCounts({ red: 0, yellow: 0, blue: 0 });
    
    const numMugs = Math.floor(Math.random() * 6) + 3;
    console.log(`Creating ${numMugs} mugs with enhanced randomness`);
    
    const mugColorChoices = [];
    const colorOptions = [0, 1, 2];
    for (let i = 0; i < numMugs; i++) {
        const colorIndex = colorOptions[Math.floor(Math.random() * colorOptions.length)];
        mugColorChoices.push(colorIndex);
    }
    
    const mugColorValues = getColorValues();
    const placementConfig = generateMugPlacementConfiguration(numMugs);
    
    for (let i = 0; i < numMugs; i++) {
        const colorIndex = mugColorChoices[i];
        const mugColor = mugColorValues[colorIndex];
        
        const mugGroup = createMugGeometry(mugColor);
        mugGroup.name = `mug_${i}`;
        
        const placementInfo = placementConfig[i];
        let mugPosition;
        
        if (placementInfo.placement === 'in_box') {
            const targetBox = boxes[placementInfo.boxIndex];
            const boxPos = targetBox.userData.physicsBody.position;
            const boxRotation = extractYRotation(targetBox.userData.physicsBody.quaternion);
            
            const localOffsets = [
                { x: -6, z: -3 }, { x: 6, z: -3 },
                { x: -6, z: 3 }, { x: 6, z: 3 },
                { x: 0, z: 0 }
            ];
            const offset = localOffsets[placementInfo.positionInBox % localOffsets.length];
            
            const worldX = boxPos.x + (offset.x * Math.cos(boxRotation) - offset.z * Math.sin(boxRotation));
            const worldZ = boxPos.z + (offset.x * Math.sin(boxRotation) + offset.z * Math.cos(boxRotation));
            
            mugPosition = {
                x: worldX,
                y: boxPos.y + 3.5,
                z: worldZ
            };
        } else if (placementInfo.placement === 'on_box') {
            const targetBox = boxes[placementInfo.boxIndex];
            const boxPos = targetBox.userData.physicsBody.position;
            
            const offsetX = (Math.random() - 0.5) * 15;
            const offsetZ = (Math.random() - 0.5) * 10;
            
            mugPosition = {
                x: boxPos.x + offsetX,
                y: boxPos.y + 7,
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
                console.log(`🔍 Mug ${i}: Attempting to use grid system...`);
                const placement = gridPlacement.findBestPlacement('mug');
                if (placement) {
                    mugPosition = {
                        x: placement.x,
                        y: 7.8,
                        z: placement.z
                    };
                    console.log(`✅ Mug ${i} placed using grid system at (${mugPosition.x.toFixed(1)}, ${mugPosition.z.toFixed(1)})`);
                } else {
                    console.warn(`⚠️ Grid system returned null for mug ${i}, using fallback`);
                    mugPosition = {
                        x: (Math.random() - 0.5) * 160,
                        y: 5,
                        z: (Math.random() - 0.5) * 70
                    };
                }
            } else {
                console.warn(`⚠️ Grid system not available for mug ${i}, using safe random position`);
                mugPosition = {
                    x: (Math.random() - 0.5) * 160,
                    y: 5,
                    z: (Math.random() - 0.5) * 70
                };
                console.log(`📍 Mug ${i} fallback position: (${mugPosition.x.toFixed(1)}, ${mugPosition.z.toFixed(1)})`);
            }
        }
        
        mugGroup.position.set(mugPosition.x, mugPosition.y, mugPosition.z);
        
        const mugRotation = Math.random() * Math.PI * 2;
        mugGroup.rotation.y = mugRotation;
        
        scene.add(mugGroup);
        addMug(mugGroup);
        
        const mugBody = createMugPhysicsBody(world, mugPosition, mugRotation);
        
        mugGroup.userData = { 
            physicsBody: mugBody, 
            type: 'mug',
            colorIndex: colorIndex,
            placement: placementInfo.placement,
            targetBoxIndex: placementInfo.boxIndex
        };
        
        console.log(`Mug ${i} (${getColorNameFromIndex(colorIndex)}): ${placementInfo.placement}${placementInfo.boxIndex !== null ? ` on box ${placementInfo.boxIndex}` : ''}`);
    }
}


export function createMugsFromConfig(scene, world, mugConfigs) {
    const colorValues = getColorValues();
    
    mugConfigs.forEach((mugConfig, index) => {
        const colorIndex = mugConfig.colorIndex || 0;
        const mugColor = colorValues[colorIndex];
        
        const mugGroup = createMugGeometry(mugColor);
        mugGroup.name = `mug_${index}`;
        
        mugGroup.position.set(
            mugConfig.position.x,
            mugConfig.position.y,
            mugConfig.position.z
        );
        mugGroup.rotation.y = mugConfig.rotation || 0;
        
        scene.add(mugGroup);
        addMug(mugGroup);
        
        const mugBody = createMugPhysicsBody(world, mugConfig.position, mugConfig.rotation || 0);
        
        mugGroup.userData = { 
            physicsBody: mugBody, 
            type: 'mug',
            colorIndex: colorIndex,
            placement: mugConfig.placement || 'on_table',
            targetBoxIndex: mugConfig.targetBoxIndex || null
        };
    });
}


export function getColorNameFromIndex(colorIndex) {
    const colorNames = ['red', 'yellow', 'blue'];
    return colorNames[colorIndex] || 'unknown';
}

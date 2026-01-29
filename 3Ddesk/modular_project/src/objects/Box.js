

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { colors, physicsConfig } from '../core/Config.js';
import { state, addBox, setBoxColorCounts } from '../core/GlobalState.js';


export function getColorValues() {
    return [colors.red, colors.yellow, colors.blue];
}


export function generateStackingConfiguration(numBoxes) {
    const config = [];
    
    if (numBoxes === 1) {
        config.push({ boxIndex: 0, stackedOn: null });
    } else if (numBoxes === 2) {
        if (Math.random() < 0.6) {
            config.push({ boxIndex: 0, stackedOn: null });
            config.push({ boxIndex: 1, stackedOn: 0 });
        } else {
            config.push({ boxIndex: 0, stackedOn: null });
            config.push({ boxIndex: 1, stackedOn: null });
        }
    } else {
        const stackingType = Math.random();
        if (stackingType < 0.4) {
            config.push({ boxIndex: 0, stackedOn: null });
            config.push({ boxIndex: 1, stackedOn: 0 });
            config.push({ boxIndex: 2, stackedOn: 1 });
        } else if (stackingType < 0.7) {
            config.push({ boxIndex: 0, stackedOn: null });
            config.push({ boxIndex: 1, stackedOn: 0 });
            config.push({ boxIndex: 2, stackedOn: null });
        } else {
            config.push({ boxIndex: 0, stackedOn: null });
            config.push({ boxIndex: 1, stackedOn: null });
            config.push({ boxIndex: 2, stackedOn: null });
        }
    }
    
    console.log('Box stacking configuration:', config);
    return config;
}


export function createBoxGeometry(boxColor) {
    const boxGroup = new THREE.Group();
    
    const bottomMaterial = new THREE.MeshPhongMaterial({ 
        color: boxColor,
        specular: 0x333333,
        shininess: 50
    });
    
    const bottomGeometry = new THREE.BoxGeometry(25, 1, 17);
    const bottom = new THREE.Mesh(bottomGeometry, bottomMaterial);
    bottom.position.y = -4;
    bottom.castShadow = true;
    bottom.receiveShadow = true;
    boxGroup.add(bottom);
    
    const wallThickness = 1;
    const wallHeight = 8;
    
    const frontWall = new THREE.BoxGeometry(25, wallHeight, wallThickness);
    const frontWallMesh = new THREE.Mesh(frontWall, bottomMaterial);
    frontWallMesh.position.set(0, 0, 8);
    frontWallMesh.castShadow = true;
    boxGroup.add(frontWallMesh);
    
    const backWallMesh = new THREE.Mesh(frontWall, bottomMaterial);
    backWallMesh.position.set(0, 0, -8);
    backWallMesh.castShadow = true;
    boxGroup.add(backWallMesh);
    
    const sideWall = new THREE.BoxGeometry(wallThickness, wallHeight, 15);
    const leftWallMesh = new THREE.Mesh(sideWall, bottomMaterial);
    leftWallMesh.position.set(-12, 0, 0);
    leftWallMesh.castShadow = true;
    boxGroup.add(leftWallMesh);
    
    const rightWallMesh = new THREE.Mesh(sideWall, bottomMaterial);
    rightWallMesh.position.set(12, 0, 0);
    rightWallMesh.castShadow = true;
    boxGroup.add(rightWallMesh);
    
    return boxGroup;
}


export function createBoxPhysicsBody(world, position, rotation) {
    const boxBody = new CANNON.Body({ 
        mass: physicsConfig.boxMass,
        fixedRotation: true,
        linearDamping: physicsConfig.linearDamping,
        angularDamping: physicsConfig.angularDamping
    });
    
    const bottomShape = new CANNON.Box(new CANNON.Vec3(12.5, 0.5, 8.5));
    boxBody.addShape(bottomShape, new CANNON.Vec3(0, -4, 0));
    
    const frontShape = new CANNON.Box(new CANNON.Vec3(12.5, 4, 0.5));
    boxBody.addShape(frontShape, new CANNON.Vec3(0, 0, 8));
    
    const backShape = new CANNON.Box(new CANNON.Vec3(12.5, 4, 0.5));
    boxBody.addShape(backShape, new CANNON.Vec3(0, 0, -8));
    
    const leftShape = new CANNON.Box(new CANNON.Vec3(0.5, 4, 7.5));
    boxBody.addShape(leftShape, new CANNON.Vec3(-12, 0, 0));
    
    const rightShape = new CANNON.Box(new CANNON.Vec3(0.5, 4, 7.5));
    boxBody.addShape(rightShape, new CANNON.Vec3(12, 0, 0));
    
    boxBody.position.set(position.x, position.y, position.z);
    boxBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotation);
    boxBody.material = new CANNON.Material({ friction: 0.6, restitution: 0.1 });
    
    world.addBody(boxBody);
    return boxBody;
}


export function createBoxesWithSafePositions(scene, world) {
    setBoxColorCounts({ red: 0, yellow: 0, blue: 0 });
    
    const numBoxes = Math.floor(Math.random() * 3) + 1;
    console.log(`Creating ${numBoxes} boxes with enhanced randomness`);
    
    const availableColors = [
        { color: colors.red, index: 0 },
        { color: colors.yellow, index: 1 },
        { color: colors.blue, index: 2 }
    ];
    
    for (let i = availableColors.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [availableColors[i], availableColors[j]] = [availableColors[j], availableColors[i]];
    }
    
    const selectedColors = availableColors.slice(0, numBoxes);
    const stackingConfig = generateStackingConfiguration(numBoxes);
    
    for (let i = 0; i < numBoxes; i++) {
        const colorData = selectedColors[i];
        const boxColor = colorData.color;
        const colorIndex = colorData.index;
        
        const boxGroup = createBoxGeometry(boxColor);
        boxGroup.name = `box_${i}`;
        
        let boxPosition, boxRotation;
        const stackInfo = stackingConfig.find(stack => stack.boxIndex === i);
        
        if (stackInfo && stackInfo.stackedOn !== null) {
            const baseBox = state.boxes[stackInfo.stackedOn];
            const basePosition = baseBox.position;
            const baseRotation = baseBox.rotation.y;
            
            const offsetX = (Math.random() - 0.5) * 8;
            const offsetZ = (Math.random() - 0.5) * 6;
            
            boxPosition = {
                x: basePosition.x + offsetX,
                y: 15,
                z: basePosition.z + offsetZ
            };
            
            boxRotation = baseRotation + (Math.random() - 0.5) * Math.PI / 6;
        } else {
            boxPosition = {
                x: (Math.random() - 0.5) * 80,
                y: 6,
                z: (Math.random() - 0.5) * 40
            };
            boxRotation = (Math.random() - 0.5) * Math.PI;
        }
        
        boxGroup.position.set(boxPosition.x, boxPosition.y, boxPosition.z);
        boxGroup.rotation.y = boxRotation;
        
        scene.add(boxGroup);
        addBox(boxGroup);
        
        const boxBody = createBoxPhysicsBody(world, boxPosition, boxRotation);
        
        boxGroup.userData = { 
            physicsBody: boxBody, 
            type: 'box',
            colorIndex: colorIndex,
            isStacked: stackInfo && stackInfo.stackedOn !== null,
            stackedOn: stackInfo ? stackInfo.stackedOn : null,
            originalPosition: { x: boxPosition.x, y: boxPosition.y, z: boxPosition.z }
        };
    }
}


export function createBoxesFromConfig(scene, world, boxConfigs) {
    const colorValues = getColorValues();
    
    boxConfigs.forEach((boxConfig, index) => {
        const colorIndex = boxConfig.colorIndex || 0;
        const boxColor = colorValues[colorIndex];
        
        const boxGroup = createBoxGeometry(boxColor);
        boxGroup.name = `box_${index}`;
        
        boxGroup.position.set(
            boxConfig.position.x,
            boxConfig.position.y,
            boxConfig.position.z
        );
        boxGroup.rotation.y = boxConfig.rotation || 0;
        
        scene.add(boxGroup);
        addBox(boxGroup);
        
        const boxBody = createBoxPhysicsBody(world, boxConfig.position, boxConfig.rotation || 0);
        
        boxGroup.userData = { 
            physicsBody: boxBody, 
            type: 'box',
            colorIndex: colorIndex,
            isStacked: boxConfig.isStacked || false,
            stackedOn: boxConfig.stackedOn || null,
            originalPosition: { 
                x: boxConfig.position.x, 
                y: boxConfig.position.y, 
                z: boxConfig.position.z 
            }
        };
    });
}

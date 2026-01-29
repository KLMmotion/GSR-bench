

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { colors, physicsConfig } from '../core/Config.js';
import { state, addBoxWithLid, setBoxWithLidColorCounts } from '../core/GlobalState.js';


export function getColorValuesWithLid() {
    return [colors.red, colors.yellow, colors.blue];
}


export function createBoxWithLidGeometry(boxColor) {
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


export function createLidGeometry(boxColor) {
    const lidGroup = new THREE.Group();
    
    const lidMaterial = new THREE.MeshPhongMaterial({ 
        color: boxColor,
        specular: 0x333333,
        shininess: 50
    });
    
    const lidGeometry = new THREE.BoxGeometry(26, 1.5, 18);
    const lid = new THREE.Mesh(lidGeometry, lidMaterial);
    lid.castShadow = true;
    lid.receiveShadow = true;
    lidGroup.add(lid);
    
    const handleGeometry = new THREE.BoxGeometry(8, 0.8, 2);
    const handle = new THREE.Mesh(handleGeometry, lidMaterial);
    handle.position.set(0, 1.2, 9);
    handle.castShadow = true;
    lidGroup.add(handle);
    
    return lidGroup;
}


export function createBoxWithLidPhysicsBody(world, position, rotation) {
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


export function createLidPhysicsBody(world, position) {
    const lidBody = new CANNON.Body({ 
        mass: physicsConfig.boxMass * 0.3,
        fixedRotation: false,
        linearDamping: 0.5,
        angularDamping: 0.7
    });
    
    const lidShape = new CANNON.Box(new CANNON.Vec3(13, 0.75, 9));
    lidBody.addShape(lidShape);
    
    lidBody.position.set(position.x, position.y, position.z);
    lidBody.material = new CANNON.Material({ friction: 0.8, restitution: 0.05 });
    
    lidBody.collisionFilterGroup = 2;
    lidBody.collisionFilterMask = -1;
    
    world.addBody(lidBody);
    console.log('创建盖子物理体，collisionFilterGroup=2, collisionFilterMask=-1');
    return lidBody;
}


export function createHingeConstraint(boxBody, lidBody) {
    const hingePivotA = new CANNON.Vec3(0, 4, -8.5);
    const hingePivotB = new CANNON.Vec3(0, 0, -9);
    const hingeAxis = new CANNON.Vec3(1, 0, 0);
    
    const hinge = new CANNON.HingeConstraint(boxBody, lidBody, {
        pivotA: hingePivotA,
        pivotB: hingePivotB,
        axisA: hingeAxis,
        axisB: hingeAxis,
        collideConnected: true
    });
    
    hinge.disableMotor();
    
    return hinge;
}


export function openLid(boxWithLid) {
    if (!boxWithLid.userData.lid || boxWithLid.userData.isOpen) {
        return;
    }
    
    const hinge = boxWithLid.userData.hinge;
    const lidBody = boxWithLid.userData.lidBody;
    
    if (hinge && lidBody) {
        if (boxWithLid.userData.objectsInBox) {
            boxWithLid.userData.objectsInBox.forEach(obj => {
                obj.body.collisionFilterMask = obj.originalMask;
            });
            boxWithLid.userData.objectsInBox = [];
        }
        
        if (lidBody.fixedRotation) {
            lidBody.fixedRotation = false;
            lidBody.updateMassProperties();
        }
        
        lidBody.angularDamping = 0.7;
        
        lidBody.angularVelocity.x = 2;
        
        hinge.enableMotor();
        hinge.setMotorSpeed(3);
        hinge.setMotorMaxForce(120);
        
        boxWithLid.userData.isOpen = true;
        boxWithLid.userData.isOpening = true;
        
        setTimeout(() => {
            if (hinge && boxWithLid.userData.isOpening) {
                hinge.disableMotor();
                boxWithLid.userData.isOpening = false;
                if (lidBody) {
                    lidBody.angularVelocity.set(0, 0, 0);
                    lidBody.velocity.set(0, 0, 0);
                }
            }
        }, 1000);
    }
}


export function closeLid(boxWithLid) {
    if (!boxWithLid.userData.lid || !boxWithLid.userData.isOpen) {
        return;
    }
    
    const hinge = boxWithLid.userData.hinge;
    const lidBody = boxWithLid.userData.lidBody;
    const boxBody = boxWithLid.userData.body;
    
    if (hinge && lidBody && boxBody) {
        const objectsInBox = [];
        
        const boxHalfWidth = 12.5;
        const boxHalfDepth = 8.5;
        const boxPos = boxBody.position;
        
        console.log('🔍 closeLid: 检测盒子内部物体...');
        console.log('   盒子位置:', boxPos);
        console.log('   state.mugs.length:', state.mugs?.length);
        console.log('   state.cubes.length:', state.cubes?.length);
        console.log('   state.liberoAssets.length:', state.liberoAssets?.length);
        
        if (state.liberoAssets && state.liberoAssets.length > 0) {
            state.liberoAssets.forEach(asset => {
                const assetBody = asset.userData?.physicsBody || asset.userData?.body;
                if (!assetBody) return;
                
                const assetPos = assetBody.position;
                
                const horizontallyInside = (
                    Math.abs(assetPos.x - boxPos.x) < boxHalfWidth - 0.2 &&
                    Math.abs(assetPos.z - boxPos.z) < boxHalfDepth - 0.2
                );
                
                if (horizontallyInside) {
                    console.log('   ✓ 发现 LIBERO asset:', asset.userData?.assetId, '位置:', assetPos);
                    console.log('     原始 collisionFilterMask:', assetBody.collisionFilterMask.toString(2));
                    objectsInBox.push({
                        body: assetBody,
                        originalMask: assetBody.collisionFilterMask
                    });
                    const newMask = assetBody.collisionFilterMask & ~2;
                    assetBody.collisionFilterMask = newMask;
                    assetBody.wakeUp();
                    console.log('     新 collisionFilterMask:', newMask.toString(2));
                }
            });
        }
        
        if (state.mugs && state.mugs.length > 0) {
            state.mugs.forEach(mug => {
                const mugBody = mug.userData?.physicsBody;
                if (!mugBody) return;
                
                const mugPos = mugBody.position;
                
                const horizontallyInside = (
                    Math.abs(mugPos.x - boxPos.x) < boxHalfWidth - 0.2 &&
                    Math.abs(mugPos.z - boxPos.z) < boxHalfDepth - 0.2
                );
                
                if (horizontallyInside) {
                    console.log('   ✓ 发现 mug:', mug.name, '位置:', mugPos);
                    console.log('     原始 collisionFilterMask:', mugBody.collisionFilterMask.toString(2));
                    objectsInBox.push({
                        body: mugBody,
                        originalMask: mugBody.collisionFilterMask
                    });
                    const newMask = mugBody.collisionFilterMask & ~2;
                    mugBody.collisionFilterMask = newMask;
                    mugBody.wakeUp();
                    console.log('     新 collisionFilterMask:', newMask.toString(2));
                }
            });
        }
        
        if (state.cubes && state.cubes.length > 0) {
            state.cubes.forEach(cube => {
                const cubeBody = cube.userData?.physicsBody;
                if (!cubeBody) return;
                
                const cubePos = cubeBody.position;
                
                const horizontallyInside = (
                    Math.abs(cubePos.x - boxPos.x) < boxHalfWidth - 0.2 &&
                    Math.abs(cubePos.z - boxPos.z) < boxHalfDepth - 0.2
                );
                
                if (horizontallyInside) {
                    console.log('   ✓ 发现 cube:', cube.name, '位置:', cubePos);
                    console.log('     原始 collisionFilterMask:', cubeBody.collisionFilterMask.toString(2));
                    objectsInBox.push({
                        body: cubeBody,
                        originalMask: cubeBody.collisionFilterMask
                    });
                    const newMask = cubeBody.collisionFilterMask & ~2;
                    cubeBody.collisionFilterMask = newMask;
                    cubeBody.wakeUp();
                    console.log('     新 collisionFilterMask:', newMask.toString(2));
                }
            });
        }
        
        console.log('   总共找到', objectsInBox.length, '个物体在盒子内');
        
        boxWithLid.userData.objectsInBox = objectsInBox;
        
        lidBody.angularVelocity.x = -2;
        
        hinge.enableMotor();
        hinge.setMotorSpeed(-4);
        hinge.setMotorMaxForce(200);
        
        boxWithLid.userData.isOpen = false;
        boxWithLid.userData.isClosing = true;
        
        setTimeout(() => {
            if (hinge && boxWithLid.userData.isClosing) {
                console.log('🔒 关闭完成，检查物体位置...');
                
                hinge.disableMotor();
                boxWithLid.userData.isClosing = false;
                
                if (lidBody && boxBody) {
                    lidBody.angularVelocity.set(0, 0, 0);
                    lidBody.velocity.set(0, 0, 0);
                    
                    const boxRotation = boxBody.quaternion;
                    
                    lidBody.quaternion.copy(boxRotation);
                    
                    const targetY = boxBody.position.y + 4.75;
                    lidBody.position.y = targetY;
                    
                    const worldHingeZ = boxBody.position.z - 8.5 * Math.cos(boxRotation.toAxisAngle()[1]);
                    lidBody.position.z = worldHingeZ - 0.5;
                    
                    lidBody.angularDamping = 0.99;
                    
                    lidBody.fixedRotation = true;
                    lidBody.updateMassProperties();
                }
                
                if (boxWithLid.userData.objectsInBox && boxWithLid.userData.objectsInBox.length > 0) {
                    boxWithLid.userData.objectsInBox.forEach((obj, index) => {
                        const objPos = obj.body.position;
                        const stillInside = (
                            Math.abs(objPos.x - boxPos.x) < boxHalfWidth - 0.2 &&
                            Math.abs(objPos.z - boxPos.z) < boxHalfDepth - 0.2
                        );
                        console.log(`   物体 ${index}: 位置=`, objPos, '仍在盒子内=', stillInside);
                    });
                }
            }
        }, 1500);
    }
}


export function toggleLid(boxWithLid) {
    if (!boxWithLid.userData.lid) {
        return;
    }
    
    if (boxWithLid.userData.isOpen) {
        closeLid(boxWithLid);
    } else {
        openLid(boxWithLid);
    }
}


export function createBoxesWithLidWithSafePositions(scene, world) {
    setBoxWithLidColorCounts({ red: 0, yellow: 0, blue: 0 });
    
    const numBoxes = Math.floor(Math.random() * 3) + 1;
    console.log(`Creating ${numBoxes} boxes with lid`);
    
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
    
    const positions = [
        { x: 60, z: 0 },
        { x: 40, z: -30 },
        { x: 40, z: 30 }
    ];
    
    for (let i = 0; i < numBoxes; i++) {
        const colorData = selectedColors[i];
        const boxColor = colorData.color;
        const colorIndex = colorData.index;
        
        const boxGroup = createBoxWithLidGeometry(boxColor);
        boxGroup.name = `lid_box_${i}`;
        boxGroup.userData.type = 'box_with_lid';
        boxGroup.userData.colorIndex = colorIndex;
        boxGroup.userData.isOpen = false;
        
        const lidGroup = createLidGeometry(boxColor);
        lidGroup.name = `lid_${i}`;
        lidGroup.userData.type = 'lid';
        lidGroup.userData.parentBox = boxGroup.name;
        
        const pos = positions[i];
        const boxPosition = { x: pos.x, y: 5, z: pos.z };
        const boxRotation = (Math.random() - 0.5) * Math.PI / 4;
        
        boxGroup.position.set(boxPosition.x, boxPosition.y, boxPosition.z);
        boxGroup.rotation.y = boxRotation;
        
        const boxBody = createBoxWithLidPhysicsBody(world, boxPosition, boxRotation);
        
        const lidPosition = { 
            x: boxPosition.x, 
            y: boxPosition.y + 4.75,
            z: boxPosition.z
        };
        const lidBody = createLidPhysicsBody(world, lidPosition);
        
        lidBody.quaternion.copy(boxBody.quaternion);
        
        lidGroup.position.set(lidPosition.x, lidPosition.y, lidPosition.z);
        lidGroup.rotation.y = boxRotation;
        lidGroup.rotation.y = boxRotation;
        
        const hinge = createHingeConstraint(boxBody, lidBody);
        world.addConstraint(hinge);
        
        boxGroup.userData.body = boxBody;
        boxGroup.userData.lid = lidGroup;
        boxGroup.userData.lidBody = lidBody;
        boxGroup.userData.hinge = hinge;
        lidGroup.userData.body = lidBody;
        lidGroup.userData.parentBoxGroup = boxGroup;
        
        scene.add(boxGroup);
        scene.add(lidGroup);
        addBoxWithLid(boxGroup);
        
        const colorNames = ['red', 'yellow', 'blue'];
        const currentCounts = state.boxWithLidColorCounts;
        currentCounts[colorNames[colorIndex]]++;
        setBoxWithLidColorCounts(currentCounts);
    }
}


export function createBoxWithLidFromConfig(scene, world, config) {
    const boxColor = parseInt(config.color.replace('#', ''), 16);
    
    const boxGroup = createBoxWithLidGeometry(boxColor);
    boxGroup.name = config.name;
    boxGroup.userData.type = 'box_with_lid';
    boxGroup.userData.colorIndex = config.colorIndex;
    boxGroup.userData.isOpen = config.isOpen || false;
    
    const lidGroup = createLidGeometry(boxColor);
    lidGroup.name = config.name.replace('lid_box', 'lid');
    lidGroup.userData.type = 'lid';
    lidGroup.userData.parentBox = config.name;
    
    boxGroup.position.set(config.position.x, config.position.y, config.position.z);
    boxGroup.rotation.y = config.rotation || 0;
    
    if (config.isOpen) {
        const hingeZ = config.position.z - 8;
        lidGroup.position.set(config.position.x, config.position.y + 4, hingeZ + 9);
        lidGroup.rotation.x = -Math.PI / 2;
    } else {
        lidGroup.position.set(config.position.x, config.position.y + 4.75, config.position.z);
    }
    lidGroup.rotation.y = config.rotation || 0;
    
    const boxBody = createBoxWithLidPhysicsBody(world, config.position, config.rotation || 0);
    const lidBody = createLidPhysicsBody(world, lidGroup.position);
    
    if (!config.isOpen) {
        lidBody.quaternion.copy(boxBody.quaternion);
        lidBody.angularVelocity.set(0, 0, 0);
        lidBody.velocity.set(0, 0, 0);
        lidBody.angularDamping = 0.99;
        lidBody.fixedRotation = true;
        lidBody.updateMassProperties();
    }
    
    const hinge = createHingeConstraint(boxBody, lidBody);
    world.addConstraint(hinge);
    
    boxGroup.userData.body = boxBody;
    boxGroup.userData.lid = lidGroup;
    boxGroup.userData.lidBody = lidBody;
    boxGroup.userData.hinge = hinge;
    lidGroup.userData.body = lidBody;
    lidGroup.userData.parentBoxGroup = boxGroup;
    
    scene.add(boxGroup);
    scene.add(lidGroup);
    addBoxWithLid(boxGroup);
    
    return boxGroup;
}



import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { colors } from '../core/Config.js';
import { state, addBox, addBoxWithLid, setBoxColorCounts, setBoxWithLidColorCounts } from '../core/GlobalState.js';
import { createBoxGeometry, createBoxPhysicsBody } from './Box.js';
import { 
    createBoxWithLidGeometry, 
    createLidGeometry, 
    createBoxWithLidPhysicsBody, 
    createLidPhysicsBody, 
    createHingeConstraint,
    openLid 
} from './BoxWithLid.js';


export function createAllBoxes(scene, world) {
    console.log('Creating boxes with new random rules...');
    
    setBoxColorCounts({ red: 0, yellow: 0, blue: 0 });
    setBoxWithLidColorCounts({ red: 0, yellow: 0, blue: 0 });
    
    const colorConfigs = [
        { color: colors.red, index: 0, name: 'red' },
        { color: colors.yellow, index: 1, name: 'yellow' },
        { color: colors.blue, index: 2, name: 'blue' }
    ];
    
    const availablePositions = [
        { x: -30, z: 0 },
        { x: 0, z: 0 },
        { x: 30, z: 0 }
    ];
    
    for (let i = availablePositions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [availablePositions[i], availablePositions[j]] = [availablePositions[j], availablePositions[i]];
    }
    
    let normalBoxIndex = 0;
    let lidBoxIndex = 0;
    let positionIndex = 0;
    
    colorConfigs.forEach((colorConfig) => {
        const decision = Math.floor(Math.random() * 3);
        
        if (decision === 0) {
            console.log(`${colorConfig.name} box: NOT created`);
            return;
        }
        
        const pos = availablePositions[positionIndex++];
        const boxPosition = { x: pos.x, y: 5, z: pos.z };
        const boxRotation = (Math.random() - 0.5) * Math.PI / 4;
        
        if (decision === 1) {
            createNormalBox(scene, world, colorConfig, boxPosition, boxRotation, normalBoxIndex++);
        } else {
            const initiallyOpen = Math.random() < 0.5;
            createBoxWithLid(scene, world, colorConfig, boxPosition, boxRotation, lidBoxIndex++, initiallyOpen);
        }
    });
    
    console.log(`Created ${state.boxes.length} normal boxes and ${state.boxesWithLid.length} boxes with lid`);
}


function createNormalBox(scene, world, colorConfig, position, rotation, index) {
    const boxGroup = createBoxGeometry(colorConfig.color);
    boxGroup.name = `box_${index}`;
    boxGroup.userData.colorIndex = colorConfig.index;
    boxGroup.userData.type = 'box';
    
    boxGroup.position.set(position.x, position.y, position.z);
    boxGroup.rotation.y = rotation;
    
    const boxBody = createBoxPhysicsBody(world, position, rotation);
    boxGroup.userData.physicsBody = boxBody;
    
    scene.add(boxGroup);
    addBox(boxGroup);
    
    const currentCounts = state.boxColorCounts;
    currentCounts[colorConfig.name]++;
    setBoxColorCounts(currentCounts);
    
    console.log(`Created normal ${colorConfig.name} box at (${position.x.toFixed(1)}, ${position.z.toFixed(1)})`);
}


function createBoxWithLid(scene, world, colorConfig, position, rotation, index, initiallyOpen) {
    const boxGroup = createBoxWithLidGeometry(colorConfig.color);
    boxGroup.name = `lid_box_${index}`;
    boxGroup.userData.type = 'box_with_lid';
    boxGroup.userData.colorIndex = colorConfig.index;
    boxGroup.userData.isOpen = initiallyOpen;
    
    const lidGroup = createLidGeometry(colorConfig.color);
    lidGroup.name = `lid_${index}`;
    lidGroup.userData.type = 'lid';
    lidGroup.userData.parentBox = boxGroup.name;
    
    boxGroup.position.set(position.x, position.y, position.z);
    boxGroup.rotation.y = rotation;
    
    const boxBody = createBoxWithLidPhysicsBody(world, position, rotation);
    
    const lidPosition = { 
        x: position.x, 
        y: position.y + 4.75,
        z: position.z
    };
    const lidBody = createLidPhysicsBody(world, lidPosition);
    
    lidBody.quaternion.copy(boxBody.quaternion);
    
    lidGroup.position.set(lidPosition.x, lidPosition.y, lidPosition.z);
    lidGroup.rotation.y = rotation;
    
    const hinge = createHingeConstraint(boxBody, lidBody);
    world.addConstraint(hinge);
    
    if (!initiallyOpen) {
        lidBody.angularVelocity.set(0, 0, 0);
        lidBody.velocity.set(0, 0, 0);
        lidBody.angularDamping = 0.99;
        lidBody.fixedRotation = true;
        lidBody.updateMassProperties();
        console.log(`  → Lid locked in closed position with rotation ${rotation.toFixed(2)}`);
    }
    
    boxGroup.userData.body = boxBody;
    boxGroup.userData.lid = lidGroup;
    boxGroup.userData.lidBody = lidBody;
    boxGroup.userData.hinge = hinge;
    lidGroup.userData.body = lidBody;
    lidGroup.userData.parentBoxGroup = boxGroup;
    
    scene.add(boxGroup);
    scene.add(lidGroup);
    addBoxWithLid(boxGroup);
    
    const currentCounts = state.boxWithLidColorCounts;
    currentCounts[colorConfig.name]++;
    setBoxWithLidColorCounts(currentCounts);
    
    console.log(`Created ${colorConfig.name} box with lid at (${position.x.toFixed(1)}, ${position.z.toFixed(1)}), initially ${initiallyOpen ? 'OPEN' : 'CLOSED'}`);
    
    if (initiallyOpen) {
        setTimeout(() => {
            openLid(boxGroup);
        }, 500);
    }
}



import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { colors, objectDimensions } from '../core/Config.js';


export function createDesk(scene, world) {
    const { width, depth, height, legRadius, legHeight } = objectDimensions.table;
    
    const deskGeometry = new THREE.BoxGeometry(width, height, depth);
    const deskMaterial = new THREE.MeshPhongMaterial({ 
        color: colors.wood,
        specular: 0x222222,
        shininess: 30
    });
    const desk = new THREE.Mesh(deskGeometry, deskMaterial);
    desk.position.set(0, 0, 0);
    desk.castShadow = true;
    desk.receiveShadow = true;
    scene.add(desk);
    
    const deskShape = new CANNON.Box(new CANNON.Vec3(width/2, height/2, depth/2));
    const deskBody = new CANNON.Body({ mass: 0 });
    deskBody.addShape(deskShape);
    deskBody.position.set(0, 0, 0);
    deskBody.material = new CANNON.Material({ friction: 0.9, restitution: 0.01 });
    world.addBody(deskBody);
    
    const legGeometry = new THREE.CylinderGeometry(legRadius, legRadius, legHeight);
    const legMaterial = new THREE.MeshPhongMaterial({ 
        color: colors.wood,
        specular: 0x222222,
        shininess: 30
    });
    
    const legPositions = [
        [-80, -17, -35],
        [80, -17, -35],
        [-80, -17, 35],
        [80, -17, 35]
    ];
    
    legPositions.forEach(pos => {
        const leg = new THREE.Mesh(legGeometry, legMaterial);
        leg.position.set(pos[0], pos[1], pos[2]);
        leg.castShadow = true;
        scene.add(leg);
    });
    
    return desk;
}

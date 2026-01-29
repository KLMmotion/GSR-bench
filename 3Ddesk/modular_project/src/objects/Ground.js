

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { colors } from '../core/Config.js';


export function createGround(scene, world) {
    const groundGeometry = new THREE.PlaneGeometry(300, 300);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: colors.ground });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -30;
    ground.receiveShadow = true;
    scene.add(ground);
    
    const groundShape = new CANNON.Plane();
    const groundBody = new CANNON.Body({ mass: 0 });
    groundBody.addShape(groundShape);
    groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    groundBody.position.set(0, -30, 0);
    groundBody.material = new CANNON.Material({ friction: 0.9, restitution: 0.01 });
    world.addBody(groundBody);
    
    return ground;
}

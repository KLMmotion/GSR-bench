

import * as THREE from 'three';
import { config } from '../core/Config.js';


export function createBoundary(scene, world) {
    const sphereGeometry = new THREE.SphereGeometry(config.boundaryRadius, 32, 16);
    const sphereMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x00ff00, 
        wireframe: true, 
        transparent: true, 
        opacity: 0.3,
        visible: config.showBoundary === 1
    });
    const boundaryMesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
    boundaryMesh.position.set(0, 0, 0);
    scene.add(boundaryMesh);
    
    return boundaryMesh;
}


export function toggleBoundary(boundaryMesh) {
    config.showBoundary = config.showBoundary === 1 ? 0 : 1;
    if (boundaryMesh) {
        boundaryMesh.visible = config.showBoundary === 1;
    }
    console.log('Boundary visibility:', config.showBoundary === 1 ? 'ON' : 'OFF');
}

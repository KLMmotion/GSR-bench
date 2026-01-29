

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { state } from '../core/GlobalState.js';


export async function loadPlateModel() {
    const basePath = './libero_assest/assets/stable_scanned_objects/plate/';
    
    return new Promise((resolve, reject) => {
        const mtlLoader = new MTLLoader();
        mtlLoader.setPath(basePath);
        
        mtlLoader.load('model.mtl', (materials) => {
            materials.preload();
            
            const objLoader = new OBJLoader();
            objLoader.setMaterials(materials);
            objLoader.setPath(basePath);
            
            objLoader.load('model.obj', (object) => {
                object.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                
                resolve(object);
            }, undefined, reject);
        }, undefined, reject);
    });
}


export async function createPlate(scene, world, position = { x: 0, y: 10, z: 0 }) {
    try {
        const plateModel = await loadPlateModel();
        
        plateModel.position.set(position.x, position.y, position.z);
        
        const scale = 50;
        plateModel.scale.set(scale, scale, scale);
        
        scene.add(plateModel);
        
        const plateRadius = 1.5;
        const plateHeight = 0.5;
        
        const plateShape = new CANNON.Cylinder(plateRadius, plateRadius, plateHeight, 16);
        const plateBody = new CANNON.Body({
            mass: 0.3, // 300g
            shape: plateShape,
            material: new CANNON.Material({
                friction: 0.5,
                restitution: 0.1
            })
        });
        
        const quat = new CANNON.Quaternion();
        quat.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        plateBody.quaternion = quat;
        
        plateBody.position.set(position.x, position.y, position.z);
        world.addBody(plateBody);
        
        plateModel.userData = {
            type: 'plate',
            physicsBody: plateBody,
            name: `plate_${state.plates ? state.plates.length : 0}`
        };
        
        if (!state.plates) {
            state.plates = [];
        }
        state.plates.push(plateModel);
        
        console.log('✅ Plate loaded successfully at', position);
        return plateModel;
        
    } catch (error) {
        console.error('❌ Error loading plate model:', error);
        throw error;
    }
}


export async function createPlateAtRandomPosition(scene, world) {
    const randomX = (Math.random() - 0.5) * 180;
    const randomZ = (Math.random() - 0.5) * 120;
    const y = 10;
    
    const position = { x: randomX, y: y, z: randomZ };
    return await createPlate(scene, world, position);
}

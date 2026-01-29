

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { state } from '../core/GlobalState.js';

let isDragging = false;
let dragObject = null;
let dragConstraint = null;


export function initDragSystem(renderer, camera, controls, world) {
    renderer.domElement.addEventListener('mousedown', (event) => onMouseDown(event, camera, controls, world));
    renderer.domElement.addEventListener('mousemove', (event) => onMouseMove(event, camera));
    renderer.domElement.addEventListener('mouseup', () => onMouseUp(controls, world));
}


function onMouseDown(event, camera, controls, world) {
    state.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    state.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    state.raycaster.setFromCamera(state.mouse, camera);
    
    const draggableObjects = [
        ...state.boxes, 
        ...state.mugs, 
        ...state.cubes, 
        ...state.boxesWithLid,
        ...state.liberoAssets
    ];
    state.boxesWithLid.forEach(box => {
        if (box.userData.lid) {
            draggableObjects.push(box.userData.lid);
        }
    });
    
    const intersects = state.raycaster.intersectObjects(draggableObjects, true);
    
    if (intersects.length > 0) {
        let object = intersects[0].object;
        while (object.parent && !object.userData.physicsBody && !object.userData.body) {
            object = object.parent;
        }
        
        const physicsBody = object.userData.physicsBody || object.userData.body;
        
        if (object.userData && physicsBody) {
            isDragging = true;
            dragObject = object;
            
            state.objectsInHand.add(object);
            
            controls.enabled = false;
            
            physicsBody.angularVelocity.set(0, 0, 0);
            physicsBody.fixedRotation = true;
            
            dragConstraint = new CANNON.PointToPointConstraint(
                physicsBody,
                new CANNON.Vec3(0, 0, 0),
                new CANNON.Body({ mass: 0 }),
                new CANNON.Vec3(
                    intersects[0].point.x,
                    intersects[0].point.y,
                    intersects[0].point.z
                )
            );
            world.addConstraint(dragConstraint);
        }
    }
}


function onMouseMove(event, camera) {
    if (isDragging && dragConstraint) {
        state.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        state.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        state.raycaster.setFromCamera(state.mouse, camera);
        
        const direction = state.raycaster.ray.direction;
        const distance = 100;
        const targetPoint = state.raycaster.ray.origin.clone().add(direction.multiplyScalar(distance));
        
        targetPoint.x = Math.max(-55, Math.min(55, targetPoint.x));
        targetPoint.z = Math.max(-25, Math.min(25, targetPoint.z));
        targetPoint.y = Math.max(5, targetPoint.y);
        
        dragConstraint.pivotB.set(targetPoint.x, targetPoint.y, targetPoint.z);
        
        const physicsBody = dragObject && (dragObject.userData.physicsBody || dragObject.userData.body);
        if (physicsBody) {
            physicsBody.angularVelocity.set(0, 0, 0);
        }
    }
}


function onMouseUp(controls, world) {
    if (isDragging && dragConstraint) {
        world.removeConstraint(dragConstraint);
        
        const physicsBody = dragObject && (dragObject.userData.physicsBody || dragObject.userData.body);
        if (physicsBody) {
            physicsBody.angularVelocity.set(0, 0, 0);
            physicsBody.fixedRotation = true;
            
            state.objectsInHand.delete(dragObject);
        }
        
        dragConstraint = null;
        dragObject = null;
        isDragging = false;
        
        controls.enabled = true;
    }
}


export function getIsDragging() {
    return isDragging;
}


export function getDragObject() {
    return dragObject;
}

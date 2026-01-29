

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { state } from '../core/GlobalState.js';
import { addLogEntry } from '../ui/UIManager.js';
import { waitForSceneStabilization } from './CommandExecutor.js';


function getPhysicsBody(object) {
    if (!object || !object.userData) return null;
    return object.userData.physicsBody || object.userData.body;
}


function stopBodyMotion(body) {
    body.velocity.set(0, 0, 0);
    body.angularVelocity.set(0, 0, 0);
}


function extractYRotation(quaternion) {
    const q = quaternion;
    return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
}


function setBodyRotationY(body, rotation) {
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotation);
}


export function animateObjectMovement(object, targetPosition, containedObjects = []) {
    console.log(`🎬 animateObjectMovement START`);
    console.log(`  Object:`, object.userData);
    console.log(`  Target position:`, targetPosition);
    console.log(`  Contained objects:`, containedObjects.length);
    
    const body = getPhysicsBody(object);
    if (!body) {
        console.error('Cannot get physics body from object');
        return;
    }
    console.log(`  Physics body found:`, {x: body.position.x.toFixed(1), y: body.position.y.toFixed(1), z: body.position.z.toFixed(1)});
    
    const world = state.world;
    
    state.objectsInHand.add(object);
    state.objectsBeingAnimated.add(object);
    
    const originalStep = world.step;
    world.step = function() {};
    
    stopBodyMotion(body);
    body.fixedRotation = true;
    
    let lidBody = null;
    let lidStartPosition = null;
    if (object.userData.type === 'box_with_lid' && object.userData.lidBody) {
        lidBody = object.userData.lidBody;
        stopBodyMotion(lidBody);
        lidBody.fixedRotation = true;
        lidStartPosition = {
            x: lidBody.position.x,
            y: lidBody.position.y,
            z: lidBody.position.z
        };
    }
    
    containedObjects.forEach(contained => {
        const containedBody = getPhysicsBody(contained.object);
        if (!containedBody) return;
        stopBodyMotion(containedBody);
        containedBody.fixedRotation = true;
        state.objectsInHand.add(contained.object);
    });
    
    const startPosition = {
        x: body.position.x,
        y: body.position.y,
        z: body.position.z
    };
    
    const highestY = Math.max(startPosition.y, targetPosition.y) + 15;
    const intermediatePosition = {
        x: startPosition.x + (targetPosition.x - startPosition.x) * 0.5,
        y: highestY,
        z: startPosition.z + (targetPosition.z - startPosition.z) * 0.5
    };
    
    const totalDuration = 200;
    const phase1Duration = totalDuration * 0.4;
    const phase2Duration = totalDuration * 0.3;
    const phase3Duration = totalDuration * 0.3;
    
    const startTime = Date.now();
    
    function animateStep() {
        const elapsed = Date.now() - startTime;
        let progress = 0;
        let currentStart, currentTarget;
        
        if (elapsed < phase1Duration) {
            progress = elapsed / phase1Duration;
            currentStart = startPosition;
            currentTarget = intermediatePosition;
        } else if (elapsed < phase1Duration + phase2Duration) {
            progress = (elapsed - phase1Duration) / phase2Duration;
            currentStart = intermediatePosition;
            currentTarget = {
                x: targetPosition.x,
                y: highestY,
                z: targetPosition.z
            };
        } else if (elapsed < totalDuration) {
            progress = (elapsed - phase1Duration - phase2Duration) / phase3Duration;
            currentStart = {
                x: targetPosition.x,
                y: highestY,
                z: targetPosition.z
            };
            currentTarget = targetPosition;
        } else {
            state.objectsInHand.delete(object);
            state.objectsBeingAnimated.delete(object);
            containedObjects.forEach(contained => {
                state.objectsInHand.delete(contained.object);
            });
            
            body.position.set(targetPosition.x, targetPosition.y, targetPosition.z);
            
            if (lidBody && lidStartPosition) {
                const lidOffset = {
                    x: lidStartPosition.x - startPosition.x,
                    y: lidStartPosition.y - startPosition.y,
                    z: lidStartPosition.z - startPosition.z
                };
                lidBody.position.set(
                    targetPosition.x + lidOffset.x,
                    targetPosition.y + lidOffset.y,
                    targetPosition.z + lidOffset.z
                );
            }
            
            containedObjects.forEach(contained => {
                const containedBody = getPhysicsBody(contained.object);
                if (!containedBody) return;
                containedBody.position.set(
                    targetPosition.x + contained.relativePosition.x,
                    targetPosition.y + contained.relativePosition.y,
                    targetPosition.z + contained.relativePosition.z
                );
            });
            
            setTimeout(() => {
                world.step = originalStep;
                console.log('Movement completed with', containedObjects.length, 'contained objects');
                waitForSceneStabilization();
            }, 100);
            return;
        }
        
        const easeProgress = progress < 0.5 
            ? 2 * progress * progress 
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        
        const newPosition = {
            x: currentStart.x + (currentTarget.x - currentStart.x) * easeProgress,
            y: currentStart.y + (currentTarget.y - currentStart.y) * easeProgress,
            z: currentStart.z + (currentTarget.z - currentStart.z) * easeProgress
        };
        
        body.position.set(newPosition.x, newPosition.y, newPosition.z);
        
        if (lidBody && lidStartPosition) {
            const lidOffset = {
                x: lidStartPosition.x - startPosition.x,
                y: lidStartPosition.y - startPosition.y,
                z: lidStartPosition.z - startPosition.z
            };
            lidBody.position.set(
                newPosition.x + lidOffset.x,
                newPosition.y + lidOffset.y,
                newPosition.z + lidOffset.z
            );
        }
        
        containedObjects.forEach(contained => {
            const containedBody = getPhysicsBody(contained.object);
            if (!containedBody) return;
            containedBody.position.set(
                newPosition.x + contained.relativePosition.x,
                newPosition.y + contained.relativePosition.y,
                newPosition.z + contained.relativePosition.z
            );
        });
        
        requestAnimationFrame(animateStep);
    }
    
    animateStep();
}


export function animateObjectMovementWithRotation(object, targetPosition, containedObjects = [], targetRotation = null) {
    const body = getPhysicsBody(object);
    if (!body) {
        console.error('Cannot get physics body from object');
        return;
    }
    
    const world = state.world;
    
    state.objectsInHand.add(object);
    state.objectsBeingAnimated.add(object);
    
    if (object.userData.wasInDrawer) {
        console.log(`🔓 Releasing object from drawer binding`);
        object.userData.wasInDrawer = false;
        object.userData.drawerOffset = null;
        object.userData.drawerBody = null;
    }
    
    const originalStep = world.step;
    world.step = function() {};
    
    stopBodyMotion(body);
    body.fixedRotation = true;
    
    let lidBody = null;
    let lidStartPosition = null;
    if (object.userData.type === 'box_with_lid' && object.userData.lidBody) {
        lidBody = object.userData.lidBody;
        stopBodyMotion(lidBody);
        lidBody.fixedRotation = true;
        lidStartPosition = {
            x: lidBody.position.x,
            y: lidBody.position.y,
            z: lidBody.position.z
        };
    }
    
    containedObjects.forEach(contained => {
        const containedBody = getPhysicsBody(contained.object);
        if (!containedBody) return;
        stopBodyMotion(containedBody);
        containedBody.fixedRotation = true;
        state.objectsInHand.add(contained.object);
    });
    
    const startPosition = {
        x: body.position.x,
        y: body.position.y,
        z: body.position.z
    };
    
    const startRotation = extractYRotation(body.quaternion);
    const startQuaternion = body.quaternion.clone();
    
    const highestY = Math.max(startPosition.y, targetPosition.y) + 15;
    const intermediatePosition = {
        x: startPosition.x + (targetPosition.x - startPosition.x) * 0.5,
        y: highestY,
        z: startPosition.z + (targetPosition.z - startPosition.z) * 0.5
    };
    
    const totalDuration = 800;
    const phase1Duration = totalDuration * 0.3;
    const phase2Duration = totalDuration * 0.4;
    const phase3Duration = totalDuration * 0.3;
    
    const startTime = Date.now();
    
    function animateStep() {
        const elapsed = Date.now() - startTime;
        let progress = 0;
        let currentStart, currentTarget, rotationProgress = 0;
        
        if (elapsed < phase1Duration) {
            progress = elapsed / phase1Duration;
            currentStart = startPosition;
            currentTarget = intermediatePosition;
            rotationProgress = 0;
        } else if (elapsed < phase1Duration + phase2Duration) {
            progress = (elapsed - phase1Duration) / phase2Duration;
            currentStart = intermediatePosition;
            currentTarget = {
                x: targetPosition.x,
                y: highestY,
                z: targetPosition.z
            };
            rotationProgress = progress;
        } else if (elapsed < totalDuration) {
            progress = (elapsed - phase1Duration - phase2Duration) / phase3Duration;
            currentStart = {
                x: targetPosition.x,
                y: highestY,
                z: targetPosition.z
            };
            currentTarget = targetPosition;
            rotationProgress = 1;
        } else {
            state.objectsInHand.delete(object);
            state.objectsBeingAnimated.delete(object);
            containedObjects.forEach(contained => {
                state.objectsInHand.delete(contained.object);
            });
            
            body.position.set(targetPosition.x, targetPosition.y, targetPosition.z);
            if (targetPosition.rotation !== undefined) {
                if (targetPosition.rotationAxis === 'x') {
                    const targetQuaternion = new THREE.Quaternion();
                    targetQuaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), targetPosition.rotation);
                    body.quaternion.copy(targetQuaternion);
                } else if (targetPosition.rotationAxis === 'z') {
                    const targetQuaternion = new THREE.Quaternion();
                    targetQuaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), targetPosition.rotation);
                    body.quaternion.copy(targetQuaternion);
                } else {
                    setBodyRotationY(body, targetPosition.rotation);
                }
            }
            
            if (lidBody && lidStartPosition) {
                const lidOffset = {
                    x: lidStartPosition.x - startPosition.x,
                    y: lidStartPosition.y - startPosition.y,
                    z: lidStartPosition.z - startPosition.z
                };
                lidBody.position.set(
                    targetPosition.x + lidOffset.x,
                    targetPosition.y + lidOffset.y,
                    targetPosition.z + lidOffset.z
                );
            }
            
            containedObjects.forEach(contained => {
                const containedBody = getPhysicsBody(contained.object);
                if (!containedBody) return;
                containedBody.position.set(
                    targetPosition.x + contained.relativePosition.x,
                    targetPosition.y + contained.relativePosition.y,
                    targetPosition.z + contained.relativePosition.z
                );
            });
            
            setTimeout(() => {
                world.step = originalStep;
                addLogEntry('物体放置完成，包含旋转调整', 'success');
                waitForSceneStabilization();
            }, 100);
            return;
        }
        
        const easeProgress = progress < 0.5 
            ? 2 * progress * progress 
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        
        const newPosition = {
            x: currentStart.x + (currentTarget.x - currentStart.x) * easeProgress,
            y: currentStart.y + (currentTarget.y - currentStart.y) * easeProgress,
            z: currentStart.z + (currentTarget.z - currentStart.z) * easeProgress
        };
        
        body.position.set(newPosition.x, newPosition.y, newPosition.z);
        
        if (targetPosition.rotation !== undefined) {
            if (targetPosition.rotationAxis === 'x' || targetPosition.rotationAxis === 'z') {
                const targetQuaternion = new THREE.Quaternion();
                const axis = targetPosition.rotationAxis === 'x' 
                    ? new THREE.Vector3(1, 0, 0) 
                    : new THREE.Vector3(0, 0, 1);
                targetQuaternion.setFromAxisAngle(axis, targetPosition.rotation);
                
                body.quaternion.copy(startQuaternion).slerp(targetQuaternion, rotationProgress);
            } else {
                const currentRotation = startRotation + (targetPosition.rotation - startRotation) * rotationProgress;
                setBodyRotationY(body, currentRotation);
            }
        }
        
        if (lidBody && lidStartPosition) {
            const lidOffset = {
                x: lidStartPosition.x - startPosition.x,
                y: lidStartPosition.y - startPosition.y,
                z: lidStartPosition.z - startPosition.z
            };
            lidBody.position.set(
                newPosition.x + lidOffset.x,
                newPosition.y + lidOffset.y,
                newPosition.z + lidOffset.z
            );
        }
        
        containedObjects.forEach(contained => {
            const containedBody = getPhysicsBody(contained.object);
            if (!containedBody) return;
            containedBody.position.set(
                newPosition.x + contained.relativePosition.x,
                newPosition.y + contained.relativePosition.y,
                newPosition.z + contained.relativePosition.z
            );
        });
        
        requestAnimationFrame(animateStep);
    }
    
    animateStep();
}

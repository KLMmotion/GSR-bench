

import * as CANNON from 'cannon-es';
import { physicsConfig } from './Config.js';


export function initPhysicsWorld() {
    const world = new CANNON.World();
    world.gravity.set(0, physicsConfig.gravity, 0);
    world.broadphase = new CANNON.NaiveBroadphase();
    world.defaultContactMaterial.friction = physicsConfig.friction;
    world.defaultContactMaterial.restitution = physicsConfig.restitution;
    world.defaultContactMaterial.contactEquationStiffness = 1e8;
    world.defaultContactMaterial.contactEquationRelaxation = 4;
    
    return world;
}


export function stepPhysics() {
    const world = GlobalState.world;
    if (world) {
        world.step(1/60);
    }
}


export function syncPhysicsWithGraphics() {
    GlobalState.boxes.forEach(box => {
        if (box.userData.physicsBody) {
            box.position.copy(box.userData.physicsBody.position);
            box.quaternion.copy(box.userData.physicsBody.quaternion);
        }
    });
    
    GlobalState.mugs.forEach(mug => {
        if (mug.userData.physicsBody) {
            mug.position.copy(mug.userData.physicsBody.position);
            mug.quaternion.copy(mug.userData.physicsBody.quaternion);
        }
    });
}


export function constrainToBoundary() {
    const center = new CANNON.Vec3(0, 0, 0);
    const maxDistance = config.boundaryRadius - 5;
    
    [...GlobalState.boxes, ...GlobalState.mugs].forEach(object => {
        if (object.userData.physicsBody) {
            const body = object.userData.physicsBody;
            const position = body.position;
            const distance = center.distanceTo(position);
            
            if (distance > maxDistance) {
                const direction = position.clone().vsub(center).unit();
                const newPosition = center.clone().vadd(direction.scale(maxDistance));
                body.position.copy(newPosition);
                
                const velocityTowardsCenter = body.velocity.clone().dot(direction.scale(-1));
                if (velocityTowardsCenter < 0) {
                    body.velocity.vadd(direction.scale(-velocityTowardsCenter * 0.5));
                }
            }
        }
    });
}


export function createPhysicsMaterial(options = {}) {
    return new CANNON.Material({
        friction: options.friction || physicsConfig.friction,
        restitution: options.restitution || physicsConfig.restitution
    });
}


export function createBoxShape(halfExtents) {
    return new CANNON.Box(new CANNON.Vec3(halfExtents.x, halfExtents.y, halfExtents.z));
}


export function createCylinderShape(radiusTop, radiusBottom, height, numSegments) {
    return new CANNON.Cylinder(radiusTop, radiusBottom, height, numSegments);
}


export function createPlaneShape() {
    return new CANNON.Plane();
}


export function createBody(options = {}) {
    const body = new CANNON.Body({
        mass: options.mass || 0
    });
    
    if (options.fixedRotation !== undefined) {
        body.fixedRotation = options.fixedRotation;
    }
    
    body.linearDamping = options.linearDamping || physicsConfig.linearDamping;
    body.angularDamping = options.angularDamping || physicsConfig.angularDamping;
    
    return body;
}


export function setBodyPosition(body, x, y, z) {
    body.position.set(x, y, z);
}


export function setBodyRotationY(body, angle) {
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), angle);
}


export function extractYRotation(quaternion) {
    return Math.atan2(
        2 * (quaternion.w * quaternion.y + quaternion.x * quaternion.z),
        1 - 2 * (quaternion.y * quaternion.y + quaternion.z * quaternion.z)
    );
}


export function stopBodyMotion(body) {
    body.velocity.set(0, 0, 0);
    body.angularVelocity.set(0, 0, 0);
}

export { CANNON };

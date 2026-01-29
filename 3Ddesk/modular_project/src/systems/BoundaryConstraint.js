

import * as CANNON from 'cannon-es';
import { config } from '../core/Config.js';
import { state } from '../core/GlobalState.js';


export function constrainToBoundary() {
    const center = new CANNON.Vec3(0, 0, 0);
    const maxDistance = config.boundaryRadius - 5;
    
    [...state.boxes, ...state.mugs].forEach(object => {
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


export function toggleBoundary() {
    config.showBoundary = config.showBoundary === 1 ? 0 : 1;
    if (state.boundaryMesh) {
        state.boundaryMesh.visible = config.showBoundary === 1;
    }
    console.log('Boundary visibility:', config.showBoundary === 1 ? 'ON' : 'OFF');
}

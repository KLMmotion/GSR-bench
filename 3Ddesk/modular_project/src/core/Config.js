

export const config = {
    showBoundary: 0, // 0: invisible, 1: visible
    boundaryRadius: 80, // Sphere radius for boundary
    rosUrl: 'ws://localhost:9090' // ROS bridge WebSocket URL
};

export const colors = {
    red: 0xff4444,
    yellow: 0xffdd44,
    blue: 0x4488ff,
    green: 0x44ff44,
    white: 0xeeeeee,
    wood: 0x8B4513,
    ground: 0x4A4A4A
};

export const objectDimensions = {
    box: {
        width: 25,
        depth: 17,
        height: 8,
        wallThickness: 1
    },
    mug: {
        radius: 2.2,
        height: 5,
        handleRadius: 1.2,
        handleThickness: 0.25
    },
    table: {
        width: 180,
        depth: 90,
        height: 4,
        legRadius: 2,
        legHeight: 30
    }
};

export const physicsConfig = {
    gravity: -100,
    boxMass: 200,
    mugMass: 100,
    cubeMass: 80,
    friction: 0.6,
    restitution: 0.1,
    linearDamping: 0.01,
    angularDamping: 0.01
};

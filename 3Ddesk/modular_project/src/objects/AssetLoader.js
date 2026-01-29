

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { state } from '../core/GlobalState.js';
import { updateObjectNameMapping } from '../utils/ObjectNaming.js';
import { findSafeTablePositionWithGrid } from '../systems/TableGridPlacement.js';


export const ASSET_CATALOG = {
    scanned: [
        { id: 'plate', name: 'Plate (盘子)', path: './libero_assest/assets/stable_scanned_objects/plate/', files: 'model' },
        { id: 'bowl', name: 'Bowl (碗)', path: './libero_assest/assets/stable_scanned_objects/bowl/', files: 'model' },
        { id: 'white_bowl', name: 'White Bowl (白碗)', path: './libero_assest/assets/stable_scanned_objects/white_bowl/', files: 'model' },
        { id: 'red_bowl', name: 'Red Bowl (红碗)', path: './libero_assest/assets/stable_scanned_objects/red_bowl/', files: 'model' }
    ],
    hope: [
        { id: 'milk', name: 'Milk (牛奶)', path: './libero_assest/assets/stable_hope_objects/milk/', files: 'textured' },
        { id: 'ketchup', name: 'Ketchup (番茄酱)', path: './libero_assest/assets/stable_hope_objects/ketchup/', files: 'textured' },
        { id: 'orange_juice', name: 'Orange Juice (橙汁)', path: './libero_assest/assets/stable_hope_objects/orange_juice/', files: 'textured' },
        { id: 'alphabet_soup', name: 'Alphabet Soup (字母汤)', path: './libero_assest/assets/stable_hope_objects/alphabet_soup/', files: 'textured' },
        { id: 'tomato_sauce', name: 'Tomato Sauce (番茄酱罐)', path: './libero_assest/assets/stable_hope_objects/tomato_sauce/', files: 'textured' },
        { id: 'chocolate_pudding', name: 'Chocolate Pudding (巧克力布丁)', path: './libero_assest/assets/stable_hope_objects/chocolate_pudding/', files: 'textured' },
        { id: 'butter', name: 'Butter (黄油)', path: './libero_assest/assets/stable_hope_objects/butter/', files: 'butter' },
        { id: 'bbq_sauce', name: 'BBQ Sauce (烧烤酱)', path: './libero_assest/assets/stable_hope_objects/bbq_sauce/', files: 'bbq_sauce' },
        { id: 'cream_cheese', name: 'Cream Cheese (奶油奶酪)', path: './libero_assest/assets/stable_hope_objects/cream_cheese/', files: 'cream_cheese' },
        { id: 'popcorn', name: 'Popcorn (爆米花)', path: './libero_assest/assets/stable_hope_objects/popcorn/', files: 'popcorn' }
    ],
    turbosquid: [
        { id: 'red_coffee_mug', name: 'Red Coffee Mug (红色咖啡杯)', path: './libero_assest/assets/turbosquid_objects/red_coffee_mug/', files: 'red_coffee_mug' },
        { id: 'white_yellow_mug', name: 'White Yellow Mug (黄白杯子)', path: './libero_assest/assets/turbosquid_objects/white_yellow_mug/', files: 'white_yellow_mug' },
        { id: 'porcelain_mug', name: 'Porcelain Mug (瓷杯)', path: './libero_assest/assets/turbosquid_objects/porcelain_mug/', files: 'porcelain_mug' },
        { id: 'black_book', name: 'Black Book (黑色书籍)', path: './libero_assest/assets/turbosquid_objects/black_book/', files: 'black_book' },
        { id: 'yellow_book', name: 'Yellow Book (黄色书籍)', path: './libero_assest/assets/turbosquid_objects/yellow_book/', files: 'yellow_book' }
    ],
    articulated: [
        { id: 'short_cabinet', name: 'Short Cabinet (矮柜-3抽屉)', path: './libero_assest/assets/articulated_objects/short_cabinet/', files: 'articulated', parts: ['base', 'drawer_low', 'drawer_middle', 'drawer_high'] }
    ],
    simple: [
        { id: 'cube_red', name: 'Red Cube (红立方体)', type: 'cube', color: 'red', repeatable: true },
        { id: 'cube_yellow', name: 'Yellow Cube (黄立方体)', type: 'cube', color: 'yellow', repeatable: true },
        { id: 'cube_blue', name: 'Blue Cube (蓝立方体)', type: 'cube', color: 'blue', repeatable: true },
        { id: 'mug_red', name: 'Red Mug (红杯子)', type: 'mug', color: 'red', repeatable: true },
        { id: 'mug_yellow', name: 'Yellow Mug (黄杯子)', type: 'mug', color: 'yellow', repeatable: true },
        { id: 'mug_blue', name: 'Blue Mug (蓝杯子)', type: 'mug', color: 'blue', repeatable: true }
    ]
};


const loadedAssets = new Set();


export function isAssetLoaded(assetId) {
    return loadedAssets.has(assetId);
}


export function markAssetLoaded(assetId) {
    loadedAssets.add(assetId);
}


export function unmarkAssetLoaded(assetId) {
    loadedAssets.delete(assetId);
}


async function loadOBJModel(basePath, fileName) {
    return new Promise((resolve, reject) => {
        const mtlLoader = new MTLLoader();
        mtlLoader.setPath(basePath);
        
        mtlLoader.load(`${fileName}.mtl`, (materials) => {
            materials.preload();
            
            const objLoader = new OBJLoader();
            objLoader.setMaterials(materials);
            objLoader.setPath(basePath);
            
            objLoader.load(`${fileName}.obj`, (object) => {
                object.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                
                resolve(object);
            }, undefined, (error) => {
                console.error(`Failed to load OBJ: ${fileName}.obj`, error);
                reject(error);
            });
        }, undefined, (error) => {
            console.error(`Failed to load MTL: ${fileName}.mtl`, error);
            reject(error);
        });
    });
}


function createPhysicsVisualization(body, size, color = 0x00ff00) {
    const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    const material = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.5,
        wireframe: false,
        depthTest: true,
        side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);
    
    const edges = new THREE.EdgesGeometry(geometry);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 3 });
    const wireframe = new THREE.LineSegments(edges, lineMaterial);
    mesh.add(wireframe);
    
    mesh.position.set(body.position.x, body.position.y, body.position.z);
    if (body.quaternion) {
        mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
    }
    
    console.log(`   🟢 Visualization ${color.toString(16)} position set to: (${mesh.position.x.toFixed(2)}, ${mesh.position.y.toFixed(2)}, ${mesh.position.z.toFixed(2)})`);
    console.log(`   📦 Size: ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}`);
    
    const axesHelper = createLocalAxesHelper(Math.max(size.x, size.y, size.z) / 2);
    mesh.add(axesHelper);
    
    return mesh;
}


function createShapeVisualization(size, offset, color = 0x00ff00) {
    const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    const material = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.4,
        wireframe: false,
        depthTest: true,
        side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);
    
    mesh.position.set(offset.x, offset.y, offset.z);
    
    const edges = new THREE.EdgesGeometry(geometry);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
    const wireframe = new THREE.LineSegments(edges, lineMaterial);
    mesh.add(wireframe);
    
    return mesh;
}


function createLocalAxesHelper(size) {
    const axesGroup = new THREE.Group();
    
    const xAxisGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(size, 0, 0)
    ]);
    const xAxisMaterial = new THREE.LineBasicMaterial({ 
        color: 0xff0000,
        linewidth: 3
    });
    const xAxis = new THREE.Line(xAxisGeometry, xAxisMaterial);
    axesGroup.add(xAxis);
    
    const yAxisGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, size, 0)
    ]);
    const yAxisMaterial = new THREE.LineBasicMaterial({ 
        color: 0x00ff00,
        linewidth: 3
    });
    const yAxis = new THREE.Line(yAxisGeometry, yAxisMaterial);
    axesGroup.add(yAxis);
    
    const zAxisGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, size)
    ]);
    const zAxisMaterial = new THREE.LineBasicMaterial({ 
        color: 0x0000ff,
        linewidth: 3
    });
    const zAxis = new THREE.Line(zAxisGeometry, zAxisMaterial);
    axesGroup.add(zAxis);
    
    const xArrowGeometry = new THREE.ConeGeometry(size * 0.05, size * 0.15, 8);
    const xArrowMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const xArrow = new THREE.Mesh(xArrowGeometry, xArrowMaterial);
    xArrow.position.set(size, 0, 0);
    xArrow.rotation.z = -Math.PI / 2;
    axesGroup.add(xArrow);
    
    const yArrowGeometry = new THREE.ConeGeometry(size * 0.05, size * 0.15, 8);
    const yArrowMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const yArrow = new THREE.Mesh(yArrowGeometry, yArrowMaterial);
    yArrow.position.set(0, size, 0);
    axesGroup.add(yArrow);
    
    const zArrowGeometry = new THREE.ConeGeometry(size * 0.05, size * 0.15, 8);
    const zArrowMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
    const zArrow = new THREE.Mesh(zArrowGeometry, zArrowMaterial);
    zArrow.position.set(0, 0, size);
    zArrow.rotation.x = Math.PI / 2;
    axesGroup.add(zArrow);
    
    return axesGroup;
}


async function loadArticulatedPart(basePath, partFolder, partFileName) {
    const partPath = `${basePath}${partFolder}/`;
    return await loadOBJModel(partPath, partFileName);
}


async function loadCollisionModel(basePath, partFolder, partFileName) {
    return new Promise((resolve, reject) => {
        const partPath = `${basePath}${partFolder}/`;
        const objLoader = new OBJLoader();
        objLoader.setPath(partPath);
        
        objLoader.load(`${partFileName}.obj`, (object) => {
            resolve(object);
        }, undefined, (error) => {
            console.warn(`⚠️ Failed to load collision model: ${partFileName}.obj`, error);
            reject(error);
        });
    });
}


async function createArticulatedAsset(scene, world, assetConfig, position) {
    const { id: assetId, name, path, parts } = assetConfig;
    
    console.log(`🗄️ Loading articulated asset: ${name}`);
    console.log(`   Base path: ${path}`);
    console.log(`   Parts: ${parts.join(', ')}`);
    
    const cabinetGroup = new THREE.Group();
    cabinetGroup.name = assetId;
    
    const partObjects = [];
    
    for (let i = 0; i < parts.length; i++) {
        const partName = parts[i];
        try {
            let partFileName;
            
            if (partName === 'base') {
                partFileName = 'base_vis';
            } else {
                partFileName = partName;
            }
            
            console.log(`   ✅ Loading part ${i + 1}/${parts.length}: ${partName}/${partFileName}`);
            const partObject = await loadArticulatedPart(path, partName, partFileName);
            
            let collisionModel = null;
            try {
                const collisionFileName = partName === 'base' ? 'base_col' : `${partName}_col`;
                console.log(`   🔶 Loading collision model: ${partName}/${collisionFileName}`);
                collisionModel = await loadCollisionModel(path, partName, collisionFileName);
                console.log(`   ✅ Collision model loaded for ${partName}`);
            } catch (error) {
                console.warn(`   ⚠️ No collision model for ${partName}, will use visual model`);
            }
            
            partObject.userData.partName = partName;
            partObject.userData.partIndex = i;
            partObject.userData.isDrawer = partName.includes('drawer');
            partObject.userData.isOpen = false;
            partObject.userData.collisionModel = collisionModel;
            
            if (partObject.userData.isDrawer) {
                partObject.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        child.userData.isClickable = true;
                        child.userData.parentDrawer = partObject;
                    }
                });
            }
            
            cabinetGroup.add(partObject);
            partObjects.push(partObject);
            
        } catch (error) {
            console.warn(`   ⚠️ Failed to load part "${partName}":`, error.message);
        }
    }
    
    if (cabinetGroup.children.length === 0) {
        throw new Error(`Failed to load any parts for ${assetId}`);
    }
    
    console.log(`✅ Loaded ${cabinetGroup.children.length}/${parts.length} parts for ${assetId}`);
    
    const box = new THREE.Box3().setFromObject(cabinetGroup);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    const basePart = partObjects.find(part => part.userData.partName === 'base');
    if (basePart) {
        const baseBox = new THREE.Box3().setFromObject(basePart);
        const baseCenter = baseBox.getCenter(new THREE.Vector3());
        
        partObjects.forEach(part => {
            if (part.userData.isDrawer) {
                const partBox = new THREE.Box3().setFromObject(part);
                const partCenter = partBox.getCenter(new THREE.Vector3());
                
                part.userData.localPosition = new THREE.Vector3(
                    partCenter.x - baseCenter.x,
                    partCenter.y - baseCenter.y,
                    partCenter.z - baseCenter.z
                );
                
                console.log(`📍 "${part.userData.partName}" local offset: (${part.userData.localPosition.x.toFixed(2)}, ${part.userData.localPosition.y.toFixed(2)}, ${part.userData.localPosition.z.toFixed(2)})`);
            }
        });
    }
    
    cabinetGroup.position.sub(center);
    
    const maxDim = Math.max(size.x, size.y, size.z);
    const targetSize = 25;
    const scale = targetSize / maxDim;
    cabinetGroup.scale.setScalar(scale);
    
    console.log(`📏 Cabinet size: ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}`);
    console.log(`📏 Scale factor: ${scale.toFixed(3)}, target size: ${targetSize}`);

    let baseBody;

    if (basePart) {
        const modelForPhysics = basePart.userData.collisionModel || basePart;
        const modelType = basePart.userData.collisionModel ? 'collision model' : 'visual model';
        
        console.log(`🏗️ Creating base physics body using ${modelType}`);
        
        const baseBox = new THREE.Box3().setFromObject(modelForPhysics);
        const baseSize = new THREE.Vector3();
        baseBox.getSize(baseSize);

        const baseScaledSize = new THREE.Vector3(
            baseSize.x * scale,
            baseSize.y * scale,
            baseSize.z * scale
        );

        const wallThickness = 0.5;

        baseBody = new CANNON.Body({
            mass: 50,
            fixedRotation: false,
            linearDamping: 0.9,
            angularDamping: 0.9,
            position: new CANNON.Vec3(position.x, position.y + baseScaledSize.y / 2, position.z),
            collisionFilterGroup: 1,
            collisionFilterMask: ~2
        });

        if (position.rotation !== undefined) {
            baseBody.quaternion.setFromEuler(position.rotation, 0, 0, 'XYZ');
            console.log(`   🔄 Cabinet physics body rotation: ${(position.rotation * 180 / Math.PI).toFixed(1)}°`);
        }

        baseBody.angularFactor.set(0, 1, 0);
        
        const bottomY = -baseScaledSize.y / 2 + wallThickness / 2;
        const bottomShape = new CANNON.Box(new CANNON.Vec3(
            baseScaledSize.x / 2,
            wallThickness / 2,
            baseScaledSize.z / 2
        ));
        baseBody.addShape(bottomShape, new CANNON.Vec3(0, bottomY, 0));
        
        const topY = baseScaledSize.y / 2 - wallThickness / 2;
        const topShape = new CANNON.Box(new CANNON.Vec3(
            baseScaledSize.x / 2,
            wallThickness / 2,
            baseScaledSize.z / 2
        ));
        baseBody.addShape(topShape, new CANNON.Vec3(0, topY, 0));
        
        const backShape = new CANNON.Box(new CANNON.Vec3(
            wallThickness / 2,
            baseScaledSize.y / 2,
            baseScaledSize.z / 2
        ));
        baseBody.addShape(backShape, new CANNON.Vec3(-baseScaledSize.x / 2 + wallThickness / 2, 0, 0));
        
        const leftShape = new CANNON.Box(new CANNON.Vec3(
            baseScaledSize.x / 2,
            baseScaledSize.y / 2,
            wallThickness / 2
        ));
        baseBody.addShape(leftShape, new CANNON.Vec3(0, 0, baseScaledSize.z / 2 - wallThickness / 2));
        
        const rightShape = new CANNON.Box(new CANNON.Vec3(
            baseScaledSize.x / 2,
            baseScaledSize.y / 2,
            wallThickness / 2
        ));
        baseBody.addShape(rightShape, new CANNON.Vec3(0, 0, -baseScaledSize.z / 2 + wallThickness / 2));

        world.addBody(baseBody);
        
        // const baseVizGroup = new THREE.Group();
        // baseVizGroup.name = `base_physics_${assetId}`;
        
        // const bottomViz = createShapeVisualization(
        //     new CANNON.Vec3(baseScaledSize.x, wallThickness, baseScaledSize.z),
        //     new CANNON.Vec3(0, bottomY, 0),
        // );
        // baseVizGroup.add(bottomViz);
        
        // const topViz = createShapeVisualization(
        //     new CANNON.Vec3(baseScaledSize.x, wallThickness, baseScaledSize.z),
        //     new CANNON.Vec3(0, topY, 0),
        //     0xffff00
        // );
        // baseVizGroup.add(topViz);
        
        // const backViz = createShapeVisualization(
        //     new CANNON.Vec3(wallThickness, baseScaledSize.y, baseScaledSize.z),
        //     new CANNON.Vec3(-baseScaledSize.x / 2 + wallThickness / 2, 0, 0),
        // );
        // baseVizGroup.add(backViz);
        
        // const leftViz = createShapeVisualization(
        //     new CANNON.Vec3(baseScaledSize.x, baseScaledSize.y, wallThickness),
        //     new CANNON.Vec3(0, 0, baseScaledSize.z / 2 - wallThickness / 2),
        //     0xffaa00
        // );
        // baseVizGroup.add(leftViz);
        
        // const rightViz = createShapeVisualization(
        //     new CANNON.Vec3(baseScaledSize.x, baseScaledSize.y, wallThickness),
        //     new CANNON.Vec3(0, 0, -baseScaledSize.z / 2 + wallThickness / 2),
        //     0xffaa00
        // );
        // baseVizGroup.add(rightViz);
        
        // baseVizGroup.position.set(baseBody.position.x, baseBody.position.y, baseBody.position.z);
        // if (baseBody.quaternion) {
        //     baseVizGroup.quaternion.set(baseBody.quaternion.x, baseBody.quaternion.y, baseBody.quaternion.z, baseBody.quaternion.w);
        // }
        
        // console.log(`   🟡 Base visualization initial position: (${baseVizGroup.position.x.toFixed(2)}, ${baseVizGroup.position.y.toFixed(2)}, ${baseVizGroup.position.z.toFixed(2)})`);
        // console.log(`   🎯 Base body position: (${baseBody.position.x.toFixed(2)}, ${baseBody.position.y.toFixed(2)}, ${baseBody.position.z.toFixed(2)})`);
        
        // scene.add(baseVizGroup);
        cabinetGroup.userData.baseVisualization = null;
        
        // console.log(`   ✅ Base visualization added to scene: ${baseVizGroup.name}`);
        // console.log(`   📦 Base visualization has ${baseVizGroup.children.length} children`);
        
        console.log(`🏗️ Base physics body created (hollow container): ${baseScaledSize.x.toFixed(2)} × ${baseScaledSize.y.toFixed(2)} × ${baseScaledSize.z.toFixed(2)}`);
        console.log(`   Wall Thickness: ${wallThickness}`);
        console.log(`   Opening: X+ direction (front)`);
        console.log(`   Components: bottom, top, back, left, right (5 shapes)`);
        console.log(`   Collision group: 1 (cabinet), mask: ~2 (ignore drawers)`);
    } else {
        const scaledSize = new THREE.Vector3(
            size.x * scale,
            size.y * scale,
            size.z * scale
        );

        const shape = new CANNON.Box(new CANNON.Vec3(
            scaledSize.x / 2,
            scaledSize.y / 2,
            scaledSize.z / 2
        ));

        baseBody = new CANNON.Body({
            mass: 50,
            position: new CANNON.Vec3(position.x, position.y + scaledSize.y / 2, position.z),
            shape: shape,
            collisionFilterGroup: 1,
            collisionFilterMask: ~2
        });

        if (position.rotation !== undefined) {
            baseBody.quaternion.setFromEuler(position.rotation, 0, 0, 'XYZ');
            console.log(`   🔄 Cabinet (fallback) physics body rotation: ${(position.rotation * 180 / Math.PI).toFixed(1)}°`);
        }

        world.addBody(baseBody);
        console.log(`🏗️ Fallback base physics body created: ${scaledSize.x.toFixed(2)} × ${scaledSize.y.toFixed(2)} × ${scaledSize.z.toFixed(2)}`);
        console.log(`   Collision group: 1 (cabinet), mask: ~2 (ignore drawers)`);
    }
    
    cabinetGroup.position.copy(baseBody.position);

    if (position.rotation !== undefined) {
        cabinetGroup.rotation.y = position.rotation;
        console.log(`   🔄 Cabinet visual model rotation Y: ${(position.rotation * 180 / Math.PI).toFixed(1)}°`);
    }
    
    scene.add(cabinetGroup);
    
    scene.updateMatrixWorld(true);
    
    const drawerBodies = [];
    partObjects.forEach(part => {
        if (part.userData.isDrawer) {
            
            part.userData.closedPosition = part.position.clone();
            part.userData.openPosition = part.position.clone();
            part.userData.openPosition.x += 3.5;
            
            const modelForPhysics = part.userData.collisionModel || part;
            const modelType = part.userData.collisionModel ? 'collision model' : 'visual model';
            
            const drawerBox = new THREE.Box3().setFromObject(modelForPhysics);
            const drawerSize = new THREE.Vector3();
            drawerBox.getSize(drawerSize);
            
            const drawerScaledSize = new THREE.Vector3(
                drawerSize.x * scale,
                drawerSize.y * scale,
                drawerSize.z * scale
            );
            
            cabinetGroup.updateMatrixWorld(true);
            
            const scaledBox = new THREE.Box3().setFromObject(part);
            const drawerWorldPos = new THREE.Vector3();
            scaledBox.getCenter(drawerWorldPos);
            
            const drawerWorldQuat = new THREE.Quaternion();
            part.getWorldQuaternion(drawerWorldQuat);
            
            console.log(`🔍 "${part.userData.partName}" world position from bounding box center:`);
            console.log(`   Drawer world pos: (${drawerWorldPos.x.toFixed(2)}, ${drawerWorldPos.y.toFixed(2)}, ${drawerWorldPos.z.toFixed(2)})`);
            console.log(`   Drawer local pos: (${part.position.x.toFixed(2)}, ${part.position.y.toFixed(2)}, ${part.position.z.toFixed(2)})`);
            
            const wallThickness = 0.25;
            const drawerCompound = new CANNON.Body({
                mass: 0,
                type: CANNON.Body.STATIC,
                position: new CANNON.Vec3(
                    drawerWorldPos.x,
                    drawerWorldPos.y,
                    drawerWorldPos.z
                ),
                quaternion: new CANNON.Quaternion(
                    drawerWorldQuat.x,
                    drawerWorldQuat.y,
                    drawerWorldQuat.z,
                    drawerWorldQuat.w
                ),
                collisionFilterGroup: 2,
                collisionFilterMask: -1
            });
            
            const bottomY = -drawerScaledSize.y / 2 + wallThickness / 2;
            const bottomShape = new CANNON.Box(new CANNON.Vec3(
                drawerScaledSize.x / 2,
                wallThickness / 2,
                drawerScaledSize.z / 2
            ));
            drawerCompound.addShape(bottomShape, new CANNON.Vec3(0, bottomY, 0));
            
            const frontShape = new CANNON.Box(new CANNON.Vec3(
                wallThickness / 2,
                drawerScaledSize.y / 2,
                drawerScaledSize.z / 2
            ));
            drawerCompound.addShape(frontShape, new CANNON.Vec3(drawerScaledSize.x / 2 - wallThickness / 2, 0, 0));
            
            const backShape = new CANNON.Box(new CANNON.Vec3(
                wallThickness / 2,
                drawerScaledSize.y / 2,
                drawerScaledSize.z / 2
            ));
            drawerCompound.addShape(backShape, new CANNON.Vec3(-drawerScaledSize.x / 2 + wallThickness / 2, 0, 0));
            
            const leftShape = new CANNON.Box(new CANNON.Vec3(
                drawerScaledSize.x / 2,
                drawerScaledSize.y / 2,
                wallThickness / 2
            ));
            drawerCompound.addShape(leftShape, new CANNON.Vec3(0, 0, drawerScaledSize.z / 2 - wallThickness / 2));
            
            const rightShape = new CANNON.Box(new CANNON.Vec3(
                drawerScaledSize.x / 2,
                drawerScaledSize.y / 2,
                wallThickness / 2
            ));
            drawerCompound.addShape(rightShape, new CANNON.Vec3(0, 0, -drawerScaledSize.z / 2 + wallThickness / 2));

            world.addBody(drawerCompound);
            drawerBodies.push(drawerCompound);

            part.userData.physicsBody = drawerCompound;
            part.userData.drawerSize = drawerScaledSize.clone();

            // const drawerColors = {
            // };
            // const vizColor = drawerColors[part.userData.partName] || 0x00ff00;
            // const drawerViz = createPhysicsVisualization(drawerCompound, drawerScaledSize, vizColor);
            // drawerViz.name = `drawer_physics_${part.userData.partName}`;
            
            // drawerViz.position.set(
            //     drawerCompound.position.x,
            //     drawerCompound.position.y,
            //     drawerCompound.position.z
            // );
            
            // scene.add(drawerViz);
            
            // drawerViz.updateMatrix();
            // drawerViz.updateMatrixWorld(true);
            
            // console.log(`   ✅ Viz mesh actual position after add to scene: (${drawerViz.position.x.toFixed(2)}, ${drawerViz.position.y.toFixed(2)}, ${drawerViz.position.z.toFixed(2)})`);
            // console.log(`   🎯 Physics body position: (${drawerCompound.position.x.toFixed(2)}, ${drawerCompound.position.y.toFixed(2)}, ${drawerCompound.position.z.toFixed(2)})`);
            
            // part.userData.physicsVisualization = drawerViz;
            part.userData.physicsVisualization = null;

            console.log(`🚪 Drawer "${part.userData.partName}" physics body (${modelType}):`);
            console.log(`   Size: ${drawerScaledSize.x.toFixed(2)} × ${drawerScaledSize.y.toFixed(2)} × ${drawerScaledSize.z.toFixed(2)} (hollow container)`);
            console.log(`   World Position: (${drawerWorldPos.x.toFixed(2)}, ${drawerWorldPos.y.toFixed(2)}, ${drawerWorldPos.z.toFixed(2)})`);
            console.log(`   World Rotation: (${drawerWorldQuat.x.toFixed(3)}, ${drawerWorldQuat.y.toFixed(3)}, ${drawerWorldQuat.z.toFixed(3)}, ${drawerWorldQuat.w.toFixed(3)})`);
            console.log(`   Wall Thickness: ${wallThickness}`);
            console.log(`   Mass: 0 (static, 5 shapes: bottom + 4 walls)`);
            console.log(`   Collision group: 2 (drawer), mask: ~1 (ignore cabinet)`);
            console.log(`   Open Distance: 3.5 (local, auto-scaled by Group)`);
            console.log(`   🟢 Physics visualization added (green box)`);
        }
    });
    
    console.log(`\n🔍 Debug: Checking all visualization meshes in scene:`);
    scene.traverse((child) => {
        if (child.name && child.name.startsWith('drawer_physics_')) {
            console.log(`   Found "${child.name}": position = (${child.position.x.toFixed(2)}, ${child.position.y.toFixed(2)}, ${child.position.z.toFixed(2)})`);
        }
    });
    console.log(`🔍 Debug: Total viz meshes found\n`);
    
    const existingBaseViz = cabinetGroup.userData.baseVisualization;
    cabinetGroup.userData = {
        type: 'libero_asset',
        assetId: assetId,
        category: 'articulated',
        physicsBody: baseBody,
        name: assetId,
        isArticulated: true,
        parts: parts,
        partObjects: partObjects,
        scale: scale,
        baseVisualization: existingBaseViz
    };
    
    if (existingBaseViz) {
        console.log(`   ✅ Base visualization preserved in userData`);
    }
    
    if (!state.liberoAssets) {
        state.liberoAssets = [];
    }
    state.liberoAssets.push(cabinetGroup);
    
    markAssetLoaded(assetId);
    
    updateObjectNameMapping();
    
    console.log(`✅ Articulated asset loaded: ${name} (${assetId})`);
    console.log(`💡 Click on drawers to open/close them!`);
    return cabinetGroup;
}


export function syncDrawerPhysicsBodies(cabinetGroup) {
    if (!cabinetGroup.userData.isArticulated) return;
    
    const partObjects = cabinetGroup.userData.partObjects;
    if (!partObjects) return;
    
    partObjects.forEach(part => {
        if (part.userData.isDrawer && part.userData.physicsBody) {
            if (part.userData.isAnimating && part.userData.animationData) {
                const data = part.userData.animationData;
                const elapsed = Date.now() - data.startTime;
                const progress = Math.min(elapsed / data.duration, 1);
                const eased = easeInOutCubic(progress);
                
                if (!data.frameCount) data.frameCount = 0;
                data.frameCount++;
                if (data.frameCount === 1 || data.frameCount % 10 === 0) {
                    console.log(`   🎬 Frame ${data.frameCount}: Animating ${part.userData.partName}, progress: ${(progress * 100).toFixed(0)}%, elapsed: ${elapsed}ms`);
                }
                
                part.position.x = data.startPos.x + (data.targetPos.x - data.startPos.x) * eased;
                part.position.y = data.startPos.y + (data.targetPos.y - data.startPos.y) * eased;
                part.position.z = data.startPos.z + (data.targetPos.z - data.startPos.z) * eased;
                
                const physicsBody = part.userData.physicsBody;
                const deltaX = (data.targetPhysicsPos.x - data.startPhysicsPos.x) * eased;
                const deltaY = (data.targetPhysicsPos.y - data.startPhysicsPos.y) * eased;
                const deltaZ = (data.targetPhysicsPos.z - data.startPhysicsPos.z) * eased;
                
                physicsBody.position.set(
                    data.startPhysicsPos.x + deltaX,
                    data.startPhysicsPos.y + deltaY,
                    data.startPhysicsPos.z + deltaZ
                );
                
                const worldQuat = new THREE.Quaternion();
                part.getWorldQuaternion(worldQuat);
                physicsBody.quaternion.set(worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w);
                
                physicsBody.velocity.set(0, 0, 0);
                physicsBody.angularVelocity.set(0, 0, 0);
                physicsBody.updateAABB();
                
                if (data.boundObjectOffsets && data.boundObjectOffsets.length > 0) {
                    if (data.frameCount === 1) {
                        console.log(`   📦 Updating ${data.boundObjectOffsets.length} bound objects`);
                        data.boundObjectOffsets.forEach(item => {
                            console.log(`      - ${item.object.name || item.object.userData.name}`);
                        });
                    }
                    
                    data.boundObjectOffsets.forEach(item => {
                        const obj = item.object;
                        const offset = item.offset;
                        const objBody = item.body;
                        const relativeQuat = item.relativeQuat;
                        
                        objBody.position.set(
                            physicsBody.position.x + offset.x,
                            physicsBody.position.y + offset.y,
                            physicsBody.position.z + offset.z
                        );
                        
                        if (relativeQuat) {
                            const drawerQuat = new THREE.Quaternion(
                                physicsBody.quaternion.x,
                                physicsBody.quaternion.y,
                                physicsBody.quaternion.z,
                                physicsBody.quaternion.w
                            );
                            const finalQuat = drawerQuat.multiply(relativeQuat);
                            objBody.quaternion.set(finalQuat.x, finalQuat.y, finalQuat.z, finalQuat.w);
                        } else {
                            objBody.quaternion.copy(physicsBody.quaternion);
                        }
                        
                        objBody.velocity.set(0, 0, 0);
                        objBody.angularVelocity.set(0, 0, 0);
                        objBody.updateAABB();
                        
                        if (obj.position && obj.quaternion) {
                            obj.position.copy(objBody.position);
                            obj.quaternion.copy(objBody.quaternion);
                        }
                    });
                }
                
                if (part.userData.physicsVisualization) {
                    part.userData.physicsVisualization.position.copy(physicsBody.position);
                    part.userData.physicsVisualization.quaternion.copy(worldQuat);
                }
                
                if (progress >= 1) {
                    part.userData.isAnimating = false;
                    
                    if (data.boundObjectOffsets) {
                        data.boundObjectOffsets.forEach(item => {
                            const obj = item.object;
                            if (obj.userData) {
                                obj.userData.isFollowingDrawer = false;
                                obj.userData.wasInDrawer = true;
                                obj.userData.drawerOffset = item.offset;
                                obj.userData.drawerRelativeQuat = item.relativeQuat;
                                obj.userData.drawerBody = physicsBody;
                                console.log(`   ✅ Object ${obj.name || obj.userData.name} remains in drawer after animation`);
                            }
                        });
                    }
                    
                    if (data.onComplete) data.onComplete();
                    
                    delete part.userData.animationData;
                }
                
                return;
            }
            
            const box = new THREE.Box3().setFromObject(part);
            const worldPos = new THREE.Vector3();
            box.getCenter(worldPos);
            
            const worldQuat = new THREE.Quaternion();
            part.getWorldQuaternion(worldQuat);
            
            const physicsBody = part.userData.physicsBody;
            physicsBody.position.set(worldPos.x, worldPos.y, worldPos.z);
            physicsBody.quaternion.set(worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w);
            physicsBody.updateAABB();
            
            if (part.userData.physicsVisualization) {
                part.userData.physicsVisualization.position.copy(physicsBody.position);
                part.userData.physicsVisualization.quaternion.copy(worldQuat);
            }
            
            if (!part.userData.isOpen) {
                syncObjectsInDrawer(part, physicsBody);
            } else {
                releaseObjectsFromDrawer(part, physicsBody);
            }
        }
    });
}


function syncObjectsInDrawer(drawer, drawerBody) {
    const sceneObjects = [];
    
    if (state.liberoAssets) {
        state.liberoAssets.forEach(asset => {
            if (asset.userData && asset.userData.physicsBody && !asset.userData.isArticulated) {
                sceneObjects.push(asset);
            }
        });
    }
    
    if (state.cubes) {
        state.cubes.forEach(cube => sceneObjects.push(cube));
    }
    if (state.mugs) {
        state.mugs.forEach(mug => sceneObjects.push(mug));
    }
    if (state.boxes) {
        state.boxes.forEach(box => sceneObjects.push(box));
    }
    
    if (state.scene) {
        state.scene.traverse((obj) => {
            if (obj.userData && obj.userData.physicsBody && !sceneObjects.includes(obj)) {
                if (!obj.userData.isDrawer && !obj.userData.isArticulated && obj.type !== 'Group') {
                    sceneObjects.push(obj);
                }
            }
        });
    }
    
    sceneObjects.forEach(obj => {
        if (!obj.userData.physicsBody) return;
        
        if (obj.userData.wasInDrawer && obj.userData.drawerBody === drawerBody) {
            const objBody = obj.userData.physicsBody;
            const offset = obj.userData.drawerOffset;
            
            if (!offset) return;
            
            objBody.position.set(
                drawerBody.position.x + offset.x,
                drawerBody.position.y + offset.y,
                drawerBody.position.z + offset.z
            );
            
            const relativeQuat = obj.userData.drawerRelativeQuat;
            if (relativeQuat) {
                const drawerQuat = new THREE.Quaternion(
                    drawerBody.quaternion.x,
                    drawerBody.quaternion.y,
                    drawerBody.quaternion.z,
                    drawerBody.quaternion.w
                );
                const finalQuat = drawerQuat.multiply(relativeQuat);
                objBody.quaternion.set(finalQuat.x, finalQuat.y, finalQuat.z, finalQuat.w);
            } else {
                objBody.quaternion.copy(drawerBody.quaternion);
            }
            
            objBody.velocity.set(0, 0, 0);
            objBody.angularVelocity.set(0, 0, 0);
            objBody.updateAABB();
            
            if (obj.position && obj.quaternion) {
                obj.position.copy(objBody.position);
                obj.quaternion.copy(objBody.quaternion);
            }
        }
    });
}


function releaseObjectsFromDrawer(drawer, drawerBody) {
    const sceneObjects = [];
    
    if (state.liberoAssets) {
        state.liberoAssets.forEach(asset => {
            if (asset.userData && asset.userData.physicsBody && !asset.userData.isArticulated) {
                sceneObjects.push(asset);
            }
        });
    }
    
    if (state.cubes) {
        state.cubes.forEach(cube => sceneObjects.push(cube));
    }
    if (state.mugs) {
        state.mugs.forEach(mug => sceneObjects.push(mug));
    }
    if (state.boxes) {
        state.boxes.forEach(box => sceneObjects.push(box));
    }
    
    if (state.scene) {
        state.scene.traverse((obj) => {
            if (obj.userData && obj.userData.physicsBody && !sceneObjects.includes(obj)) {
                if (!obj.userData.isDrawer && !obj.userData.isArticulated && obj.type !== 'Group') {
                    sceneObjects.push(obj);
                }
            }
        });
    }
    
    sceneObjects.forEach(obj => {
        if (!obj.userData.physicsBody) return;
        
        if (obj.userData.wasInDrawer && obj.userData.drawerBody === drawerBody) {
            const objBody = obj.userData.physicsBody;
            const offset = obj.userData.drawerOffset;
            
            if (offset) {
                objBody.position.set(
                    drawerBody.position.x + offset.x,
                    drawerBody.position.y + offset.y,
                    drawerBody.position.z + offset.z
                );
                
                const relativeQuat = obj.userData.drawerRelativeQuat;
                if (relativeQuat) {
                    const drawerQuat = new THREE.Quaternion(
                        drawerBody.quaternion.x,
                        drawerBody.quaternion.y,
                        drawerBody.quaternion.z,
                        drawerBody.quaternion.w
                    );
                    const finalQuat = drawerQuat.multiply(relativeQuat);
                    objBody.quaternion.set(finalQuat.x, finalQuat.y, finalQuat.z, finalQuat.w);
                } else {
                    objBody.quaternion.copy(drawerBody.quaternion);
                }
                
                objBody.updateAABB();
                
                if (obj.position && obj.quaternion) {
                    obj.position.copy(objBody.position);
                    obj.quaternion.copy(objBody.quaternion);
                }
                
                console.log(`   📍 Updated ${obj.name || obj.userData.name} position before release`);
            }
            
            delete obj.userData.wasInDrawer;
            delete obj.userData.drawerOffset;
            delete obj.userData.drawerRelativeQuat;
            delete obj.userData.drawerBody;
            
            console.log(`   🔓 Released object ${obj.name || obj.userData.name} from drawer`);
        }
    });
}


function extractVerticesFromGeometry(geometry) {
    const vertices = [];
    const positionAttribute = geometry.attributes.position;
    
    if (!positionAttribute) {
        return vertices;
    }
    
    for (let i = 0; i < positionAttribute.count; i++) {
        vertices.push(new CANNON.Vec3(
            positionAttribute.getX(i),
            positionAttribute.getY(i),
            positionAttribute.getZ(i)
        ));
    }
    
    return vertices;
}


function simplifyVertices(vertices, targetCount = 100) {
    if (vertices.length <= targetCount) {
        return vertices;
    }
    
    const step = Math.floor(vertices.length / targetCount);
    const simplified = [];
    
    for (let i = 0; i < vertices.length; i += step) {
        if (simplified.length >= targetCount) break;
        simplified.push(vertices[i]);
    }
    
    return simplified;
}


function fixModelCoordinateSystem(model) {
    console.log('🔄 Fixing model coordinate system: Z-up → Y-up, bottom-origin → center-origin');
    
    model.traverse((child) => {
        if (child.isMesh && child.geometry) {
            const geometry = child.geometry;
            
            geometry.rotateX(-Math.PI / 2);
            
            geometry.computeBoundingBox();
            const box = geometry.boundingBox;
            
            const centerX = (box.min.x + box.max.x) / 2;
            const centerY = (box.min.y + box.max.y) / 2;
            const centerZ = (box.min.z + box.max.z) / 2;
            
            geometry.translate(-centerX, -centerY, -centerZ);
            
            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();
            
            console.log(`   ✅ Mesh centered at (${centerX.toFixed(2)}, ${centerY.toFixed(2)}, ${centerZ.toFixed(2)})`);
        }
    });
}


function createConvexHullFromObject(object, scale = 1, alignToBottom = true) {
    let allVertices = [];
    
    object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
            const geometry = child.geometry;
            
            if (geometry.attributes.position) {
                const vertices = extractVerticesFromGeometry(geometry);
                
                vertices.forEach(v => {
                    v.x *= scale;
                    v.y *= scale;
                    v.z *= scale;
                });
                
                allVertices = allVertices.concat(vertices);
            }
        }
    });
    
    if (allVertices.length === 0) {
        console.warn('⚠️ No vertices found in object, using default box shape');
        return { 
            shape: new CANNON.Box(new CANNON.Vec3(1, 1, 1)),
            centerOffset: new CANNON.Vec3(0, 0, 0)
        };
    }
    
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    
    allVertices.forEach(v => {
        minX = Math.min(minX, v.x);
        minY = Math.min(minY, v.y);
        minZ = Math.min(minZ, v.z);
        maxX = Math.max(maxX, v.x);
        maxY = Math.max(maxY, v.y);
        maxZ = Math.max(maxZ, v.z);
    });
    
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;
    
    console.log(`📐 Model bounds after scaling: Y from ${minY.toFixed(2)} to ${maxY.toFixed(2)}`);
    console.log(`📍 Geometric center: (${centerX.toFixed(2)}, ${centerY.toFixed(2)}, ${centerZ.toFixed(2)})`);
    
    const centeredVertices = allVertices.map(v => new CANNON.Vec3(
        v.x - centerX,
        v.y - centerY,
        v.z - centerZ
    ));
    
    let resultCenterOffset;
    if (alignToBottom) {
        const centerToBottom = centerY - minY;
        resultCenterOffset = new CANNON.Vec3(0, centerToBottom, 0);
        console.log(`📍 Bottom alignment: center lifted by ${centerToBottom.toFixed(2)}`);
    } else {
        resultCenterOffset = new CANNON.Vec3(0, 0, 0);
        console.log(`📍 No bottom alignment (food items)`);
    }
    
    console.log(`� Creating bounding box collision shape from ${centeredVertices.length} vertices`);
    
    const shape = createBoundingBoxFromVertices(centeredVertices);
    
    return {
        shape: shape,
        centerOffset: resultCenterOffset
    };
}


function createBoundingBoxFromVertices(vertices) {
    if (vertices.length === 0) {
        return new CANNON.Box(new CANNON.Vec3(1, 1, 1));
    }
    
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    
    vertices.forEach(v => {
        minX = Math.min(minX, v.x);
        minY = Math.min(minY, v.y);
        minZ = Math.min(minZ, v.z);
        maxX = Math.max(maxX, v.x);
        maxY = Math.max(maxY, v.y);
        maxZ = Math.max(maxZ, v.z);
    });
    
    console.log(`   📊 Adjusted vertex bounds: X[${minX.toFixed(2)}, ${maxX.toFixed(2)}], Y[${minY.toFixed(2)}, ${maxY.toFixed(2)}], Z[${minZ.toFixed(2)}, ${maxZ.toFixed(2)}]`);
    
    const halfExtents = new CANNON.Vec3(
        Math.abs(maxX - minX) / 2 || 1,
        Math.abs(maxY - minY) / 2 || 1,
        Math.abs(maxZ - minZ) / 2 || 1
    );
    
    console.log(`   📦 Box half-extents: ${halfExtents.x.toFixed(2)} × ${halfExtents.y.toFixed(2)} × ${halfExtents.z.toFixed(2)}`);
    console.log(`   📍 Box center will be at: (0, ${halfExtents.y.toFixed(2)}, 0) relative to vertices`);
    
    return new CANNON.Box(halfExtents);
}


function getPhysicsParams(assetId) {
    
    if (assetId.includes('plate')) {
        return {
            useConvexHull: true,
            mass: 30.0,
            scale: 20,
            alignToBottom: true
        };
    }
    
    if (assetId.includes('bowl')) {
        return {
            useConvexHull: true,
            mass: 38.0,
            scale: 30,
            alignToBottom: true
        };
    }
    
    if (['milk', 'ketchup', 'orange_juice', 'alphabet_soup', 'tomato_sauce', 'chocolate_pudding'].includes(assetId)) {
        return {
            useConvexHull: true,
            mass: 0.5,
            scale: 0.6,
            alignToBottom: false
        };
    }
    
    if (['butter', 'bbq_sauce', 'cream_cheese', 'popcorn'].includes(assetId)) {
        return {
            useConvexHull: true,
            mass: 0.4,
            scale: 0.6,
            alignToBottom: false
        };
    }
    
    if (assetId.includes('mug')) {
        return {
            useConvexHull: true,
            mass: 0.3,
            scale: 30,
            alignToBottom: true
        };
    }
    
    if (assetId.includes('book')) {
        return {
            useConvexHull: true,
            mass: 0.6,
            scale: 20.0,
            alignToBottom: true
        };
    }
    
    return {
        useConvexHull: true,
        mass: 0.5,
        scale: 1.2,
        alignToBottom: true
    };
}


function createPhysicsBodyFromModel(world, model, params, position) {
    let shape;
    let centerOffset = new CANNON.Vec3(0, 0, 0);

    if (params.useConvexHull) {
        console.log(`🔨 Creating convex hull physics body for model...`);
        const alignToBottom = params.alignToBottom !== undefined ? params.alignToBottom : true;
        const result = createConvexHullFromObject(model, params.scale, alignToBottom);
        shape = result.shape;
        centerOffset = result.centerOffset;
    } else {
        if (params.shape === 'cylinder') {
            shape = new CANNON.Cylinder(params.radius, params.radius, params.height, 16);
        } else {
            const size = params.size;
            shape = new CANNON.Box(new CANNON.Vec3(size.x, size.y, size.z));
        }
    }

    const body = new CANNON.Body({
        mass: params.mass,
        shape: shape,
        material: new CANNON.Material({
            friction: 0.5,
            restitution: 0.1
        })
    });

    const finalY = position.y + centerOffset.y;
    body.position.set(
        position.x,
        finalY,
        position.z
    );

    if (position.rotation !== undefined) {
        body.quaternion.setFromEuler(position.rotation, 0, 0, 'XYZ');
        console.log(`   🔄 Physics body rotation: ${(position.rotation * 180 / Math.PI).toFixed(1)}°`);
    }

    console.log(`   🎯 Physics body position: (${position.x.toFixed(2)}, ${finalY.toFixed(2)}, ${position.z.toFixed(2)})`);
    console.log(`   ⬆️  Center offset applied: ${centerOffset.y.toFixed(2)}`);

    world.addBody(body);

    return { body, centerOffset };
}


export async function createAsset(scene, world, category, assetId, position = { x: 0, y: 10, z: 0 }) {
    try {
        if (isAssetLoaded(assetId)) {
            throw new Error(`Asset "${assetId}" has already been loaded`);
        }
        
        const categoryAssets = ASSET_CATALOG[category];
        if (!categoryAssets) {
            throw new Error(`Unknown category: ${category}`);
        }
        
        const assetConfig = categoryAssets.find(a => a.id === assetId);
        if (!assetConfig) {
            throw new Error(`Asset "${assetId}" not found in category "${category}"`);
        }
        
        if (assetConfig.files === 'articulated' && assetConfig.parts) {
            console.log(`🗄️ Loading articulated object: ${assetId} with ${assetConfig.parts.length} parts`);
            return await createArticulatedAsset(scene, world, assetConfig, position);
        }
        
        const model = await loadOBJModel(assetConfig.path, assetConfig.files);
        
        const params = getPhysicsParams(assetId);
        
        if (params.alignToBottom) {
            fixModelCoordinateSystem(model);
        }
        
        model.scale.set(params.scale, params.scale, params.scale);
        
        const { body: physicsBody, centerOffset } = createPhysicsBodyFromModel(world, model, params, position);

        model.position.copy(physicsBody.position);

        if (position.rotation !== undefined) {
            model.rotation.y = position.rotation;
            console.log(`   🔄 Visual model rotation Y: ${(position.rotation * 180 / Math.PI).toFixed(1)}°`);
        }
        
        console.log(`📍 Model & Physics body center: (${model.position.x.toFixed(2)}, ${model.position.y.toFixed(2)}, ${model.position.z.toFixed(2)})`);
        console.log(`   Center offset from bottom: ${centerOffset.y.toFixed(2)}`);
        console.log(`   Expected bottom position: ${(model.position.y - centerOffset.y).toFixed(2)}`);
        console.log(`📏 Asset "${assetId}" scale:`, model.scale);
        console.log(`🔍 Asset "${assetId}" visible:`, model.visible);
        
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        console.log(`📦 Asset "${assetId}" bounding box size:`, size);
        console.log(`📦 Asset "${assetId}" actual world bounds:`, box.min, 'to', box.max);
        console.log(`   Visual model bottom Y: ${box.min.y.toFixed(2)}, should be ~10.00`);
        
        scene.add(model);
        
        model.userData = {
            type: 'libero_asset',
            assetId: assetId,
            category: category,
            physicsBody: physicsBody,
            name: assetId
        };
        
        if (!state.liberoAssets) {
            state.liberoAssets = [];
        }
        state.liberoAssets.push(model);
        
        markAssetLoaded(assetId);
        
        updateObjectNameMapping();
        
        console.log(`✅ Asset loaded: ${assetConfig.name} (${assetId})`);
        return model;
        
    } catch (error) {
        console.error(`❌ Error loading asset "${assetId}":`, error);
        throw error;
    }
}


export async function createAssetAtRandomPosition(scene, world, category, assetId) {
    console.log(`🎯 [AssetLoader] 使用栅格系统为 ${category}/${assetId} 查找安全位置`);

    try {
        const safePosition = findSafeTablePositionWithGrid('mug');

        console.log(`✅ [AssetLoader] 栅格系统找到安全位置:`);
        console.log(`   - X: ${safePosition.x.toFixed(2)}`);
        console.log(`   - Y: ${safePosition.y.toFixed(2)} (桌面上方)`);
        console.log(`   - Z: ${safePosition.z.toFixed(2)}`);
        console.log(`   - 旋转: ${(safePosition.rotation * 180 / Math.PI).toFixed(1)}°`);

        return await createAsset(scene, world, category, assetId, safePosition);

    } catch (error) {
        console.error(`❌ [AssetLoader] 栅格放置失败，使用备用方案:`, error);

        const fallbackX = (Math.random() - 0.5) * 180;
        const fallbackZ = (Math.random() - 0.5) * 90;
        const fallbackY = 10;

        const fallbackPosition = {
            x: fallbackX,
            y: fallbackY,
            z: fallbackZ
        };

        console.warn(`⚠️ [AssetLoader] 使用备用位置: (${fallbackX.toFixed(1)}, ${fallbackY}, ${fallbackZ.toFixed(1)})`);

        return await createAsset(scene, world, category, assetId, fallbackPosition);
    }
}


export function getAllAssets() {
    const allAssets = [];
    
    for (const [category, assets] of Object.entries(ASSET_CATALOG)) {
        assets.forEach(asset => {
            const assetInfo = {
                ...asset,
                category,
                loaded: isAssetLoaded(asset.id)
            };
            
            if (asset.repeatable) {
                assetInfo.loaded = false;
                assetInfo.repeatable = true;
            }
            
            allAssets.push(assetInfo);
        });
    }
    
    return allAssets;
}


export function toggleDrawer(drawer) {
    if (!drawer.userData.isDrawer) {
        console.warn('⚠️ Not a drawer object');
        return;
    }
    
    const isOpen = drawer.userData.isOpen;
    const targetPos = isOpen ? drawer.userData.closedPosition : drawer.userData.openPosition;
    
    console.log(`🚪 ${isOpen ? 'Closing' : 'Opening'} drawer: ${drawer.userData.partName}`);
    
    animateDrawerPosition(drawer, targetPos, () => {
        drawer.userData.isOpen = !isOpen;
        console.log(`✅ Drawer ${drawer.userData.partName} is now ${drawer.userData.isOpen ? 'open' : 'closed'}`);
    });
}


function animateDrawerPosition(drawer, targetPos, onComplete) {
    const startPos = drawer.position.clone();
    const duration = 500;
    const startTime = Date.now();
    
    drawer.userData.isAnimating = true;
    
    const cabinetGroup = drawer.parent;
    
    const physicsBody = drawer.userData.physicsBody;
    const startPhysicsPos = physicsBody ? new CANNON.Vec3(
        physicsBody.position.x,
        physicsBody.position.y,
        physicsBody.position.z
    ) : null;
    
    const targetPhysicsPos = new CANNON.Vec3();
    if (cabinetGroup && physicsBody && startPhysicsPos) {
        const deltaX = targetPos.x - startPos.x;
        const deltaY = targetPos.y - startPos.y;
        const deltaZ = targetPos.z - startPos.z;
        
        targetPhysicsPos.set(
            startPhysicsPos.x + deltaX,
            startPhysicsPos.y + deltaY,
            startPhysicsPos.z + deltaZ
        );
    }
    
    const boundObjects = findObjectsInDrawer(physicsBody, drawer.userData.drawerSize);
    const boundObjectOffsets = [];
    
    if (boundObjects.length > 0) {
        console.log(`   📦 Found ${boundObjects.length} objects in drawer, binding them...`);
        
        boundObjects.forEach(obj => {
            if (obj.userData.physicsBody) {
                const objBody = obj.userData.physicsBody;
                const offset = new CANNON.Vec3(
                    objBody.position.x - physicsBody.position.x,
                    objBody.position.y - physicsBody.position.y,
                    objBody.position.z - physicsBody.position.z
                );
                
                const objQuat = new THREE.Quaternion(
                    objBody.quaternion.x,
                    objBody.quaternion.y,
                    objBody.quaternion.z,
                    objBody.quaternion.w
                );
                const drawerQuat = new THREE.Quaternion(
                    physicsBody.quaternion.x,
                    physicsBody.quaternion.y,
                    physicsBody.quaternion.z,
                    physicsBody.quaternion.w
                );
                const relativeQuat = objQuat.clone().premultiply(drawerQuat.invert());
                
                boundObjectOffsets.push({
                    object: obj,
                    offset: offset,
                    body: objBody,
                    relativeQuat: relativeQuat
                });
                
                obj.userData.isFollowingDrawer = true;
                
                console.log(`   📏 Object offset: (${offset.x.toFixed(2)}, ${offset.y.toFixed(2)}, ${offset.z.toFixed(2)})`);
            }
        });
    }
    
    drawer.userData.animationData = {
        startTime,
        duration,
        startPos,
        targetPos,
        startPhysicsPos,
        targetPhysicsPos,
        boundObjectOffsets,
        onComplete
    };
    
    console.log(`🎬 1622Drawer animation set up, will be updated in main loop`);
}


function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}


function findObjectsInDrawer(drawerBody, drawerSize) {
    const boundObjects = [];
    
    const drawerPos = drawerBody.position;
    
    const sceneObjects = [];
    
    if (state.liberoAssets) {
        state.liberoAssets.forEach(asset => {
            if (asset.userData && asset.userData.physicsBody && !asset.userData.isArticulated) {
                sceneObjects.push(asset);
            }
        });
    }
    
    if (state.cubes) {
        state.cubes.forEach(cube => sceneObjects.push(cube));
    }
    if (state.mugs) {
        state.mugs.forEach(mug => sceneObjects.push(mug));
    }
    if (state.boxes) {
        state.boxes.forEach(box => sceneObjects.push(box));
    }
    
    if (state.scene) {
        state.scene.traverse((obj) => {
            if (obj.userData && obj.userData.physicsBody && !sceneObjects.includes(obj)) {
                if (!obj.userData.isDrawer && !obj.userData.isArticulated && obj.type !== 'Group') {
                    sceneObjects.push(obj);
                }
            }
        });
    }
    
    console.log(`   🔍 Checking ${sceneObjects.length} objects for drawer at (${drawerPos.x.toFixed(2)}, ${drawerPos.y.toFixed(2)}, ${drawerPos.z.toFixed(2)})`);
    console.log(`   📐 Drawer size: (${drawerSize.x.toFixed(2)}, ${drawerSize.y.toFixed(2)}, ${drawerSize.z.toFixed(2)})`);
    
    sceneObjects.forEach(obj => {
        if (!obj.userData.physicsBody) return;
        
        const objBody = obj.userData.physicsBody;
        const objPos = objBody.position;
        
        let checkPos = objPos;
        if (obj.userData.assetId) {
            obj.getWorldPosition(new THREE.Vector3());
            const worldPos = new THREE.Vector3();
            obj.getWorldPosition(worldPos);
            checkPos = worldPos;
            
            const posDiff = Math.abs(worldPos.y - objPos.y);
            if (posDiff > 1) {
                console.log(`   ⚠️ ${obj.name || obj.userData.assetId}: visual Y=${worldPos.y.toFixed(2)}, physics Y=${objPos.y.toFixed(2)}, diff=${posDiff.toFixed(2)}`);
            }
        }
        
        const dx = Math.abs(checkPos.x - drawerPos.x);
        const dy = Math.abs(checkPos.y - drawerPos.y);
        const dz = Math.abs(checkPos.z - drawerPos.z);
        
        console.log(`   🧐 Checking object: ${obj.name || obj.userData.name || 'unnamed'} at (${checkPos.x.toFixed(2)}, ${checkPos.y.toFixed(2)}, ${checkPos.z.toFixed(2)})`);
        console.log(`      Distance: dx=${dx.toFixed(2)}, dy=${dy.toFixed(2)}, dz=${dz.toFixed(2)}`);
        
        const halfSizeX = drawerSize.x / 2;
        const halfSizeY = drawerSize.y / 2;
        const halfSizeZ = drawerSize.z / 2;
        const toleranceXZ = 1.0;
        
        const inVerticalRange = dy < halfSizeY;
        
        if (dx < halfSizeX - toleranceXZ &&
            inVerticalRange &&
            dz < halfSizeZ - toleranceXZ) {
            boundObjects.push(obj);
            console.log(`   ✅ Found object in drawer: ${obj.name || obj.userData.name}`);
        }
    });
    
    return boundObjects;
}

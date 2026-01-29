

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { state } from '../core/GlobalState.js';


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
    ]
};


const loadedAssets = new Set();


export function isAssetLoaded(assetId) {
    return loadedAssets.has(assetId);
}


export function markAssetLoaded(assetId) {
    loadedAssets.add(assetId);
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


function getBottomAlignmentOffset(model) {
    model.position.set(0, 0, 0);
    const box = new THREE.Box3().setFromObject(model);
    const min = box.min;
    const max = box.max;
    
    const height = max.y - min.y;
    const bottomY = min.y;
    
    console.log(`🔧 Model bounds: Y from ${min.y.toFixed(2)} to ${max.y.toFixed(2)}, height: ${height.toFixed(2)}`);
    console.log(`📍 Bottom offset needed: ${(-bottomY).toFixed(2)} to align bottom to Y=0`);
    
    return -bottomY;
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
    
    let centeredVertices;
    let resultCenterOffset;
    
    if (alignToBottom) {
        console.log(`� Bottom-aligned object: minY=${minY.toFixed(2)} (should be ~0)`);
        
        centeredVertices = allVertices.map(v => new CANNON.Vec3(
            v.x - centerX,
            v.y - minY,
            v.z - centerZ
        ));
        
        resultCenterOffset = new CANNON.Vec3(0, (maxY - minY) / 2, 0);
    } else {
        console.log(`� Center-aligned object: using geometric center`);
        
        centeredVertices = allVertices.map(v => new CANNON.Vec3(
            v.x - centerX,
            v.y - centerY,
            v.z - centerZ
        ));
        
        resultCenterOffset = new CANNON.Vec3(0, 0, 0);
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
            mass: 0.3,
            scale: 20,
            alignToBottom: true
        };
    }
    
    if (assetId.includes('bowl')) {
        return {
            useConvexHull: true,
            mass: 0.4,
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
        
        const model = await loadOBJModel(assetConfig.path, assetConfig.files);
        
        const params = getPhysicsParams(assetId);
        
        model.scale.set(params.scale, params.scale, params.scale);
        
        let bottomOffset = 0;
        if (params.alignToBottom) {
            bottomOffset = getBottomAlignmentOffset(model);
        }
        
        const { body: physicsBody, centerOffset } = createPhysicsBodyFromModel(world, model, params, position);
        
        model.position.set(
            position.x,
            position.y + bottomOffset,
            position.z
        );
        
        console.log(`📍 Visual model "${assetId}" position:`, model.position);
        console.log(`   Physics body position (center): (${physicsBody.position.x.toFixed(2)}, ${physicsBody.position.y.toFixed(2)}, ${physicsBody.position.z.toFixed(2)})`);
        console.log(`   Bottom offset applied: ${bottomOffset.toFixed(2)}`);
        console.log(`📏 Asset "${assetId}" scale:`, model.scale);
        console.log(`🔍 Asset "${assetId}" visible:`, model.visible);
        
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        console.log(`📦 Asset "${assetId}" bounding box size:`, size);
        
        scene.add(model);
        
        model.userData = {
            type: 'libero_asset',
            assetId: assetId,
            category: category,
            physicsBody: physicsBody,
            name: assetId,
            bottomOffset: bottomOffset,
            alignToBottom: params.alignToBottom
        };
        
        if (!state.liberoAssets) {
            state.liberoAssets = [];
        }
        state.liberoAssets.push(model);
        
        markAssetLoaded(assetId);
        
        console.log(`✅ Asset loaded: ${assetConfig.name} (${assetId})`);
        return model;
        
    } catch (error) {
        console.error(`❌ Error loading asset "${assetId}":`, error);
        throw error;
    }
}


export async function createAssetAtRandomPosition(scene, world, category, assetId) {
    const randomX = (Math.random() - 0.5) * 180;
    const randomZ = (Math.random() - 0.5) * 120;
    const y = 10;
    
    const position = { x: randomX, y: y, z: randomZ };
    return await createAsset(scene, world, category, assetId, position);
}


export function getAllAssets() {
    const allAssets = [];
    
    for (const [category, assets] of Object.entries(ASSET_CATALOG)) {
        assets.forEach(asset => {
            allAssets.push({
                ...asset,
                category,
                loaded: isAssetLoaded(asset.id)
            });
        });
    }
    
    return allAssets;
}

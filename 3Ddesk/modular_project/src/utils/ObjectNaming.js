

import { state, setObjectNameMap, updateObjectNameMapEntry, resetObjectNameMap } from '../core/GlobalState.js';


export function getColorNameFromIndex(colorIndex, objectType) {
    if (objectType === 'cube') {
        const colorNames = ['red', 'yellow', 'blue', 'green', 'white'];
        return colorNames[colorIndex] || 'unknown';
    } else {
        const colorNames = ['red', 'yellow', 'blue'];
        return colorNames[colorIndex] || 'unknown';
    }
}


export function updateObjectNameMapping() {
    resetObjectNameMap();
    
    const mugColorCounts = { red: 0, yellow: 0, blue: 0 };
    const cubeColorCounts = { red: 0, yellow: 0, blue: 0, green: 0, white: 0 };
    
    state.boxes.forEach((box, index) => {
        const colorName = getColorNameFromIndex(box.userData.colorIndex, 'box');
        updateObjectNameMapEntry(`box_${index}`, `${colorName}_box`);
    });
    
    state.boxesWithLid.forEach((box, index) => {
        const colorName = getColorNameFromIndex(box.userData.colorIndex, 'box');
        updateObjectNameMapEntry(`lid_box_${index}`, `${colorName}_lid_box`);
    });
    
    state.mugs.forEach(mug => {
        const colorName = getColorNameFromIndex(mug.userData.colorIndex, 'mug');
        mugColorCounts[colorName]++;
    });
    
    const usedMugColorCounts = { red: 0, yellow: 0, blue: 0 };
    state.mugs.forEach((mug, index) => {
        const colorName = getColorNameFromIndex(mug.userData.colorIndex, 'mug');
        usedMugColorCounts[colorName]++;
        
        let name;
        if (mugColorCounts[colorName] === 1) {
            name = `${colorName}_mug1`;
        } else {
            name = `${colorName}_mug${usedMugColorCounts[colorName]}`;
        }
        
        updateObjectNameMapEntry(`mug_${index}`, name);
        console.log(`Mug ${index}: ${colorName} -> ${name}`);
    });
    
    state.cubes.forEach(cube => {
        const colorName = getColorNameFromIndex(cube.userData.colorIndex, 'cube');
        cubeColorCounts[colorName]++;
    });
    
    const usedCubeColorCounts = { red: 0, yellow: 0, blue: 0, green: 0, white: 0 };
    state.cubes.forEach((cube, index) => {
        const colorName = getColorNameFromIndex(cube.userData.colorIndex, 'cube');
        usedCubeColorCounts[colorName]++;
        
        let name;
        if (cubeColorCounts[colorName] === 1) {
            name = `${colorName}_cube1`;
        } else {
            name = `${colorName}_cube${usedCubeColorCounts[colorName]}`;
        }
        
        updateObjectNameMapEntry(`cube_${index}`, name);
        console.log(`Cube ${index}: ${colorName} -> ${name}`);
    });
    
    console.log(`🔍 Checking LIBERO assets: ${state.liberoAssets ? state.liberoAssets.length : 0} assets`);
    if (state.liberoAssets && Array.isArray(state.liberoAssets)) {
        state.liberoAssets.forEach((asset, index) => {
            console.log(`  Asset ${index}:`, asset.userData);
            if (asset.userData && asset.userData.assetId) {
                const assetId = asset.userData.assetId;
                updateObjectNameMapEntry(assetId, assetId);
                console.log(`✅ LIBERO Asset registered: "${assetId}" (index: ${index})`);
                
                if (asset.userData.isArticulated && asset.userData.partObjects) {
                    asset.userData.partObjects.forEach(part => {
                        if (part.userData.isDrawer && part.userData.partName) {
                            const partName = part.userData.partName; // drawer_low, drawer_middle, drawer_high
                            const drawerName = `${assetId}/${partName}`;
                            updateObjectNameMapEntry(partName, drawerName);
                            console.log(`  ✅ Drawer registered: "${drawerName}"`);
                        }
                    });
                }
            } else {
                console.warn(`⚠️ LIBERO Asset at index ${index} missing assetId:`, asset);
            }
        });
    } else {
        console.warn(`⚠️ state.liberoAssets is not available or not an array`);
    }
    
    console.log(`📋 0109 Final objectNameMap:`, state.objectNameMap);
}


export function getObjectDisplayName(objectKey) {
    return state.objectNameMap[objectKey] || objectKey;
}


export function findObjectByDisplayName(displayName) {
    const lowerName = displayName.toLowerCase();
    
    if (lowerName === 'table') {
        return state.desk;
    }
    
    for (const [key, name] of Object.entries(state.objectNameMap)) {
        if (name.toLowerCase() === lowerName) {
            if (key.startsWith('box_')) {
                const index = parseInt(key.split('_')[1]);
                return state.boxes[index];
            } else if (key.startsWith('mug_')) {
                const index = parseInt(key.split('_')[1]);
                return state.mugs[index];
            } else if (key.startsWith('cube_')) {
                const index = parseInt(key.split('_')[1]);
                return state.cubes[index];
            } else {
                const asset = state.liberoAssets?.find(a => a.userData?.assetId === key);
                if (asset) return asset;
            }
        }
    }
    
    return null;
}


export function getAllBoxNames() {
    return state.boxes.map((box, index) => state.objectNameMap[`box_${index}`]);
}


export function getAllMugNames() {
    return state.mugs.map((mug, index) => state.objectNameMap[`mug_${index}`]);
}


export function getAllCubeNames() {
    return state.cubes.map((cube, index) => state.objectNameMap[`cube_${index}`]);
}


export function getAllLiberoAssetNames() {
    return state.liberoAssets.map(asset => {
        const assetId = asset.userData?.assetId;
        return state.objectNameMap[assetId] || assetId || 'unknown';
    });
}


export function isContainer(object) {
    if (!object || !object.userData) return false;
    
    const type = object.userData.type;
    const assetId = object.userData.assetId;
    
    if (type === 'box' || type === 'box_with_lid') {
        return true;
    }
    
    if (assetId && (assetId.includes('bowl') || assetId.includes('plate'))) {
        return true;
    }
    
    return false;
}


export function getContainerType(object) {
    if (!object || !object.userData) return 'unknown';
    
    const type = object.userData.type;
    const assetId = object.userData.assetId;
    
    if (type === 'box' || type === 'box_with_lid') {
        return type;
    }
    
    if (assetId) {
        if (assetId.includes('bowl')) return 'bowl';
        if (assetId.includes('plate')) return 'plate';
    }
    
    return 'unknown';
}


export function isDrawer(object) {
    if (!object || !object.userData) return false;
    return object.userData.isDrawer === true;
}


export function getDrawerCabinet(drawer) {
    if (!drawer || !drawer.parent) return null;
    
    const cabinet = drawer.parent;
    if (cabinet && cabinet.userData && cabinet.userData.isArticulated) {
        return cabinet;
    }
    
    return null;
}


export function getCabinetDrawers(cabinet) {
    if (!cabinet || !cabinet.userData || !cabinet.userData.partObjects) {
        return [];
    }
    
    return cabinet.userData.partObjects.filter(part => part.userData.isDrawer);
}


export function findDrawerByName(drawerName) {
    if (!state.liberoAssets) return null;
    
    let partName = drawerName;
    let assetId = null;
    
    if (drawerName.includes('/')) {
        const parts = drawerName.split('/');
        assetId = parts[0];
        partName = parts[1];
    }
    
    for (const asset of state.liberoAssets) {
        if (asset.userData.isArticulated && asset.userData.partObjects) {
            if (assetId && asset.userData.assetId !== assetId) {
                continue;
            }
            
            const drawer = asset.userData.partObjects.find(
                part => part.userData.isDrawer && part.userData.partName === partName
            );
            if (drawer) return drawer;
        }
    }
    
    return null;
}

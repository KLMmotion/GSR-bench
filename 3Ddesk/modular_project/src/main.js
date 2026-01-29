

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Core modules
import { config } from './core/Config.js';
import { state, setScene, setCamera, setRenderer, setControls, setWorld, setDesk, setBoundaryMesh, setRaycaster, setMouse } from './core/GlobalState.js';
import { initScene, createLighting } from './core/SceneManager.js';
import { initPhysicsWorld } from './core/PhysicsEngine.js';
import { initROS } from './core/ROSManager.js';

// Object modules
import { createGround } from './objects/Ground.js';
import { createDesk } from './objects/Desk.js';
import { createAllBoxes } from './objects/BoxFactory.js';
import { toggleLid } from './objects/BoxWithLid.js';
import { createMugsWithSafePositions } from './objects/Mug.js';
import { createCubesWithSafePositions } from './objects/Cube.js';
import { createBoundary } from './objects/Boundary.js';
import { getAllAssets, createAssetAtRandomPosition, isAssetLoaded, toggleDrawer, syncDrawerPhysicsBodies, ASSET_CATALOG } from './objects/AssetLoader.js';

// System modules
import { initDragSystem } from './systems/DragSystem.js';
import { constrainToBoundary, toggleBoundary } from './systems/BoundaryConstraint.js';
import { TableGridPlacement } from './systems/TableGridPlacement.js';
import { randomReset } from './systems/CommandExecutor.js';
import { saveCurrentConfiguration, openConfigManager, closeConfigManager, updateSelectedConfig, loadSelectedConfiguration, deleteConfiguration, loadConfiguration, selectDefaultOption, cancelTaskQuery, confirmTaskQuery, deleteConfigurationFromList } from './systems/ConfigManager.js';
import { startAutoTest, stopAutoTest, saveCommandLog } from './systems/AutoTest.js';
import { openObjectList, closeObjectList } from './systems/ObjectListManager.js';

// Utils
import { updateObjectNameMapping } from './utils/ObjectNaming.js';

// UI
import { addLogEntry, updateCurrentCommandDisplay } from './ui/UIManager.js';

let gridPlacement = null;


function init() {
    const { scene, camera, renderer } = initScene();
    setScene(scene);
    setCamera(camera);
    setRenderer(renderer);
    
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    setControls(controls);
    
    const world = initPhysicsWorld();
    setWorld(world);
    
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    setRaycaster(raycaster);
    setMouse(mouse);

    createLighting(scene);
    createGround(scene, world);

    const desk = createDesk(scene, world);
    setDesk(desk);

    createAllBoxes(scene, world);

    gridPlacement = new TableGridPlacement(scene, state.boxes, state.mugs, state.desk);

    createMugsWithSafePositions(scene, world);

    if (gridPlacement && typeof gridPlacement.updateGrid === 'function') {
        gridPlacement.updateGrid();
    }

    createCubesWithSafePositions(scene, world);

    const boundaryMesh = createBoundary(scene, world);
    setBoundaryMesh(boundaryMesh);

    updateObjectNameMapping();
    
    initROS();
    
    addEventListeners(renderer, camera, controls, world);
    
    animate();
}


function addEventListeners(renderer, camera, controls, world) {
    window.addEventListener('resize', () => onWindowResize(camera, renderer));
    
    initDragSystem(renderer, camera, controls, world);
    
    renderer.domElement.addEventListener('click', (event) => {
        if (state.isDragging) {
            return;
        }
        
        const raycaster = state.raycaster;
        const mouse = state.mouse;
        
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        raycaster.setFromCamera(mouse, camera);
        
        const intersects = raycaster.intersectObjects(state.scene.children, true);
        
        if (intersects.length > 0) {
            const object = intersects[0].object;
            
            if (object.userData.isClickable && object.userData.parentDrawer) {
                const drawer = object.userData.parentDrawer;
                toggleDrawer(drawer);
            }
        }
    });
    
    renderer.domElement.addEventListener('dblclick', (event) => {
        const raycaster = state.raycaster;
        const mouse = state.mouse;
        
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        raycaster.setFromCamera(mouse, camera);
        
        const allObjects = [...state.boxesWithLid];
        state.boxesWithLid.forEach(box => {
            if (box.userData.lid) {
                allObjects.push(box.userData.lid);
            }
        });
        
        const intersects = raycaster.intersectObjects(allObjects, true);
        
        if (intersects.length > 0) {
            let object = intersects[0].object;
            
            while (object.parent && !object.userData.type) {
                object = object.parent;
            }
            
            if (object.userData.type === 'box_with_lid') {
                toggleLid(object);
            } else if (object.userData.type === 'lid' && object.userData.parentBoxGroup) {
                toggleLid(object.userData.parentBoxGroup);
            }
        }
    });
}


function onWindowResize(camera, renderer) {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}


function animate() {
    requestAnimationFrame(animate);
    
    state.controls.update();
    
    state.world.step(1/60);
    
    constrainToBoundary();
    
    if (state.liberoAssets) {
        state.liberoAssets.forEach(asset => {
            if (asset.userData.isArticulated) {
                syncDrawerPhysicsBodies(asset);
            }
        });
    }
    
    state.boxes.forEach(box => {
        if (box.userData.physicsBody) {
            box.position.copy(box.userData.physicsBody.position);
            box.quaternion.copy(box.userData.physicsBody.quaternion);
        }
    });
    
    state.boxesWithLid.forEach(box => {
        if (box.userData.body) {
            box.position.copy(box.userData.body.position);
            box.quaternion.copy(box.userData.body.quaternion);
        }
        if (box.userData.lid && box.userData.lidBody) {
            const lid = box.userData.lid;
            const lidBody = box.userData.lidBody;
            lid.position.copy(lidBody.position);
            lid.quaternion.copy(lidBody.quaternion);
        }
    });
    
    state.mugs.forEach(mug => {
        if (mug.userData.physicsBody) {
            if (mug.userData.isFollowingDrawer) {
                return;
            }
            
            if (mug.userData.wasInDrawer && mug.userData.drawerBody && mug.userData.drawerOffset) {
                const drawerBody = mug.userData.drawerBody;
                const offset = mug.userData.drawerOffset;
                
                mug.userData.physicsBody.position.set(
                    drawerBody.position.x + offset.x,
                    drawerBody.position.y + offset.y,
                    drawerBody.position.z + offset.z
                );
                
                mug.userData.physicsBody.velocity.set(0, 0, 0);
            }
            
            mug.position.copy(mug.userData.physicsBody.position);
            mug.quaternion.copy(mug.userData.physicsBody.quaternion);
        }
    });
    
    state.cubes.forEach(cube => {
        if (cube.userData.physicsBody) {
            if (cube.userData.isFollowingDrawer) {
                if (Math.random() < 0.01) {
                    console.log(`   ⏭️  Skipping cube sync (following drawer)`);
                }
                return;
            }
            
            if (cube.userData.wasInDrawer && cube.userData.drawerBody && cube.userData.drawerOffset) {
                const drawerBody = cube.userData.drawerBody;
                const offset = cube.userData.drawerOffset;
                
                cube.userData.physicsBody.position.set(
                    drawerBody.position.x + offset.x,
                    drawerBody.position.y + offset.y,
                    drawerBody.position.z + offset.z
                );
                
                cube.userData.physicsBody.velocity.set(0, 0, 0);
            }
            
            cube.position.copy(cube.userData.physicsBody.position);
            cube.quaternion.copy(cube.userData.physicsBody.quaternion);
        }
    });
    
    if (state.liberoAssets) {
        state.liberoAssets.forEach(asset => {
            if (asset.userData.physicsBody) {
                asset.position.copy(asset.userData.physicsBody.position);
                asset.quaternion.copy(asset.userData.physicsBody.quaternion);
                
            }
        });
    }
    
    const syncedObjects = new Set();
    
    if (state.mugs) state.mugs.forEach(obj => syncedObjects.add(obj));
    if (state.cubes) state.cubes.forEach(obj => syncedObjects.add(obj));
    if (state.boxes) state.boxes.forEach(obj => syncedObjects.add(obj));
    if (state.boxesWithLid) state.boxesWithLid.forEach(obj => syncedObjects.add(obj));
    if (state.liberoAssets) state.liberoAssets.forEach(obj => syncedObjects.add(obj));
    
    if (state.scene) {
        state.scene.traverse((obj) => {
            if (syncedObjects.has(obj) || !obj.userData.physicsBody || obj.userData.isDrawer) {
                return;
            }
            
            if (obj.userData.type === 'libero_asset' && obj.userData.category !== 'articulated' && Math.random() < 0.02) {
                console.log(`   🔍 Found OBJ asset in traverse: ${obj.userData.assetId}, isFollowingDrawer: ${obj.userData.isFollowingDrawer}`);
            }
            
            if (obj.userData.isFollowingDrawer) {
                if (Math.random() < 0.02) {
                    console.log(`   ⏭️  Skipping ${obj.name || obj.userData.name} sync (following drawer)`);
                }
                return;
            }
            
            if (obj.userData.wasInDrawer && obj.userData.drawerBody && obj.userData.drawerOffset) {
                const drawerBody = obj.userData.drawerBody;
                const offset = obj.userData.drawerOffset;
                
                obj.userData.physicsBody.position.set(
                    drawerBody.position.x + offset.x,
                    drawerBody.position.y + offset.y,
                    drawerBody.position.z + offset.z
                );
                
                obj.userData.physicsBody.velocity.set(0, 0, 0);
            }
            
            obj.position.copy(obj.userData.physicsBody.position);
            obj.quaternion.copy(obj.userData.physicsBody.quaternion);
        });
    }
    
    state.renderer.render(state.scene, state.camera);
}

window.openAssetSelector = function() {
    const overlay = document.getElementById('asset-selector-overlay');
    const dialog = document.getElementById('asset-selector-dialog');
    const container = document.getElementById('asset-list-container');
    
    container.innerHTML = '';
    
    const allAssets = getAllAssets();
    
    const categories = {
        scanned: { title: '📦 扫描物体 (Scanned Objects)', icon: '🍽️', assets: [] },
        hope: { title: '🥫 HOPE 物体 (Food Items)', icon: '🥛', assets: [] },
        turbosquid: { title: '🏺 Turbosquid 物体 (Props)', icon: '☕', assets: [] },
        articulated: { title: '🗄️ 可动关节物体 (Articulated Objects)', icon: '📂', assets: [] },
        simple: { title: '🧊 简单物体 (Simple Objects - 可重复)', icon: '🎨', assets: [] }
    };
    
    allAssets.forEach(asset => {
        if (categories[asset.category]) {
            categories[asset.category].assets.push(asset);
        }
    });
    
    Object.entries(categories).forEach(([categoryKey, categoryData]) => {
        if (categoryData.assets.length === 0) return;
        
        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'asset-category';
        
        const categoryTitle = document.createElement('h3');
        categoryTitle.textContent = categoryData.title;
        categoryTitle.onclick = function() {
            this.classList.toggle('collapsed');
            gridDiv.classList.toggle('collapsed');
        };
        categoryDiv.appendChild(categoryTitle);
        
        const gridDiv = document.createElement('div');
        gridDiv.className = 'asset-grid';
        
        categoryData.assets.forEach(asset => {
            const assetDiv = document.createElement('div');
            assetDiv.className = 'asset-option';
            
            if (asset.loaded && !asset.repeatable) {
                assetDiv.classList.add('loaded');
            } else {
                assetDiv.onclick = () => loadAssetFromSelector(asset.category, asset.id, asset.name);
            }
            
            let statusText = '点击加载';
            if (asset.repeatable) {
                statusText = '↻ 可重复';
            } else if (asset.loaded) {
                statusText = '✓ 已加载';
            }
            
            assetDiv.innerHTML = `
                <div class="asset-icon">${categoryData.icon}</div>
                <div class="asset-info">
                    <div class="asset-name">${asset.name}</div>
                    <div class="asset-status">${statusText}</div>
                </div>
            `;
            
            gridDiv.appendChild(assetDiv);
        });
        
        categoryDiv.appendChild(gridDiv);
        container.appendChild(categoryDiv);
    });
    
    overlay.style.display = 'block';
    dialog.style.display = 'block';
};

window.closeAssetSelector = function() {
    document.getElementById('asset-selector-overlay').style.display = 'none';
    document.getElementById('asset-selector-dialog').style.display = 'none';
};

window.loadAssetFromSelector = async function(category, assetId, assetName) {
    try {
        addLogEntry(`正在加载 ${assetName}...`, 'info');
        updateCurrentCommandDisplay(`正在加载 ${assetName}...`, 'info');
        
        if (category === 'simple') {
            const assetConfig = ASSET_CATALOG.simple.find(a => a.id === assetId);
            
            if (assetConfig.type === 'cube') {
                const colorIndexMap = { 'red': 0, 'yellow': 1, 'blue': 2 };
                const colorIndex = colorIndexMap[assetConfig.color];
                
                const randomX = (Math.random() - 0.5) * 180;
                const randomZ = (Math.random() - 0.5) * 120;
                const position = { x: randomX, y: 10, z: randomZ };
                
                const { createCubeGeometry, createCubePhysicsBody, getColorValues } = await import('./objects/Cube.js');
                const colorValues = getColorValues();
                
                const cubeMesh = createCubeGeometry(colorValues[colorIndex]);
                cubeMesh.name = `cube_${assetConfig.color}_${Date.now()}`;
                cubeMesh.userData.color = assetConfig.color;
                cubeMesh.userData.colorIndex = colorIndex;
                
                const cubeBody = createCubePhysicsBody(state.world, position, 0);
                cubeMesh.position.copy(cubeBody.position);
                cubeMesh.quaternion.copy(cubeBody.quaternion);
                cubeMesh.userData.physicsBody = cubeBody;
                
                state.scene.add(cubeMesh);
                state.cubes.push(cubeMesh);
                
                addLogEntry(`✅ ${assetName} 加载成功！位置: (${position.x.toFixed(1)}, ${position.z.toFixed(1)})`, 'success');
                updateCurrentCommandDisplay(`✅ ${assetName} 加载成功！`, 'success');
                
                updateObjectNameMapping();
                
            } else if (assetConfig.type === 'mug') {
                const colorIndexMap = { 'red': 0, 'yellow': 1, 'blue': 2 };
                const colorIndex = colorIndexMap[assetConfig.color];
                
                const randomX = (Math.random() - 0.5) * 180;
                const randomZ = (Math.random() - 0.5) * 120;
                const position = { x: randomX, y: 10, z: randomZ };
                
                const { createMugGeometry, createMugPhysicsBody, getColorValues } = await import('./objects/Mug.js');
                const colorValues = getColorValues();
                
                const mugMesh = createMugGeometry(colorValues[colorIndex]);
                mugMesh.name = `mug_${assetConfig.color}_${Date.now()}`;
                mugMesh.userData.color = assetConfig.color;
                mugMesh.userData.colorIndex = colorIndex;
                
                const mugBody = createMugPhysicsBody(state.world, position, 0);
                mugMesh.position.copy(mugBody.position);
                mugMesh.quaternion.copy(mugBody.quaternion);
                mugMesh.userData.physicsBody = mugBody;
                
                state.scene.add(mugMesh);
                state.mugs.push(mugMesh);
                
                addLogEntry(`✅ ${assetName} 加载成功！位置: (${position.x.toFixed(1)}, ${position.z.toFixed(1)})`, 'success');
                updateCurrentCommandDisplay(`✅ ${assetName} 加载成功！`, 'success');
                
                updateObjectNameMapping();
            }
            
            openAssetSelector();
            
        } else {
            const asset = await createAssetAtRandomPosition(state.scene, state.world, category, assetId);
            
            addLogEntry(`✅ ${assetName} 加载成功！位置: (${asset.position.x.toFixed(1)}, ${asset.position.z.toFixed(1)})`, 'success');
            updateCurrentCommandDisplay(`✅ ${assetName} 加载成功！`, 'success');
            
            openAssetSelector();
            
            console.log('Asset loaded:', assetName, asset);
        }
        
    } catch (error) {
        addLogEntry(`❌ 加载失败: ${error.message}`, 'error');
        updateCurrentCommandDisplay(`❌ 加载失败: ${error.message}`, 'error');
        console.error('Failed to load asset:', error);
    }
};

window.randomReset = randomReset;
window.saveCurrentConfiguration = saveCurrentConfiguration;
window.openConfigManager = openConfigManager;
window.closeConfigManager = closeConfigManager;
window.updateSelectedConfig = updateSelectedConfig;
window.loadSelectedConfiguration = loadSelectedConfiguration;
window.deleteConfiguration = deleteConfiguration;
window.deleteConfigurationFromList = deleteConfigurationFromList;
window.loadConfiguration = loadConfiguration;
window.selectDefaultOption = selectDefaultOption;
window.cancelTaskQuery = cancelTaskQuery;
window.confirmTaskQuery = confirmTaskQuery;
window.startAutoTest = startAutoTest;
window.stopAutoTest = stopAutoTest;
window.saveCommandLog = saveCommandLog;
window.toggleBoundary = toggleBoundary;
window.openObjectList = openObjectList;
window.closeObjectList = closeObjectList;

window.getGridPlacement = () => gridPlacement;

init();

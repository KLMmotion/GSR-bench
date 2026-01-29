

export let scene = null;
export let camera = null;
export let renderer = null;
export let world = null;
export let controls = null;

export let desk = null;
export let boxes = [];
export let boxesWithLid = [];
export let mugs = [];
export let cubes = [];
export let plates = [];
export let liberoAssets = [];

export let raycaster = null;
export let mouse = null;
export let isDragging = false;
export let dragObject = null;
export let dragConstraint = null;
export let boundaryMesh = null;

export let objectsInHand = new Set();
export let objectsBeingAnimated = new Set();

export let ros = null;
export let sceneGraphTopic = null;
export let actionCommandSubscriber = null;
export let taskQueryPublisher = null;
export let agentOverSubscriber = null;
export let agentTriggerPublisher = null;
export let publishInterval = null;
export let isRosConnected = false;

export let isAutoTesting = false;
export let currentConfigIndex = 0;
export let availableTestConfigs = [];
export let autoTestTimeout = null;
export let autoTestStartTime = null;
export let allCommandLog = [];

export let isCheckingSceneStability = false;
export let sceneStabilityCheckId = 0;

export let configManagerOpen = false;
export let availableConfigs = [];
export let selectedConfigNumber = 1;

export let objectNameMap = {
    'table': 'table'
};

export let boxColorCounts = { red: 0, yellow: 0, blue: 0 };
export let boxWithLidColorCounts = { red: 0, yellow: 0, blue: 0 };
export let mugColorCounts = { red: 0, yellow: 0, blue: 0 };
export let cubeColorCounts = { red: 0, yellow: 0, blue: 0, green: 0, white: 0 };

export function setScene(value) { scene = value; }
export function setCamera(value) { camera = value; }
export function setRenderer(value) { renderer = value; }
export function setWorld(value) { world = value; }
export function setControls(value) { controls = value; }
export function setDesk(value) { desk = value; }

export function setBoxes(value) { boxes = value; }
export function setBoxesWithLid(value) { boxesWithLid = value; }
export function setMugs(value) { mugs = value; }
export function setCubes(value) { cubes = value; }
export function setPlates(value) { plates = value; }
export function setLiberoAssets(value) { liberoAssets = value; }
export function clearBoxes() { boxes = []; }
export function clearBoxesWithLid() { boxesWithLid = []; }
export function clearMugs() { mugs = []; }
export function clearCubes() { cubes = []; }
export function clearPlates() { plates = []; }
export function clearLiberoAssets() { liberoAssets = []; }
export function addBox(box) { boxes.push(box); }
export function addBoxWithLid(box) { boxesWithLid.push(box); }
export function addMug(mug) { mugs.push(mug); }
export function addCube(cube) { cubes.push(cube); }
export function addPlate(plate) { plates.push(plate); }
export function addLiberoAsset(asset) { liberoAssets.push(asset); }

export function setRaycaster(value) { raycaster = value; }
export function setMouse(value) { mouse = value; }
export function setIsDragging(value) { isDragging = value; }
export function setDragObject(value) { dragObject = value; }
export function setDragConstraint(value) { dragConstraint = value; }
export function setBoundaryMesh(value) { boundaryMesh = value; }

export function setRos(value) { ros = value; }
export function setSceneGraphTopic(value) { sceneGraphTopic = value; }
export function setActionCommandSubscriber(value) { actionCommandSubscriber = value; }
export function setTaskQueryPublisher(value) { taskQueryPublisher = value; }
export function setAgentOverSubscriber(value) { agentOverSubscriber = value; }
export function setAgentTriggerPublisher(value) { agentTriggerPublisher = value; }
export function setPublishInterval(value) { publishInterval = value; }
export function setIsRosConnected(value) { isRosConnected = value; }

export function setIsAutoTesting(value) { isAutoTesting = value; }
export function setCurrentConfigIndex(value) { currentConfigIndex = value; }
export function setAvailableTestConfigs(value) { availableTestConfigs = value; }
export function setAutoTestTimeout(value) { autoTestTimeout = value; }
export function setAutoTestStartTime(value) { autoTestStartTime = value; }
export function clearAllCommandLog() { allCommandLog = []; }
export function addToCommandLog(entry) { allCommandLog.push(entry); }
export function setIsCheckingSceneStability(value) { isCheckingSceneStability = value; }
export function setSceneStabilityCheckId(value) { sceneStabilityCheckId = value; }

export function setConfigManagerOpen(value) { configManagerOpen = value; }
export function setAvailableConfigs(value) { availableConfigs = value; }
export function setSelectedConfigNumber(value) { selectedConfigNumber = value; }

export function setObjectNameMap(value) { objectNameMap = value; }
export function updateObjectNameMapEntry(key, value) { objectNameMap[key] = value; }
export function resetObjectNameMap() { objectNameMap = { 'table': 'table' }; }

export function setBoxColorCounts(value) { boxColorCounts = value; }
export function setBoxWithLidColorCounts(value) { boxWithLidColorCounts = value; }
export function setMugColorCounts(value) { mugColorCounts = value; }
export function setCubeColorCounts(value) { cubeColorCounts = value; }
export function resetColorCounts() {
    boxColorCounts = { red: 0, yellow: 0, blue: 0 };
    boxWithLidColorCounts = { red: 0, yellow: 0, blue: 0 };
    mugColorCounts = { red: 0, yellow: 0, blue: 0 };
    cubeColorCounts = { red: 0, yellow: 0, blue: 0, green: 0, white: 0 };
}

export function clearInHandStates() {
    objectsInHand.clear();
    objectsBeingAnimated.clear();
}

export const state = {
    get scene() { return scene; },
    get camera() { return camera; },
    get renderer() { return renderer; },
    get world() { return world; },
    get controls() { return controls; },
    get desk() { return desk; },
    get boxes() { return boxes; },
    get boxesWithLid() { return boxesWithLid; },
    get mugs() { return mugs; },
    get cubes() { return cubes; },
    get liberoAssets() { return liberoAssets; },
    get raycaster() { return raycaster; },
    get mouse() { return mouse; },
    get isDragging() { return isDragging; },
    get dragObject() { return dragObject; },
    get dragConstraint() { return dragConstraint; },
    get boundaryMesh() { return boundaryMesh; },
    get objectsInHand() { return objectsInHand; },
    get objectsBeingAnimated() { return objectsBeingAnimated; },
    get ros() { return ros; },
    get sceneGraphTopic() { return sceneGraphTopic; },
    get actionCommandSubscriber() { return actionCommandSubscriber; },
    get taskQueryPublisher() { return taskQueryPublisher; },
    get agentOverSubscriber() { return agentOverSubscriber; },
    get agentTriggerPublisher() { return agentTriggerPublisher; },
    get publishInterval() { return publishInterval; },
    get isRosConnected() { return isRosConnected; },
    get isAutoTesting() { return isAutoTesting; },
    get currentConfigIndex() { return currentConfigIndex; },
    get availableTestConfigs() { return availableTestConfigs; },
    get autoTestTimeout() { return autoTestTimeout; },
    get autoTestStartTime() { return autoTestStartTime; },
    get allCommandLog() { return allCommandLog; },
    get isCheckingSceneStability() { return isCheckingSceneStability; },
    get sceneStabilityCheckId() { return sceneStabilityCheckId; },
    get configManagerOpen() { return configManagerOpen; },
    get availableConfigs() { return availableConfigs; },
    get selectedConfigNumber() { return selectedConfigNumber; },
    get objectNameMap() { return objectNameMap; },
    set objectNameMap(value) { objectNameMap = value; },
    get boxColorCounts() { return boxColorCounts; },
    get boxWithLidColorCounts() { return boxWithLidColorCounts; },
    get mugColorCounts() { return mugColorCounts; },
    get cubeColorCounts() { return cubeColorCounts; }
};

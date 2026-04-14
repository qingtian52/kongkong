import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import gsap from 'gsap';
import * as XLSX from 'xlsx';

// ================= 列映射配置 =================
const COLUMN_CONFIG = {
    gridIdCol: 0,
    nameCol: 1,
    wechatImgCol: 2,
    locationCol: 3,
    noteCol: 4
};

// ---------- 1. 场景初始化 ----------
const scene = new THREE.Scene();
const textureLoader = new THREE.TextureLoader();

// 白天/黑夜背景纹理
const dayTexture = textureLoader.load('/sky.png');
dayTexture.colorSpace = THREE.SRGBColorSpace;
const nightTexture = textureLoader.load('/dark.png');
nightTexture.colorSpace = THREE.SRGBColorSpace;

let isDayMode = true;  // 当前是否为白天模式
scene.background = dayTexture;
scene.backgroundIntensity = 0.9;
scene.environment = null;

const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 1000);
const initialCameraPos = new THREE.Vector3(0, 5, 120);
const initialCameraTarget = new THREE.Vector3(0, 0, 0);
camera.position.copy(initialCameraPos);
camera.lookAt(initialCameraTarget);
camera.zoom = 1.0;
camera.updateProjectionMatrix();

const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
    precision: "highp"
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.6;
document.body.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0px';
labelRenderer.domElement.style.left = '0px';
labelRenderer.domElement.style.pointerEvents = 'none';
document.body.appendChild(labelRenderer.domElement);

// ---------- 2. 灯光系统 ----------
const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xfff8e8, 2);
dirLight.position.set(12, 22, 15);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 4096;
dirLight.shadow.mapSize.height = 4096;
dirLight.shadow.bias = -0.0001;
dirLight.shadow.normalBias = 0.05;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 80;
dirLight.shadow.camera.left = -40;
dirLight.shadow.camera.right = 40;
dirLight.shadow.camera.top = 40;
dirLight.shadow.camera.bottom = -40;
dirLight.shadow.camera.updateProjectionMatrix();
scene.add(dirLight);

const fillLight = new THREE.DirectionalLight(0xe0f0ff, 1.5);
fillLight.position.set(-15, 10, -12);
scene.add(fillLight);

const backLight = new THREE.DirectionalLight(0xffffff, 1.3);
backLight.position.set(0, 18, -20);
scene.add(backLight);

const warmFill = new THREE.PointLight(0xffaa66, 0.8);
warmFill.position.set(5, 8, 10);
scene.add(warmFill);

// 保存灯光默认强度，用于黑夜模式切换
const lightIntensities = {
    ambient: 0.55,
    dir: 2,
    fill: 1.5,
    back: 1.3,
    warm: 0.8
};

// 切换白天/黑夜模式
function toggleTheme() {
    isDayMode = !isDayMode;
    if (isDayMode) {
        scene.background = dayTexture;
        ambientLight.intensity = lightIntensities.ambient;
        dirLight.intensity = lightIntensities.dir;
        fillLight.intensity = lightIntensities.fill;
        backLight.intensity = lightIntensities.back;
        warmFill.intensity = lightIntensities.warm;
        themeBtn.style.backgroundImage = "url('/day.png')";
        themeBtn.innerHTML = ''; // 清除文字，显示背景图
        // 如果 day.png 不存在，降级为 emoji
        themeBtn.style.backgroundSize = 'cover';
    } else {
        scene.background = nightTexture;
        ambientLight.intensity = lightIntensities.ambient * 0.25;
        dirLight.intensity = lightIntensities.dir * 0.3;
        fillLight.intensity = lightIntensities.fill * 0.2;
        backLight.intensity = lightIntensities.back * 0.2;
        warmFill.intensity = lightIntensities.warm * 0.15;
        themeBtn.style.backgroundImage = "url('/night.png')";
        themeBtn.innerHTML = '';
        themeBtn.style.backgroundSize = 'cover';
    }
}

// ---------- 3. 轨道控制 ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enableRotate = true;
controls.enableZoom = true;
controls.enablePan = false;
controls.target.copy(initialCameraTarget);
const ANGLE_LIMIT = Math.PI / 6;
controls.minPolarAngle = Math.PI / 2 - ANGLE_LIMIT;
controls.maxPolarAngle = Math.PI / 2 + ANGLE_LIMIT;
controls.maxDistance = 200;
controls.minDistance = 10;
controls.minAzimuthAngle = -Math.PI / 6;
controls.maxAzimuthAngle = Math.PI / 6;
controls.update();

// ---------- 4. 重置函数（同时关闭简介弹窗）----------
function resetToInitialState() {
    closeIntroModal(); // 关闭简介弹窗
    
    gsap.killTweensOf(camera.position);
    gsap.killTweensOf(controls.target);
    gsap.killTweensOf(camera);
    
    camera.up.set(0, 1, 0);
    camera.position.copy(initialCameraPos);
    controls.target.copy(initialCameraTarget);
    camera.zoom = 1.0;
    camera.updateProjectionMatrix();
    controls.update();
    camera.lookAt(initialCameraTarget);
    
    if (activeGrid) {
        resetGridAnimation(activeGrid);
        activeGrid = null;
    }
    
    hideAllDialogs();
    
    if (gridParents.length) {
        gridParents.forEach(grid => {
            grid.traverse(child => {
                if (child.isMesh && child.material) {
                    gsap.killTweensOf(child.material.emissive);
                    child.material.emissive.setHex(0x222222);
                    child.material.emissiveIntensity = 0.1;
                }
            });
        });
    }
    hoveredGridName = '';
}

// ---------- 5. 右上角按钮组 ----------
const btnContainer = document.createElement('div');
btnContainer.style.cssText = `
    position: fixed;
    right: 25px;
    top: 25px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 15px;
    z-index: 100;
`;

// 辅助函数：为按钮添加 hover 显示文字功能
function addHoverText(btn, text, bgImageUrl) {
    const textSpan = document.createElement('span');
    textSpan.innerText = text;
    textSpan.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        font-weight: bold;
        color: white;
        text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
        background-color: rgba(0,0,0,0.6);
        border-radius: inherit;
        opacity: 0;
        transition: opacity 0.2s;
        pointer-events: none;
    `;
    btn.style.position = 'relative';
    btn.appendChild(textSpan);
    
    btn.addEventListener('mouseenter', () => {
        textSpan.style.opacity = '1';
        btn.style.backgroundImage = 'none';
    });
    btn.addEventListener('mouseleave', () => {
        textSpan.style.opacity = '0';
        btn.style.backgroundImage = `url(${bgImageUrl})`;
    });
}

// 关于按钮（原头像按钮）
const avatarBtn = document.createElement('div');
avatarBtn.style.cssText = `
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background-image: url('/头像.png');
    background-size: cover;
    background-position: center;
    cursor: pointer;
    transition: transform 0.2s ease;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    border: 0px solid rgba(255,255,255,0.6);
`;
avatarBtn.onmouseenter = () => avatarBtn.style.transform = 'scale(1.05)';
avatarBtn.onmouseleave = () => avatarBtn.style.transform = 'scale(1)';
avatarBtn.onclick = (e) => {
    e.stopPropagation();
    showIntroModal();
};
addHoverText(avatarBtn, '关于', '/头像.png');

// 返回按钮
const resetBtn = document.createElement('div');
resetBtn.style.cssText = `
    width: 80px;
    height: 80px;
    cursor: pointer;
    transition: all 0.2s ease;
    background-image: url('/back01.png');
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
    border-radius: 50%;
    background-color: rgba(0,0,0,0.001);
`;

resetBtn.onclick = (e) => {
    e.stopPropagation();
    resetToInitialState();
};
addHoverText(resetBtn, '返回', '/back01.png');

// 白天/黑夜切换按钮
const themeBtn = document.createElement('div');
themeBtn.style.cssText = `
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background-image: url('/day.png');
    background-size: cover;
    background-position: center;
    cursor: pointer;
    transition: transform 0.2s ease;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    background-color: rgba(0,0,0,0.2);
`;
themeBtn.onmouseenter = () => themeBtn.style.transform = 'scale(1.05)';
themeBtn.onmouseleave = () => themeBtn.style.transform = 'scale(1)';
themeBtn.onclick = (e) => {
    e.stopPropagation();
    toggleTheme();
};
// 如果 day.png / night.png 不存在，降级显示 emoji 文字
const dayImg = new Image();
dayImg.onerror = () => {
    if (isDayMode) {
        themeBtn.style.backgroundImage = 'none';
        themeBtn.innerHTML = '🌞';
        themeBtn.style.fontSize = '48px';
        themeBtn.style.lineHeight = '80px';
        themeBtn.style.textAlign = 'center';
    }
};
dayImg.src = '/day.png';
const nightImg = new Image();
nightImg.onerror = () => {
    if (!isDayMode) {
        themeBtn.style.backgroundImage = 'none';
        themeBtn.innerHTML = '🌙';
        themeBtn.style.fontSize = '48px';
        themeBtn.style.lineHeight = '80px';
        themeBtn.style.textAlign = 'center';
    }
};
nightImg.src = '/night.png';

btnContainer.appendChild(avatarBtn);
btnContainer.appendChild(resetBtn);
btnContainer.appendChild(themeBtn);
document.body.appendChild(btnContainer);

// ---------- 6. 简介弹窗（修复关闭按钮）----------
let introModal = null;
let isIntroModalVisible = false;
let outsideClickHandler = null;

function showIntroModal() {
    if (introModal && document.body.contains(introModal)) {
        introModal.style.display = 'flex';
        isIntroModalVisible = true;
        bindOutsideClick();
        return;
    }
    
    introModal = document.createElement('div');
    introModal.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 1500px;
        max-width: 90vw;
        height: 1100px;
        max-height: 80vh;
        background: #A3D9ED;
        border-radius: 20px;
        box-shadow: 0 20px 35px rgba(0,0,0,0.3);
        z-index: 200;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        font-family: "Microsoft YaHei", "PingFang SC", system-ui, sans-serif;
        border: 1px solid rgba(0,0,0,0.1);
        resize: both;
        pointer-events: auto;
    `;
    
    const titleBar = document.createElement('div');
    titleBar.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: #f5f5f5;
        border-bottom: 1px solid #ddd;
        flex-shrink: 0;
        user-select: none;
    `;
    const leftPlaceholder = document.createElement('div');
    leftPlaceholder.style.width = '30px';
    const title = document.createElement('span');
    title.innerText = '📖 空空简介';
    title.style.fontWeight = 'bold';
    title.style.fontSize = '26px';
    title.style.flex = '1';
    title.style.textAlign = 'center';
    const closeBtn = document.createElement('span');
    closeBtn.innerText = '✕';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.fontSize = '24px';
    closeBtn.style.padding = '0 6px';
    closeBtn.onclick = (e) => {
        e.stopPropagation();
        closeIntroModal();
    };
    titleBar.appendChild(leftPlaceholder);
    titleBar.appendChild(title);
    titleBar.appendChild(closeBtn);
    
    const contentDiv = document.createElement('div');
    contentDiv.style.cssText = `
        flex: 1;
        padding: 24px;
        overflow-y: auto;
        font-size: 21px;
        line-height: 1.5;
        color: #FFFFFF;
        white-space: pre-wrap;
        word-break: break-word;
    `;
    contentDiv.innerText = '加载中...';
    
    introModal.appendChild(titleBar);
    introModal.appendChild(contentDiv);
    document.body.appendChild(introModal);
    
    fetch('/data/简介.txt')
        .then(res => {
            if (!res.ok) throw new Error('文件不存在');
            return res.text();
        })
        .then(text => {
            contentDiv.innerText = text || '（暂无简介内容）';
        })
        .catch(err => {
            console.error('加载简介失败:', err);
            contentDiv.innerText = '❌ 无法加载简介内容，请确保 /data/简介.txt 文件存在。';
        });
    
    isIntroModalVisible = true;
    bindOutsideClick();
}

function bindOutsideClick() {
    if (outsideClickHandler) document.removeEventListener('click', outsideClickHandler);
    outsideClickHandler = (e) => {
        if (isIntroModalVisible && introModal && !introModal.contains(e.target)) {
            closeIntroModal();
        }
    };
    setTimeout(() => {
        if (isIntroModalVisible) {
            document.addEventListener('click', outsideClickHandler);
        }
    }, 0);
}

function closeIntroModal() {
    if (introModal) {
        introModal.style.display = 'none';
        isIntroModalVisible = false;
        if (outsideClickHandler) {
            document.removeEventListener('click', outsideClickHandler);
            outsideClickHandler = null;
        }
    }
}

// ---------- 7. 核心变量 ----------
let activeGrid = null;
let hoveredGridName = '';
let gridParents = [];
const originalData = new Map();
let mixer = null;
let interactiveMeshes = [];

// 存储 kong_remesh 模型的所有 Mesh
let kongRemeshMeshSet = new Set();

const labelScene = new THREE.Scene();
const dialogMap = new Map();
let currentVisibleDialog = null;

const CAM_ZOOM_IN = 1.2;
const PULL_DISTANCE = 8;
const PULL_DIRECTION = new THREE.Vector3(0, 0, 1);
const SCALE_FACTOR = 1.25;
const CAM_RIGHT_OFFSET_RATIO = 0.55;
const CAM_EXTRA_ZOOM = -28;
const MIN_CAMERA_DISTANCE = 12;

// ---------- 8. Excel 数据加载 ----------
const gridDataMap = new Map();

function buildImageUrl(fileName) {
    if (!fileName) return '';
    if (fileName.startsWith('/') || fileName.startsWith('http')) return fileName;
    return `/media/${fileName}`;
}

async function loadExcelData() {
    try {
        const response = await fetch('/data/grid_data.xlsx');
        if (!response.ok) {
            console.warn('Excel 文件未找到');
            return false;
        }
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });
        if (!rows || rows.length < 2) return false;
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;
            let gridId = String(row[COLUMN_CONFIG.gridIdCol] || '').trim();
            if (gridId === "") continue;
            let pureId = gridId.replace(/^Grid_/i, '');
            const name = row[COLUMN_CONFIG.nameCol] ? String(row[COLUMN_CONFIG.nameCol]).trim() : '';
            const wechatImgFile = row[COLUMN_CONFIG.wechatImgCol] ? String(row[COLUMN_CONFIG.wechatImgCol]).trim() : '';
            const location = row[COLUMN_CONFIG.locationCol] ? String(row[COLUMN_CONFIG.locationCol]).trim() : '';
            const note = row[COLUMN_CONFIG.noteCol] ? String(row[COLUMN_CONFIG.noteCol]).trim() : '';
            const wechatImgUrl = buildImageUrl(wechatImgFile);
            gridDataMap.set(pureId, { name, wechatImgUrl, location, note });
        }
        console.log(`加载 ${gridDataMap.size} 条格子配置`);
        return true;
    } catch (err) {
        console.error('Excel 解析失败:', err);
        return false;
    }
}

function getDialogDataForGrid(gridParent) {
    if (!gridParent || !gridParent.name) return null;
    const match = gridParent.name.match(/\d+/);
    let gridNumber = match ? match[0] : '';
    if (!gridNumber) return null;
    return gridDataMap.get(gridNumber) || null;
}

// ---------- 9. CSS2D弹窗 ----------
function createDialogElement(data) {
    const div = document.createElement('div');
    div.style.backgroundColor = '#90D3F4';
    div.style.backdropFilter = 'blur(12px)';
    div.style.border = '1px solid rgba(255, 255, 255, 0.25)';
    div.style.borderRadius = '0px';
    div.style.fontFamily = '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif';
    div.style.color = '#ffffff';
    div.style.boxShadow = '0 8px 20px rgba(0,0,0,0.3)';
    div.style.padding = '25px';
    div.style.width = '400px';
    div.style.height = '430px';
    div.style.display = 'flex';
    div.style.flexDirection = 'column';
    div.style.pointerEvents = 'none';
    
    const imgHtml = data.wechatImgUrl 
        ? `<div style="flex:0 0 120px; width:120px; margin-right:12px;"><img src="${data.wechatImgUrl}" style="width:100%; height:auto; object-fit:cover;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div style="display:none; text-align:center;">📷</div></div>`
        : `<div style="flex:0 0 120px; width:120px; margin-right:12px; background:rgba(255,255,255,0.1); display:flex; align-items:center; justify-content:center;">📷</div>`;
    
    const nameHtml = `<div style="font-size:35px; font-weight:bold; margin-bottom:18px;">${escapeHtml(data.name || '匿名')}</div>`;
    const locationHtml = `<div style="font-size:28px; color:#F0E05F;">📍 ${escapeHtml(data.location || '未知地点')}</div>`;
    const noteHtml = `<div style="flex-grow:1; overflow-y:auto; margin-top:25px; font-size:20px; line-height:1.4; border-top:0.2px solid rgba(255,255,255,0.2); padding-top:10px;">${escapeHtml(data.note || '暂无笔记')}</div>`;
    
    div.innerHTML = `
        <div style="display:flex; align-items:flex-start;">
            ${imgHtml}
            <div style="display:flex; flex-direction:column; justify-content:flex-start; margin-top:8px; flex:1;">
                ${nameHtml}
                ${locationHtml}
            </div>
        </div>
        ${noteHtml}
    `;
    return new CSS2DObject(div);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

function createDialogsForGrids() {
    for (let grid of gridParents) {
        const data = getDialogDataForGrid(grid);
        if (!data) continue;
        const dialogObj = createDialogElement(data);
        dialogObj.visible = false;
        labelScene.add(dialogObj);
        dialogMap.set(grid, dialogObj);
    }
}

function showDialogForGrid(grid) {
    if (currentVisibleDialog) {
        currentVisibleDialog.visible = false;
        currentVisibleDialog = null;
    }
    const dialogObj = dialogMap.get(grid);
    if (dialogObj) {
        dialogObj.visible = true;
        currentVisibleDialog = dialogObj;
        updateDialogPosition(grid, dialogObj);
    }
}

function hideAllDialogs() {
    if (currentVisibleDialog) {
        currentVisibleDialog.visible = false;
        currentVisibleDialog = null;
    }
}

function updateDialogPosition(grid, dialogObj) {
    const box = new THREE.Box3().setFromObject(grid);
    if (box.isEmpty()) return;
    const screenHeight = window.innerHeight;
    let verticalCorrection = screenHeight <= 1200 ? -1.2 : (screenHeight >= 2000 ? 0 : -0.6);
    const rightPos = new THREE.Vector3(
        box.max.x + 3.2,
        (box.min.y + box.max.y) / 2 + verticalCorrection+0.6,
        (box.min.z + box.max.z) / 2
    );
    dialogObj.position.copy(rightPos);
}

function updateActiveDialogPosition() {
    if (currentVisibleDialog && activeGrid) {
        updateDialogPosition(activeGrid, currentVisibleDialog);
    }
}

// ---------- 10. 模型加载 ----------
function optimizeMaterialTextures(material) {
    if (!material) return;
    if (material.map) material.map.anisotropy = 16;
    if (material.emissiveMap) material.emissiveMap.anisotropy = 16;
    if (material.roughnessMap) material.roughnessMap.anisotropy = 16;
    if (material.metalnessMap) material.metalnessMap.anisotropy = 16;
    if (material.normalMap) material.normalMap.anisotropy = 16;
    material.precision = 'highp';
}

const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
loader.setDRACOLoader(dracoLoader);
const ktx2Loader = new KTX2Loader();
ktx2Loader.setTranscoderPath('https://www.gstatic.com/basis-universal/v1/basis/');
ktx2Loader.detectSupport(renderer);
loader.setKTX2Loader(ktx2Loader);

function loadModel() {
    loader.load('/kongmin04002.glb', (gltf) => {
        const model = gltf.scene;
        if (gltf.animations?.length) {
            mixer = new THREE.AnimationMixer(model);
            gltf.animations.forEach(clip => mixer.clipAction(clip).play());
        }
        model.traverse((child) => {
            if (child.isObject3D && child.name && child.name.match(/^Grid_\d+$/)) {
                gridParents.push(child);
                originalData.set(child, {
                    position: child.position.clone(),
                    scale: child.scale.clone(),
                    rotation: child.rotation.clone()
                });
                child.position.copy(originalData.get(child).position);
                child.scale.copy(originalData.get(child).scale);
                child.updateMatrixWorld(true);
                gsap.killTweensOf(child.position);
                gsap.killTweensOf(child.scale);
                child.traverse(sub => {
                    if (sub.isMesh) {
                        if (sub.material) {
                            const mat = sub.material;
                            if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
                            if (mat.emissiveMap) mat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
                            mat.transparent = false;
                            mat.alphaTest = 0.5;
                            mat.depthWrite = true;
                            const isGlass = mat.name && mat.name.toLowerCase().includes('glass');
                            if (!isGlass) {
                                mat.roughness = 0.7;
                                mat.metalness = 0.0;
                                mat.envMapIntensity = 0.3;
                            }
                            mat.emissive = new THREE.Color(0x222222);
                            mat.emissiveIntensity = 0.1;
                            mat.needsUpdate = true;
                            optimizeMaterialTextures(mat);
                        }
                        sub.castShadow = true;
                        sub.receiveShadow = true;
                    }
                });
            } else if (child.isMesh) {
                if (child.material) {
                    const mat = child.material;
                    if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
                    mat.roughness = 0.7;
                    mat.envMapIntensity = 1.2;
                    mat.needsUpdate = true;
                    optimizeMaterialTextures(mat);
                }
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        console.log(`找到 ${gridParents.length} 个格子`);
        scene.add(model);
        model.position.set(-10, 0, 0);
        model.updateMatrixWorld(true);
        
        interactiveMeshes = [];
        gridParents.forEach(grid => { grid.traverse(o => { if (o.isMesh) interactiveMeshes.push(o); }); });
        
        // 查找所有名称包含 "kong_remesh" 的模型（不区分大小写）
        kongRemeshMeshSet.clear();
        const collectKongRemeshMeshes = (node) => {
            if (node.name && node.name.toLowerCase().includes('kong_remesh')) {
                node.traverse(sub => {
                    if (sub.isMesh) {
                        kongRemeshMeshSet.add(sub);
                        if (!interactiveMeshes.includes(sub)) {
                            interactiveMeshes.push(sub);
                        }
                    }
                });
            } else {
                node.children.forEach(child => collectKongRemeshMeshes(child));
            }
        };
        collectKongRemeshMeshes(model);
        if (kongRemeshMeshSet.size > 0) {
            console.log(`找到 ${kongRemeshMeshSet.size} 个 kong_remesh 模型网格，已加入交互检测`);
        } else {
            console.warn('未找到名称包含 "kong_remesh" 的模型，请检查 GLB 文件中的节点命名');
        }
        
        createDialogsForGrids();
        
        const loadingEl = document.getElementById('loading');
        if (loadingEl) loadingEl.style.display = 'none';
    }, (xhr) => {
        const percent = (xhr.loaded / xhr.total * 100).toFixed(2);
        const loadingDiv = document.getElementById('loading');
        if (loadingDiv) loadingDiv.innerText = `✨ 加载中 ${percent}% ✨`;
    }, (error) => {
        console.error('模型加载失败:', error);
        const loadingDiv = document.getElementById('loading');
        if (loadingDiv) loadingDiv.innerHTML = '❌ 模型加载失败<br>请确保模型文件存在';
    });
}

function playPullAndScaleAnimation(gridParent, onComplete) {
    const data = originalData.get(gridParent);
    if (!data) return;
    gsap.killTweensOf(gridParent.position);
    gsap.killTweensOf(gridParent.scale);
    const targetPos = data.position.clone().add(PULL_DIRECTION.clone().multiplyScalar(PULL_DISTANCE));
    const targetScale = data.scale.clone().multiplyScalar(SCALE_FACTOR);
    gsap.to(gridParent.position, { x: targetPos.x, y: targetPos.y, z: targetPos.z, duration: 0.35, ease: "power2.out" });
    gsap.to(gridParent.scale, { x: targetScale.x, y: targetScale.y, z: targetScale.z, duration: 0.4, ease: "back.out(1.7)", onComplete });
    gridParent.traverse(child => { if (child.isMesh && child.material) gsap.to(child.material.emissive, { r: 0.3, g: 0.35, b: 0.45, duration: 0.3 }); });
}

function resetGridAnimation(gridParent) {
    const data = originalData.get(gridParent);
    if (!data) return;
    gsap.killTweensOf(gridParent.position);
    gsap.killTweensOf(gridParent.scale);
    gsap.to(gridParent.scale, { x: data.scale.x, y: data.scale.y, z: data.scale.z, duration: 0.25, ease: "power2.inOut" });
    gsap.to(gridParent.position, { x: data.position.x, y: data.position.y, z: data.position.z, duration: 0.25, ease: "power2.inOut" });
    gridParent.traverse(child => { if (child.isMesh && child.material) gsap.to(child.material.emissive, { r: 0.1, g: 0.1, b: 0.1, duration: 0.25 }); });
}

function getCameraPositionForGrid(grid) {
    const box = new THREE.Box3().setFromObject(grid);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * Math.PI / 180;
    let baseDistance = maxDim / (2 * Math.tan(fov / 2)) + 3.0;
    let finalDistance = Math.max(baseDistance - CAM_EXTRA_ZOOM, MIN_CAMERA_DISTANCE);
    const rightOffset = size.x * CAM_RIGHT_OFFSET_RATIO;
    return {
        pos: new THREE.Vector3(center.x + rightOffset, center.y, center.z + finalDistance),
        target: new THREE.Vector3(center.x + rightOffset, center.y, center.z)
    };
}

function animateCameraToGrid(grid) {
    const { pos, target } = getCameraPositionForGrid(grid);
    gsap.killTweensOf(camera.position);
    gsap.killTweensOf(controls.target);
    gsap.killTweensOf(camera);
    gsap.to(camera.position, { x: pos.x, y: pos.y, z: pos.z, duration: 1.2, ease: "power2.inOut", onUpdate: () => controls.update() });
    gsap.to(controls.target, { x: target.x, y: target.y, z: target.z, duration: 1.2, ease: "power2.inOut", onUpdate: () => { camera.lookAt(controls.target); controls.update(); } });
    gsap.to(camera, { zoom: CAM_ZOOM_IN, duration: 1.2, ease: "power2.inOut", onUpdate: () => camera.updateProjectionMatrix() });
}

// ---------- 11. 射线交互 ----------
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function onMouseMove(event) {
    if (interactiveMeshes.length === 0) return;
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactiveMeshes, false);
    const lastHoveredGrid = gridParents.find(g => g.name === hoveredGridName);
    
    // 检查是否 hover 到 kong_remesh 模型
    if (intersects.length) {
        const hitObject = intersects[0].object;
        if (kongRemeshMeshSet.has(hitObject)) {
            if (lastHoveredGrid) {
                lastHoveredGrid.traverse(child => {
                    if (child.isMesh && child.material) gsap.to(child.material.emissive, { r: 0.1, g: 0.1, b: 0.1, duration: 0.2 });
                });
                hoveredGridName = '';
            }
            document.body.style.cursor = 'pointer';
            return;
        }
    }
    
    // 原有格子 hover 逻辑
    if (intersects.length) {
        let parent = intersects[0].object.parent;
        while (parent && !parent.name?.match(/^Grid_\d+$/)) parent = parent.parent;
        const newHoveredName = parent ? parent.name : '';
        if (newHoveredName && newHoveredName !== hoveredGridName) {
            if (lastHoveredGrid) lastHoveredGrid.traverse(child => { if (child.isMesh && child.material) gsap.to(child.material.emissive, { r: 0.1, g: 0.1, b: 0.1, duration: 0.2 }); });
            if (parent) parent.traverse(child => { if (child.isMesh && child.material) gsap.to(child.material.emissive, { r: 0.4, g: 0.25, b: 0.6, duration: 0.2 }); });
            hoveredGridName = newHoveredName;
        }
        document.body.style.cursor = 'pointer';
    } else {
        if (lastHoveredGrid) lastHoveredGrid.traverse(child => { if (child.isMesh && child.material) gsap.to(child.material.emissive, { r: 0.1, g: 0.1, b: 0.1, duration: 0.2 }); });
        hoveredGridName = '';
        document.body.style.cursor = 'default';
    }
}

function onMouseClick(event) {
    if (isIntroModalVisible) return;
    if (interactiveMeshes.length === 0) return;
    if (event.target.closest && (event.target.closest('div')?.style?.zIndex === '100' || event.target.closest('div')?.style?.zIndex === '200')) return;
    
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactiveMeshes, false);
    
    // 优先判断是否点击到 kong_remesh 模型
    if (intersects.length) {
        const hitObject = intersects[0].object;
        if (kongRemeshMeshSet.has(hitObject)) {
            showIntroModal();
            return;
        }
    }
    
    // 原有格子点击逻辑
    let clickedGrid = null;
    if (intersects.length) {
        let parent = intersects[0].object.parent;
        while (parent && !parent.name?.match(/^Grid_\d+$/)) parent = parent.parent;
        clickedGrid = parent;
    }
    
    if (clickedGrid && gridParents.includes(clickedGrid)) {
        if (activeGrid && activeGrid !== clickedGrid) {
            resetGridAnimation(activeGrid);
            hideAllDialogs();
            activeGrid = null;
        }
        if (activeGrid !== clickedGrid) {
            activeGrid = clickedGrid;
            playPullAndScaleAnimation(activeGrid, () => {
                if (activeGrid === clickedGrid) {
                    showDialogForGrid(activeGrid);
                }
            });
            animateCameraToGrid(activeGrid);
        } else {
            if (activeGrid) {
                showDialogForGrid(activeGrid);
            }
        }
    } else {
        resetToInitialState();
    }
}

function onWheel() {
    if (currentVisibleDialog) {
        hideAllDialogs();
    }
}

window.addEventListener('mousemove', onMouseMove);
window.addEventListener('click', onMouseClick);
window.addEventListener('wheel', onWheel);

// ---------- 12. 动画循环 ----------
const clock = new THREE.Clock();
let lastTime = 0;

function animate(currentTime = 0) {
    requestAnimationFrame(animate);
    const delta = Math.min(0.033, (currentTime - lastTime) / 1000);
    lastTime = currentTime;
    if (mixer) mixer.update(delta);
    controls.update();
    updateActiveDialogPosition();
    renderer.render(scene, camera);
    labelRenderer.render(labelScene, camera);
}
animate();

let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        labelRenderer.setSize(window.innerWidth, window.innerHeight);
        if (activeGrid && currentVisibleDialog) {
            updateDialogPosition(activeGrid, currentVisibleDialog);
        }
    }, 100);
});

async function initApp() {
    await loadExcelData();
    loadModel();
}
initApp();
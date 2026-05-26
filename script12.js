import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
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

// ---------- 全局加载进度管理 ----------
let excelLoadedFlag = false;
let modelLoadedFlag = false;
let modelProgressRatio = 0;
let totalProgress = 0;

let loadingOverlay = null;
let progressFillElement = null;

function createLoadingOverlay() {
    const oldOverlay = document.getElementById('loading-overlay');
    if (oldOverlay) oldOverlay.remove();
    
    const overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.innerHTML = `
        <div class="loading-container">
            <div class="loading-text">✨ 加载中... ✨</div>
            <div class="progress-bar-bg">
                <div class="progress-bar-fill"></div>
            </div>
            
        </div>
    `;
    document.body.appendChild(overlay);
    
    loadingOverlay = overlay;
    progressFillElement = overlay.querySelector('.progress-bar-fill');
    
    const oldLoadingDiv = document.getElementById('loading');
    if (oldLoadingDiv) oldLoadingDiv.style.display = 'none';
}

function updateTotalProgress() {
    if (!progressFillElement) return;
    let weightedProgress = 0;
    if (excelLoadedFlag) weightedProgress += 0.3;
    if (modelLoadedFlag) {
        weightedProgress += 0.7;
    } else {
        weightedProgress += (modelProgressRatio * 0.7);
    }
    totalProgress = Math.min(0.999, Math.max(0, weightedProgress));
    const percent = totalProgress * 100;
    progressFillElement.style.width = `${percent}%`;
    
    if (excelLoadedFlag && modelLoadedFlag) {
        progressFillElement.style.width = '100%';
        setTimeout(() => {
            if (loadingOverlay) {
                loadingOverlay.style.opacity = '0';
                setTimeout(() => {
                    if (loadingOverlay && loadingOverlay.parentNode) {
                        loadingOverlay.remove();
                    }
                }, 500);
            }
        }, 200);
    }
}

function markExcelLoaded() {
    if (excelLoadedFlag) return;
    excelLoadedFlag = true;
    updateTotalProgress();
    tryFinalizeAllResources();
}

function markModelLoaded() {
    if (modelLoadedFlag) return;
    modelLoadedFlag = true;
    modelProgressRatio = 1;
    updateTotalProgress();
    tryFinalizeAllResources();
}

function updateModelProgress(loaded, total) {
    if (modelLoadedFlag) return;
    if (total > 0) {
        modelProgressRatio = Math.min(1, loaded / total);
        updateTotalProgress();
    }
}

let finalizeExecuted = false;
function tryFinalizeAllResources() {
    if (finalizeExecuted) return;
    if (excelLoadedFlag && modelLoadedFlag) {
        finalizeExecuted = true;
        if (typeof createAllDialogMeshes === 'function' && gridParents.length > 0) {
            if (dialogMeshMap.size === 0) {
                createAllDialogMeshes();
                console.log('所有资源加载完毕，弹窗已创建');
            }
        } else if (gridParents.length > 0) {
            setTimeout(() => {
                if (dialogMeshMap.size === 0 && typeof createAllDialogMeshes === 'function') {
                    createAllDialogMeshes();
                }
            }, 100);
        }
    }
}

// ---------- 1. 场景初始化 ----------
const scene = new THREE.Scene();
scene.background = null;
scene.environment = null;

const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.5, 500);
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
// if (renderer.shadowMap.mapSize) {
//     renderer.shadowMap.mapSize.set(1024, 1024);
// } else {
//     renderer.shadowMap.mapSize = { width: 1024, height: 1024 };
// }
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.6;
renderer.setClearColor(0x000000, 0);
renderer.sortObjects = true;
document.body.appendChild(renderer.domElement);

document.body.style.margin = '0';
document.body.style.padding = '0';
document.body.style.overflow = 'hidden';
document.body.style.backgroundImage = "url('/sky.png')";
document.body.style.backgroundSize = 'cover';
document.body.style.backgroundRepeat = 'no-repeat';
document.body.style.backgroundPosition = 'center center';
document.body.style.backgroundColor = '#000';

// ---------- 2. 灯光系统 ----------
const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xfff8e8, 2);
dirLight.position.set(12, 22, 15);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 1024;
dirLight.shadow.mapSize.height = 1024;
dirLight.shadow.bias = -0.0001;
dirLight.shadow.normalBias = 0.05;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 80;
dirLight.shadow.camera.left = -30;
dirLight.shadow.camera.right = 30;
dirLight.shadow.camera.top = 30;
dirLight.shadow.camera.bottom = -30;
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
warmFill.distance = 30;
warmFill.decay = 1.5;
scene.add(warmFill);

let topPointLights = [];

const lightIntensities = {
    ambient: 0.55,
    dir: 2,
    fill: 1.5,
    back: 1.3,
    warm: 0.8
};

let glowMeshSet = new Set();
let gridParents = [];
let activeGrid = null;
let hoveredGridName = '';
let mixer = null;
let interactiveMeshes = [];
let kongRemeshMeshSet = new Set();
let dialogMeshMap = new Map();
let currentVisibleDialogMesh = null;

function initTopPointLights() {
    topPointLights.forEach(light => {
        if (light.parent) light.parent.remove(light);
    });
    topPointLights = [];
    if (!gridParents.length) return;

    gridParents.forEach(grid => {
        grid.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(grid);
        if (box.isEmpty()) return;
        const center = box.getCenter(new THREE.Vector3());
        const topY = box.max.y;
        const light = new THREE.PointLight(0xffaa77, isDayMode ? 0 : 8);
        light.distance = 6;
        light.decay = 1.2;
        light.castShadow = false;
        light.shadow = null;
        const worldPos = new THREE.Vector3(center.x, topY - 1, center.z);
        const localPos = grid.worldToLocal(worldPos);
        light.position.copy(localPos);
        grid.add(light);
        topPointLights.push(light);
    });
    console.log(`为 ${topPointLights.length} 个格子创建了点光源`);
}

let isDayMode = true;

function toggleTheme() {
    isDayMode = !isDayMode;
    if (isDayMode) {
        document.body.style.backgroundImage = "url('/sky.png')";
        ambientLight.intensity = lightIntensities.ambient;
        dirLight.intensity = lightIntensities.dir;
        fillLight.intensity = lightIntensities.fill;
        backLight.intensity = lightIntensities.back;
        warmFill.intensity = lightIntensities.warm;
        topPointLights.forEach(light => { if (light) light.intensity = 0; });
        setGlowModelsIntensity(0.1, 0x222222);
        themeBtn.style.backgroundImage = "url('/night.png')";
    } else {
        document.body.style.backgroundImage = "url('/dark.png')";
        ambientLight.intensity = lightIntensities.ambient * 0.25;
        dirLight.intensity = lightIntensities.dir * 0.3;
        fillLight.intensity = lightIntensities.fill * 0.2;
        backLight.intensity = lightIntensities.back * 0.2;
        warmFill.intensity = lightIntensities.warm * 0.15;
        topPointLights.forEach(light => { if (light) light.intensity = 8; });
        setGlowModelsIntensity(2, 0xffaa66);
        themeBtn.style.backgroundImage = "url('/day.png')";
    }
    themeBtn.style.backgroundSize = 'cover';
}

function setGlowModelsIntensity(intensity, colorHex) {
    const color = new THREE.Color(colorHex);
    glowMeshSet.forEach(mesh => {
        if (mesh.isMesh && mesh.material) {
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach(mat => {
                if (mat.emissive !== undefined) {
                    mat.emissive = color;
                    mat.emissiveIntensity = intensity;
                }
            });
        }
    });
}

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

function resetToInitialState() {
    closeIntroModal();
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
        font-size: 18px;
        font-weight: bold;
        color: white;
        text-shadow: 1px 1px 2px rgba(0,0,0,0.2);
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

const avatarBtn = document.createElement('div');
avatarBtn.style.cssText = `
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background-image: url('/头像.png');
    background-size: cover;
    background-position: center;
    cursor: pointer;
    transition: transform 0.2s ease;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
`;
avatarBtn.onmouseenter = () => avatarBtn.style.transform = 'scale(1.05)';
avatarBtn.onmouseleave = () => avatarBtn.style.transform = 'scale(1)';
avatarBtn.onclick = (e) => {
    e.stopPropagation();
    showIntroModal();
};
addHoverText(avatarBtn, '关于', '/头像.png');

const resetBtn = document.createElement('div');
resetBtn.style.cssText = `
    width: 54px;
    height: 54px;
    cursor: pointer;
    transition: all 0.2s ease;
    background-image: url('/back01.png');
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
    border-radius: 50%;
    background-color: rgba(0,0,0,0.01);
`;
resetBtn.onclick = (e) => {
    e.stopPropagation();
    resetToInitialState();
};
resetBtn.onmouseenter = () => resetBtn.style.transform = 'scale(1.05)';
resetBtn.onmouseleave = () => resetBtn.style.transform = 'scale(1)';
addHoverText(resetBtn, '返回', '/back01.png');

const themeBtn = document.createElement('div');
themeBtn.style.cssText = `
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background-size: cover;
    background-position: center;
    cursor: pointer;
    transition: transform 0.2s ease;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    background-color: rgba(0,0,0,0.002);
`;
themeBtn.onmouseenter = () => themeBtn.style.transform = 'scale(1.05)';
themeBtn.onmouseleave = () => themeBtn.style.transform = 'scale(1)';

function handleThemeBtnHover() {
    themeBtn.style.backgroundImage = isDayMode ? "url('/hovernight.png')" : "url('/hoverday.png')";
    themeBtn.style.backgroundSize = 'cover';
}
function handleThemeBtnLeave() {
    themeBtn.style.backgroundImage = isDayMode ? "url('/night.png')" : "url('/day.png')";
    themeBtn.style.backgroundSize = 'cover';
}
themeBtn.addEventListener('mouseenter', handleThemeBtnHover);
themeBtn.addEventListener('mouseleave', handleThemeBtnLeave);
themeBtn.onclick = (e) => {
    e.stopPropagation();
    toggleTheme();
};
themeBtn.style.backgroundImage = "url('/night.png')";
themeBtn.style.backgroundSize = 'cover';

btnContainer.appendChild(avatarBtn);
btnContainer.appendChild(resetBtn);
btnContainer.appendChild(themeBtn);
document.body.appendChild(btnContainer);

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
        padding: 25px 25px;
        background: #f5f5f5;
        border-bottom: 1px solid #ddd;
        flex-shrink: 0;
        user-select: none;
    `;
    const leftPlaceholder = document.createElement('div');
    leftPlaceholder.style.width = '160px';
    const title = document.createElement('span');
    title.innerText = '关于项目';
    title.style.fontWeight = 'bold';
    title.style.fontSize = '26px';
    title.style.flex = '1';
    title.style.textAlign = 'center';
    const closeBtn = document.createElement('span');
    closeBtn.innerText = '✕';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.fontSize = '24px';
    closeBtn.style.padding = '0 15px';
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
        padding: 5em;
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
            markExcelLoaded();
            return false;
        }
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });
        if (!rows || rows.length < 2) {
            markExcelLoaded();
            return false;
        }
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
        markExcelLoaded();
        return true;
    } catch (err) {
        console.error('Excel 解析失败:', err);
        markExcelLoaded();
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

const DIALOG_WIDTH = 5.8;
const DIALOG_HEIGHT = 6;
const DIALOG_CANVAS_WIDTH = 800;
const DIALOG_CANVAS_HEIGHT = 830;

function drawDialogToCanvas(canvas, data, onImageLoaded) {
    const ctx = canvas.getContext('2d');
    const w = DIALOG_CANVAS_WIDTH;
    const h = DIALOG_CANVAS_HEIGHT;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#9adbf5';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(w - 20, 0);
    ctx.quadraticCurveTo(w, 0, w, 20);
    ctx.lineTo(w, h - 20);
    ctx.quadraticCurveTo(w, h, w - 20, h);
    ctx.lineTo(20, h);
    ctx.quadraticCurveTo(0, h, 0, h - 20);
    ctx.lineTo(0, 20);
    ctx.quadraticCurveTo(0, 0, 20, 0);
    ctx.closePath();
    ctx.clip();
    const imgSize = 180;
    const imgX = 25;
    const imgY = 25;
    ctx.fillStyle = 'rgba(255,255,255,0.01)';
    ctx.fillRect(imgX, imgY, imgSize, imgSize);
    if (data.wechatImgUrl) {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            const scale = Math.max(imgSize / img.width, imgSize / img.height);
            const drawW = img.width * scale;
            const drawH = img.height * scale;
            const drawX = imgX + (imgSize - drawW) / 2;
            const drawY = imgY + (imgSize - drawH) / 2;
            ctx.drawImage(img, drawX, drawY, drawW, drawH);
            if (onImageLoaded) onImageLoaded();
        };
        img.onerror = () => {
            ctx.fillStyle = '#aaa';
            ctx.font = `bold ${imgSize * 0.5}px "Microsoft YaHei"`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('📷', imgX + imgSize/2, imgY + imgSize/2);
            if (onImageLoaded) onImageLoaded();
        };
        img.src = data.wechatImgUrl;
    } else {
        ctx.fillStyle = '#aaa';
        ctx.font = `bold ${imgSize * 0.5}px "Microsoft YaHei"`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('📷', imgX + imgSize/2, imgY + imgSize/2);
    }
    const textX = imgX + imgSize + 21;
    const textY = imgY + 8;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold 70px "Microsoft YaHei", "PingFang SC"`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let nameText = data.name || '匿名';
    ctx.fillText(nameText, textX, textY + 12);
    ctx.font = `45px "Microsoft YaHei", "PingFang SC"`;
    ctx.fillStyle = '#F0E05F';
    let locationText = `📍 ${data.location || '未知地点'}`;
    ctx.fillText(locationText, textX, textY + 120);
    const noteY = imgY + imgSize + 45;
    const noteLeftMargin = 25;
    const noteRightMargin = 25;
    const noteMaxWidth = w - noteLeftMargin - noteRightMargin;
    ctx.beginPath();
    ctx.moveTo(noteLeftMargin, noteY - 8);
    ctx.lineTo(w - noteRightMargin, noteY - 8);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `28px "Microsoft YaHei", "PingFang SC"`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const noteText = data.note || '暂无笔记';
    let lines = [];
    let currentLine = '';
    for (let i = 0; i < noteText.length; i++) {
        const testLine = currentLine + noteText[i];
        const metrics = ctx.measureText(testLine);
        if (metrics.width > noteMaxWidth && currentLine.length > 0) {
            lines.push(currentLine);
            currentLine = noteText[i];
        } else {
            currentLine = testLine;
        }
    }
    if (currentLine) lines.push(currentLine);
    const lineHeight = 35;
    const maxLines = Math.min(lines.length, 12);
    for (let i = 0; i < maxLines; i++) {
        ctx.fillText(lines[i], noteLeftMargin, noteY + i * lineHeight);
    }
    if (lines.length > 12) {
        ctx.fillText('...', noteLeftMargin, noteY + 12 * lineHeight);
    }
    ctx.restore();
}

function createDialogMesh(data) {
    const canvas = document.createElement('canvas');
    canvas.width = DIALOG_CANVAS_WIDTH;
    canvas.height = DIALOG_CANVAS_HEIGHT;
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    const updateTexture = () => {
        drawDialogToCanvas(canvas, data, () => {
            texture.needsUpdate = true;
        });
        texture.needsUpdate = true;
    };
    updateTexture();
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
        toneMapped: false,
        depthTest: true,
        depthWrite: true
    });
    const geometry = new THREE.PlaneGeometry(DIALOG_WIDTH, DIALOG_HEIGHT);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.y = 0;
    mesh.userData = { data, canvas, texture };
    mesh.visible = false;
    return mesh;
}

function updateDialogPositionForGrid(grid, dialogMesh) {
    const box = new THREE.Box3().setFromObject(grid);
    if (box.isEmpty()) return;
    const screenHeight = window.innerHeight;
    let verticalCorrection = screenHeight <= 1200 ? -1.2 : (screenHeight >= 2000 ? 0 : -0.6);
    const pos = new THREE.Vector3(
        box.max.x + 3,
        (box.min.y + box.max.y) / 2 + verticalCorrection + 0.6,
        (box.min.z + box.max.z) / 2 + 3.38
    );
    dialogMesh.position.copy(pos);
}

function showDialogForGrid(grid) {
    if (currentVisibleDialogMesh) {
        currentVisibleDialogMesh.visible = false;
        currentVisibleDialogMesh = null;
    }
    const dialogMesh = dialogMeshMap.get(grid);
    if (dialogMesh) {
        updateDialogPositionForGrid(grid, dialogMesh);
        dialogMesh.visible = true;
        currentVisibleDialogMesh = dialogMesh;
    }
}

function hideAllDialogs() {
    if (currentVisibleDialogMesh) {
        currentVisibleDialogMesh.visible = false;
        currentVisibleDialogMesh = null;
    }
}

function updateActiveDialogPosition() {
    if (currentVisibleDialogMesh && activeGrid) {
        updateDialogPositionForGrid(activeGrid, currentVisibleDialogMesh);
    }
}

function createAllDialogMeshes() {
    for (let grid of gridParents) {
        if (dialogMeshMap.has(grid)) continue;
        const data = getDialogDataForGrid(grid);
        if (!data) continue;
        const dialogMesh = createDialogMesh(data);
        scene.add(dialogMesh);
        dialogMeshMap.set(grid, dialogMesh);
    }
    console.log(`创建 ${dialogMeshMap.size} 个3D弹窗`);
}

function optimizeMaterialTextures(material) {
    if (!material) return;
    if (material.map) material.map.anisotropy = 16;
    if (material.emissiveMap) material.emissiveMap.anisotropy = 16;
    if (material.roughnessMap) material.roughnessMap.anisotropy = 16;
    if (material.metalnessMap) material.metalnessMap.anisotropy = 16;
    if (material.normalMap) material.normalMap.anisotropy = 16;
    material.precision = 'highp';
    material.polygonOffset = true;
    material.polygonOffsetFactor = 2;
    material.polygonOffsetUnits = 2;
    material.shadowSide = THREE.FrontSide;
    if (material.transparent) {
        material.alphaTest = 0.1;
    }
}

const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
loader.setDRACOLoader(dracoLoader);
const ktx2Loader = new KTX2Loader();
ktx2Loader.setTranscoderPath('https://www.gstatic.com/basis-universal/v1/basis/');
ktx2Loader.detectSupport(renderer);
loader.setKTX2Loader(ktx2Loader);

const originalData = new Map();

const CAM_ZOOM_IN = 1.2;
const PULL_DISTANCE = 8;
const PULL_DIRECTION = new THREE.Vector3(0, 0, 1);
const SCALE_FACTOR = 1.25;
const CAM_RIGHT_OFFSET_RATIO = 0.55;
const CAM_EXTRA_ZOOM = -28;
const MIN_CAMERA_DISTANCE = 12;

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

function loadModel() {
    loader.load('/kongmin0414.glb', (gltf) => {
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
        
        kongRemeshMeshSet.clear();
        glowMeshSet.clear();
        const collectGlowMeshes = (node) => {
            const nameLower = node.name ? node.name.toLowerCase() : '';
            const isKongRemesh = nameLower.includes('kong_remesh');
            const isText4 = nameLower.includes('文本_4') || nameLower.includes('text_4');
            if (isKongRemesh || isText4) {
                node.traverse(sub => {
                    if (sub.isMesh) {
                        glowMeshSet.add(sub);
                        if (!interactiveMeshes.includes(sub)) interactiveMeshes.push(sub);
                        if (isKongRemesh && !kongRemeshMeshSet.has(sub)) kongRemeshMeshSet.add(sub);
                    }
                });
            } else {
                node.children.forEach(child => collectGlowMeshes(child));
            }
        };
        collectGlowMeshes(model);
        
        initTopPointLights();
        if (!isDayMode) {
            topPointLights.forEach(light => { if (light) light.intensity = 8; });
        } else {
            topPointLights.forEach(light => { if (light) light.intensity = 0; });
        }
        
        setGlowModelsIntensity(0.1, 0x222222);
        
        markModelLoaded();
        
        const loadingEl = document.getElementById('loading');
        if (loadingEl) loadingEl.style.display = 'none';
    }, (xhr) => {
        if (xhr.lengthComputable) {
            updateModelProgress(xhr.loaded, xhr.total);
        }
    }, (error) => {
        console.error('模型加载失败:', error);
        if (loadingOverlay) {
            loadingOverlay.innerHTML = `<div class="loading-container"><div class="loading-text">❌ 加载失败</div><div class="progress-bar-bg"><div class="progress-bar-fill" style="width:100%; background:#e05a5a;"></div></div><div class="loading-sub">请检查网络或模型文件</div></div>`;
        }
        markModelLoaded();
    });
}

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let currentHoveredGrid = null;

function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function performRaycast() {
    if (interactiveMeshes.length === 0) return;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactiveMeshes, false);
    let hitGrid = null;
    let hitKongRemesh = false;
    if (intersects.length) {
        const hitObject = intersects[0].object;
        if (kongRemeshMeshSet.has(hitObject)) {
            hitKongRemesh = true;
            document.body.style.cursor = 'pointer';
            if (currentHoveredGrid) {
                currentHoveredGrid.traverse(child => {
                    if (child.isMesh && child.material) gsap.to(child.material.emissive, { r: 0.1, g: 0.1, b: 0.1, duration: 0.2 });
                });
                currentHoveredGrid = null;
                hoveredGridName = '';
            }
            return;
        }
        let parent = intersects[0].object.parent;
        while (parent && !parent.name?.match(/^Grid_\d+$/)) parent = parent.parent;
        hitGrid = parent;
    }
    if (hitGrid && gridParents.includes(hitGrid)) {
        if (currentHoveredGrid !== hitGrid) {
            if (currentHoveredGrid) {
                currentHoveredGrid.traverse(child => {
                    if (child.isMesh && child.material) gsap.to(child.material.emissive, { r: 0.1, g: 0.1, b: 0.1, duration: 0.2 });
                });
            }
            hitGrid.traverse(child => {
                if (child.isMesh && child.material) gsap.to(child.material.emissive, { r: 0.4, g: 0.25, b: 0.6, duration: 0.2 });
            });
            currentHoveredGrid = hitGrid;
            hoveredGridName = hitGrid.name;
        }
        document.body.style.cursor = 'pointer';
    } else {
        if (currentHoveredGrid) {
            currentHoveredGrid.traverse(child => {
                if (child.isMesh && child.material) gsap.to(child.material.emissive, { r: 0.1, g: 0.1, b: 0.1, duration: 0.2 });
            });
            currentHoveredGrid = null;
            hoveredGridName = '';
        }
        document.body.style.cursor = 'default';
    }
}

function onMouseClick(event) {
    if (isIntroModalVisible) return;
    if (interactiveMeshes.length === 0) return;
    if (event.target.closest && (event.target.closest('div')?.style?.zIndex === '100' || event.target.closest('div')?.style?.zIndex === '200')) return;
    const clickMouse = new THREE.Vector2();
    clickMouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    clickMouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(clickMouse, camera);
    const intersects = raycaster.intersectObjects(interactiveMeshes, false);
    if (intersects.length) {
        const hitObject = intersects[0].object;
        if (kongRemeshMeshSet.has(hitObject)) {
            showIntroModal();
            return;
        }
    }
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
    if (currentVisibleDialogMesh) {
        hideAllDialogs();
    }
}

window.addEventListener('mousemove', onMouseMove);
window.addEventListener('click', onMouseClick);
window.addEventListener('wheel', onWheel);

const clock = new THREE.Clock();
let lastTime = 0;

function animate(currentTime = 0) {
    requestAnimationFrame(animate);
    const delta = Math.min(0.033, (currentTime - lastTime) / 1000);
    lastTime = currentTime;
    performRaycast();
    if (mixer) mixer.update(delta);
    controls.update();
    updateActiveDialogPosition();
    renderer.render(scene, camera);
}
animate();

let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        if (activeGrid && currentVisibleDialogMesh) {
            updateDialogPositionForGrid(activeGrid, currentVisibleDialogMesh);
        }
    }, 100);
});

async function initApp() {
    createLoadingOverlay();
    await loadExcelData();
    loadModel();
}
initApp();
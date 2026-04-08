import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import gsap from 'gsap';
import * as XLSX from 'xlsx';

// ================= 列映射配置 =================
const COLUMN_CONFIG = {
    gridIdCol: 0,        // A列: grid_id
    nameCol: 1,          // B列: 领养者姓名
    wechatImgCol: 2,     // C列: 微信头像（图片文件名）
    locationCol: 3,      // D列: 地理位置
    albumCol: 4,         // E列: 对应的相册名
    noteCol: 5,          // F列: 笔记
    emptyImgCol: 6       // G列: 空空照片1（图片文件名）
};
// =================================================================

// ---------- 1. 场景初始化 ----------
const scene = new THREE.Scene();
const textureLoader = new THREE.TextureLoader();
const skyTexture = textureLoader.load('/sky.png');
skyTexture.colorSpace = THREE.SRGBColorSpace;
scene.background = skyTexture;
scene.backgroundIntensity = 0.9;
scene.environment = null;

const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 1000);
const initialCameraPos = new THREE.Vector3(0, -100, 60);
const initialCameraTarget = new THREE.Vector3(0, 0, 0);
camera.position.copy(initialCameraPos);
camera.lookAt(initialCameraTarget);
camera.zoom = 1.0;                  // 默认 zoom
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

// ---------- 3. 轨道控制 ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enableRotate = true;
controls.enableZoom = true;
controls.enablePan = false;
controls.target.copy(initialCameraTarget);
controls.maxPolarAngle = Math.PI / 2.1;
controls.maxDistance = 200;
controls.minDistance = 10;
controls.minAzimuthAngle = -Math.PI / 6;   // 向左最多30°
controls.maxAzimuthAngle = Math.PI / 6;    // 向右最多30°
controls.update();

// ---------- 4. 返回按钮（修复摄像机重置）----------
const resetBtn = document.createElement('button');
resetBtn.innerHTML = '↺';
resetBtn.style.cssText = `
    position: fixed;
    right: 25px;
    top: 25px;
    width: 80px;
    height: 80px;
    background: rgba(255, 255, 255, 0.9);
    border: none;
    border-radius: 50%;
    font-size: 56px;
    font-weight: bold;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 100;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #333;
    backdrop-filter: blur(4px);
`;
resetBtn.onmouseenter = () => resetBtn.style.background = 'rgba(255,255,255,1)';
resetBtn.onmouseleave = () => resetBtn.style.background = 'rgba(255,255,255,0.9)';
resetBtn.onclick = () => {
    gsap.killTweensOf(camera.position);
    gsap.killTweensOf(controls.target);
    gsap.killTweensOf(camera);      // 终止 zoom 动画
    camera.up.set(0, 1, 0);
    camera.position.copy(initialCameraPos);
    controls.target.copy(initialCameraTarget);
    // 关键：恢复默认 zoom 并更新投影矩阵
    camera.zoom = 1.0;
    camera.updateProjectionMatrix();
    controls.update();
    camera.lookAt(initialCameraTarget);
    if (activeGrid) {
        resetGridAnimation(activeGrid);
        activeGrid = null;
    }
    hideDialogImmediately();
    hoveredGridName = '';
};
document.body.appendChild(resetBtn);

// ---------- 5. 核心变量 ----------
let activeGrid = null;
let hoveredGridName = '';
let dialogElement = null;
let isDialogVisible = false;

// 相机动画参数（调整后：zoom 减小，距离增大）
const CAM_ZOOM_IN = 0.65;               // 原来 1.6 → 1.2，画面更远
const PULL_DISTANCE = 8;
const PULL_DIRECTION = new THREE.Vector3(0, 0, 1);
const SCALE_FACTOR = 1.25;
const CAM_RIGHT_OFFSET_RATIO = 0.55;
const CAM_EXTRA_ZOOM = -8;              // 原来 -16 → -8，相机距离增大
const MIN_CAMERA_DISTANCE = 12;         // 原来 8 → 12，最小距离增大

// ---------- 6. Excel 数据加载 ----------
const gridDataMap = new Map();

function buildImageUrl(fileName) {
    if (!fileName) return '';
    if (fileName.startsWith('/') || fileName.startsWith('http')) {
        return fileName;
    }
    return `/media/${fileName}`;
}

async function loadExcelData() {
    try {
        const response = await fetch('/data/grid_data.xlsx');
        if (!response.ok) {
            console.warn('❌ Excel 文件未找到，路径: /data/grid_data.xlsx');
            return false;
        }
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });
        if (!rows || rows.length < 2) {
            console.warn('❌ Excel 数据为空');
            return false;
        }

        const headers = rows[0];
        console.log('📋 Excel 标题行:', headers);

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;

            let gridId = String(row[COLUMN_CONFIG.gridIdCol] || '').trim();
            if (gridId === "") continue;
            let pureId = gridId.replace(/^Grid_/i, '');

            const name = row[COLUMN_CONFIG.nameCol] ? String(row[COLUMN_CONFIG.nameCol]).trim() : '';
            const wechatImgFile = row[COLUMN_CONFIG.wechatImgCol] ? String(row[COLUMN_CONFIG.wechatImgCol]).trim() : '';
            const location = row[COLUMN_CONFIG.locationCol] ? String(row[COLUMN_CONFIG.locationCol]).trim() : '';
            const album = row[COLUMN_CONFIG.albumCol] ? String(row[COLUMN_CONFIG.albumCol]).trim() : '';
            const note = row[COLUMN_CONFIG.noteCol] ? String(row[COLUMN_CONFIG.noteCol]).trim() : '';
            const emptyImgFile = row[COLUMN_CONFIG.emptyImgCol] ? String(row[COLUMN_CONFIG.emptyImgCol]).trim() : '';

            const wechatImgUrl = buildImageUrl(wechatImgFile);
            const emptyImgUrl = buildImageUrl(emptyImgFile);

            gridDataMap.set(pureId, {
                name,
                wechatImgUrl,
                location,
                album,
                note,
                emptyImgUrl
            });

            console.log(`✅ 加载格子 ${pureId}: 姓名=${name}, 微信头像=${wechatImgUrl || '无'}, 位置=${location}, 相册=${album}, 笔记=${note.substring(0,20)}, 空空照片=${emptyImgUrl || '无'}`);
        }
        console.log(`🎉 成功加载 ${gridDataMap.size} 条格子配置`);
        return true;
    } catch (err) {
        console.error('❌ Excel 解析失败:', err);
        return false;
    }
}

function getDialogDataForGrid(gridParent) {
    if (!gridParent || !gridParent.name) return null;
    const match = gridParent.name.match(/\d+/);
    let gridNumber = match ? match[0] : '';
    if (!gridNumber) return null;
    const data = gridDataMap.get(gridNumber);
    if (data) {
        return data;
    }
    console.warn(`⚠️ 未找到格子 ${gridNumber} 的配置数据`);
    return null;
}

// ---------- 7. 图文弹窗 ----------
function initDialog() {
    if (!document.getElementById('dialog-bubble-style')) {
        const style = document.createElement('style');
        style.id = 'dialog-bubble-style';
        style.textContent = `
            .dialog-bubble {
                position: fixed;
                background: rgba(0, 0, 0, 0.85);
                backdrop-filter: blur(12px);
                border: 1px solid rgba(255, 255, 255, 0.25);
                border-radius: 20px;
                font-family: "Microsoft YaHei", "PingFang SC", system-ui, sans-serif;
                color: #ffffff;
                box-shadow: 0 8px 20px rgba(0,0,0,0.3);
                z-index: 999;
                opacity: 0;
                transform: translate(-50%, -50%) scale(0.9);
                pointer-events: none;
                transition: all 0.25s cubic-bezier(0.2, 0.9, 0.4, 1.1);
                max-width: 320px;
                min-width: 240px;
                padding: 16px 20px;
            }          
            .dialog-content {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            .dialog-row {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .dialog-label {
                font-size: 13px;
                font-weight: 600;
                color: #ffaa66;
                letter-spacing: 1px;
            }
            .dialog-value {
                font-size: 14px;
                line-height: 1.4;
                word-break: break-word;
                white-space: normal;
            }
            .dialog-img {
                text-align: center;
                margin: 4px 0;
            }
            .dialog-img img {
                max-width: 100%;
                max-height: 140px;
                border-radius: 12px;
                object-fit: contain;
                background: rgba(255,255,255,0.1);
            }
            .img-placeholder {
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 80px;
                background: rgba(255,255,255,0.1);
                border-radius: 12px;
                color: #aaa;
                font-size: 13px;
            }
            hr {
                margin: 4px 0;
                border-color: rgba(255,255,255,0.2);
            }
        `;
        document.head.appendChild(style);
    }
    dialogElement = document.createElement('div');
    dialogElement.className = 'dialog-bubble';
    document.body.appendChild(dialogElement);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function generateImageHtml(imgUrl, altText) {
    if (!imgUrl) {
        return `<div class="img-placeholder">📷 暂无图片</div>`;
    }
    return `<div class="dialog-img"><img src="${imgUrl}" alt="${escapeHtml(altText)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div style="display:none;align-items:center;justify-content:center;min-height:80px;" class="img-placeholder">📷 图片加载失败</div></div>`;
}

function updateDialogContent() {
    if (!activeGrid || !dialogElement) return;
    const data = getDialogDataForGrid(activeGrid);
    let html = '<div class="dialog-content">';

    if (data) {
        if (data.name) {
            html += `<div class="dialog-row"><div class="dialog-label">🐾 领养者</div><div class="dialog-value">${escapeHtml(data.name)}</div></div>`;
        }
        if (data.wechatImgUrl) {
            html += `<div class="dialog-row"><div class="dialog-label">📷 微信头像</div>${generateImageHtml(data.wechatImgUrl, '微信头像')}</div>`;
        }
        if (data.location) {
            html += `<div class="dialog-row"><div class="dialog-label">📍 地理位置</div><div class="dialog-value">${escapeHtml(data.location)}</div></div>`;
        }
        if (data.album) {
            html += `<div class="dialog-row"><div class="dialog-label">📁 相册名</div><div class="dialog-value">${escapeHtml(data.album)}</div></div>`;
        }
        if (data.note) {
            html += `<div class="dialog-row"><div class="dialog-label">📝 笔记</div><div class="dialog-value">${escapeHtml(data.note)}</div></div>`;
        }
        if (data.emptyImgUrl) {
            html += `<div class="dialog-row"><div class="dialog-label">📷 空空照片</div>${generateImageHtml(data.emptyImgUrl, '空空照片')}</div>`;
        }
        if (!data.name && !data.location && !data.album && !data.note && !data.wechatImgUrl && !data.emptyImgUrl) {
            html += `<div class="dialog-row"><div class="dialog-value">✨ 暂无详细资料 ✨</div></div>`;
        }
    } else {
        html += `<div class="dialog-row"><div class="dialog-value">✨ 暂无配置信息，敬请期待 ✨</div></div>`;
    }

    html += '</div>';
    dialogElement.innerHTML = html;
}

function showDialogForActiveGrid() {
    if (!activeGrid) return;
    updateDialogContent();
    isDialogVisible = true;
    dialogElement.style.opacity = '0.95';
    dialogElement.style.transform = 'translate(-50%, -50%) scale(1)';
    updateDialogPosition();
}

function hideDialogImmediately() {
    if (!dialogElement) return;
    isDialogVisible = false;
    dialogElement.style.opacity = '0';
    dialogElement.style.transform = 'translate(-50%, -50%) scale(0.9)';
}

function updateDialogPosition() {
    if (!isDialogVisible || !activeGrid || !dialogElement) return;
    const box = new THREE.Box3().setFromObject(activeGrid);
    if (box.isEmpty()) return;
    const rightPos = new THREE.Vector3(
        box.max.x + 2,
        (box.min.y + box.max.y) / 2 + 0.8,
        (box.min.z + box.max.z) / 2
    );
    const screenPos = rightPos.clone().project(camera);
    const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;
    dialogElement.style.left = `${Math.min(window.innerWidth - 40, Math.max(40, x))}px`;
    dialogElement.style.top = `${Math.min(window.innerHeight - 40, Math.max(40, y))}px`;
    const scaleFactor = Math.max(0.8, Math.min(1.4, 1 / Math.max(0.8, camera.zoom)));
    dialogElement.style.fontSize = `${14 * scaleFactor}px`;
}

// ---------- 8. 模型加载与格子动画 ----------
let gridParents = [];
const originalData = new Map();
let mixer = null;
let interactiveMeshes = [];

function optimizeMaterialTextures(material) {
    if (!material) return;
    if (material.map) material.map.anisotropy = 16;
    if (material.emissiveMap) material.emissiveMap && (material.emissiveMap.anisotropy = 16);
    if (material.roughnessMap) material.roughnessMap && (material.roughnessMap.anisotropy = 16);
    if (material.metalnessMap) material.metalnessMap && (material.metalnessMap.anisotropy = 16);
    if (material.normalMap) material.normalMap && (material.normalMap.anisotropy = 16);
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
        console.log(`✅ 找到 ${gridParents.length} 个 Grid 格子`);
        scene.add(model);
        model.position.set(-10, 0, 0);
        model.updateMatrixWorld(true);
        interactiveMeshes = [];
        gridParents.forEach(grid => { grid.traverse(o => { if (o.isMesh) interactiveMeshes.push(o); }); });
        initDialog();
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
    gsap.to(controls.target, { x: target.x, y: target.y, z: target.z, duration: 1.2, ease: "power2.inOut", onUpdate: () => { camera.lookAt(controls.target); controls.update(); updateDialogPosition(); } });
    gsap.to(camera, { zoom: CAM_ZOOM_IN, duration: 1.2, ease: "power2.inOut", onUpdate: () => camera.updateProjectionMatrix() });
}

// ---------- 9. 射线交互 ----------
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function onMouseMove(event) {
    if (interactiveMeshes.length === 0) return;
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactiveMeshes, false);
    const lastHoveredGrid = gridParents.find(g => g.name === hoveredGridName);
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
    if (interactiveMeshes.length === 0) return;
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactiveMeshes, false);
    let clickedGrid = null;
    if (intersects.length) {
        let parent = intersects[0].object.parent;
        while (parent && !parent.name?.match(/^Grid_\d+$/)) parent = parent.parent;
        clickedGrid = parent;
    }
    if (clickedGrid && gridParents.includes(clickedGrid)) {
        if (activeGrid && activeGrid !== clickedGrid) {
            resetGridAnimation(activeGrid);
            hideDialogImmediately();
            activeGrid = null;
        }
        if (activeGrid !== clickedGrid) {
            activeGrid = clickedGrid;
            playPullAndScaleAnimation(activeGrid, () => { if (activeGrid === clickedGrid) { showDialogForActiveGrid(); updateDialogPosition(); } });
            animateCameraToGrid(activeGrid);
        } else {
            if (activeGrid) { showDialogForActiveGrid(); updateDialogPosition(); }
        }
    }
}

window.addEventListener('mousemove', onMouseMove);
window.addEventListener('click', onMouseClick);

// ---------- 10. 启动应用 ----------
async function initApp() {
    await loadExcelData();
    loadModel();
}

// 动画循环
const clock = new THREE.Clock();
let lastTime = 0;
function animate(currentTime = 0) {
    requestAnimationFrame(animate);
    const delta = Math.min(0.033, (currentTime - lastTime) / 1000);
    lastTime = currentTime;
    if (mixer) mixer.update(delta);
    controls.update();
    if (isDialogVisible && activeGrid) updateDialogPosition();
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
        if (isDialogVisible) updateDialogPosition();
    }, 100);
});

initApp();
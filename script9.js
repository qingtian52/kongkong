import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import gsap from 'gsap';

// ---------- 1. 场景初始化 ----------
const scene = new THREE.Scene();
const textureLoader = new THREE.TextureLoader();
const skyTexture = textureLoader.load('/sky.png');
skyTexture.colorSpace = THREE.SRGBColorSpace;
scene.background = skyTexture;
scene.backgroundIntensity = 0.9;

// 移除环境反射，避免背景色影响模型颜色
scene.environment = null;

const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 1000);
const initialCameraPos = new THREE.Vector3(0, -60, 80);
const initialCameraTarget = new THREE.Vector3(0, 0, 0);
camera.position.copy(initialCameraPos);
camera.lookAt(initialCameraTarget);

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

// ---------- 2. 灯光系统（暖色调，无偏蓝）----------
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

// 暖色补光，抵消可能的环境冷感
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
controls.update();

// ---------- 4. 返回按钮（大图标，一次复位）----------
const resetBtn = document.createElement('button');
resetBtn.innerHTML = '↺';
resetBtn.style.cssText = `
    position: fixed;
    right: 25px;
    top: 25px;
    transform: none;
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
     camera.up.set(0, 1, 0);
    camera.position.copy(initialCameraPos);
    controls.target.copy(initialCameraTarget);
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
const DIALOG_TEXT = "✨ 你好呀！ ✨";

const PULL_DISTANCE = 9;
const PULL_DIRECTION = new THREE.Vector3(0, 0, 1);
const SCALE_FACTOR = 1.25;

// 相机移动参数（可自由调整）
const CAM_RIGHT_OFFSET_RATIO = 0.55;   // 右移量（格子宽度的比例）
const CAM_EXTRA_ZOOM = -16;            // 额外拉近（负值=拉远）
const MIN_CAMERA_DISTANCE = 8;       // 最小距离
//const CAM_UP_OFFSET =-12;            // 向上偏移（增大=更高）

// ---------- 6. 模型加载 ----------
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

loader.load(
    '/kongmin0407.glb',
    (gltf) => {
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
                            mat.roughness = 0.8;
                            mat.metalness = 0.2;
                            mat.envMapIntensity = 1.5;
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

        console.log(`✅ 找到 ${gridParents.length} 个 Grid`);
        scene.add(model);
        model.position.set(-10, 0, 0);
        model.updateMatrixWorld(true);

        interactiveMeshes = [];
        gridParents.forEach(grid => {
            grid.traverse(o => { if (o.isMesh) interactiveMeshes.push(o); });
        });

        initDialog();
        const loadingEl = document.getElementById('loading');
        if (loadingEl) loadingEl.style.display = 'none';
    },
    (xhr) => {
        const percent = (xhr.loaded / xhr.total * 100).toFixed(2);
        const loadingDiv = document.getElementById('loading');
        if (loadingDiv) loadingDiv.innerText = `✨ 加载中 ${percent}% ✨`;
    },
    (error) => {
        console.error('模型加载失败:', error);
        const loadingDiv = document.getElementById('loading');
        if (loadingDiv) {
            loadingDiv.innerHTML = '❌ 模型加载失败<br>请确保 /kongmin24.glb 存在';
            loadingDiv.style.whiteSpace = 'normal';
            loadingDiv.style.textAlign = 'center';
        }
    }
);

// ---------- 7. 对话框（白字黑半透明）----------
function initDialog() {
    // 动态添加全局样式（确保只添加一次）
    if (!document.getElementById('dialog-bubble-style')) {
        const style = document.createElement('style');
        style.id = 'dialog-bubble-style';
        style.textContent = `
            .dialog-bubble {
                position: fixed;
                padding: 16px 20px;
                background: rgba(0, 0, 0, 0.75);
                backdrop-filter: blur(8px);
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 16px;
                font-size: 16px;
                font-family: "Microsoft YaHei", sans-serif;
                font-weight: 500;
                color: #ffffff;
                text-shadow: 0 1px 2px rgba(0,0,0,0.3);
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                z-index: 999;
                opacity: 0;
                transform: translate(-50%, -50%) scale(0.9);
                pointer-events: none;
                transition: all 0.25s cubic-bezier(0.2, 0.9, 0.4, 1.1);
                white-space: nowrap;
                letter-spacing: 1px;
            }
            /* 左侧三角形箭头 */
            .dialog-bubble::before {
                content: '';
                position: absolute;
                left: -16px;
                top: 50%;
                transform: translateY(-50%);
                width: 0;
                height: 0;
                border-style: solid;
                border-width: 12px 16px 12px 0;
                border-color: transparent rgba(0, 0, 0, 0.75) transparent transparent;
                filter: drop-shadow(-1px 0 1px rgba(0,0,0,0.1));
            }
        `;
        document.head.appendChild(style);
    }
    dialogElement = document.createElement('div');
    dialogElement.className = 'dialog-bubble';
    dialogElement.innerText = DIALOG_TEXT;
    document.body.appendChild(dialogElement);
}

function showDialogForActiveGrid() {
    if (!activeGrid) {
        hideDialogImmediately();
        return;
    }
    isDialogVisible = true;
    dialogElement.style.opacity = '0.9';
    dialogElement.style.transform = 'translate(-50%, -50%) scale(2.8)';
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
        box.max.x + 3,
        (box.min.y + box.max.y) / 2 + 1.0,
        (box.min.z + box.max.z) / 2
    );
    const screenPos = rightPos.clone();
    screenPos.project(camera);
    const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;
    dialogElement.style.left = `${Math.min(window.innerWidth - 40, Math.max(40, x))}px`;
    dialogElement.style.top = `${Math.min(window.innerHeight - 40, Math.max(40, y))}px`;
}

// ---------- 8. 格子动画 ----------
function playPullAndScaleAnimation(gridParent, onComplete) {
    const data = originalData.get(gridParent);
    if (!data) return;
    gsap.killTweensOf(gridParent.position);
    gsap.killTweensOf(gridParent.scale);
    const targetPos = data.position.clone().add(PULL_DIRECTION.clone().multiplyScalar(PULL_DISTANCE));
    const targetScale = data.scale.clone().multiplyScalar(SCALE_FACTOR);
    gsap.to(gridParent.position, { x: targetPos.x, y: targetPos.y, z: targetPos.z, duration: 0.35, ease: "power2.out" });
    gsap.to(gridParent.scale, { x: targetScale.x, y: targetScale.y, z: targetScale.z, duration: 0.4, ease: "back.out(1.7)", onComplete });
    gridParent.traverse(child => {
        if (child.isMesh && child.material) {
            gsap.to(child.material.emissive, { r: 0.3, g: 0.35, b: 0.45, duration: 0.3 });
        }
    });
}

function resetGridAnimation(gridParent) {
    const data = originalData.get(gridParent);
    if (!data) return;
    gsap.killTweensOf(gridParent.position);
    gsap.killTweensOf(gridParent.scale);
    gsap.to(gridParent.scale, { x: data.scale.x, y: data.scale.y, z: data.scale.z, duration: 0.25, ease: "power2.inOut" });
    gsap.to(gridParent.position, { x: data.position.x, y: data.position.y, z: data.position.z, duration: 0.25, ease: "power2.inOut" });
    gridParent.traverse(child => {
        if (child.isMesh && child.material) {
            gsap.to(child.material.emissive, { r: 0.1, g: 0.1, b: 0.1, duration: 0.25 });
        }
    });
}

// ---------- 9. 相机移动（右移 + 拉近，无水平旋转）----------
function getCameraPositionForGrid(grid) {
    const box = new THREE.Box3().setFromObject(grid);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * Math.PI / 180;
    let baseDistance = maxDim / (2 * Math.tan(fov / 2)) + 3.0;
    let finalDistance = Math.max(baseDistance - CAM_EXTRA_ZOOM, MIN_CAMERA_DISTANCE);
    const rightOffset = size.x * CAM_RIGHT_OFFSET_RATIO;
    
    // 相机位置：Y 坐标使用格子的中心高度（平视）
    const newCameraPos = new THREE.Vector3(
        center.x + rightOffset,
        center.y,                // 改为格子中心高度
        center.z + finalDistance
    );
    // 目标点：Y 坐标也使用格子中心高度
    const target = new THREE.Vector3(
        center.x + rightOffset,
        center.y,                // 与相机同高，实现完全平视
        center.z
    );
    return { pos: newCameraPos, target: target };
}
function animateCameraToGrid(grid) {
    const { pos, target } = getCameraPositionForGrid(grid);
    gsap.killTweensOf(camera.position);
    gsap.killTweensOf(controls.target);
    gsap.to(camera.position, {
        x: pos.x, y: pos.y, z: pos.z,
        duration: 0.7,
        ease: "power2.inOut",
        onUpdate: () => controls.update()
    });
    gsap.to(controls.target, {
        x: target.x, y: target.y, z: target.z,
        duration: 0.7,
        ease: "power2.inOut",
        onUpdate: () => {
            camera.lookAt(controls.target);
            controls.update();
            updateDialogPosition();
        }
    });
}

// ---------- 10. 射线交互 ----------
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
            if (lastHoveredGrid) {
                lastHoveredGrid.traverse(child => {
                    if (child.isMesh && child.material) {
                        gsap.to(child.material.emissive, { r: 0.1, g: 0.1, b: 0.1, duration: 0.2 });
                    }
                });
            }
            if (parent) {
                parent.traverse(child => {
                    if (child.isMesh && child.material) {
                        gsap.to(child.material.emissive, { r: 0.4, g: 0.25, b: 0.6, duration: 0.2 });
                    }
                });
            }
            hoveredGridName = newHoveredName;
        }
        document.body.style.cursor = 'pointer';
    } else {
        if (lastHoveredGrid) {
            lastHoveredGrid.traverse(child => {
                if (child.isMesh && child.material) {
                    gsap.to(child.material.emissive, { r: 0.1, g: 0.1, b: 0.1, duration: 0.2 });
                }
            });
        }
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
            playPullAndScaleAnimation(activeGrid, () => {
                if (activeGrid === clickedGrid) {
                    showDialogForActiveGrid();
                    updateDialogPosition();
                }
            });
            animateCameraToGrid(activeGrid);
        } else {
            if (activeGrid) {
                showDialogForActiveGrid();
                updateDialogPosition();
            }
        }
    }
}

window.addEventListener('mousemove', onMouseMove);
window.addEventListener('click', onMouseClick);

// ---------- 11. 动画循环 ----------
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

// 窗口自适应
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
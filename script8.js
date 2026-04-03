import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import gsap from 'gsap';

// --- 1. 场景初始化 ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf5f5f5);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000); // 调整近远平面减少深度冲突
const initialCameraPos = new THREE.Vector3(0, 0, 120);
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
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // 限制最大2倍像素比，平衡画质与性能
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // 柔和阴影
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.6;
document.body.appendChild(renderer.domElement);

// --- 2. 灯光系统 ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xfff8e8, 2.2);
dirLight.position.set(12, 22, 15);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 4096;
dirLight.shadow.mapSize.height = 4096;
dirLight.shadow.bias = -0.0001;      // 调整阴影偏移，减少条纹
dirLight.shadow.normalBias = 0.05;   // 法线偏移，减少阴影痤疮
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

scene.environment = new THREE.Color(0xcccccc);
scene.environmentIntensity = 1.5;

// --- 3. 控制器 ---
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

// --- 4. 复位按钮 ---
const resetBtn = document.createElement('button');
resetBtn.innerText = '返回';
resetBtn.style.cssText = `
    position: fixed;
    left: 20px;
    top: 50%;
    transform: translateY(-50%);
    padding: 12px 24px;
    background: #fff;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    z-index: 100;
    transition: all 0.2s;
`;
resetBtn.onmouseenter = () => resetBtn.style.background = '#f5f5f5';
resetBtn.onmouseleave = () => resetBtn.style.background = '#fff';
resetBtn.onclick = () => {
    gsap.to(camera.position, {
        x: initialCameraPos.x,
        y: initialCameraPos.y,
        z: initialCameraPos.z,
        duration: 0.8,
        ease: "power2.inOut"
    });
    gsap.to(controls.target, {
        x: initialCameraTarget.x,
        y: initialCameraTarget.y,
        z: initialCameraTarget.z,
        duration: 0.8,
        ease: "power2.inOut",
        onUpdate: () => {
            camera.lookAt(controls.target);
            controls.update();
        }
    });
    if (activeGrid) {
        resetGridAnimation(activeGrid);
        activeGrid = null;
    }
    hideDialog();
    hoveredGridName = '';
};
document.body.appendChild(resetBtn);

// --- 5. 核心变量 ---
let activeGrid = null;
let hoveredGridName = '';
let dialogElement = null;
let activeDialogDoll = null;
const DIALOG_TEXT = "你好呀！";

// --- 6. 模型加载 ---
const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
loader.setDRACOLoader(dracoLoader);
const ktx2Loader = new KTX2Loader();
ktx2Loader.setTranscoderPath('https://www.gstatic.com/basis-universal/v1/basis/');
ktx2Loader.detectSupport(renderer);
loader.setKTX2Loader(ktx2Loader);

const gridParents = [];
const originalData = new Map();
let mixer = null;
let interactiveMeshes = [];
let dollRoots = [];

const PULL_DISTANCE = 6.3;
const PULL_DIRECTION = new THREE.Vector3(0, 0, 1);
const SCALE_FACTOR = 1.25;

// 辅助函数：优化材质纹理（各向异性过滤）
function optimizeMaterialTextures(material) {
    if (!material) return;
    if (material.map) material.map.anisotropy = 16;
    if (material.emissiveMap) material.emissiveMap.anisotropy = 16;
    if (material.roughnessMap) material.roughnessMap.anisotropy = 16;
    if (material.metalnessMap) material.metalnessMap.anisotropy = 16;
    if (material.normalMap) material.normalMap.anisotropy = 16;
    if (material.aoMap) material.aoMap.anisotropy = 16;
    material.precision = 'highp';
}

loader.load(
    '/kongmin24.glb',
    (gltf) => {
        const model = gltf.scene;

        if (gltf.animations?.length) {
            mixer = new THREE.AnimationMixer(model);
            gltf.animations.forEach(clip => mixer.clipAction(clip).play());
        }

        model.traverse((child) => {
            if (child.isObject3D && child.name.match(/^Grid_\d+$/)) {
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

                const dollRoot = findDollRootInGrid(child);
                if (dollRoot) dollRoots.push(dollRoot);

                child.traverse(sub => {
                    if (sub.isMesh) {
                        if (sub.material) {
                            const mat = sub.material;
                            if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
                            if (mat.emissiveMap) mat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
                            mat.transparent = false;
                            mat.alphaTest = 0.5;
                            mat.depthWrite = true;
                            mat.roughness = 0.2;
                            mat.metalness = 0.1;
                            mat.envMapIntensity = 2.0;
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
                    mat.roughness = 0.25;
                    mat.envMapIntensity = 1.8;
                    mat.needsUpdate = true;
                    optimizeMaterialTextures(mat);
                }
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        console.log(`✅ 找到 ${gridParents.length} 个 Grid，${dollRoots.length} 个玩偶`);
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
    (xhr) => console.log(`模型加载进度: ${(xhr.loaded / xhr.total * 100).toFixed(2)}%`),
    (error) => console.error('模型加载失败:', error)
);

function findDollRootInGrid(gridParent) {
    let dollRoot = null;
    gridParent.traverse(child => {
        const hasDollParts = child.children.some(c => c.name.match(/^(body|头|衣服)_\d+$/));
        if (hasDollParts && !dollRoot) dollRoot = child;
    });
    return dollRoot;
}

// --- 7. 对话框管理（同上，未修改）---
function initDialog() {
    dialogElement = document.createElement('div');
    dialogElement.style.cssText = `
        position: fixed;
        padding: 12px 16px;
        background: rgba(255, 255, 255, 0.85);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.9);
        border-radius: 12px;
        font-size: 16px;
        font-family: "Microsoft YaHei", sans-serif;
        color: #333;
        box-shadow: 0 4px 16px rgba(0,0,0,0.1);
        z-index: 99;
        opacity: 0;
        transform: translateY(10px) scale(0.9) translate(-50%, 0);
        pointer-events: none;
        transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        white-space: nowrap;
    `;
    dialogElement.innerText = DIALOG_TEXT;
    document.body.appendChild(dialogElement);
}

function showDialog(dollRoot) {
    if (!dialogElement || !dollRoot) return;
    if (activeDialogDoll === dollRoot) {
        hideDialog();
        return;
    }
    if (activeDialogDoll) hideDialog();
    activeDialogDoll = dollRoot;
    updateDialogPosition();
    dialogElement.style.opacity = '1';
    dialogElement.style.transform = `translate(-50%, -10px) scale(1)`;
    dialogElement.style.pointerEvents = 'auto';
}

function hideDialog() {
    if (!dialogElement) return;
    dialogElement.style.opacity = '0';
    dialogElement.style.transform = `translate(-50%, 10px) scale(0.9)`;
    dialogElement.style.pointerEvents = 'none';
    activeDialogDoll = null;
}

function updateDialogPosition() {
    if (!activeDialogDoll || !dialogElement) return;
    const vector = new THREE.Vector3();
    activeDialogDoll.getWorldPosition(vector);
    vector.y += 2.5;
    vector.project(camera);
    const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-vector.y * 0.5 + 0.5) * window.innerHeight;
    dialogElement.style.left = `${x}px`;
    dialogElement.style.top = `${y}px`;
}

// --- 8. 射线交互（同上，未修改）---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    if (interactiveMeshes.length === 0) return;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactiveMeshes, false);

    const lastHoveredGrid = gridParents.find(g => g.name === hoveredGridName);

    if (intersects.length) {
        let parent = intersects[0].object.parent;
        while (parent && !parent.name.match(/^Grid_\d+$/)) parent = parent.parent;
        const newHoveredName = parent ? parent.name : '';

        if (newHoveredName && newHoveredName !== hoveredGridName) {
            if (lastHoveredGrid) {
                lastHoveredGrid.traverse(child => {
                    if (child.isMesh && child.material) {
                        gsap.to(child.material.emissive, { r: 0.1, g: 0.1, b: 0.1, duration: 0.2 });
                    }
                });
            }
            parent.traverse(child => {
                if (child.isMesh && child.material) {
                    gsap.to(child.material.emissive, { r: 0.4, g: 0.25, b: 0.6, duration: 0.2 });
                }
            });
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
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const allDollMeshes = [];
    dollRoots.forEach(root => root.traverse(o => { if (o.isMesh) allDollMeshes.push(o); }));
    const dollHits = raycaster.intersectObjects(allDollMeshes, false);
    let clickedDoll = null;
    if (dollHits.length) {
        let obj = dollHits[0].object;
        while (obj && !dollRoots.includes(obj)) obj = obj.parent;
        clickedDoll = obj;
    }

    if (hoveredGridName) {
        const targetGrid = gridParents.find(g => g.name === hoveredGridName);
        if (!targetGrid) return;

        if (clickedDoll) {
            showDialog(clickedDoll);
        } else {
            hideDialog();
        }

        if (activeGrid && activeGrid !== targetGrid) {
            resetGridAnimation(activeGrid);
        }

        if (activeGrid !== targetGrid) {
            activeGrid = targetGrid;
            playPullAndScaleAnimation(targetGrid);
            const box = new THREE.Box3().setFromObject(targetGrid);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const fov = camera.fov * (Math.PI / 180);
            const cameraZ = Math.abs(maxDim / Math.sin(fov / 2)) + 10;

            gsap.to(camera.position, {
                x: center.x, y: center.y, z: center.z + cameraZ,
                duration: 0.8, ease: "power2.inOut",
                onUpdate: () => updateDialogPosition()
            });
            gsap.to(controls.target, {
                x: center.x, y: center.y, z: center.z,
                duration: 0.8, ease: "power2.inOut",
                onUpdate: () => {
                    camera.lookAt(controls.target);
                    controls.update();
                    updateDialogPosition();
                }
            });
        }
    }
}

window.addEventListener('mousemove', onMouseMove);
window.addEventListener('click', onMouseClick);

// --- 9. 动画循环 ---
const clock = new THREE.Clock();
let lastTime = 0;
function animate(currentTime = 0) {
    requestAnimationFrame(animate);
    const deltaTime = Math.min(0.016, (currentTime - lastTime) / 1000);
    lastTime = currentTime;
    if (mixer) mixer.update(deltaTime);
    controls.update();
    if (activeDialogDoll) updateDialogPosition();
    renderer.render(scene, camera);
}
animate();

// --- 10. 格子动画 ---
function playPullAndScaleAnimation(gridParent) {
    const data = originalData.get(gridParent);
    if (!data) return;
    gsap.killTweensOf(gridParent.position);
    gsap.killTweensOf(gridParent.scale);
    const targetPos = data.position.clone().add(PULL_DIRECTION.clone().multiplyScalar(PULL_DISTANCE));
    const targetScale = data.scale.clone().multiplyScalar(SCALE_FACTOR);
    gsap.to(gridParent.position, { x: targetPos.x, y: targetPos.y, z: targetPos.z, duration: 0.3, ease: "power2.out" });
    gsap.to(gridParent.scale, { x: targetScale.x, y: targetScale.y, z: targetScale.z, duration: 0.3, ease: "back.out(1.7)" });
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

// --- 窗口自适应 ---
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        if (activeDialogDoll) updateDialogPosition();
    }, 100);
});
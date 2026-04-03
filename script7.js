import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import gsap from 'gsap';

// --- 1. 场景初始化 ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf5f5f5);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 2000);
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
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.autoClear = true;
renderer.autoClearDepth = true;
renderer.autoClearStencil = true;
renderer.depthFunc = THREE.LessEqualDepth;
renderer.depthWrite = true;
renderer.depthTest = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = true;
renderer.shadowMap.needsUpdate = true;
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
dirLight.shadow.bias = -0.001;
dirLight.shadow.normalBias = 0.05;
dirLight.shadow.camera.near = 1;
dirLight.shadow.camera.far = 100;
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

const envColor = new THREE.Color(0xcccccc);
scene.environment = envColor;
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

// --- 4. 左侧复位按钮 ---
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
    // 复位相机
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
    // 复位所有格子
    if (activeGrid) {
        resetGridAnimation(activeGrid);
        activeGrid = null;
    }
    hoveredGridName = ''; // 重置悬停状态
};
document.body.appendChild(resetBtn);

// --- 5. 核心控制变量（改为点击激活）---
let activeGrid = null; // 当前激活的格子
let hoveredGridName = ''; // 仅记录悬停的格子名称（不激活）
let isClickLock = false; // 点击锁，避免重复点击
const CLICK_LOCK_DELAY = 1000; // 点击后1秒内不重复触发

// --- 6. 加载模型 ---
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

const PULL_DISTANCE = 6.3;
const PULL_DIRECTION = new THREE.Vector3(0, 0, 1);
const SCALE_FACTOR = 1.25;

loader.load(
    '/kongmin24.glb',
    (gltf) => {
        const model = gltf.scene;

        if (gltf.animations && gltf.animations.length > 0) {
            mixer = new THREE.AnimationMixer(model);
            gltf.animations.forEach((clip) => {
                const action = mixer.clipAction(clip);
                action.play();
            });
        }

        model.traverse((child) => {
            if (child.isObject3D && child.name.match(/^Grid_\d+$/)) {
                gridParents.push(child);
                originalData.set(child, {
                    position: child.position.clone(),
                    scale: child.scale.clone(),
                    rotation: child.rotation.clone()
                });

                // 强制复位所有格子到初始状态
                child.position.copy(originalData.get(child).position);
                child.scale.copy(originalData.get(child).scale);
                child.updateMatrixWorld(true);
                gsap.killTweensOf(child.position);
                gsap.killTweensOf(child.scale);

                child.traverse((subChild) => {
                    if (subChild.isMesh) {
                        if (subChild.material) {
                            const mat = subChild.material;
                            if (mat.map) {
                                mat.map.colorSpace = THREE.SRGBColorSpace;
                                mat.map.needsUpdate = true;
                            }
                            if (mat.emissiveMap) {
                                mat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
                                mat.emissiveMap.needsUpdate = true;
                            }
                            mat.transparent = false;
                            mat.alphaTest = 0.5;
                            mat.depthWrite = true;
                            mat.roughness = 0.2;
                            mat.metalness = 0.1;
                            mat.envMapIntensity = 2.0;
                            mat.emissive = new THREE.Color(0x222222);
                            mat.emissiveIntensity = 0.1;
                            mat.needsUpdate = true;
                            gsap.killTweensOf(mat.emissive);
                        }
                        subChild.castShadow = true;
                        subChild.receiveShadow = true;
                    }
                });
            } else if (child.isMesh) {
                if (child.material) {
                    const mat = child.material;
                    if (mat.map) {
                        mat.map.colorSpace = THREE.SRGBColorSpace;
                        mat.map.needsUpdate = true;
                    }
                    mat.roughness = 0.25;
                    mat.envMapIntensity = 1.8;
                    mat.needsUpdate = true;
                }
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        console.log(`✅ 找到 ${gridParents.length} 个 Grid`);
        scene.add(model);

        const loadingEl = document.getElementById('loading');
        if (loadingEl) loadingEl.style.display = 'none';
        model.position.set(-10, 0, 0); // 调整模型位置居中
        model.updateMatrixWorld(true);

        interactiveMeshes = [];
        gridParents.forEach(grid => {
            grid.traverse((o) => { if (o.isMesh) interactiveMeshes.push(o); });
        });
    },
    (xhr) => {
        const percent = (xhr.loaded / xhr.total) * 100;
        console.log(`模型加载进度: ${percent.toFixed(2)}%`);
    },
    (error) => {
        console.error('模型加载失败:', error);
    }
);

// --- 7. 交互逻辑（改为点击激活，带悬停高亮）---
const raycaster = new THREE.Raycaster();
raycaster.params.Points.threshold = 0.2;
raycaster.params.Line.threshold = 0.2;
const mouse = new THREE.Vector2();

// 仅记录鼠标悬停的格子（不激活）
function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    // 仅更新悬停状态，不触发任何激活逻辑
    if (interactiveMeshes.length === 0) return;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactiveMeshes, false);
    
    // 先获取上一次的悬停格子（用于离开时恢复）
    const lastHoveredGrid = gridParents.find(grid => grid.name === hoveredGridName);
    
    if (intersects.length > 0) {
        let parent = intersects[0].object.parent;
        while (parent && !parent.name.match(/^Grid_\d+$/)) {
            parent = parent.parent;
        }
        
        // 1. 更新当前悬停格子名称
        const newHoveredName = parent ? parent.name : '';
        
        // 2. 如果悬停的是新格子，执行高亮
        if (newHoveredName && newHoveredName !== hoveredGridName) {
            // 先恢复上一个格子的颜色
            if (lastHoveredGrid) {
                lastHoveredGrid.traverse((child) => {
                    if (child.isMesh && child.material) {
                        gsap.to(child.material.emissive, {
                            r: 0.1, g: 0.1, b: 0.1,
                            duration: 0.2, ease: "power2.out"
                        });
                    }
                });
            }
            
            // 高亮当前格子
            parent.traverse((child) => {
                if (child.isMesh && child.material) {
                    gsap.to(child.material.emissive, {
                        r: 0.4, g: 0.25, b: 0.6, // 淡蓝色高亮，更明显
                        duration: 0.2, ease: "power2.out"
                    });
                }
            });
        }
        
        // 3. 更新悬停状态
        hoveredGridName = newHoveredName;
        document.body.style.cursor = 'pointer'; // 仅改变鼠标样式提示可点击
    } else {
        // 4. 鼠标离开所有格子，恢复上一个格子的颜色
        if (lastHoveredGrid) {
            lastHoveredGrid.traverse((child) => {
                if (child.isMesh && child.material) {
                    gsap.to(child.material.emissive, {
                        r: 0.1, g: 0.1, b: 0.1,
                        duration: 0.2, ease: "power2.out"
                    });
                }
            });
        }
        
        // 5. 重置悬停状态
        hoveredGridName = '';
        document.body.style.cursor = 'default';
    }
}

// 点击激活格子（核心：只有点击才触发）
function onMouseClick(event) {
    if (isClickLock || !hoveredGridName) return; // 无悬停格子则不触发
    
    // 找到当前悬停的格子
    const targetGrid = gridParents.find(grid => grid.name === hoveredGridName);
    if (!targetGrid) return;

    // 点击锁：避免快速重复点击
    isClickLock = true;
    setTimeout(() => {
        isClickLock = false;
    }, CLICK_LOCK_DELAY);

    // 复位之前激活的格子
    if (activeGrid && activeGrid.name !== targetGrid.name) {
        resetGridAnimation(activeGrid);
    }

    // 激活当前格子
    activeGrid = targetGrid;
    playPullAndScaleAnimation(targetGrid);
    
    // 镜头拉近到点击的格子
    const box = new THREE.Box3().setFromObject(targetGrid);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    const cameraZ = Math.abs(maxDim / Math.sin(fov / 2)) + 10;

    gsap.to(camera.position, {
        x: center.x,
        y: center.y,
        z: center.z + cameraZ,
        duration: 0.8,
        ease: "power2.inOut"
    });
    gsap.to(controls.target, {
        x: center.x,
        y: center.y,
        z: center.z,
        duration: 0.8,
        ease: "power2.inOut",
        onUpdate: () => {
            camera.lookAt(controls.target);
            controls.update();
        }
    });
}

// 绑定事件：移动仅悬停，点击才激活
window.addEventListener('mousemove', onMouseMove, false);
window.addEventListener('click', onMouseClick, false);

// --- 8. 动画循环（仅渲染，无自动激活逻辑）---
const clock = new THREE.Clock();
let lastTime = 0;

function animate(currentTime = 0) {
    requestAnimationFrame(animate);
    const deltaTime = Math.min(0.016, (currentTime - lastTime) / 1000);
    lastTime = currentTime;
    const delta = clock.getDelta();

    if (mixer) mixer.update(deltaTime);
    controls.update();
    renderer.render(scene, camera);
}

// --- 格子动画函数（不变）---
function playPullAndScaleAnimation(gridParent) {
    const data = originalData.get(gridParent);
    if (!data) return;

    gsap.killTweensOf(gridParent.position);
    gsap.killTweensOf(gridParent.scale);
    gridParent.traverse((child) => {
        if (child.isMesh && child.material) gsap.killTweensOf(child.material.emissive);
    });

    const targetPos = data.position.clone().add(PULL_DIRECTION.clone().multiplyScalar(PULL_DISTANCE));
    const targetScale = data.scale.clone().multiplyScalar(SCALE_FACTOR);

    const tl = gsap.timeline({
        onUpdate: () => gridParent.updateMatrixWorld(true)
    });

    tl.to(gridParent.position, {
        x: targetPos.x, y: targetPos.y, z: targetPos.z,
        duration: 0.3, ease: "power2.out"
    });

    tl.to(gridParent.scale, {
        x: targetScale.x, y: targetScale.y, z: targetScale.z,
        duration: 0.3, ease: "back.out(1.7)"
    }, "<");

    gridParent.traverse((child) => {
        if (child.isMesh && child.material) {
            gsap.to(child.material.emissive, {
                r: 0.3, g: 0.35, b: 0.45,
                duration: 0.3, ease: "power2.out",
                onUpdate: () => child.material.needsUpdate = true
            });
        }
    });
}

function resetGridAnimation(gridParent) {
    const data = originalData.get(gridParent);
    if (!data) return;

    gsap.killTweensOf(gridParent.position);
    gsap.killTweensOf(gridParent.scale);
    gridParent.traverse((child) => {
        if (child.isMesh && child.material) gsap.killTweensOf(child.material.emissive);
    });

    const tl = gsap.timeline({
        onUpdate: () => gridParent.updateMatrixWorld(true)
    });

    tl.to(gridParent.scale, {
        x: data.scale.x, y: data.scale.y, z: data.scale.z,
        duration: 0.25, ease: "power2.inOut"
    });

    tl.to(gridParent.position, {
        x: data.position.x, y: data.position.y, z: data.position.z,
        duration: 0.25, ease: "power2.inOut"
    }, "<");

    gridParent.traverse((child) => {
        if (child.isMesh && child.material) {
            gsap.to(child.material.emissive, {
                r: 0.1, g: 0.1, b: 0.1,
                duration: 0.25,
                onUpdate: () => child.material.needsUpdate = true
            });
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
    }, 100);
});

animate();
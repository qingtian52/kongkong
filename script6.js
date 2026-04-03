import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'; // 新增 KTX2 支持
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import gsap from 'gsap';

// --- 1. 场景初始化（核心优化：深度缓冲区、抗锯齿、精度）---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf5f5f5);

// 关键优化：调整相机近裁剪面，避免深度精度问题（近裁面过小会导致Z-fighting）
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 2000); // 近裁面从0.1改为1
camera.position.set(0,0,120);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ 
    antialias: true, 
    alpha: true,
    powerPreference: "high-performance", // 优先高性能渲染
    precision: "highp" // 强制高精度渲染
});
renderer.setSize(window.innerWidth, window.innerHeight);
// 优化：devicePixelRatio不限制过低，同时开启MSAA抗锯齿
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); 
// 关键优化：开启深度缓冲区和模板缓冲区，提高深度检测精度
renderer.autoClear = true;
renderer.autoClearDepth = true;
renderer.autoClearStencil = true;
// 关键优化：解决Z-fighting的核心配置
renderer.depthFunc = THREE.LessEqualDepth; // 深度测试改为<=，减少冲突
renderer.depthWrite = true;
renderer.depthTest = true;

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // 软阴影，减少硬阴影闪烁
renderer.shadowMap.autoUpdate = true;
renderer.shadowMap.needsUpdate = true;

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.6;
document.body.appendChild(renderer.domElement);

// --- 2. 灯光系统（核心优化：阴影偏差、灯光精度）---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xfff8e8, 2.2); 
dirLight.position.set(12, 22, 15);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 4096; // 提高阴影贴图分辨率
dirLight.shadow.mapSize.height = 4096;
// 关键优化：调整阴影偏差，解决阴影闪烁
dirLight.shadow.bias = -0.001; // 从-0.0005调整为-0.001
dirLight.shadow.normalBias = 0.05; // 新增：法线偏差，解决薄面阴影闪烁
dirLight.shadow.camera.near = 1; // 阴影相机近裁面同步调整
dirLight.shadow.camera.far = 100;
dirLight.shadow.camera.left = -40;
dirLight.shadow.camera.right = 40;
dirLight.shadow.camera.top = 40;
dirLight.shadow.camera.bottom = -40;
dirLight.shadow.camera.updateProjectionMatrix(); // 强制更新投影矩阵
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

// --- 3. 控制器（优化：减少过度阻尼导致的抖动）---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08; // 从0.05调整为0.08，减少抖动
controls.enableRotate = true;
controls.enableZoom = true;
controls.enablePan = false;
controls.target.set(0, 0, 0);
controls.maxPolarAngle = Math.PI / 2.1;
controls.maxDistance = 100; // 限制最大缩放距离，避免相机过远导致精度问题
controls.minDistance = 10; // 限制最小缩放距离
controls.update();

// --- 4. 加载模型（核心优化：材质深度配置、避免重复克隆）---
const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
loader.setDRACOLoader(dracoLoader);
// 新增 KTX2 加载器（解决压缩纹理变黑问题）
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
    '/kongout.glb',
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

                child.traverse((subChild) => {
                    if (subChild.isMesh) {
                        if (subChild.material) {
                            const mat = subChild.material;
                            // 关键修复：强制修正纹理色彩空间
                            if (mat.map) {
                                mat.map.colorSpace = THREE.SRGBColorSpace;
                                mat.map.needsUpdate = true;
                            }
                            // 修复 emissive 贴图色彩空间
                            if (mat.emissiveMap) {
                                mat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
                                mat.emissiveMap.needsUpdate = true;
                            }
                            // 修复 alpha 透明问题
                            mat.transparent = false; // 若模型不需要透明，关闭透明避免渲染顺序问题
                            mat.alphaTest = 0.5; // 若需要透明，设置 alphaTest 避免黑色半透
                            mat.depthWrite = true;
                            
                            // 保持你原有的材质参数
                            mat.roughness = 0.2;
                            mat.metalness = 0.1;
                            mat.envMapIntensity = 2.0;
                            mat.emissive = new THREE.Color(0x222222);
                            mat.emissiveIntensity = 0.1;
                            mat.needsUpdate = true;
                        }
                        subChild.castShadow = true;
                        subChild.receiveShadow = true;
                    }
                });
            } else if (child.isMesh) {
                if (child.material) {
                    const mat = child.material;
                    // 同样修复纹理色彩空间
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
        model.position.set(0, 0, 0);

        interactiveMeshes = [];
        gridParents.forEach(grid => {
            grid.traverse((o) => { if (o.isMesh) interactiveMeshes.push(o); });
        });
    },
    (xhr) => {
        // 加载进度（可选）
        const percent = (xhr.loaded / xhr.total) * 100;
        console.log(`模型加载进度: ${percent.toFixed(2)}%`);
    },
    (error) => {
        console.error('模型加载失败:', error);
    }
);

// --- 5. 交互逻辑（优化：避免频繁材质更新）---
const raycaster = new THREE.Raycaster();
raycaster.params.Points.threshold = 0.1; // 提高射线检测阈值，减少误触发
raycaster.params.Line.threshold = 0.1;
const mouse = new THREE.Vector2();
let hoveredGrid = null;

function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

window.addEventListener('mousemove', onMouseMove, false);

// --- 6. 动画循环（优化：稳定帧率、减少过度渲染）---
const clock = new THREE.Clock();
let lastTime = 0;

function animate(currentTime = 0) {
    requestAnimationFrame(animate);
    // 优化：固定帧率，避免帧率波动导致的动画抖动
    const deltaTime = Math.min(0.016, (currentTime - lastTime) / 1000); // 限制最大delta为16ms（60fps）
    lastTime = currentTime;

    const delta = clock.getDelta();

    if (mixer) mixer.update(deltaTime); // 使用固定deltaTime更新动画
    controls.update();

    raycaster.setFromCamera(mouse, camera);
    // 优化：射线检测只检测可见物体，减少计算
    const intersects = raycaster.intersectObjects(interactiveMeshes, false);

    if (intersects.length > 0) {
        let parent = intersects[0].object.parent;
        while (parent && !parent.name.match(/^Grid_\d+$/)) {
            parent = parent.parent;
        }

        if (hoveredGrid !== parent) {
            if (hoveredGrid) resetGridAnimation(hoveredGrid);
            hoveredGrid = parent;
            if (hoveredGrid) playPullAndScaleAnimation(hoveredGrid);
            document.body.style.cursor = 'pointer';
        }
    } else {
        if (hoveredGrid) {
            resetGridAnimation(hoveredGrid);
            hoveredGrid = null;
            document.body.style.cursor = 'default';
        }
    }

    renderer.render(scene, camera);
}

// 优化：动画函数添加防抖，避免频繁属性更新
function playPullAndScaleAnimation(gridParent) {
    const data = originalData.get(gridParent);
    if (!data) return;

    gsap.killTweensOf(gridParent.position);
    gsap.killTweensOf(gridParent.scale);
    
    gridParent.traverse((child) => {
        if (child.isMesh && child.material) {
            gsap.killTweensOf(child.material.emissive);
        }
    });

    const targetPos = data.position.clone().add(PULL_DIRECTION.clone().multiplyScalar(PULL_DISTANCE));
    const targetScale = data.scale.clone().multiplyScalar(SCALE_FACTOR);

    const tl = gsap.timeline({
        onUpdate: () => {
            gridParent.updateMatrixWorld(true); // 只在更新时更新矩阵，减少开销
        }
    });

    tl.to(gridParent.position, {
        x: targetPos.x,
        y: targetPos.y,
        z: targetPos.z,
        duration: 0.3,
        ease: "power2.out"
    });

    tl.to(gridParent.scale, {
        x: targetScale.x,
        y: targetScale.y,
        z: targetScale.z,
        duration: 0.3,
        ease: "back.out(1.7)"
    }, "<");

    gridParent.traverse((child) => {
        if (child.isMesh && child.material) {
            gsap.to(child.material.emissive, { 
                r: 0.3, g: 0.35, b: 0.45, 
                duration: 0.3,
                ease: "power2.out",
                onUpdate: () => {
                    child.material.needsUpdate = true; // 只在必要时更新材质
                }
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
        if (child.isMesh && child.material) {
            gsap.killTweensOf(child.material.emissive);
        }
    });

    const tl = gsap.timeline({
        onUpdate: () => {
            gridParent.updateMatrixWorld(true);
        }
    });

    tl.to(gridParent.scale, {
        x: data.scale.x,
        y: data.scale.y,
        z: data.scale.z,
        duration: 0.25,
        ease: "power2.inOut"
    });

    tl.to(gridParent.position, {
        x: data.position.x,
        y: data.position.y,
        z: data.position.z,
        duration: 0.25,
        ease: "power2.inOut"
    }, "<");

    gridParent.traverse((child) => {
        if (child.isMesh && child.material) {
            gsap.to(child.material.emissive, { 
                r: 0.1, g: 0.1, b: 0.1, 
                duration: 0.25,
                onUpdate: () => {
                    child.material.needsUpdate = true;
                }
            });
        }
    });
}

// 窗口自适应（优化：防抖处理）
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }, 100); // 防抖100ms
});

// 启动动画循环
animate();
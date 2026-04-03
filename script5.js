import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
// 👇 这里修正了拼写错误 (controls)
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import gsap from 'gsap';

// --- 1. 场景初始化 ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f0);

// 保持 45 度 FOV 以获得更好的视野
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2000);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.body.appendChild(renderer.domElement);

// --- 2. 灯光系统 ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 2);
dirLight.position.set(10, 15,12);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.bias = -0.0005;
dirLight.shadow.camera.near = 0.1;
dirLight.shadow.camera.far = 100;
dirLight.shadow.camera.left = -30;
dirLight.shadow.camera.right = 30;
dirLight.shadow.camera.top = 30;
dirLight.shadow.camera.bottom = -30;
scene.add(dirLight);

const fillLight = new THREE.DirectionalLight(0xddeeff, 1.5);
fillLight.position.set(-10, 5, -10);
scene.add(fillLight);

const backLight = new THREE.DirectionalLight(0xffffff, 1.0);
backLight.position.set(0, 10, -15);
scene.add(backLight);

const envColor = new THREE.Color(0xaaaaaa);
scene.environment = envColor;

// --- 3. 控制器 ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableRotate = true;
controls.enableZoom = true;
controls.enablePan = false;
controls.target.set(0, 0, 0);

// --- 4. 加载模型 ---
const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
loader.setDRACOLoader(dracoLoader);

const gridParents = [];
const originalData = new Map(); 
let mixer = null;
let interactiveMeshes = [];

// 【修复点 1】修正抽出方向为 Z 轴 (0, 0, 1)，即朝向相机方向
const PULL_DISTANCE = 6.3; // 适当减小一点距离，避免穿模或移出屏幕太多
const PULL_DIRECTION = new THREE.Vector3(0, 0, 1); 
const SCALE_FACTOR = 1.25; // 稍微减小放大倍数，配合前移效果更自然

loader.load(
    '/konggridmin.glb',
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
                
                // 记录原始状态
                originalData.set(child, {
                    position: child.position.clone(),
                    scale: child.scale.clone(),
                    rotation: child.rotation.clone()
                });

                child.traverse((subChild) => {
                    if (subChild.isMesh) {
                        if (subChild.material) {
                            const mat = subChild.material.clone();
                            mat.roughness = 0.35;
                            mat.metalness = 0.2;
                            mat.envMapIntensity = 1.5;
                            mat.emissive = new THREE.Color(0x0a0a0a);
                            mat.emissiveIntensity = 0.1;
                            mat.needsUpdate = true;
                            subChild.material = mat;
                        }
                        subChild.castShadow = true;
                        subChild.receiveShadow = true;
                    }
                });
            } else if (child.isMesh) {
                if (child.material) {
                    const mat = child.material.clone();
                    mat.roughness = 0.5;
                    mat.envMapIntensity = 1.2;
                    child.material = mat;
                }
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        console.log(`✅ 找到 ${gridParents.length} 个 Grid`);
        scene.add(model);
        
        const loadingEl = document.getElementById('loading');
        if (loadingEl) loadingEl.style.display = 'none';

        // 动态计算相机位置
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        
        const fovRad = camera.fov * (Math.PI / 180);
        let cameraDistance = maxDim / (2 * Math.tan(fovRad / 2));
        cameraDistance *= 1.6; 

        // 调整相机位置，确保能看清正面
        camera.position.set(center.x + cameraDistance * 0.5, center.y + maxDim * 0.2, center.z + cameraDistance * 0.8);
        camera.lookAt(center);
        controls.target.copy(center);

        // 动态设置控制器范围
        controls.minDistance = cameraDistance * 0.2; 
        controls.maxDistance = cameraDistance * 2.0;
        controls.update();

        interactiveMeshes = [];
        gridParents.forEach(grid => {
            grid.traverse((o) => { if (o.isMesh) interactiveMeshes.push(o); });
        });
    },
    undefined,
    (error) => {
        console.error('模型加载失败:', error);
    }
);

// --- 5. 交互逻辑 ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let hoveredGrid = null;

function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

window.addEventListener('mousemove', onMouseMove, false);

// --- 6. 动画循环 ---
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (mixer) mixer.update(delta);
    controls.update();

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactiveMeshes, false);

    if (intersects.length > 0) {
        let parent = intersects[0].object.parent;
        while (parent && !parent.name.match(/^Grid_\d+$/)) {
            parent = parent.parent;
        }

        // 只有当悬停对象发生变化时才触发动画
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

/**
 * 【修复点 2 & 3】播放动画前先杀死旧动画，确保状态干净
 */
function playPullAndScaleAnimation(gridParent) {
    const data = originalData.get(gridParent);
    if (!data) return;

    // 【关键修复】杀死该物体上所有正在进行的 position 和 scale 动画
    gsap.killTweensOf(gridParent.position);
    gsap.killTweensOf(gridParent.scale);
    
    // 杀死子物体材质动画
    gridParent.traverse((child) => {
        if (child.isMesh && child.material) {
            gsap.killTweensOf(child.material.emissive);
        }
    });

    const targetPos = data.position.clone().add(PULL_DIRECTION.clone().multiplyScalar(PULL_DISTANCE));
    const targetScale = data.scale.clone().multiplyScalar(SCALE_FACTOR);

    const tl = gsap.timeline();

    // 阶段 1: 抽出 (Z 轴移动)
    tl.to(gridParent.position, {
        x: targetPos.x,
        y: targetPos.y,
        z: targetPos.z,
        duration: 0.3,
        ease: "power2.out"
    });

    // 阶段 2: 放大 (与抽出同时开始，但略有延迟或重叠，这里选择 "<" 同时开始)
    tl.to(gridParent.scale, {
        x: targetScale.x,
        y: targetScale.y,
        z: targetScale.z,
        duration: 0.3,
        ease: "back.out(1.7)"
    }, "<"); 

    // 颜色高亮
    gridParent.traverse((child) => {
        if (child.isMesh && child.material) {
            gsap.to(child.material.emissive, { 
                r: 0.4, g: 0.4, b: 0.6, 
                duration: 0.3,
                ease: "power2.out"
            });
        }
    });
}

/**
 * 复位动画：同样先杀死旧动画，再执行复位
 */
function resetGridAnimation(gridParent) {
    const data = originalData.get(gridParent);
    if (!data) return;

    // 【关键修复】杀死所有旧动画，防止卡住
    gsap.killTweensOf(gridParent.position);
    gsap.killTweensOf(gridParent.scale);
    gridParent.traverse((child) => {
        if (child.isMesh && child.material) {
            gsap.killTweensOf(child.material.emissive);
        }
    });

    const tl = gsap.timeline();

    // 阶段 1: 缩小
    tl.to(gridParent.scale, {
        x: data.scale.x,
        y: data.scale.y,
        z: data.scale.z,
        duration: 0.25,
        ease: "power2.inOut"
    });

    // 阶段 2: 推回原位 (与缩小同时)
    tl.to(gridParent.position, {
        x: data.position.x,
        y: data.position.y,
        z: data.position.z,
        duration: 0.25,
        ease: "power2.inOut"
    }, "<");

    // 恢复颜色
    gridParent.traverse((child) => {
        if (child.isMesh && child.material) {
            gsap.to(child.material.emissive, { 
                r: 0.05, g: 0.05, b: 0.05, 
                duration: 0.25 
            });
        }
    });
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
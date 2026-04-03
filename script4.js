import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AnimationMixer } from 'three/src/animation/AnimationMixer.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// ==================== 1. 场景与相机 ====================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8892a6); 
scene.fog = new THREE.Fog(0x8892a6, 20, 60);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.01,
  1000
);

// 核心优化1：相机位置完全居中对齐，z轴稍远保证视野完整
camera.position.set(0, 2.5, 10); 

// ==================== 2. 渲染器核心设置 ====================
const renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    alpha: true,
    powerPreference: "high-performance"
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3));

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

if (THREE.REVISION >= 160) {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
} else {
    renderer.outputEncoding = THREE.sRGBEncoding;
}

renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.6; 

document.body.appendChild(renderer.domElement);

// ==================== 3. 灯光系统 ====================
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

const mainLight = new THREE.DirectionalLight(0xfff0dd, 1);
mainLight.position.set(-5, 4, 11);
mainLight.castShadow = true;
mainLight.shadow.mapSize.width = 4096; 
mainLight.shadow.mapSize.height = 4096;
mainLight.shadow.camera.near = 0.5;
mainLight.shadow.camera.far = 50;
const d = 12;
mainLight.shadow.camera.left = -d;
mainLight.shadow.camera.right = d;
mainLight.shadow.camera.top = d;
mainLight.shadow.camera.bottom = -d;
mainLight.shadow.bias = -0.0005;
scene.add(mainLight);

const fillLight = new THREE.DirectionalLight(0x99ccff, 1.2);
fillLight.position.set(-5, 2, -5);
scene.add(fillLight);

// const rimLight = new THREE.DirectionalLight(0x00ffff, 1);
// rimLight.position.set(0, 5, -10);
// scene.add(rimLight);

// ==================== 4. 控制器 ====================
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 5;
controls.maxDistance = 30;

// 核心优化2：控制器目标默认设为世界原点（后续会根据模型动态校准）
controls.target.set(0, 1.5, 0);
controls.update(); 

// ==================== 5. 加载器 ====================
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/');

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);
gltfLoader.setMeshoptDecoder(MeshoptDecoder);

let mixer = null;

// 加载状态提示
const loadingDiv = document.createElement('div');
loadingDiv.style.position = 'absolute';
loadingDiv.style.top = '50%';
loadingDiv.style.left = '50%';
loadingDiv.style.transform = 'translate(-50%, -50%)';
loadingDiv.style.color = 'white';
loadingDiv.style.fontSize = '24px';
loadingDiv.style.fontFamily = 'Arial';
loadingDiv.style.textAlign = 'center';
loadingDiv.innerHTML = '🔄 正在加载模型...';
document.body.appendChild(loadingDiv);

// ==================== 6. 加载模型与材质 ====================
gltfLoader.load(
  '/konggrid.glb',
  (gltf) => {
    console.log('✅ 模型加载成功！');
    const model = gltf.scene;
    
    // 核心优化3：精准计算模型包围盒（强制更新矩阵确保计算准确）
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    // 核心优化4：强制将模型几何中心对齐世界原点（彻底解决偏左）
    model.position.sub(center); // 抵消模型自身偏移
    model.position.x = 0; // 强制x轴归零（关键：彻底解决偏左）
    model.position.y = 0.5; // 仅保留y轴的轻微抬高
    
    // 缩放模型（保持原有逻辑）
    const maxSize = Math.max(size.x, size.y, size.z);
    const scale = 6 / maxSize;
    model.scale.set(scale, scale, scale);
    
    scene.add(model);

    // 材质替换（保持原有逻辑）
    model.traverse((child) => {
      if (child.isMesh) {
        const originalColor = child.material?.color?.clone() || new THREE.Color(0xffffff);
        const originalMap = child.material?.map || null;
        const originalNormal = child.material?.normalMap || null;

        const newMat = new THREE.MeshStandardMaterial({
          color: originalColor,
          map: originalMap,
          normalMap: originalNormal,
          roughness: 0.4, 
          metalness: 0.1,
          emissive: child.material?.emissive ? child.material.emissive : new THREE.Color(0x000000),
          emissiveMap: child.material?.emissiveMap || null,
          emissiveIntensity: 1.0,
          envMapIntensity: 1.5,
          side: THREE.DoubleSide
        });

        if (newMat.map) {
          newMat.map.colorSpace = THREE.SRGBColorSpace;
          newMat.map.needsUpdate = true;
        }
        
        child.material = newMat;
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    // 核心优化5：动态校准控制器目标到模型实际中心
    const modelCenter = new THREE.Vector3();
    box.getCenter(modelCenter);
    modelCenter.y = 1.5; // 保持y轴视觉高度
    modelCenter.x = 0; // 强制x轴居中
    controls.target.copy(modelCenter);
    controls.update();

    // 动画播放（保持原有逻辑）
    if (gltf.animations && gltf.animations.length > 0) {
      mixer = new AnimationMixer(model);
      gltf.animations.forEach((clip) => {
        const action = mixer.clipAction(clip);
        action.play();
      });
    }

    loadingDiv.remove();

  },
  (xhr) => {
    const percent = (xhr.loaded / xhr.total * 100).toFixed(0);
    loadingDiv.innerHTML = `📥 加载中: ${percent}%`;
  },
  (error) => {
    console.error('❌ 模型加载失败:', error);
    loadingDiv.innerHTML = `❌ 加载失败!<br><small>${error.message}</small>`;
    loadingDiv.style.color = '#ff6b6b';
  }
);

// ==================== 7. 动画循环 ====================
let lastTime = performance.now();

function animate() {
  requestAnimationFrame(animate);
  
  const currentTime = performance.now();
  const delta = (currentTime - lastTime) / 1000;
  lastTime = currentTime;

  if (mixer) mixer.update(delta);
  controls.update();
  renderer.render(scene, camera);
}

animate();

// ==================== 8. 窗口自适应 ====================
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3));
});
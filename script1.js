import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AnimationMixer } from 'three/src/animation/AnimationMixer.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// 1. 初始化场景
const scene = new THREE.Scene();
// 浅灰色
scene.background = new THREE.Color(0xe8d3c0);

// 相机
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.01,
  1000
);
camera.position.set(0, 2, 6);

// 渲染器：调整色调映射，更柔和接近 Babylon
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
// 改用更柔和的 Reinhard 色调映射，接近 Babylon 默认
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = 0.75; // 降低曝光，避免过曝
document.body.appendChild(renderer.domElement);

// 环境光：使用 RoomEnvironment，和 Babylon 的默认环境更接近
const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

// 2. 轨道控制器
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 2;
controls.maxDistance = 15;
controls.maxPolarAngle = Math.PI / 2;

// 3. 光照：大幅降低强度，避免过曝
const hemiLight = new THREE.HemisphereLight(0xd6c38b, 0xd6c38b, 0.2); // 大幅降低半球光
scene.add(hemiLight);

const ambientLight = new THREE.AmbientLight(0xb77f70, 0.5); // 降低基础环境光
scene.add(ambientLight);

const directionalLight1 = new THREE.DirectionalLight(0xd6c38b, 2); // 降低主光源
directionalLight1.position.set(5,5, -2);
directionalLight1.castShadow = true;
directionalLight1.shadow.mapSize.width = 1024;
directionalLight1.shadow.mapSize.height = 1024;
scene.add(directionalLight1);

const directionalLight2 = new THREE.DirectionalLight(0xe1ccb1,4); // 降低补光
directionalLight2.position.set(-5, 5, -5);
scene.add(directionalLight2);

// 4. 加载模型
const gltfLoader = new GLTFLoader();
gltfLoader.setMeshoptDecoder(MeshoptDecoder);

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/');
gltfLoader.setDRACOLoader(dracoLoader);

let mixer = null;
gltfLoader.load(
  'kongkong.glb',
  (gltf) => {
    const model = gltf.scene;
    scene.add(model);

    // 修复材质与贴图
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((mat) => {
          if (mat.map) {
            mat.map.encoding = THREE.SRGBColorSpace;
            mat.map.needsUpdate = true;
          }
          if (mat.normalMap) mat.normalMap.needsUpdate = true;
          if (mat.metalnessMap) mat.metalnessMap.needsUpdate = true;
          if (mat.roughnessMap) mat.roughnessMap.needsUpdate = true;
          
          // 调整 PBR 参数，更接近 Babylon 渲染
          if (mat.isMeshStandardMaterial) {
            mat.envMapIntensity = 0.8; // 降低环境反射强度
            mat.metalness = Math.min(mat.metalness, 0.7);
            mat.roughness = Math.max(mat.roughness, 0.4);
          }
          
          mat.needsUpdate = true;
        });
      }
    });

    // 模型居中与缩放
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    model.position.sub(center);

    const maxSize = Math.max(size.x, size.y, size.z);
    const scale = 5 / maxSize;
    model.scale.set(scale, scale, scale);

    model.position.y = 0.5;
    model.position.x = 0.2;
    model.position.z = 0;

    // 动画播放
    if (gltf.animations.length > 0) {
      mixer = new AnimationMixer(model);
      gltf.animations.forEach(clip => {
        const action = mixer.clipAction(clip);
        action.play();
        action.loop = THREE.LoopRepeat;
      });
    }
    console.log('模型加载完成！环境已接近 Babylon.js');
  },
  (xhr) => console.log(`加载进度: ${Math.round(xhr.loaded / xhr.total * 100)}%`),
  (error) => console.error('加载失败:', error)
);

// 5. 动画循环
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  if (mixer) mixer.update(clock.getDelta());
  controls.update();
  renderer.render(scene, camera);
}
animate();

// 6. 窗口自适应
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
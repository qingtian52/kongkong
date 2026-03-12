import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AnimationMixer } from 'three/src/animation/AnimationMixer.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// 1. 初始化场景
const scene = new THREE.Scene();
// 背景色保持柔和
scene.background = new THREE.Color(0xc7b5a6);

// 相机
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.01,
  1000
);
camera.position.set(0, 2, 6);

// 渲染器：启用抗锯齿，使用 ACES 但降低曝光
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.5; // 降低曝光，避免过曝
document.body.appendChild(renderer.domElement);

// 环境贴图：强度适当
//const pmremGenerator = new THREE.PMREMGenerator(renderer);
//scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.02).texture; // 微调强度

// 2. 轨道控制器
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 2;
controls.maxDistance = 15;
controls.maxPolarAngle = Math.PI / 2;

// 3. 光照：重新平衡，降低强度以防过曝
const hemiLight = new THREE.HemisphereLight(0xd6c38b, 0x8f9bb3,5); // 强度略降
scene.add(hemiLight);

const ambientLight = new THREE.AmbientLight(0xb77f70, 4); // 降低环境光
scene.add(ambientLight);

// 主光源：暖色，强度降低
const directionalLight1 = new THREE.DirectionalLight(0xffe6d5,7);
directionalLight1.position.set(5, 5, -2);
directionalLight1.castShadow = true;
directionalLight1.shadow.mapSize.width = 1024;
directionalLight1.shadow.mapSize.height = 1024;
scene.add(directionalLight1);

// 补光：冷色，强度降低
const directionalLight2 = new THREE.DirectionalLight(0xc0d0e0, 2);
directionalLight2.position.set(-5, 5, -5);
scene.add(directionalLight2);

// 背光：柔和
const backLight = new THREE.DirectionalLight(0xffffff, 1);
backLight.position.set(0, 2, 5);
scene.add(backLight);

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

    // 遍历模型，修复材质与贴图（避免修改 metalness/roughness）
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((mat, index) => {
          // 确保贴图颜色空间正确
          if (mat.map) {
            mat.map.encoding = THREE.SRGBColorSpace;
            // 某些模型可能需要翻转 Y
            // mat.map.flipY = false; // 根据实际需要调整
            mat.map.needsUpdate = true;
          }
          if (mat.normalMap) mat.normalMap.needsUpdate = true;
          if (mat.metalnessMap) {
            mat.metalnessMap.encoding = THREE.LinearColorSpace; // 金属贴图通常是线性
            mat.metalnessMap.needsUpdate = true;
          }
          if (mat.roughnessMap) {
            mat.roughnessMap.encoding = THREE.LinearColorSpace;
            mat.roughnessMap.needsUpdate = true;
          }
          if (mat.emissiveMap) {
            mat.emissiveMap.encoding = THREE.SRGBColorSpace;
            mat.emissiveMap.needsUpdate = true;
          }

          // 仅调整环境反射强度，不改变 metalness/roughness 以免破坏原材质
          if (mat.isMeshStandardMaterial) {
            mat.envMapIntensity = 1.0; // 提高环境反射强度（原0.8）
            mat.metalness = Math.min(mat.metalness, 0.4); // 适当降低金属感
            mat.roughness = Math.max(mat.roughness, 0.2); // 适当提高粗糙度，减少反光惨白
            //mat.emissive = new THREE.Color(0x000000); // 确保无自发光
          }

          mat.needsUpdate = true;

          // 调试：输出材质信息，便于查找黑色贴图
          console.log(`材质 ${child.name || 'unnamed'} 索引 ${index}:`, {
            color: mat.color,
            map: mat.map ? '有' : '无',
            emissive: mat.emissive,
            metalness: mat.metalness,
            roughness: mat.roughness
          });
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
    console.log('模型加载完成，已优化曝光与材质');
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
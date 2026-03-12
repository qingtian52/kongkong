import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AnimationMixer } from 'three/src/animation/AnimationMixer.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// 1. 初始化场景
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a192f); // 深蓝色背景

// 相机：调整初始位置，更聚焦中心
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.01,
  1000
);
camera.position.set(0, 2, 6); // 稍微拉远一点，方便看全模型

// 渲染器
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// 2. 轨道控制器（防止模型飞出）
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 2;
controls.maxDistance = 15;
controls.maxPolarAngle = Math.PI / 2; // 限制俯视角度

// 3. 超强光照组合（彻底解决偏暗问题）
// 半球光：模拟天空+地面的环境光，让整体更通透
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
scene.add(hemiLight);

// 环境光：基础照亮
const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
scene.add(ambientLight);

// 主光源：正面打光
const directionalLight1 = new THREE.DirectionalLight(0xffffff, 1.5);
directionalLight1.position.set(5, 10, 7);
directionalLight1.castShadow = true;
scene.add(directionalLight1);

// 补光：侧面打光，消除死角
const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight2.position.set(-5, 5, -5);
scene.add(directionalLight2);

// 4. 加载模型
const gltfLoader = new GLTFLoader();
gltfLoader.setMeshoptDecoder(MeshoptDecoder);

let mixer = null;
gltfLoader.load(
  'kongkong.glb',
  (gltf) => {
    const model = gltf.scene;
    scene.add(model);

    // 第一步：计算模型包围盒，让模型自身居中
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    model.position.sub(center); // 模型自身原点对齐中心

    // 第二步：放大模型（系数从4改为5，更大更清晰）
    const maxSize = Math.max(size.x, size.y, size.z);
    const scale = 5 / maxSize;
    model.scale.set(scale, scale, scale);

    // 第三步：关键！手动调整整体位置，让模型在画面正中心
    // 目前模型偏左下，我们向上(Y轴)和向前(Z轴)微调
    model.position.y = 0.5; // 抬高模型，避免贴地
    model.position.x = 0.2;
    model.position.z = 0;    // 确保Z轴在中心

    // 动画播放
    if (gltf.animations.length > 0) {
      mixer = new AnimationMixer(model);
      gltf.animations.forEach(clip => {
        const action = mixer.clipAction(clip);
        action.play();
        action.loop = THREE.LoopRepeat;
      });
    }
    console.log('模型加载并居中完成！');
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
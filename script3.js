import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import gsap from 'gsap';
// 可选：FXAA抗锯齿后处理（进一步消除锯齿）
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

// ===================== 核心配置 =====================
const CELL_HOVER_SCALE = 1.2;
const ANIM_DURATION = 0.3;
const GLB_PATH = '/kongkong.glb'; // 替换为你的GLB路径
// 🔔 临时：先不限制格子命名，先收集所有Group看控制台日志
const CELL_COLLECT_MODE = 'debug'; // 'debug'=打印所有Group名称 | 'strict'=按名称匹配

// ===================== 全局变量 =====================
let scene, camera, renderer, controls, composer;
let cells = [];
let currentHoverCell = null;
let mixer = null;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const clock = new THREE.Clock();

// ===================== 初始化场景（抗锯齿+控制器优化） =====================
function initScene() {
  // 1. 场景
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0eae6); // 柔和暖底，适配粉色模型

  // 2. 相机
  camera = new THREE.PerspectiveCamera(
    50, // 更宽视角，避免模型裁切
    window.innerWidth / window.innerHeight,
    0.01,
    1000
  );
  camera.position.set(0, 12, 20); // 初始位置：更高更远，先看到整体
  camera.lookAt(0, 0, 0); // 强制朝向场景中心

  // 3. 渲染器（✅ 抗锯齿核心配置）
  renderer = new THREE.WebGLRenderer({ 
    antialias: true, // 强制开启抗锯齿
    powerPreference: "high-performance",
    alpha: false
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // 适配高分屏，避免锯齿
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap; // 柔和阴影，减少锯齿
  document.body.appendChild(renderer.domElement);

  // 4. 后处理：FXAA抗锯齿（进一步消除锯齿）
  composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  const fxaaPass = new ShaderPass(FXAAShader);
  fxaaPass.uniforms['resolution'].value.x = 1 / window.innerWidth;
  fxaaPass.uniforms['resolution'].value.y = 1 / window.innerHeight;
  composer.addPass(fxaaPass);

  // 5. 控制器（✅ 解决模型旋转移出画面核心）
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enableZoom = true;
  controls.enablePan = true;
  controls.minDistance = 8;   // 最小拉近
  controls.maxDistance = 60;  // 最大拉远
  controls.maxPolarAngle = Math.PI / 2; // 限制俯仰，避免颠倒
  controls.target.set(0, 0, 0); // 强制旋转中心为原点（模型中心）
  controls.update(); // 立即生效

  // 6. 光照（保留明暗层次，适配粉色模型）
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const mainLight = new THREE.DirectionalLight(0xfff4e6, 2.5);
  mainLight.position.set(8, 12, 6);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.set(1024, 1024);
  mainLight.shadow.camera.near = 1;
  mainLight.shadow.camera.far = 80;
  mainLight.shadow.camera.left = -30;
  mainLight.shadow.camera.right = 30;
  mainLight.shadow.camera.top = 30;
  mainLight.shadow.camera.bottom = -30;
  scene.add(mainLight);

  const fillLight = new THREE.DirectionalLight(0xc0d0e0, 1.5);
  fillLight.position.set(-8, 8, -4);
  scene.add(fillLight);
}

// ===================== 模型加载（强制居中+格子调试） =====================
function loadModel() {
  const gltfLoader = new GLTFLoader();
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/');
  dracoLoader.setDecoderConfig({ type: 'js' });
  gltfLoader.setDRACOLoader(dracoLoader);

  const loadingDiv = document.createElement('div');
  loadingDiv.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);font-size:20px;color:#333;';
  loadingDiv.textContent = '加载中... 0%';
  document.body.appendChild(loadingDiv);

  gltfLoader.load(
    GLB_PATH,
    (gltf) => {
      const model = gltf.scene;
      scene.add(model);
      document.body.removeChild(loadingDiv);

      // ✅ 强制模型居中（解决旋转移出画面核心）
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      // 把模型中心移到场景原点(0,0,0)
      model.position.set(-center.x, -center.y, -center.z);
      // 自动缩放模型到合适大小（避免过大/过小）
      const maxSize = Math.max(size.x, size.y, size.z);
      const scale = 10 / maxSize; // 10=目标显示大小，可调整
      model.scale.set(scale, scale, scale);
      console.log(`✅ 模型尺寸：${size.x.toFixed(2)}x${size.y.toFixed(2)}x${size.z.toFixed(2)}，已居中+缩放`);

      // 1. 播放动画
      if (gltf.animations.length > 0) {
        mixer = new THREE.AnimationMixer(model);
        gltf.animations.forEach(clip => {
          const action = mixer.clipAction(clip);
          action.loop = THREE.LoopRepeat;
          action.play();
        });
        console.log(`✅ 动画数量：${gltf.animations.length}`);
      }

      // 2. 修复材质+抗锯齿
      model.traverse((child) => {
        if (child.isMesh && child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach(mat => {
            // 修复贴图颜色空间
            if (mat.map) {
              mat.map.encoding = THREE.SRGBColorSpace;
              // ✅ 贴图过滤：线性过滤，减少锯齿同时保证清晰度
              mat.map.minFilter = THREE.LinearFilter;
              mat.map.magFilter = THREE.LinearFilter;
              mat.map.needsUpdate = true;
            }
            // 修复材质参数，避免黑块
            if (mat.isMeshStandardMaterial) {
              mat.metalness = 0.1;
              mat.roughness = 0.7;
              mat.envMapIntensity = 0;
              mat.needsUpdate = true;
            }
          });
          // 开启阴影
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      // ✅ 调试模式：先收集所有Group，打印名称（解决找不到格子核心）
      if (CELL_COLLECT_MODE === 'debug') {
        console.log('=== 模型所有Group名称（请复制你格子的Group名） ===');
        model.traverse((child) => {
          if (child.isGroup) {
            console.log(`Group名称：${child.name}`);
          }
        });
        alert('请查看控制台，复制你的格子Group名称，然后修改CELL_COLLECT_MODE为"strict"并匹配名称！');
      } else {
        // ✅ 严格模式：按你提供的格子名称收集（替换为你控制台看到的格子名）
        model.traverse((child) => {
          if (child.isGroup && (
            child.name.includes('cell') || // 示例：如果你的格子名含cell
            child.name.includes('grid') || // 示例：如果你的格子名含grid
            child.name.includes('格子')    // 示例：如果你的格子名是中文
          )) {
            cells.push(child);
            child.scale.set(1, 1, 1);
            child.userData.index = cells.length - 1;
            console.log(`✅ 收集到格子：${child.name}`);
          }
        });

        if (cells.length === 0) {
          console.error('❌ 未找到格子！请检查控制台打印的Group名称，修改收集条件');
          alert('未找到格子！请查看控制台日志，修改代码里的格子名称匹配条件');
        } else {
          console.log(`✅ 总格子数：${cells.length}`);
        }
      }
    },
    (xhr) => {
      const progress = Math.round((xhr.loaded / xhr.total) * 100);
      loadingDiv.textContent = `加载中... ${progress}%`;
    },
    (error) => {
      document.body.removeChild(loadingDiv);
      console.error('❌ 模型加载失败：', error);
      alert(`加载失败：${error.message}`);
    }
  );
}

// ===================== 格子交互（兼容调试模式） =====================
function onMouseMove(event) {
  if (cells.length === 0) return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  // 收集所有格子的子Mesh用于射线检测
  const allCellMeshes = cells.flatMap(cell => {
    const meshes = [];
    cell.traverse(child => child.isMesh && meshes.push(child));
    return meshes;
  });

  const intersects = raycaster.intersectObjects(allCellMeshes, true);
  if (intersects.length > 0) {
    let hoverCell = intersects[0].object;
    // 向上遍历找到所属格子Group
    while (hoverCell && !cells.includes(hoverCell)) {
      hoverCell = hoverCell.parent;
      if (!hoverCell) break;
    }

    if (hoverCell && currentHoverCell !== hoverCell) {
      // 恢复上一个格子
      if (currentHoverCell) {
        gsap.to(currentHoverCell.scale, { x:1, y:1, z:1, duration:ANIM_DURATION, ease:'power2.out' });
      }
      // 放大当前格子
      currentHoverCell = hoverCell;
      gsap.to(currentHoverCell.scale, { x:CELL_HOVER_SCALE, y:CELL_HOVER_SCALE, z:CELL_HOVER_SCALE, duration:ANIM_DURATION, ease:'power2.out' });
      console.log(`🔍 悬停格子：${hoverCell.name}`);
    }
  } else {
    // 离开所有格子
    if (currentHoverCell) {
      gsap.to(currentHoverCell.scale, { x:1, y:1, z:1, duration:ANIM_DURATION, ease:'power2.out' });
      currentHoverCell = null;
    }
  }
}

// ===================== 动画循环+事件监听 =====================
function animate() {
  requestAnimationFrame(animate);
  if (mixer) mixer.update(clock.getDelta());
  controls.update();
  // ✅ 用后处理渲染（FXAA抗锯齿）
  composer.render();
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  // 更新FXAA分辨率
  const fxaaPass = composer.passes[1];
  fxaaPass.uniforms['resolution'].value.x = 1 / window.innerWidth;
  fxaaPass.uniforms['resolution'].value.y = 1 / window.innerHeight;
}

// 绑定事件
function bindEvents() {
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('resize', onWindowResize);
  // 备用滚轮事件（确保缩放可用）
  window.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY * 0.01;
    const currentDistance = camera.position.distanceTo(new THREE.Vector3(0,0,0));
    const newDistance = Math.max(controls.minDistance, Math.min(controls.maxDistance, currentDistance + delta));
    camera.position.setLength(newDistance);
    controls.update();
  }, { passive: false });
}

// ===================== 启动 =====================
function init() {
  initScene();
  loadModel();
  bindEvents();
  animate();
}

init();
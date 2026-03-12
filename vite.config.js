import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000, // 自定义端口
    open: true // 自动打开浏览器
  },
  assetsInclude: ['**/*.glb'] // 让 Vite 识别 GLB 模型文件
});
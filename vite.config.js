import { defineConfig } from 'vite'

export default defineConfig({
  // 关键：部署到 Vercel 需配置 base 为根路径
  base: '/', 
  // 如果是 GitHub Pages 才需要填仓库名，Vercel 直接用 '/' 即可
  plugins: []
})
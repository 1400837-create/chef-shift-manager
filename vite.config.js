import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// IMPORTANT: replace 'chef-shift-manager' with your actual GitHub repository
// name if it's different. This must match exactly for GitHub Pages routing
// to work, e.g. https://<user>.github.io/<repo-name>/
export default defineConfig({
  plugins: [react()],
  base: '/chef-shift-manager/',
})

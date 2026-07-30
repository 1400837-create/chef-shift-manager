import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// IMPORTANT: replace 'chef-shift-manager' with your actual GitHub repository
// name if it's different. This must match exactly for GitHub Pages routing
// to work, e.g. https://<user>.github.io/<repo-name>/
export default defineConfig({
  plugins: [react()],
  base: '/chef-shift-manager/',
  define: {
    // Shown in the header (small, greyed out) so a report of "still broken"
    // can be checked against whether the device actually has this build —
    // installed PWAs can sit on a stale cached bundle for a while.
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
})

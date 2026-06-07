import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    server: {
      hmr: { host: 'localhost', port: 5173 },
      proxy: {
        '/render': 'http://localhost:3001',
        '/thumbs': 'http://localhost:3001',
      },
    },
    define: {
      'import.meta.env.GROQ_API_KEY': JSON.stringify(env.GROQ_API_KEY),
      'import.meta.env.MOONSHOT_API_KEY': JSON.stringify(env.MOONSHOT_API_KEY),
      'import.meta.env.OPENAI_API_KEY': JSON.stringify(env.OPENAI_API_KEY),
    },
  }
})

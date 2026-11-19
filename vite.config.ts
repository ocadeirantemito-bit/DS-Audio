import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import pkg from './package.json' with { type: 'json' }
import { validSupabaseConfig } from './supabase-config.ts'

export default defineConfig(({ mode }) => {
  const { VITE_SUPABASE_URL: url = '', VITE_SUPABASE_PUBLISHABLE_KEY: key = '' } = loadEnv(mode, process.cwd())
  if ((mode === 'hosting' || url || key) && !validSupabaseConfig(url, key)) {
    throw new Error('Configure a URL e a chave publicável ou anon do Supabase. Chaves privilegiadas são recusadas.')
  }
  return { define: { __APP_VERSION__: JSON.stringify(pkg.version) }, plugins: [react(), tailwind()], server: { host: '0.0.0.0' } }
})

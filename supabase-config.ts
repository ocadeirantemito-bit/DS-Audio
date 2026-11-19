export function validSupabaseConfig(url: string, key: string) {
  try {
    const endpoint = new URL(url)
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)
    if ((endpoint.protocol !== 'https:' && !(local && endpoint.protocol === 'http:')) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) return false
    if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true
    const parts = key.split('.')
    if (parts.length !== 3) return false
    return JSON.parse(atob(parts[1].replaceAll('-', '+').replaceAll('_', '/'))).role === 'anon'
  } catch {
    return false
  }
}

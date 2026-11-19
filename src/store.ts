import { createClient } from '@supabase/supabase-js'
import { validSupabaseConfig } from '../supabase-config'
import { demo } from './demo'
import { type Data } from './domain'

const url = import.meta.env?.VITE_SUPABASE_URL
const key = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY
export const misconfigured = Boolean(url || key) && !validSupabaseConfig(url ?? '', key ?? '')
export const supabase = url && key && !misconfigured ? createClient(url, key) : null
export type Snapshot = { revision: number; data: Data }
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>
const demoKey = 'ds-audio-demo-v1'
export function readDemo(storage: StoragePort): Snapshot {
  const raw = storage.getItem(demoKey)
  return raw ? JSON.parse(raw) as Snapshot : { revision: 0, data: demo() }
}
export async function load(): Promise<Snapshot> {
  if (!supabase) {
    const snapshot = readDemo(localStorage)
    localStorage.setItem(demoKey, JSON.stringify(snapshot))
    return snapshot
  }
  const { data, error, status } = await supabase.rpc('load_workspace')
  if (error) throw rpcFailure(error, status)
  if (!Number.isSafeInteger(data?.revision) || data.revision < 0 || !Array.isArray(data.data?.orders)
    || !Array.isArray(data.data.staff) || !Array.isArray(data.data.expenses)) {
    throw new Error('O banco devolveu uma resposta inválida ao carregar os registros.')
  }
  return data
}
export function writeDemo(storage: StoragePort, snapshot: Snapshot): Snapshot {
  const revision = readDemo(storage).revision
  if (revision !== snapshot.revision) throw new Error('Os dados mudaram. Recarregue a página antes de salvar.')
  const next = { data: snapshot.data, revision: revision + 1 }
  storage.setItem(demoKey, JSON.stringify(next))
  return next
}
export class ConnectionError extends Error {}
function rpcFailure(error: { code: string; message: string }, status: number) {
  if (status === 0 || status === 502 || status === 503 || status === 504) {
    return new ConnectionError('Falha na conexão com o banco. Se estava salvando, os campos foram mantidos. Tente novamente quando a conexão voltar.')
  }
  if (status === 401 || status === 403) return new Error('A sessão expirou ou não tem acesso aos registros.')
  if (error.code === 'PGRST202') return new Error('A função do banco está indisponível. Confira se as migrações foram aplicadas no Supabase.')
  return new Error(error.message)
}
export async function save(snapshot: Snapshot, writeId: string, restoring = false): Promise<Snapshot> {
  if (!supabase) {
    if (restoring) throw new Error('A restauração exige conexão com o Supabase.')
    const write = () => writeDemo(localStorage, snapshot)
    return navigator.locks ? navigator.locks.request(demoKey, write) : write()
  }
  const { data, error, status } = await supabase.rpc(restoring ? 'restore_workspace' : 'save_workspace', {
    payload: snapshot.data, expected_revision: snapshot.revision, write_id: writeId,
  })
  if (error) throw rpcFailure(error, status)
  if (data !== snapshot.revision + 1) throw new Error('O banco não confirmou a gravação. Os campos foram mantidos. Tente salvar novamente.')
  return { data: snapshot.data, revision: data }
}

import { useEffect, useState } from 'react'
import { CloudDownload, CloudUpload, DatabaseBackup, LogOut } from 'lucide-react'
import { createBackup, maxBackupBytes, readBackup } from './backup'
import { sum, type Data } from './domain'
import { load } from './store'
import { Modal, Rows, Select } from './ui'

const themes = [
  { value: 'dark', label: 'Escuro' }, { value: 'light', label: 'Claro' }, { value: 'system', label: 'Automático' },
] as const
export type Theme = typeof themes[number]['value']
const themeKey = 'ds-audio-theme'
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem(themeKey)
      return themes.find(item => item.value === saved)?.value ?? 'dark'
    } catch { return 'dark' }
  })
  useEffect(() => {
    const device = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => { document.documentElement.dataset.theme = theme === 'system' ? (device.matches ? 'dark' : 'light') : theme }
    apply()
    try { localStorage.setItem(themeKey, theme) } catch { /* A aparência continua aplicada nesta visita. */ }
    if (theme !== 'system') return
    device.addEventListener('change', apply)
    return () => device.removeEventListener('change', apply)
  }, [theme])
  return [theme, setTheme] as const
}
export type Connection = 'demo' | 'checking' | 'connected' | 'unavailable'
export const connectionLabel: Record<Connection, string> = {
  demo: 'Modo demonstração', checking: 'Verificando conexão…', connected: 'Supabase conectado', unavailable: 'Supabase indisponível',
}
export function SettingsPanel({ theme, setTheme, email, real, connection, setConnection, close, openBackup, signOut, busy }: {
  theme: Theme; setTheme: (theme: Theme) => void; email?: string; real: boolean;
  connection: Connection; setConnection: (status: Connection) => void;
  close: () => void; openBackup: () => void; signOut: () => Promise<void>; busy: boolean
}) {
  const [error, setError] = useState('')
  useEffect(() => {
    if (!real) return
    setConnection('checking')
    void load().then(() => setConnection('connected'), () => setConnection('unavailable'))
  }, [real, setConnection])
  return <Modal title="Configurações" close={close} busy={busy}>
    <div className="stack">
      <Select label="Aparência" value={theme} options={[...themes]} change={value => setTheme(value as Theme)}/>
      <Rows rows={[[ 'Sistema', 'DS Audio Gestão' ], [ 'Versão', __APP_VERSION__ ], [ 'Conexão', connectionLabel[connection] ], [ 'Conta', email ?? (real ? 'Autenticada' : 'Demonstração') ]]}/>
      <button className="button secondary" onClick={openBackup}><DatabaseBackup size={17}/> Backup</button>
      {real && <button className="button secondary" onClick={async () => {
        setError('')
        try { await signOut() } catch (err) { setError((err as Error).message) }
      }}><LogOut size={17}/> Sair da conta</button>}
      {error && <p role="alert" className="red">{error}</p>}
    </div>
  </Modal>
}
export function BackupPanel({ authorized, real, dirty, close, restore, busy }: {
  authorized: boolean; real: boolean; dirty: boolean; close: () => void; restore: (data: Data) => Promise<void>; busy: boolean
}) {
  const [candidate, setCandidate] = useState<Awaited<ReturnType<typeof readBackup>>>()
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const useBackup = async (action: () => Promise<void>) => {
    setError('')
    setWorking(true)
    try { await action() } catch (err) { setError((err as Error).message) }
    finally { setWorking(false) }
  }
  return <Modal title="Backup" close={close} busy={busy || working}>
    {authorized ? <div className="stack">
      <section className="stack">
        <h3>Fazer backup</h3>
        <p className="muted">Baixe os registros gravados no Supabase. O arquivo contém dados da empresa e de clientes. Guarde-o em local protegido.</p>
        <button className="button secondary" onClick={() => void useBackup(async () => {
          const { data } = await load()
          const json = await createBackup(data)
          const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
          const link = document.createElement('a')
          link.href = url
          link.download = 'ds-audio-backup-' + new Date().toISOString().slice(0, 10) + '.json'
          link.click()
          window.setTimeout(() => URL.revokeObjectURL(url), 10000)
        })}><CloudDownload size={18}/> Baixar backup JSON</button>
      </section>
      <section className="stack backup-restore">
        <h3>Restaurar backup</h3>
        <label className="field">Arquivo JSON<input type="file" accept=".json,application/json" onChange={e => {
          const file = e.currentTarget.files?.[0]
          setCandidate(undefined)
          if (!file) return
          void useBackup(async () => {
            if (file.size > maxBackupBytes) throw new Error('O arquivo excede o limite de 20 MB.')
            setCandidate(await readBackup(await file.text()))
          })
        }}/></label>
        {candidate && <>
          <Rows rows={[
            ['Data do backup', new Date(candidate.createdAt).toLocaleString('pt-BR')],
            ['Clientes nas encomendas', new Set(candidate.data.orders.map(o => o.customer + '\n' + o.phone)).size],
            ['Encomendas', candidate.data.orders.length], ['Funcionários', candidate.data.staff.length],
            ['Materiais e produtos', sum(candidate.data.orders, o => o.products.length + sum(Object.values(o.stages), s => s.materials.length))],
            ['Pagamentos', sum(candidate.data.orders, o => o.payments.length + sum(Object.values(o.stages), s => s.payments.length))],
            ['Devoluções', sum(candidate.data.orders, o => o.returns.length)], ['Despesas', candidate.data.expenses.length],
          ]}/>
          <p className="muted">A restauração substitui todos os registros gravados nesta conta pelos registros acima.</p>
          <button className="button primary" onClick={() => {
            if (confirm('Substituir todos os registros atuais da conta pelo conteúdo deste backup?' + (dirty ? ' As alterações que ainda estão no formulário serão descartadas.' : ''))) {
              void useBackup(() => restore(candidate.data))
            }
          }}><CloudUpload size={18}/> Restaurar backup</button>
        </>}
      </section>
      {error && <p className="red" role="alert">{error}</p>}
    </div> : <div className="stack"><p>{real ? 'Entre com a conta autorizada do proprietário para usar o backup.' : 'Conecte o Supabase e entre como proprietário para fazer ou restaurar um backup.'}</p></div>}
  </Modal>
}

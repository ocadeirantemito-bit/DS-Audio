import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Session } from '@supabase/supabase-js'
import { BarChart3, ClipboardList, DatabaseBackup, Download, FlaskConical, LogOut, Menu, Settings, X } from 'lucide-react'
import { code, formatDate, id, money, newOrder, orderTotals, stageTotals, stages, validateOrder, type Data, type Order } from './domain'
import { ConnectionError, load, misconfigured, save, supabase, type Snapshot } from './store'
import { OrderPage } from './OrderPage'
import { Finance } from './Finance'
import { Field } from './ui'
import { BackupPanel, SettingsPanel, connectionLabel, useTheme, type Connection } from './WorkspacePanels'
import './style.css'

function message(error: unknown) {
  return typeof error === 'object' && error && 'message' in error ? String(error.message) : 'Falha ao acessar os dados.'
}
function downloadCsv(data: Data) {
  const cell = (value: unknown) => {
    const text = String(value ?? '')
    return '"' + (/^[\s]*[=+\-@\t\r]/.test(text) ? "'" : '') + text.replaceAll('"', '""') + '"'
  }
  const rows: unknown[][] = [['Tipo', 'Encomenda', 'Data', 'Descrição', 'Valor em centavos', 'Registro JSON']]
  const add = (type: string, order: string, date: string, description: string, amount: number | '', record: unknown) => rows.push([type, order, date, description, amount, JSON.stringify(record)])
  for (const o of data.orders) {
    const number = code(o.number)
    add('Encomenda', number, o.created, o.customer, orderTotals(o).charged, o)
    for (const p of o.payments) add('Pagamento cliente', number, p.date, p.method, p.amount, p)
    for (const r of o.returns) add('Devolução', number, r.date, r.reason, r.refund, r)
    for (const s of stages) {
      add('Etapa', number, o.completed, s, o.stages[s].charge, o.stages[s])
      for (const p of o.stages[s].payments) add('Pagamento funcionário', number, p.date, s, p.amount, p)
    }
  }
  for (const e of data.expenses) add('Despesa', '', e.date, e.description, e.amount, e)
  for (const s of data.staff) add('Funcionário', '', '', s.name, '', s)
  const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(r => r.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = 'ds-audio-' + (supabase ? 'dados' : 'demonstracao') + '.csv'; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const logo = import.meta.env.BASE_URL + 'ds-audio-logo.webp'
function Brand() {
  return <div className="brand"><img src={logo} width="580" height="294" alt="DS Audio — Som Automotivo"/></div>
}
function App() {
  const [theme, setTheme] = useTheme()
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null)
  useEffect(() => {
    if (!supabase) return
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setSession(session))
    return () => data.subscription.unsubscribe()
  }, [])
  if (misconfigured) return <div className="center-screen"><div className="panel login"><Brand/><p role="alert">Informe a URL e a chave publicável do Supabase no arquivo .env.local.</p></div></div>
  if (session === undefined) return <div className="center-screen">Carregando sessão…</div>
  if (supabase && !session) return <Login/>
  return <Workspace key={session?.user.id ?? 'demo'} user={session?.user} theme={theme} setTheme={setTheme}/>
}
function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return <div className="center-screen"><form className="panel login stack" onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const { error } = await supabase!.auth.signInWithPassword({ email, password })
      if (error) setError(!error.status || error.status >= 500
        ? 'Falha na conexão com o Supabase. Tente novamente.'
        : 'Confira o e-mail e a senha e tente novamente.')
    } catch { setError('Falha de conexão ao entrar.') } finally { setBusy(false) }
  }}><Brand/><h1>Entrar na gestão</h1><Field label="E-mail" value={email} change={setEmail} type="email" required/><Field label="Senha" value={password} change={setPassword} type="password" required/>{error && <p className="red" role="alert">{error}</p>}<button className="button primary" disabled={busy}>Entrar</button></form></div>
}
function Workspace({ user, theme, setTheme }: { user?: Session['user']; theme: ReturnType<typeof useTheme>[0]; setTheme: ReturnType<typeof useTheme>[1] }) {
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [order, setOrder] = useState<Order>()
  const [page, setPage] = useState<'orders' | 'finance'>('orders')
  const [menu, setMenu] = useState(false)
  const [panel, setPanel] = useState<'settings' | 'backup' | null>(null)
  const [connection, setConnection] = useState<Connection>(supabase ? 'checking' : 'demo')
  const [feedback, setFeedback] = useState({ text: '', error: false })
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const attempt = useRef<{ signature: string; id: string } | null>(null)
  const orderAttempt = useRef<{ signature: string; date: string } | null>(null)
  const clean = useRef<Order | undefined>(undefined)
  const initial = useCallback(async () => {
    try {
      const current = await load()
      setSnapshot(current)
      if (supabase) setConnection('connected')
      clean.current = current.data.orders[0] ?? newOrder(1)
      setOrder(clean.current)
      setFeedback({ text: '', error: false })
    } catch (error) { setFeedback({ text: message(error), error: true }) }
  }, [])
  useEffect(() => { void initial() }, [initial])
  const baseline = snapshot?.data.orders.find(o => o.id === order?.id)
  const dirty = !!order && JSON.stringify(order) !== JSON.stringify(baseline ?? clean.current ?? order)
  useEffect(() => {
    if (!dirty) return
    const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [dirty])
  if (!snapshot || !order) return <div className="center-screen">{feedback.error ? <div className="stack"><p role="alert">{feedback.text}</p><button className="button secondary" onClick={initial}>Tentar novamente</button></div> : 'Carregando encomendas…'}</div>
  const { data } = snapshot
  const open = (next?: Order) => {
    if (lock.current || (dirty && !confirm('Descartar as alterações não salvas?'))) return
    const value = next ?? newOrder(Math.max(0, ...data.orders.map(o => o.number)) + 1)
    clean.current = value
    setOrder(value)
    window.scrollTo(0, 0)
  }
  const commit = async (next: Data, notice: string, restoring = false) => {
    if (lock.current) throw new Error('Aguarde a gravação atual terminar.')
    lock.current = true
    setBusy(true)
    setFeedback({ text: '', error: false })
    try {
      const signature = JSON.stringify([snapshot.revision, restoring, next])
      if (attempt.current?.signature !== signature) attempt.current = { signature, id: id() }
      setSnapshot(await save({ data: next, revision: snapshot.revision }, attempt.current.id, restoring))
      if (supabase) setConnection('connected')
      attempt.current = null
      setFeedback({ text: notice, error: false })
    } catch (error) {
      if (error instanceof ConnectionError) setConnection('unavailable')
      throw error
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  const persist = async (candidate: Order, notice = 'Encomenda salva.', stageName?: typeof stages[number]) => {
    const original = data.orders.find(o => o.id === candidate.id)
    const base = original ?? clean.current ?? candidate
    let selected = candidate
    if (stageName) {
      selected = {
        ...(original ?? candidate),
        stages: { ...base.stages, [stageName]: candidate.stages[stageName] },
        products: base.products, payments: base.payments, returns: base.returns, audit: base.audit,
        due: base.due,
      }
    }
    const saved = { ...selected, customer: selected.customer.trim(), description: selected.description.trim() }
    validateOrder(saved)
    if (original) {
      const signature = JSON.stringify(selected)
      if (orderAttempt.current?.signature !== signature) orderAttempt.current = { signature, date: new Date().toISOString() }
      for (const name of stages) {
        for (const previous of original.stages[name].materials) {
          const current = saved.stages[name].materials.find(m => m.id === previous.id)
          if (JSON.stringify(current) === JSON.stringify(previous)) continue
          const note = current ? 'Material corrigido em ' + name : 'Material removido de ' + name
          saved.audit = [...saved.audit, { date: orderAttempt.current.date, note, previous }]
        }
      }
    }
    await commit({ ...data, orders: [saved, ...data.orders.filter(o => o.id !== saved.id)] }, notice)
    setOrder(current => {
      if (current !== order) return current
      if (!stageName) return saved
      return {
        ...candidate,
        customer: original ? candidate.customer : saved.customer,
        description: original ? candidate.description : saved.description,
        stages: { ...candidate.stages, [stageName]: saved.stages[stageName] },
        audit: [...saved.audit, ...candidate.audit.slice(base.audit.length)],
      }
    })
  }
  const showError = (error: unknown) => setFeedback({ text: message(error), error: true })
  const navigate = (target: typeof page) => {
    if (lock.current) return
    setPage(target); setMenu(false); window.scrollTo(0, 0)
  }
  const signOut = async () => {
    if (!supabase || lock.current || (dirty && !confirm('Sair e descartar alterações não salvas?'))) return
    lock.current = true
    setBusy(true)
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) throw error
    } catch {
      throw new Error('Não foi possível sair. Verifique a conexão e tente novamente.')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return <div className="shell">
    {menu && <button className="overlay no-print" aria-label="Fechar menu" onClick={() => setMenu(false)}/>}
    <aside className={'sidebar no-print ' + (menu ? 'visible' : '')}>
      <Brand/>
      <nav aria-label="Navegação principal"><small>GESTÃO</small>
        <button className={page === 'orders' ? 'active' : ''} aria-current={page === 'orders' ? 'page' : undefined} onClick={() => navigate('orders')}><ClipboardList size={19}/> Encomendas e Produção</button>
        <button className={page === 'finance' ? 'active' : ''} aria-current={page === 'finance' ? 'page' : undefined} onClick={() => navigate('finance')}><BarChart3 size={19}/> Resumo Financeiro</button>
      </nav>
      <div className="sidebar-footer">
        <button onClick={() => downloadCsv(data)}><Download size={18}/> Exportar dados em CSV</button>
        {supabase && <button disabled={busy} onClick={() => void signOut().catch(showError)}><LogOut size={18}/> Sair</button>}
        <div className="workspace-mode"><span className={connection === 'connected' ? 'online' : ''}/>{supabase ? connectionLabel[connection] : 'Dados fictícios neste navegador'}</div>
      </div>
    </aside>
    <div className="surface screen">
      <header className="topbar no-print">
        <div><button className="icon-button mobile-menu" aria-label="Abrir menu" onClick={() => setMenu(true)}><Menu size={22}/></button><img className="mobile-logo" src={logo} alt="DS Audio"/><span className="breadcrumb">Gestão <span>/</span> {page === 'orders' ? 'Encomendas' : 'Financeiro'}</span></div>
        <div className="header-actions">{!supabase && <span className="demo-badge"><FlaskConical size={15}/> <span>Modo <span className="demo-long">demonstração</span><span className="demo-short">demo</span></span></span>}
          <button className="button secondary" disabled={busy} onClick={() => setPanel('backup')}><DatabaseBackup size={17}/> Backup</button>
          <button className="icon-button settings-button" aria-label="Configurações" title="Configurações" disabled={busy} onClick={() => setPanel('settings')}><Settings size={20}/></button>
        </div>
      </header>
      <main className="page">
        {page === 'orders' ? <OrderPage key={order.id} data={data} order={order} baseline={baseline ?? clean.current ?? order} change={setOrder} open={open} persist={persist} showError={showError} busy={busy} staffSave={staff => commit({ ...data, staff }, 'Funcionários salvos.')}/> : <Finance data={data} busy={busy} persist={expenses => commit({ ...data, expenses }, 'Despesa salva.')}/>}
      </main>
    </div>
    {panel === 'settings' && <SettingsPanel theme={theme} setTheme={setTheme} email={user?.email} real={!!supabase}
      connection={connection} setConnection={setConnection} close={() => setPanel(null)} openBackup={() => setPanel('backup')} signOut={signOut} busy={busy}/>}
    {panel === 'backup' && <BackupPanel authorized={!!supabase && user?.app_metadata.ds_audio_owner === true} real={!!supabase} dirty={dirty} close={() => setPanel(null)} busy={busy} restore={async restored => {
      await commit(restored, 'Backup restaurado.', true)
      const first = restored.orders[0] ?? newOrder(1)
      clean.current = first
      setOrder(first)
      setPanel(null)
      window.scrollTo(0, 0)
    }}/>}
    {page === 'orders' && <PrintOrder order={order}/>}
    {feedback.text && <div className={'toast no-print ' + (feedback.error ? 'toast-error' : '')} role={feedback.error ? 'alert' : 'status'}>{feedback.text}<button className="icon-button" aria-label="Fechar aviso" onClick={() => setFeedback({ text: '', error: false })}><X size={17}/></button></div>}
  </div>
}
function PrintOrder({ order }: { order: Order }) {
  const t = orderTotals(order)
  return <article className="print-only"><Brand/>{!supabase && <p>DEMONSTRAÇÃO · DADOS FICTÍCIOS</p>}<h2>Encomenda {code(order.number)} · {order.status}</h2><p>{order.customer} · {order.phone}</p><p>{order.description}</p><p>Cadastro {formatDate(order.created)} · Entrega prevista {formatDate(order.expected)} · Conclusão {formatDate(order.completed)}</p>
    <table><thead><tr><th>Serviço</th><th>Cobrado</th><th>Custo</th><th>Resultado</th></tr></thead><tbody>{stages.map(s => {
      const st = stageTotals(order.stages[s])
      return <tr key={s}><th>{s}</th><td>{money(order.stages[s].charge)}</td><td>{money(st.cost)}</td><td>{money(st.profit)}</td></tr>
    })}<tr><th>Materiais vendidos</th><td>{money(t.sold)}</td><td>{money(t.goods)}</td><td>{money(t.sold - t.goods)}</td></tr></tbody></table>
    <p>Total cobrado {money(t.charged)} · Recebido {money(t.received)} · Reembolsos {money(t.refunds)}</p><p>{t.balance < 0 ? 'Crédito pendente' : 'Saldo a receber'} {money(Math.abs(t.balance))} · {order.completed ? 'Lucro realizado' : 'Lucro previsto'} {money(t.profit)}</p>
  </article>
}
createRoot(document.getElementById('root')!).render(<App/>)

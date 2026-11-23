import { useState } from 'react'
import { ArrowDownLeft, CalendarDays, ChevronDown, ClipboardList, CreditCard, Hammer, Layers3, Package, PaintRoller, Pencil, Plus, Printer, RotateCcw, Save, Search, Trash2, Users, Wrench } from 'lucide-react'
import { addPayment, addReturn, code, destinations, formatDate, id, lineTotal, methods, money, orderTotals, paymentStatus, receivedFor, returned, stages, stageTotals, statuses, today, type Data, type LaborPayment, type Material, type Order, type Payment, type Product, type Return, type Staff, type Stage } from './domain'
import { Amount, Field, Modal, MoneyField, options, Qty, Rows, Select } from './ui'

type StageName = typeof stages[number]
const icons = { Caixaria: Hammer, Pintura: PaintRoller, Ferragem: Wrench, Instalação: Layers3 }
const units = ['folha', 'metro', 'litro', 'unidade', 'quilograma', 'outra']
type Props = { data: Data; order: Order; baseline: Order; change: (order: Order) => void; open: (order?: Order) => void; persist: (order: Order, notice?: string, stageName?: StageName) => Promise<void>; showError: (error: unknown) => void; staffSave: (staff: Staff[]) => Promise<void>; busy: boolean }
export function OrderPage({ data, order, baseline, change, open, persist, showError, staffSave, busy }: Props) {
  const [modal, setModal] = useState<'search' | 'debt' | 'payment' | 'staff' | 'return' | 'audit' | null>(null)
  const [editing, setEditing] = useState<Payment>()
  const [query, setQuery] = useState('')
  const [savingStages, setSavingStages] = useState<StageName[]>([])
  const [stageErrors, setStageErrors] = useState<Partial<Record<StageName, string>>>({})
  const saved = data.orders.some(o => o.id === order.id)
  const total = orderTotals(order)
  const status = paymentStatus(order)
  const done = order.status === 'Finalizada' || order.status === 'Entregue'
  const patch = (values: Partial<Order>) => change({ ...order, ...values })
  const stageDirty = (name: StageName) => JSON.stringify(order.stages[name]) !== JSON.stringify(baseline.stages[name])
  const updateStage = (name: StageName, stage: Stage) => {
    setStageErrors(errors => ({ ...errors, [name]: undefined }))
    patch({ stages: { ...order.stages, [name]: stage } })
  }
  const saveOrder = async (candidate: Order, notice?: string, name?: StageName) => {
    const affected = name ? [name] : stages.filter(stageDirty)
    setSavingStages(affected)
    try {
      await persist(candidate, notice, name)
      setStageErrors(errors => {
        const next = { ...errors }
        for (const stage of affected) delete next[stage]
        return next
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Tente novamente.'
      setStageErrors(errors => ({ ...errors, ...Object.fromEntries(affected.map(stage => [stage, detail])) }))
      throw error
    } finally {
      setSavingStages([])
    }
  }
  const audit = (message: string, previous: unknown) => saved ? [...order.audit, { date: new Date().toISOString(), note: message, previous }] : order.audit
  const catalog = [...data.orders.flatMap(o => [...Object.values(o.stages).flatMap(s => s.materials), ...o.products]), ...Object.values(order.stages).flatMap(s => s.materials), ...order.products]
  const saveStage = (name: StageName, stage: Stage, notice: string) =>
    saveOrder({ ...order, stages: { ...order.stages, [name]: stage } }, notice, name)
  const stageCard = (name: StageName) => <StageCard key={name} name={name} stage={order.stages[name]} staff={data.staff}
    update={stage => updateStage(name, stage)} catalog={catalog} staffDialog={() => setModal('staff')}
    onSave={() => void saveStage(name, order.stages[name], 'Etapa salva.').catch(showError)}
    savePayment={stage => saveStage(name, stage, 'Pagamento do funcionário salvo.')}
    dirty={stageDirty(name)} saving={savingStages.includes(name)} error={stageErrors[name]}
    saved={saved} busy={busy} initialOpen={name === 'Caixaria' || name === 'Instalação'} />
  const showSearch = () => { setQuery(''); setModal('search') }
  const contains = (o: Order) => {
    const q = query.trim().toLocaleLowerCase('pt-BR')
    const digits = q.replace(/\D/g, '')
    return !q || code(o.number).includes(q) || o.customer.toLocaleLowerCase('pt-BR').includes(q) || (!!digits && /^[\d()+.\s-]+$/.test(q) && o.phone.replace(/\D/g, '').includes(digits))
  }
  const editProduct = (product: Product) => patch({ products: order.products.map(p => p.id === product.id ? product : p) })
  return <fieldset className="order-editor" disabled={busy}>
    <div className="page-heading"><div><h1>Encomendas e Produção</h1><p>Gerencie serviços, materiais e pagamentos em um só lugar.</p></div><div className="actions no-print"><button className="button secondary" onClick={showSearch}><Search size={17} /> Buscar caixa</button><button className="button primary" onClick={() => open()}><Plus size={19} /> Nova caixa</button></div></div>
    <div className="overview">
      <div className="metric"><span className="metric-icon ruby"><ClipboardList size={20}/></span><div><small>Encomenda atual</small><strong>{code(order.number)}</strong></div></div>
      <div className="metric"><span className="metric-icon blue"><CreditCard size={20}/></span><div><small>Total da encomenda</small><strong>{money(total.charged)}</strong></div></div>
      <div className="metric"><span className="metric-icon green-bg"><ArrowDownLeft size={22}/></span><div><small>Lucro {done ? 'realizado' : 'previsto'}</small><strong><Amount value={total.profit}/></strong></div></div>
      <div className="metric"><span className="metric-icon amber-bg"><CalendarDays size={19}/></span><div><small>{total.balance < 0 ? 'Crédito pendente' : 'Saldo a receber'}</small><strong>{money(Math.abs(total.balance))}</strong></div></div>
    </div>

    <section className="panel">
      <div className="section-head"><div className="section-title"><ClipboardList size={20}/><h2>Dados da encomenda</h2></div><span className={'badge ' + (order.status === 'Em produção' ? 'amber' : done ? 'green' : 'neutral')}>{order.status}</span></div>
      <div className="panel-body order-fields">
        <Field label="Nome do cliente" value={order.customer} change={customer => patch({ customer })} placeholder="Nome completo" required />
        <Field label="Telefone / WhatsApp" type="tel" value={order.phone} change={phone => patch({ phone })} placeholder="(00) 00000-0000" />
        <Select label="Situação" value={order.status} options={options(statuses)} change={value => {
          const status = value as Order['status']
          patch({ status, completed: ['Finalizada', 'Entregue'].includes(status) ? order.completed || today() : '' })
        }} />
        <label className="field full">Descrição da caixa ou serviço<textarea rows={2} value={order.description} onChange={e => patch({ description: e.target.value })} placeholder="Descreva o serviço solicitado" /></label>
        <Field label="Data de cadastro" value={order.created} change={created => patch({ created })} type="date" required />
        <Field label="Previsão de entrega" value={order.expected} change={expected => patch({ expected })} type="date" />
        <Field label="Data de conclusão" value={order.completed} change={completed => patch({ completed })} type="date" />
      </div>
    </section>

    <div className="work-grid">
      <div className="stack">
        <section className="panel">
          <div className="section-head"><div className="section-title"><Package size={20}/><h2>Serviço da Caixa</h2></div><button className="button subtle no-print" onClick={() => setModal('staff')}><Users size={16}/> Funcionários</button></div>
          <div className="panel-body stage-stack">{stages.slice(0, 3).map(stageCard)}<div className="subtotal">Subtotal do Serviço da Caixa <strong>{money(stages.slice(0, 3).reduce((s, n) => s + order.stages[n].charge, 0))}</strong></div></div>
        </section>
      </div>
      <div className="stack">
        <section className="panel">
          <div className="section-head"><div className="section-title"><Wrench size={20}/><h2>Serviço de Instalação</h2></div></div>
          <div className="panel-body stage-stack">{stageCard('Instalação')}</div>
        </section>
        <section className="panel">
          <div className="section-head"><div className="section-title"><CreditCard size={20}/><h2>Pagamento do cliente</h2></div><span className={'badge ' + status.tone}>{status.label}</span></div>
          <div className="panel-body stack">
            <Rows rows={[[ 'Total cobrado', money(total.charged)], ['Já recebido', money(total.received)], ['Reembolsos', money(total.refunds)], ['Crédito concedido', money(total.credits)], [total.balance < 0 ? 'Crédito a acertar' : 'Saldo a receber', money(Math.abs(total.balance))]]}/>
            <Field label="Vencimento" value={order.due} change={due => patch({ due })} type="date"/>
            <button className="button primary no-print" onClick={() => { setEditing(undefined); setModal('payment') }}><Plus size={17}/> Registrar pagamento</button>
            <button className="button secondary no-print" onClick={() => setModal('debt')}><Users size={17}/> Clientes devendo</button>
            <details className="history"><summary>Recebimentos por serviço e histórico</summary>
              <Rows rows={destinations.map(d => [d, money(receivedFor(order, d))])}/>
              {order.payments.map(p => <div className="history-line" key={p.id}><div><strong>{money(p.amount)} · {p.method}</strong><small>{formatDate(p.date)} {p.note && '· ' + p.note}</small></div><button className="icon-button no-print" aria-label="Corrigir pagamento" onClick={() => { setEditing(p); setModal('payment') }}><Pencil size={17}/></button></div>)}
            </details>
          </div>
        </section>
      </div>
    </div>

    <section className="panel">
      <div className="section-head"><div className="section-title"><Package size={20}/><h2>Materiais vendidos</h2></div><div className="actions no-print"><button className="button subtle" disabled={!order.products.length} onClick={() => setModal('return')}><RotateCcw size={16}/> Devolução</button><button className="button secondary" onClick={() => patch({ products: [...order.products, { id: id(), name: '', qty: 1, cost: 0, price: 0 }] })}><Plus size={17}/> Adicionar produto</button></div></div>
      <div className="panel-body stack">{!order.products.length && <p className="muted">Nenhum produto vendido nesta encomenda.</p>}
      {order.products.map(p => <div className="product-row" key={p.id}>
        <Field label="Produto ou material" value={p.name} list="material-catalog" change={name => {
          const match = catalog.find(m => m.id !== p.id && m.name === name)
          editProduct({ ...p, name, ...(match ? { cost: match.cost, price: 'price' in match ? match.price : p.price } : {}) })
        }}/>
        <Qty value={p.qty} change={qty => editProduct({ ...p, qty })}/>
        <MoneyField label="Custo unitário" value={p.cost} change={cost => editProduct({ ...p, cost })}/>
        <MoneyField label="Preço de venda" value={p.price} change={price => editProduct({ ...p, price })}/>
        <Field label="Compra paga em" type="date" value={p.paidOn ?? ''} change={paidOn => editProduct({ ...p, paidOn })}/>
        <div className="line-result"><small>Vendido / lucro</small><strong>{money(lineTotal(p.qty - returned(order, p.id), p.price))} / <Amount value={lineTotal(p.qty - returned(order, p.id), p.price) - lineTotal(p.qty - returned(order, p.id), p.cost)}/></strong></div>
        <button className="icon-button no-print" aria-label="Remover produto" disabled={returned(order, p.id) > 0} onClick={() => {
          if (!saved || confirm('Remover este produto da encomenda?')) patch({ products: order.products.filter(x => x.id !== p.id), audit: audit('Produto removido', p) })
        }}><Trash2 size={17}/></button>
      </div>)}
      {order.returns.map(r => <div className="history-line" key={r.id}><div><strong>{order.products.find(p => p.id === r.productId)?.name} · {r.qty} devolvido(s)</strong><small>{formatDate(r.date)} {r.reason && '· ' + r.reason}</small></div><small>{money(r.refund)} reembolsado · {money(r.credit)} em crédito</small></div>)}</div>
    </section>
    <section className="panel">
      <div className="section-head"><div className="section-title"><Layers3 size={20}/><h2>Resultado da encomenda</h2></div>{order.audit.length > 0 && <button className="button subtle no-print" onClick={() => setModal('audit')}>Ver alterações</button>}</div>
      <div className="panel-body summary-grid">
        <Rows rows={[...stages.map(n => [n, money(order.stages[n].charge)] as [string, string]), ['Materiais vendidos', money(total.sold)], ['Total geral cobrado', money(total.charged)]]}/>
        <Rows rows={[...stages.map(n => ['Lucro · ' + n, <Amount value={stageTotals(order.stages[n]).profit}/>] as [string, React.ReactNode]), ['Custo total de materiais', money(total.materials)], ['Mão de obra combinada', money(total.labor)], ['Ainda devido aos funcionários', money(total.owed)]]}/>
        <div className="result-box"><small>Lucro {done ? 'realizado' : 'previsto'}</small><strong><Amount value={total.profit}/></strong><Rows rows={[[ 'Dinheiro recebido', money(total.received)], [total.balance < 0 ? 'Crédito a acertar' : 'Saldo a receber', money(Math.abs(total.balance))]]}/><p>Despesas gerais e tributos não cadastrados ficam fora deste cálculo.</p></div>
      </div>
    </section>
    <div className="bottom-actions no-print">
      <button className="button secondary" onClick={() => open()}><Plus size={17}/> Nova caixa</button><button className="button secondary" onClick={showSearch}><Search size={17}/> Buscar caixa</button><button className="button secondary" onClick={() => window.print()}><Printer size={17}/> Imprimir / PDF</button><button className="button subtle" onClick={() => open()}><RotateCcw size={16}/> Limpar</button><button className="button primary" disabled={busy} onClick={() => void saveOrder(order).catch(showError)}><Save size={17}/> {saved ? 'Salvar Alterações' : 'Salvar Encomenda'}</button>
    </div>
    <datalist id="material-catalog">{[...new Set(catalog.map(m => m.name).filter(Boolean))].map(name => <option key={name} value={name}/>)}</datalist>

    {(modal === 'search' || modal === 'debt') && <Modal title={modal === 'search' ? 'Buscar caixa' : 'Clientes devendo'} close={() => setModal(null)}>
      <div className="stack">{modal === 'search' && <Field label="Número, cliente ou telefone" value={query} change={setQuery}/>}
        {data.orders.filter(o => modal === 'search' ? contains(o) : orderTotals(o).balance > 0).map(o => <button className="list-button" key={o.id} onClick={() => { open(o); setModal(null) }}><div><strong>{code(o.number)} · {o.customer}</strong><small>{o.phone || 'Sem telefone'} · {o.status}</small></div>{modal === 'debt' && <div><strong>{money(orderTotals(o).balance)}</strong><small>{formatDate(o.due)}</small></div>}</button>)}
        {!data.orders.some(o => modal === 'search' ? contains(o) : orderTotals(o).balance > 0) && <p className="muted">Nenhuma encomenda encontrada.</p>}</div>
    </Modal>}
    {modal === 'payment' && <PaymentDialog order={order} initial={editing} close={() => setModal(null)} busy={busy} apply={async o => { await saveOrder(o, 'Pagamento salvo.'); setModal(null) }}/>}
    {modal === 'return' && <ReturnDialog order={order} close={() => setModal(null)} busy={busy} apply={async o => { await saveOrder(o, 'Devolução salva.'); setModal(null) }}/>}
    {modal === 'staff' && <StaffDialog staff={data.staff} close={() => setModal(null)} save={staffSave} busy={busy}/>}
    {modal === 'audit' && <Modal title="Histórico de alterações" close={() => setModal(null)}><div className="stack">{order.audit.map((entry, i) => <details className="history" key={i}><summary>{entry.note} · {new Date(entry.date).toLocaleString('pt-BR')}</summary><pre>{JSON.stringify(entry.previous, null, 2)}</pre></details>)}</div></Modal>}
  </fieldset>
}

function StageCard({ name, stage, staff, update, catalog, staffDialog, onSave, savePayment, dirty, saving, error, saved, busy, initialOpen }: {
  name: StageName; stage: Stage; staff: Staff[]; update: (stage: Stage) => void; catalog: (Material | Product)[]; staffDialog: () => void; onSave: () => void; savePayment: (stage: Stage) => Promise<void>; dirty: boolean; saving: boolean; error?: string; saved: boolean; busy: boolean; initialOpen: boolean
}) {
  const [expanded, setExpanded] = useState(initialOpen)
  const [laborDialog, setLaborDialog] = useState(false)
  const totals = stageTotals(stage)
  const Icon = icons[name]
  const showsCharge = name === 'Caixaria' || name === 'Instalação'
  const saveStatus = saving ? 'Salvando…' : error ? 'Erro ao salvar' : dirty ? 'Alterações pendentes' : saved ? 'Etapa salva' : ''
  const editMaterial = (m: Material) => update({ ...stage, materials: stage.materials.map(x => x.id === m.id ? m : x) })
  return <div className="stage">
    <button className="stage-toggle" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}><span className="stage-icon"><Icon size={17}/></span><strong>{name}</strong><span className="stage-profit"><Amount value={totals.profit}/></span><ChevronDown size={17} className={expanded ? 'turned' : ''}/></button>
    <div className="stage-status no-print" role="status">
      {saveStatus && <span className={'badge ' + (saving ? 'neutral' : error ? 'red' : dirty ? 'amber' : 'green')}>{saveStatus}</span>}
    </div>
    {expanded && <div className="stage-body stack">
      <div className={showsCharge ? "stage-fields" : "stage-fields stage-fields-costs"}>
        <Select label="Funcionário responsável" value={stage.staffId} options={[{ value: '', label: 'Selecionar funcionário' }, ...staff.filter(s => s.active || s.id === stage.staffId).map(s => ({ value: s.id, label: s.name + (s.active ? '' : ' (inativo)') }))]} change={staffId => {
          if (stage.payments.length) { alert('Esta etapa tem pagamentos vinculados ao funcionário.'); return }
          update({ ...stage, staffId })
        }}/>
        {showsCharge && <MoneyField label="Valor cobrado" value={stage.charge} change={charge => update({ ...stage, charge })}/>}
        <MoneyField label="Valor combinado com o funcionário" value={stage.labor} change={labor => update({ ...stage, labor })}/>
      </div>
      {!staff.length && <button className="button subtle align-start no-print" onClick={staffDialog}><Plus size={16}/> Cadastrar funcionário</button>}
      <div className="inline-head"><h3>Materiais utilizados</h3><button className="button subtle no-print" onClick={() => update({ ...stage, materials: [...stage.materials, { id: id(), name: '', cost: 0, qty: 1, unit: 'unidade' }] })}><Plus size={16}/> Adicionar material</button></div>
      {!stage.materials.length && <p className="muted compact">Nenhum material nesta etapa.</p>}
      {stage.materials.map(m => <div className="material" key={m.id}>
        <div className="material-line"><Field label="Material" value={m.name} list="material-catalog" change={name => {
          const match = catalog.find(x => x.id !== m.id && x.name === name)
          editMaterial({ ...m, name, ...(match ? { cost: match.cost, unit: 'unit' in match ? match.unit : m.unit } : {}) })
        }}/><Qty value={m.qty} change={qty => editMaterial({ ...m, qty })}/><Select label="Unidade" value={m.unit} options={options(units)} change={unit => editMaterial({ ...m, unit })}/>
        <MoneyField label="Custo unitário" value={m.cost} change={cost => editMaterial({ ...m, cost })}/><div className="line-result"><small>Subtotal</small><strong>{money(lineTotal(m.qty, m.cost))}</strong></div>
        <button className="icon-button no-print" aria-label={'Remover ' + (m.name || 'material')} onClick={() => { if (confirm('Remover este material?')) update({ ...stage, materials: stage.materials.filter(x => x.id !== m.id) }) }}><Trash2 size={16}/></button></div>
        <details className="material-date"><summary>Pagamento da compra</summary><Field label="Compra paga em" value={m.paidOn ?? ''} change={paidOn => editMaterial({ ...m, paidOn })} type="date"/></details>
      </div>)}
      <div className="stage-footer"><span>Custo da etapa <strong>{money(totals.cost)}</strong></span><span>Lucro <strong><Amount value={totals.profit}/></strong></span></div>
      <div className="inline-head compact"><span className="muted">Mão de obra · {money(totals.paid)} pago · {money(totals.owed)} a pagar</span><button className="button subtle no-print" onClick={() => setLaborDialog(true)}>Pagamentos</button></div>
      {error && !saving && <p className="red compact no-print">{error}</p>}
      <button className="button secondary align-start no-print" disabled={busy || !dirty} onClick={onSave}><Save size={16}/> Salvar Etapa</button>
    </div>}
    {laborDialog && <LaborDialog stage={stage} close={() => setLaborDialog(false)} busy={busy} apply={entry => savePayment({ ...stage, payments: [...stage.payments, entry] })}/>}
  </div>
}

function PaymentDialog({ order, initial, close, apply, busy }: { order: Order; initial?: Payment; close: () => void; apply: (o: Order) => Promise<void>; busy: boolean }) {
  const [p, set] = useState<Payment>(() => initial ?? { id: id(), date: today(), amount: 0, method: 'Pix', allocations: [], note: '' })
  const [error, setError] = useState('')
  const [auditDate] = useState(() => new Date().toISOString())
  return <Modal title={initial ? 'Corrigir pagamento' : 'Registrar pagamento'} close={close} busy={busy}><form className="stack" onSubmit={async e => {
    e.preventDefault()
    if (busy) return
    setError('')
    try {
      const next = addPayment(order, p, !!initial, auditDate)
      const normalized = next.payments.find(entry => entry.id === p.id)!
      const same = order.payments.some(entry => entry.id !== p.id && entry.date === p.date && entry.amount === p.amount && entry.method === p.method
        && destinations.every(d => entry.allocations.find(a => a.destination === d)?.amount === normalized.allocations.find(a => a.destination === d)?.amount))
      if (same && !confirm('Já existe um pagamento igual nesta data. Confirmar que é outro recebimento?')) return
      if (!initial || confirm('Confirmar a correção deste pagamento?')) await apply(next)
    } catch (err) { setError((err as Error).message) }
  }}><div className="form-grid"><Field label="Data" value={p.date} change={date => set({ ...p, date })} type="date" required/><MoneyField label="Valor pago" value={p.amount} change={amount => set({ ...p, amount })}/><Select label="Forma de pagamento" value={p.method} change={method => set({ ...p, method: method as Payment['method'] })} options={options(methods)}/><Field label="Observação opcional" value={p.note} change={note => set({ ...p, note })}/></div>
    <div><h3>Distribuição por destino</h3><p className="muted compact">O valor sem destino será registrado como entrada geral. Ao confirmar, a encomenda também será salva.</p></div><div className="form-grid">{destinations.map(destination => <MoneyField key={destination} label={destination} value={p.allocations.find(a => a.destination === destination)?.amount ?? 0} change={amount => set({ ...p, allocations: [...p.allocations.filter(a => a.destination !== destination), { destination, amount }] })}/>)}</div>
    {error && <p role="alert" className="red">{error}</p>}<button className="button primary" type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Confirmar pagamento'}</button>
  </form></Modal>
}

function LaborDialog({ stage, close, apply, busy }: { stage: Stage; close: () => void; apply: (p: LaborPayment) => Promise<void>; busy: boolean }) {
  const [date, setDate] = useState(today)
  const [amount, setAmount] = useState(0)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const { paid, owed } = stageTotals(stage)
  const [paymentId] = useState(id)
  return <Modal title="Pagamentos do funcionário" close={close} busy={busy}><form className="stack" onSubmit={async e => {
    e.preventDefault()
    if (busy) return
    setError('')
    if (!stage.staffId || !date || amount <= 0 || amount > owed) { setError('Selecione um funcionário e informe um valor dentro do saldo a pagar.'); return }
    try { await apply({ id: paymentId, staffId: stage.staffId, date, amount, note }); close() }
    catch (err) { setError((err as Error).message) }
  }}><Rows rows={[[ 'Combinado', money(stage.labor)], ['Pago', money(paid)], ['A pagar', money(owed)]]}/>
    {stage.payments.map(p => <div className="history-line" key={p.id}>{formatDate(p.date)} · {p.note || 'Pagamento'} <strong>{money(p.amount)}</strong></div>)}
    <div className="form-grid"><Field label="Data" value={date} change={setDate} type="date" required/><MoneyField label="Valor do pagamento" value={amount} change={setAmount}/></div>
    <Field label="Observação opcional" value={note} change={setNote}/>
    {error && <p role="alert" className="red">{error}</p>}<button className="button primary" disabled={busy}>{busy ? 'Salvando…' : 'Registrar pagamento'}</button>
  </form></Modal>
}
function ReturnDialog({ order, close, apply, busy }: { order: Order; close: () => void; apply: (order: Order) => Promise<void>; busy: boolean }) {
  const eligible = order.products.filter(p => p.qty > returned(order, p.id))
  const [r, set] = useState<Return>(() => ({ id: id(), productId: eligible[0]?.id ?? '', qty: 1, date: today(), reason: '', refund: 0, credit: 0 }))
  const [error, setError] = useState('')
  return <Modal title="Registrar devolução" close={close} busy={busy}><form className="stack" onSubmit={async e => {
    e.preventDefault()
    if (busy) return
    setError('')
    try { await apply(addReturn(order, r)) } catch (err) { setError((err as Error).message) }
  }}><Select label="Produto devolvido" value={r.productId} change={productId => set({ ...r, productId })} options={eligible.map(p => ({ value: p.id, label: p.name + ' · disponível: ' + (p.qty - returned(order, p.id)) }))}/>
    <div className="form-grid"><Qty value={r.qty} change={qty => set({ ...r, qty })}/><Field label="Data" value={r.date} change={date => set({ ...r, date })} type="date" required/><MoneyField label="Valor reembolsado" value={r.refund} change={refund => set({ ...r, refund })}/><MoneyField label="Valor concedido como crédito" value={r.credit} change={credit => set({ ...r, credit })}/></div>
    <Field label="Motivo opcional" value={r.reason} change={reason => set({ ...r, reason })}/><p className="muted compact">A devolução reduz a venda. Reembolsos saem do caixa na data informada. Créditos concedidos são registrados separadamente para uso futuro.</p>
    {error && <p className="red" role="alert">{error}</p>}<button className="button primary" disabled={busy || !eligible.length}>Salvar devolução</button></form></Modal>
}
function StaffDialog({ staff, close, save, busy }: { staff: Staff[]; close: () => void; save: (staff: Staff[]) => Promise<void>; busy: boolean }) {
  const [items, set] = useState(staff)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const change = (item: Staff) => set(items.map(s => s.id === item.id ? item : s))
  return <Modal title="Funcionários" close={close} busy={busy}><form className="stack" onSubmit={async e => {
    e.preventDefault()
    const next = name.trim() ? [...items, { id: id(), name: name.trim(), active: true }] : items
    if (busy) return
    setError('')
    set(next)
    setName('')
    try { await save(next); close() } catch (err) { setError((err as Error).message) }
  }}>{items.map(s => <div className="form-grid" key={s.id}><Field label="Nome" value={s.name} change={name => change({ ...s, name })} required/><Select label="Situação" value={s.active ? 'Ativo' : 'Inativo'} change={value => change({ ...s, active: value === 'Ativo' })} options={options(['Ativo', 'Inativo'])}/></div>)}
    <div className="inline-head"><Field label="Novo funcionário" value={name} change={setName}/><button type="button" className="button secondary" disabled={!name.trim()} onClick={() => { set([...items, { id: id(), name: name.trim(), active: true }]); setName('') }}><Plus size={17}/> Adicionar</button></div>{error && <p role="alert" className="red">{error}</p>}<button className="button primary" disabled={busy}>Salvar funcionários</button></form></Modal>
}

import { useState } from 'react'
import { BarChart3, CalendarDays, ChartNoAxesCombined, CircleDollarSign, Pencil, Plus, Receipt } from 'lucide-react'
import { formatDate, id, money, report, today, type Data, type Expense } from './domain'
import { Amount, Field, Modal, MoneyField, options, Rows, Select } from './ui'

const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const categories = ['Energia elétrica', 'Aluguel', 'Transporte', 'Manutenção', 'Compras administrativas', 'Outras despesas']
export function Finance({ data, persist, busy }: { data: Data; persist: (expenses: Expense[]) => Promise<void>; busy: boolean }) {
  const [period, setPeriod] = useState(today().slice(0, 7))
  const [year, setYear] = useState(today().slice(0, 4))
  const [expense, setExpense] = useState<Expense | null>(null)
  const monthly = report(data, period)
  const yearly = report(data, year)
  const annual = months.map((name, i) => ({ name, ...report(data, year + '-' + String(i + 1).padStart(2, '0')) }))
  const max = Math.max(1, ...annual.flatMap(m => [m.sold, m.materials + m.goods + m.labor + m.expenses]))
  const metrics = [
    ['Total vendido', money(monthly.sold)], ['Total efetivamente recebido', money(monthly.received)], ['Saldo a receber no fim do mês', money(monthly.open)],
    ['Materiais consumidos', money(monthly.materials)], ['Mão de obra', money(monthly.labor)], ['Despesas gerais', money(monthly.expenses)],
    ['Resultado gerencial', <Amount value={monthly.result}/>], ['Encomendas finalizadas', monthly.count],
  ] as const
  return <>
    <div className="page-heading"><div><h1>Resumo Financeiro</h1><p>Acompanhe o resultado da operação e o dinheiro em caixa.</p></div><Field label="Período mensal" value={period} change={v => { if (v) setPeriod(v) }} type="month"/></div>
    <div className="overview">{metrics.map(([label, value], i) => <div className="metric" key={label}><span className={'metric-icon ' + ['ruby', 'green-bg', 'amber-bg', 'blue'][i % 4]}>{i === 7 ? <CalendarDays size={20}/> : <CircleDollarSign size={20}/>}</span><div><small>{label}</small><strong>{value}</strong></div></div>)}</div>
    <div className="work-grid finance-grid">
      <section className="panel"><div className="section-head"><div className="section-title"><ChartNoAxesCombined size={20}/><h2>Fluxo de caixa do mês</h2></div></div><div className="panel-body"><Rows rows={[
        ['Recebimentos de clientes', money(monthly.received)], ['Pagamentos a funcionários', money(monthly.paidLabor)], ['Compras de materiais e produtos pagas', money(monthly.paidMaterials)], ['Reembolsos', money(monthly.refunds)], ['Despesas gerais pagas', money(monthly.paidExpenses)], ['Total de saídas', money(monthly.cashOut)], ['Saldo do fluxo de caixa', <Amount value={monthly.cash}/>],
      ]}/></div></section>
      <section className="panel"><div className="section-head"><div className="section-title"><Receipt size={20}/><h2>Despesas gerais</h2></div><button className="button primary" onClick={() => setExpense({ id: id(), description: '', category: categories[0], amount: 0, date: today().startsWith(period) ? today() : period + '-01', paidOn: '' })}><Plus size={17}/> Nova despesa</button></div>
      <div className="panel-body stack">{data.expenses.filter(e => e.date.startsWith(period)).map(e => <div key={e.id} className="history-line"><div><strong>{e.description}</strong><small>{e.category} · {formatDate(e.date)} · {e.paidOn ? 'Paga em ' + formatDate(e.paidOn) : 'Pendente'}</small></div><strong>{money(e.amount)}</strong><button className="icon-button" aria-label="Editar despesa" onClick={() => setExpense(e)}><Pencil size={17}/></button></div>)}{!data.expenses.some(e => e.date.startsWith(period)) && <p className="muted">Nenhuma despesa cadastrada no mês.</p>}</div></section>
    </div>
    <section className="panel"><div className="section-head"><div className="section-title"><BarChart3 size={20}/><h2>Relatório anual</h2></div><label className="field">Ano<select value={year} onChange={e => setYear(e.target.value)}>{[...new Set([year, today().slice(0, 4), ...Array.from({ length: 11 }, (_, i) => String(Number(today().slice(0, 4)) + 2 - i)), ...data.orders.map(o => o.completed.slice(0, 4)).filter(Boolean), ...data.expenses.map(e => e.date.slice(0, 4))])].sort().reverse().map(y => <option key={y}>{y}</option>)}</select></label></div>
      <div className="panel-body stack">
        <div className="chart-key"><span><i/> Receitas</span><span><i/> Custos e despesas</span></div>
        <div className="chart" aria-hidden="true">{annual.map(m => <div className="chart-month" key={m.name}><div className="bars"><i style={{ height: 100 * m.sold / max + '%' }}/><i style={{ height: 100 * (m.materials + m.goods + m.labor + m.expenses) / max + '%' }}/></div><small>{m.name.slice(0, 3)}</small></div>)}</div>
        <div className="table-scroll"><table><thead><tr>{['Mês', 'Receitas', 'Custos diretos', 'Despesas gerais', 'Resultado', 'Fluxo de caixa'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{[...annual, { name: 'Total anual', ...yearly }].map(m => <tr key={m.name}><th>{m.name}</th><td>{money(m.sold)}</td><td>{money(m.materials + m.goods + m.labor)}</td><td>{money(m.expenses)}</td><td><Amount value={m.result}/></td><td><Amount value={m.cash}/></td></tr>)}</tbody></table></div>
        <p className="muted">O resultado gerencial reconhece encomendas no mês de conclusão e despesas no mês de lançamento. Tributos e outros custos ausentes podem alterar o lucro contábil líquido.</p>
      </div>
    </section>
    {expense && <ExpenseDialog expense={expense} close={() => { if (!busy) setExpense(null) }} apply={async item => {
      await persist([...data.expenses.filter(e => e.id !== item.id), item])
      setExpense(null)
    }} busy={busy}/>}
  </>
}
function ExpenseDialog({ expense, close, apply, busy }: { expense: Expense; close: () => void; apply: (expense: Expense) => Promise<void>; busy: boolean }) {
  const [item, set] = useState(expense)
  const [paid, setPaid] = useState(!!expense.paidOn)
  const [error, setError] = useState('')
  const patch = (updates: Partial<Expense>) => set({ ...item, ...updates })
  return <Modal title="Despesa geral" close={close} busy={busy}><form className="stack" onSubmit={async e => {
    e.preventDefault()
    if (!item.description.trim() || !item.amount || !item.date || (paid && !item.paidOn)) { setError('Preencha descrição, valor e datas.'); return }
    if (busy) return
    setError('')
    try { await apply({ ...item, paidOn: paid ? item.paidOn : '' }) } catch (err) { setError((err as Error).message) }
  }}>
    <Field label="Descrição" value={item.description} change={description => patch({ description })} required/>
    <div className="form-grid"><Select label="Categoria" value={item.category} options={options(categories)} change={category => patch({ category })}/><MoneyField label="Valor" value={item.amount} change={amount => patch({ amount })}/><Field label="Data da despesa" value={item.date} change={date => patch({ date })} type="date" required/><Select label="Situação" value={paid ? 'Paga' : 'Pendente'} change={s => setPaid(s === 'Paga')} options={options(['Pendente', 'Paga'])}/>
    {paid && <Field label="Data do pagamento" value={item.paidOn} change={paidOn => patch({ paidOn })} type="date" required/>}</div>
    {error && <p className="red" role="alert">{error}</p>}<button className="button primary" disabled={busy}>Salvar despesa</button>
  </form></Modal>
}

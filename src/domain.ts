export const stages = ['Caixaria', 'Pintura', 'Ferragem', 'Instalação'] as const
export const destinations = [...stages, 'Material vendido', 'Entrada geral'] as const
export const statuses = ['Aguardando', 'Em produção', 'Finalizada', 'Entregue'] as const
export const methods = ['Pix', 'Dinheiro', 'Cartão', 'Transferência'] as const
export type Destination = typeof destinations[number]
export type Material = { id: string; name: string; qty: number; unit: string; cost: number; paidOn?: string }
export type Product = { id: string; name: string; qty: number; cost: number; price: number; paidOn?: string }
export type Staff = { id: string; name: string; active: boolean }
export type LaborPayment = { id: string; staffId: string; date: string; amount: number; note: string }
export type Stage = { staffId: string; charge: number; labor: number; materials: Material[]; payments: LaborPayment[] }
export type Allocation = { destination: Destination; amount: number }
export type Payment = { id: string; date: string; amount: number; method: typeof methods[number]; allocations: Allocation[]; note: string }
export type Return = { id: string; productId: string; qty: number; date: string; reason: string; refund: number; credit: number }
export type Order = {
  id: string; number: number; customer: string; phone: string; description: string
  created: string; expected: string; completed: string; due: string; status: typeof statuses[number]
  stages: Record<typeof stages[number], Stage>; products: Product[]; payments: Payment[]; returns: Return[]
  audit: { date: string; note: string; previous?: unknown }[]
}
export type Expense = { id: string; description: string; category: string; amount: number; date: string; paidOn: string }
export type Data = { orders: Order[]; staff: Staff[]; expenses: Expense[] }
export const id = () => globalThis.crypto.randomUUID()
export const today = () => new Date().toLocaleDateString('sv-SE')
export const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100)
export const formatDate = (value: string) => value ? value.split('-').reverse().join('/') : '—'
export const code = (number: number) => '#' + String(number).padStart(4, '0')
export const sum = <T>(items: T[], select: (item: T) => number) => items.reduce((acc, item) => acc + select(item), 0)
const milli = (qty: number) => Math.round(qty * 1000)
export const lineTotal = (qty: number, cents: number) => Math.round(milli(qty) * cents / 1000)
const quantity = (qty: number) => qty > 0 && qty <= 1_000_000 && milli(qty) / 1000 === qty
export const empty = (): Data => ({ orders: [], staff: [], expenses: [] })
export function newOrder(number: number): Order {
  const stage = (): Stage => ({ staffId: '', charge: 0, labor: 0, materials: [], payments: [] })
  return {
    id: id(), number, customer: '', phone: '', description: '', created: today(), expected: '', completed: '', due: '', status: 'Aguardando',
    stages: { Caixaria: stage(), Pintura: stage(), Ferragem: stage(), Instalação: stage() },
    products: [], payments: [], returns: [], audit: [],
  }
}
export function stageTotals(stage: Stage) {
  const materials = sum(stage.materials, m => lineTotal(m.qty, m.cost))
  const paid = sum(stage.payments, p => p.amount)
  return { materials, paid, owed: stage.labor - paid, cost: stage.labor + materials, profit: stage.charge - stage.labor - materials }
}
export function returned(order: Order, productId: string) {
  return sum(order.returns.filter(r => r.productId === productId), r => milli(r.qty)) / 1000
}
export function orderTotals(order: Order) {
  const work = Object.values(order.stages)
  const sold = sum(order.products, p => lineTotal(p.qty - returned(order, p.id), p.price))
  const goods = sum(order.products, p => lineTotal(p.qty - returned(order, p.id), p.cost))
  const stageMaterials = sum(work, s => stageTotals(s).materials)
  const labor = sum(work, s => s.labor)
  const laborPaid = sum(work, s => stageTotals(s).paid)
  const received = sum(order.payments, p => p.amount)
  const refunds = sum(order.returns, r => r.refund)
  const credits = sum(order.returns, r => r.credit)
  const charged = sum(work, s => s.charge) + sold
  const materials = stageMaterials + goods
  return { charged, sold, goods, stageMaterials, materials, labor, laborPaid, owed: labor - laborPaid, received, refunds, credits, balance: charged - received + refunds + credits, profit: charged - materials - labor }
}
export function paymentStatus(order: Order) {
  const { balance } = orderTotals(order)
  if (balance < 0) return { label: 'Crédito do cliente', tone: 'amber' }
  if (balance === 0) return { label: 'Quitado', tone: 'green' }
  if (order.due && order.due < today()) return { label: 'Em atraso', tone: 'red' }
  return { label: 'Pendente', tone: 'amber' }
}
export function receivedFor(order: Order, destination: Destination) {
  return sum(order.payments, p => sum(p.allocations.filter(a => a.destination === destination), a => a.amount))
}
const cents = (value: number) => Number.isSafeInteger(value) && value >= 0
export function addPayment(order: Order, payment: Payment, editing = false, auditDate = new Date().toISOString()): Order {
  const exists = order.payments.find(p => p.id === payment.id)
  if (Boolean(exists) !== editing) throw new Error('Pagamento já registrado ou indisponível.')
  const other = order.payments.filter(p => p.id !== payment.id)
  if (!payment.date || !cents(payment.amount) || payment.amount === 0) throw new Error('Informe a data e um valor positivo.')
  if (payment.allocations.some(a => !destinations.includes(a.destination) || !cents(a.amount))) throw new Error('Distribuição inválida.')
  const rest = payment.amount - sum(payment.allocations, a => a.amount)
  if (rest < 0) throw new Error('A distribuição excede o pagamento.')
  if (payment.amount > orderTotals({ ...order, payments: other }).balance) throw new Error('O pagamento excede o saldo a receber.')
  const allocations = payment.allocations.filter(a => a.amount > 0)
  if (rest) allocations.push({ destination: 'Entrada geral', amount: rest })
  const normalized = destinations.map(destination => ({ destination, amount: sum(allocations.filter(a => a.destination === destination), a => a.amount) })).filter(a => a.amount)
  return {
    ...order, payments: [...other, { ...payment, allocations: normalized }],
    audit: exists ? [...order.audit, { date: auditDate, note: 'Pagamento corrigido', previous: exists }] : order.audit,
  }
}
export function addReturn(order: Order, entry: Return): Order {
  const p = order.products.find(p => p.id === entry.productId)
  if (!p || !entry.date || !quantity(entry.qty) || milli(entry.qty) + milli(returned(order, p.id)) > milli(p.qty) || order.returns.some(r => r.id === entry.id)) throw new Error('Confira o produto, a data e a quantidade disponível.')
  const totals = orderTotals(order)
  const afterReturn = orderTotals({ ...order, returns: [...order.returns, { ...entry, refund: 0, credit: 0 }] })
  const paidPortion = Math.min(totals.charged - afterReturn.charged, Math.max(0, -afterReturn.balance))
  if (!cents(entry.refund) || !cents(entry.credit) || entry.refund + entry.credit > paidPortion) throw new Error('O reembolso e o crédito excedem a parte paga da devolução.')
  return { ...order, returns: [...order.returns, entry] }
}
export function validateOrder(order: Order) {
  if (!order.customer.trim() || !order.description.trim() || !order.created) throw new Error('Preencha cliente, descrição e data de cadastro.')
  if (['Finalizada', 'Entregue'].includes(order.status) && (!order.completed || order.completed < order.created)) throw new Error('Informe uma data de conclusão válida.')
  for (const stage of Object.values(order.stages)) {
    if (!cents(stage.charge) || !cents(stage.labor) || (stage.labor > 0 && !stage.staffId) || stageTotals(stage).owed < 0) throw new Error('Confira os valores e o funcionário de cada etapa.')
    if (stage.materials.some(m => !m.name.trim() || !quantity(m.qty) || !cents(m.cost))) throw new Error('Confira os nomes, quantidades e custos dos materiais.')
  }
  if (order.products.some(p => !p.name.trim() || !quantity(p.qty) || p.qty < returned(order, p.id) || !cents(p.cost) || !cents(p.price))) throw new Error('Confira os produtos vendidos.')
  const totals = orderTotals(order)
  const gross = sum(Object.values(order.stages), s => s.charge) + sum(order.products, p => lineTotal(p.qty, p.price))
  if (totals.refunds + totals.credits > totals.received) throw new Error('Reembolsos e créditos excedem o valor recebido.')
  for (const p of order.products) {
    const adjustments = sum(order.returns.filter(r => r.productId === p.id), r => r.refund + r.credit)
    if (adjustments > lineTotal(p.qty, p.price) - lineTotal(p.qty - returned(order, p.id), p.price)) throw new Error('O preço informado é incompatível com as devoluções registradas.')
  }
  if (totals.received > gross) throw new Error('Os valores cobrados ficaram abaixo dos pagamentos registrados.')
}
export function report(data: Data, period: string) {
  const inPeriod = (date?: string) => !!date && date.startsWith(period)
  const completed = data.orders.filter(o => ['Finalizada', 'Entregue'].includes(o.status) && inPeriod(o.completed))
  const totals = completed.map(orderTotals)
  const sold = sum(totals, t => t.charged)
  const materials = sum(totals, t => t.stageMaterials)
  const goods = sum(totals, t => t.goods)
  const labor = sum(totals, t => t.labor)
  const expenses = sum(data.expenses.filter(e => inPeriod(e.date)), e => e.amount)
  const received = sum(data.orders, o => sum(o.payments.filter(p => inPeriod(p.date)), p => p.amount))
  const refunds = sum(data.orders, o => sum(o.returns.filter(r => inPeriod(r.date)), r => r.refund))
  const paidLabor = sum(data.orders, o => sum(Object.values(o.stages), s => sum(s.payments.filter(p => inPeriod(p.date)), p => p.amount)))
  const paidMaterials = sum(data.orders, o => sum([...Object.values(o.stages).flatMap(s => s.materials), ...o.products].filter(m => inPeriod(m.paidOn)), m => lineTotal(m.qty, m.cost)))
  const paidExpenses = sum(data.expenses.filter(e => inPeriod(e.paidOn)), e => e.amount)
  const cashOut = refunds + paidLabor + paidMaterials + paidExpenses
  const open = sum(data.orders.filter(o => o.created <= period + (period.length === 4 ? '-12-31' : '-31')), o => {
    const asOf = { ...o, payments: o.payments.filter(p => p.date.slice(0, period.length) <= period), returns: o.returns.filter(r => r.date.slice(0, period.length) <= period) }
    return Math.max(0, orderTotals(asOf).balance)
  })
  return { sold, materials, goods, labor, expenses, received, refunds, paidLabor, paidMaterials, paidExpenses, cashOut, cash: received - cashOut, result: sold - materials - goods - labor - expenses, open, count: completed.length }
}

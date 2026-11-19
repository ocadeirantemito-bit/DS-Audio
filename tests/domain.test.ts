import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addPayment, addReturn, empty, id, lineTotal, newOrder, orderTotals, receivedFor, report, stageTotals, validateOrder, type Order, type Payment } from '../src/domain'
import { readDemo, writeDemo } from '../src/store'

const date = '2026-02-10'
function fixture(): Order {
  const order = { ...newOrder(1), customer: 'Cliente', description: 'Caixa e instalação', created: '2026-01-20', completed: date, status: 'Finalizada' as const }
  order.stages.Caixaria = { staffId: id(), charge: 120000, labor: 25000, payments: [], materials: [{ id: id(), name: 'Compensado', qty: 2.5, unit: 'folha', cost: 18000, paidOn: '2026-01-23' }] }
  order.stages.Instalação.charge = 20000
  order.products = [{ id: id(), name: 'Cabo', qty: 2, cost: 3000, price: 5000 }]
  return order
}
const payment = (amount: number): Payment => ({ id: id(), date, amount, method: 'Pix', note: '', allocations: [] })

test('materiais fracionários, etapas e lucro total', () => {
  const order = fixture()
  assert.equal(lineTotal(.145, 100), 15)
  assert.equal(stageTotals(order.stages.Caixaria).materials, 45000)
  assert.equal(stageTotals(order.stages.Caixaria).profit, 50000)
  assert.equal(orderTotals(order).profit, 74000)
  assert.equal(orderTotals(order).charged, 150000)
  assert.equal(orderTotals(order).materials, 51000)
  validateOrder(order)
})
test('pagamento parcial e distribuição com entrada geral', () => {
  const p = payment(50000)
  p.allocations = [{ destination: 'Caixaria', amount: 30000 }, { destination: 'Instalação', amount: 15000 }]
  const order = addPayment(fixture(), p)
  assert.equal(orderTotals(order).received, 50000)
  assert.equal(orderTotals(order).balance, 100000)
  assert.equal(receivedFor(order, 'Caixaria'), 30000)
  assert.equal(receivedFor(order, 'Entrada geral'), 5000)
  assert.equal(orderTotals(order).profit, 74000)
})
test('bloqueia repetição, excesso, valor negativo e distribuição indevida', () => {
  const p = payment(60000)
  const order = addPayment(fixture(), p)
  assert.throws(() => addPayment(order, p), /já registrado/)
  assert.throws(() => addPayment(order, payment(90001)), /saldo/)
  assert.throws(() => addPayment(order, payment(-1)), /positivo/)
  assert.throws(() => addPayment(order, { ...payment(5), allocations: [{ destination: 'Ferragem', amount: 10 }] }), /distribuição/)
})
test('corrige pagamento com a versão anterior no histórico', () => {
  const p = payment(60000)
  const order = addPayment(fixture(), p)
  const edited = addPayment(order, { ...p, amount: 50000 }, true)
  assert.equal(edited.payments.length, 1)
  assert.equal(edited.audit.length, 1)
  assert.equal(orderTotals(edited).received, 50000)
})
test('adiantamento a funcionário reduz dívida sem reduzir lucro novamente', () => {
  const o = fixture()
  const s = o.stages.Caixaria
  s.payments.push({ id: id(), staffId: s.staffId, amount: 12000, date, note: 'Adiantamento' })
  assert.equal(stageTotals(s).owed, 13000)
  assert.equal(orderTotals(o).profit, 74000)
  assert.equal(orderTotals(o).owed, 13000)
})
test('excluir material reduz custo e atualiza o lucro', () => {
  const o = fixture()
  o.stages.Caixaria.materials = []
  assert.equal(stageTotals(o.stages.Caixaria).cost, 25000)
  assert.equal(orderTotals(o).profit, 119000)
})
test('devolução parcial com reembolso mantém recebimento original e diminui venda uma vez', () => {
  const o = addPayment(fixture(), payment(150000))
  const r = { id: id(), productId: o.products[0].id, qty: 1, date, reason: 'Devolução', refund: 5000, credit: 0 }
  const next = addReturn(o, r)
  assert.equal(orderTotals(next).received, 150000)
  assert.equal(orderTotals(next).charged, 145000)
  assert.equal(orderTotals(next).goods, 3000)
  assert.equal(orderTotals(next).balance, 0)
  assert.equal(orderTotals(next).profit, 72000)
  assert.throws(() => addReturn(next, { ...r, id: id(), qty: 2 }), /quantidade/)
  assert.throws(() => addReturn(next, { ...r, id: id(), refund: 5001 }), /excedem/)
  const credit = addReturn(o, { ...r, refund: 0, credit: 5000 })
  assert.equal(orderTotals(credit).credits, 5000)
  assert.equal(report({ ...empty(), orders: [credit] }, '2026-02').cash, 150000)
})
test('resultado mensal e anual usam conclusão e separam recebimentos e custos pagos', () => {
  const o = addPayment(fixture(), { ...payment(50000), date: '2026-01-27' })
  const s = o.stages.Caixaria
  s.payments.push({ id: id(), staffId: s.staffId, amount: 10000, date, note: '' })
  const data = { ...empty(), orders: [o], expenses: [{ id: id(), description: 'Aluguel', category: 'Aluguel', amount: 11000, date, paidOn: '2026-03-01' }] }
  assert.equal(report(data, '2026-01').sold, 0)
  assert.equal(report(data, '2026-01').cash, 5000)
  assert.equal(report(data, '2026-02').result, 63000)
  assert.equal(report(data, '2026-02').cash, -10000)
  assert.equal(report(data, '2026-03').cash, -11000)
  assert.equal(report(data, '2026').result, 63000)
  assert.equal(report(data, '2026').cash, -16000)
  assert.equal(report(data, '2026').count, 1)
})
test('salva e recupera dados fictícios e rejeita gravações concorrentes obsoletas', () => {
  const values = new Map<string, string>()
  const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v) } }
  const start = readDemo(storage)
  assert.ok(start.data.orders.length)
  const changed = { ...start, data: { ...start.data, orders: [fixture()] } }
  assert.deepEqual(readDemoAfterWrite(), { revision: 1, data: changed.data })
  assert.throws(() => writeDemo(storage, changed), /dados mudaram/)
  function readDemoAfterWrite() {
    writeDemo(storage, changed)
    return readDemo(storage)
  }
})

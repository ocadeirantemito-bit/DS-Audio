import { addPayment, id, newOrder, today, type Data } from './domain'
export function demo(): Data {
  const date = today()
  const month = date.slice(0, 7)
  const staff = ['Marcos Lima', 'Rafael Costa', 'Diego Santos'].map(name => ({ id: id(), name, active: true }))
  const order = {
    ...newOrder(24), customer: 'Lucas Almeida', phone: '(92) 99124-5080',
    description: 'Caixa trio para 2 subwoofers de 12" com acabamento preto', created: month + '-01',
    expected: month + '-28', due: month + '-28', status: 'Em produção' as const,
  }
  order.stages.Caixaria = { staffId: staff[0].id, charge: 125000, labor: 28000, payments: [], materials: [
    { id: id(), name: 'Compensado naval 18 mm', qty: 2, unit: 'folha', cost: 18500 },
    { id: id(), name: 'Cola de madeira', qty: 1, unit: 'unidade', cost: 4500 },
  ] }
  order.stages.Pintura = { staffId: staff[1].id, charge: 48000, labor: 12000, payments: [], materials: [] }
  order.stages.Ferragem.charge = 22000
  order.stages.Instalação = { staffId: staff[2].id, charge: 65000, labor: 18000, payments: [], materials: [] }
  const done = { ...newOrder(23), customer: 'Beatriz Nunes', phone: '(92) 99440-7300', description: 'Caixa selada com instalação', created: month + '-01', completed: date, status: 'Finalizada' as const }
  done.stages.Caixaria.charge = 165000
  done.stages.Caixaria.materials.push({ id: id(), name: 'Compensado naval 18 mm', qty: 2, unit: 'folha', cost: 18500, paidOn: date })
  return {
    staff, expenses: [{ id: id(), description: 'Energia da oficina', category: 'Energia elétrica', amount: 21000, date, paidOn: date }],
    orders: [addPayment(order, { id: id(), date, amount: 90000, method: 'Pix', note: 'Sinal da encomenda', allocations: [{ destination: 'Caixaria', amount: 60000 }, { destination: 'Instalação', amount: 30000 }] }), addPayment(done, { id: id(), date, amount: 100000, method: 'Transferência', note: '', allocations: [] })],
  }
}

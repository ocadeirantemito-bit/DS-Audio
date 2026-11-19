import { destinations, methods, stages, statuses, sum, validateOrder, type Data } from './domain'

type RecordValue = Record<string, unknown>
type Check = (value: unknown) => boolean
export const maxBackupBytes = 20 * 1024 * 1024
const format = 'ds-audio-gestao'
const isObject = (value: unknown): value is RecordValue => !!value && typeof value === 'object' && !Array.isArray(value)
const object = (value: unknown, fields: Record<string, Check>) =>
  isObject(value) && Object.keys(value).every(key => Object.hasOwn(fields, key))
    && Object.entries(fields).every(([key, check]) => check(value[key]))
const list = (item: Check): Check => value => Array.isArray(value) && value.every(item)
const text: Check = value => typeof value === 'string'
const name: Check = value => typeof value === 'string' && value.trim().length > 0
const uuid: Check = value => typeof value === 'string' && /^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value)
const cents: Check = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const positive: Check = value => cents(value) && (value as number) > 0
const quantity: Check = value => typeof value === 'number' && value > 0 && value <= 1_000_000 && Math.round(value * 1000) / 1000 === value
const pick = (values: readonly string[]): Check => value => typeof value === 'string' && values.includes(value)
const date: Check = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !value.startsWith('0000') && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
const isoTime: Check = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value
const blank = (check: Check): Check => value => value === '' || check(value)
const optional = (check: Check): Check => value => value === undefined || check(value)
const material = (value: unknown) => object(value, { id: uuid, name, qty: quantity, unit: pick(['folha', 'metro', 'litro', 'unidade', 'quilograma', 'outra']), cost: cents, paidOn: optional(blank(date)) })
const product = (value: unknown) => object(value, { id: uuid, name, qty: quantity, cost: cents, price: cents, paidOn: optional(blank(date)) })
const payment = (value: unknown) => object(value, {
  id: uuid, date, method: pick(methods), amount: positive, note: text,
  allocations: list(item => object(item, { destination: pick(destinations), amount: positive })),
})
const stage = (value: unknown) => object(value, {
  staffId: blank(uuid), charge: cents, labor: cents, materials: list(material),
  payments: list(item => object(item, { id: uuid, staffId: uuid, date, amount: positive, note: text })),
})
const order = (value: unknown) => object(value, {
  id: uuid, number: value => positive(value) && (value as number) <= 2147483647,
  customer: name, phone: text, description: name, created: date, expected: blank(date), completed: blank(date), due: blank(date), status: pick(statuses),
  stages: item => object(item, Object.fromEntries(stages.map(key => [key, stage]))),
  products: list(product), payments: list(payment),
  returns: list(item => object(item, { id: uuid, productId: uuid, qty: quantity, date, reason: text, refund: cents, credit: cents })),
  audit: list(item => object(item, { date: isoTime, note: text, previous: optional(previous => material(previous) || product(previous) || payment(previous)) })),
})
function unique<T>(items: T[]) {
  if (items.length !== new Set(items).size) throw new Error('O backup contém registros duplicados.')
}
function validateData(value: unknown): Data {
  if (!object(value, {
    orders: list(order),
    staff: list(item => object(item, { id: uuid, name, active: state => typeof state === 'boolean' })),
    expenses: list(item => object(item, { id: uuid, description: name, category: text, amount: positive, date, paidOn: blank(date) })),
  })) throw new Error('O backup contém campos inválidos ou incompletos.')

  const data = value as Data
  const staffIds = data.staff.map(s => s.id.toLowerCase())
  const allStages = data.orders.flatMap(o => Object.values(o.stages))
  unique(staffIds)
  unique(data.expenses.map(e => e.id.toLowerCase()))
  unique(data.orders.map(o => o.id.toLowerCase()))
  unique(data.orders.map(o => o.number))
  unique(allStages.flatMap(s => s.materials.map(m => m.id.toLowerCase())))
  unique(allStages.flatMap(s => s.payments.map(p => p.id.toLowerCase())))
  unique(data.orders.flatMap(o => o.payments.map(p => p.id.toLowerCase())))
  unique(data.orders.flatMap(o => o.returns.map(r => r.id.toLowerCase())))
  for (const o of data.orders) {
    unique(o.products.map(p => p.id.toLowerCase()))
    for (const s of Object.values(o.stages)) {
      if ((s.staffId && !staffIds.includes(s.staffId.toLowerCase())) || s.payments.some(p => p.staffId !== s.staffId)) {
        throw new Error('O backup contém vínculos inválidos com funcionários.')
      }
    }
    for (const p of o.payments) {
      unique(p.allocations.map(a => a.destination))
      if (sum(p.allocations, a => a.amount) !== p.amount) throw new Error('O backup contém um pagamento com distribuição inválida.')
    }
    if (o.returns.some(r => !o.products.some(p => p.id === r.productId))) throw new Error('O backup contém uma devolução sem produto correspondente.')
    validateOrder(o)
  }
  return data
}

async function digest(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
}
export async function createBackup(data: Data, createdAt = new Date().toISOString()) {
  const payload = { format, version: 1, createdAt, data: validateData(data) }
  const json = JSON.stringify({ ...payload, checksum: await digest(payload) }, null, 2)
  if (new Blob([json]).size > maxBackupBytes) throw new Error('O backup excede 20 MB. Use o backup de banco do Supabase.')
  return json
}
export async function readBackup(content: string) {
  let raw: unknown
  try {
    raw = JSON.parse(content)
  } catch {
    throw new Error('O arquivo não contém um JSON válido.')
  }
  if (!isObject(raw) || raw.format !== format || raw.version !== 1 || !isoTime(raw.createdAt)
    || typeof raw.checksum !== 'string' || !/^[a-f0-9]{64}$/.test(raw.checksum)
    || Object.keys(raw).length !== 5 || !Object.hasOwn(raw, 'data')) throw new Error('O arquivo não é um backup compatível do DS Audio Gestão.')
  const payload = { format, version: 1, createdAt: raw.createdAt as string, data: raw.data }
  if (await digest(payload) !== raw.checksum) throw new Error('A verificação de integridade falhou. Selecione o arquivo original.')
  return { createdAt: payload.createdAt, data: validateData(payload.data) }
}

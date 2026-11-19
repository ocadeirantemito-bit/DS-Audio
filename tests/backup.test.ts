import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createBackup, readBackup } from '../src/backup'
import { demo } from '../src/demo'
import { id } from '../src/domain'

test('backup JSON preserva registros e rejeita alterações no conteúdo e versões desconhecidas', async () => {
  const data = demo()
  const text = await createBackup(data, '2026-01-18T10:00:00.000Z')
  assert.deepEqual(await readBackup(text), { data, createdAt: '2026-01-18T10:00:00.000Z' })
  const snapshot = JSON.parse(text)
  snapshot.data.orders[0].customer = 'Modificado'
  await assert.rejects(readBackup(JSON.stringify(snapshot)), /integridade/)
  snapshot.version = 2
  await assert.rejects(readBackup(JSON.stringify(snapshot)), /compatível/)
  await assert.rejects(readBackup('{'), /JSON válido/)
})

test('backup recusa duplicidades, vínculos órfãos e campos inesperados mesmo com checksum válido', async () => {
  const payload = { format: 'ds-audio-gestao', version: 1, createdAt: '2026-01-18T10:00:00.000Z', data: demo() }
  const encode = () => JSON.stringify({ ...payload, checksum: createHash('sha256').update(JSON.stringify(payload)).digest('hex') })
  const order = payload.data.orders[0]
  const originalStaff = order.stages.Caixaria.staffId
  order.stages.Caixaria.staffId = id()
  await assert.rejects(readBackup(encode()), /funcionários/)
  order.stages.Caixaria.staffId = originalStaff
  payload.data.orders.push(order)
  await assert.rejects(readBackup(encode()), /duplicados/)
  payload.data.orders.pop()
  order.payments[0].allocations[0].amount++
  await assert.rejects(readBackup(encode()), /distribuição/)
  order.payments[0].allocations[0].amount--
  Object.assign(payload.data, { token: 'exemplo' })
  await assert.rejects(readBackup(encode()), /campos/)
})

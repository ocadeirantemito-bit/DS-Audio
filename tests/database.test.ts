import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { createBackup, readBackup } from '../src/backup'
import { demo } from '../src/demo'
import { addPayment, addReturn, id, orderTotals, stageTotals, today } from '../src/domain'

test('PostgreSQL grava, reverte falhas, isola usuários e recupera registros em outra instância', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key, raw_app_meta_data jsonb not null default '{}');
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      insert into auth.users values ('00000000-0000-4000-a000-000000000001', '{"ds_audio_owner":true}'), ('00000000-0000-4000-a000-000000000002', '{}');
    `)
    await db.exec(await readFile(new URL('../supabase/001_workspace.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../supabase/002_retry_safe_writes.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../supabase/003_owner_restore.sql', import.meta.url), 'utf8'))
    const data = demo()
    const date = today()
    const order = data.orders[0]
    const product = { id: id(), name: 'Terminal', qty: 2, cost: 300, price: 900 }
    order.products.push(product)
    order.stages.Caixaria.payments.push({ id: id(), staffId: order.stages.Caixaria.staffId, date, amount: 1000, note: 'Adiantamento' })
    const paid = addPayment(order, { id: id(), date, amount: orderTotals(order).balance, method: 'Dinheiro', note: '', allocations: [] })
    data.orders[0] = addReturn(paid, { id: id(), productId: product.id, date, qty: 1, reason: '', refund: 900, credit: 0 })
    await db.exec("set role authenticated; set request.jwt.claim.sub = '00000000-0000-4000-a000-000000000001'")
    const save = (payload: typeof data, revision: number, writeId = id()) => db.query<{ revision: number }>(
      'select public.save_workspace($1::jsonb, $2::bigint, $3::uuid) as revision',
      [JSON.stringify(payload), revision, writeId],
    )
    const restore = (payload: typeof data, revision: number, writeId = id()) => db.query<{ revision: number }>(
      'select public.restore_workspace($1::jsonb, $2::bigint, $3::uuid) as revision',
      [JSON.stringify(payload), revision, writeId],
    )
    const load = async () => (await db.query<{ state: { revision: number; data: typeof data } }>('select public.load_workspace() as state')).rows[0].state
    const writeId = id()
    assert.equal((await save(data, 0, writeId)).rows[0].revision, 1)
    assert.equal((await save(data, 0, writeId)).rows[0].revision, 1)
    await assert.rejects(db.query('select public.save_workspace($1::jsonb, $2::bigint)', [JSON.stringify(data), 1]), /permission denied/)
    const changed = structuredClone(data)
    changed.orders[0].description = 'Mudou durante uma tentativa'
    await assert.rejects(save(changed, 0, writeId), /tentativa anterior/)
    const current = await load()
    assert.equal(current.revision, 1)
    assert.equal(current.data.orders[0].customer, data.orders[0].customer)
    assert.deepEqual(orderTotals(current.data.orders[0]), orderTotals(data.orders[0]))
    assert.equal(stageTotals(current.data.orders[0].stages.Caixaria).paid, 1000)
    assert.deepEqual(current.data.staff.map(s => s.id).sort(), data.staff.map(s => s.id).sort())
    assert.deepEqual(current.data.expenses, data.expenses)
    assert.deepEqual(current.data.orders[0].products.map(p => p.id), [product.id])
    assert.equal(current.data.orders[0].returns[0].refund, 900)
    assert.equal(current.data.orders[0].stages.Caixaria.materials.length, 2)
    assert.equal(current.data.orders[0].payments.length, data.orders[0].payments.length)
    const excessiveRefund = structuredClone(data)
    excessiveRefund.orders[0].returns[0].refund++
    await assert.rejects(save(excessiveRefund, 1), /devoluções/)
    const invalid = structuredClone(data)
    invalid.orders[0].payments[0].allocations[0].amount++
    await assert.rejects(save(invalid, 1), /distribuídos/)
    await assert.rejects(save(data, 0), /dados mudaram/)
    await assert.rejects(db.exec('delete from public.orders'), /permission denied/)
    assert.deepEqual(await load(), current)
    const exported = await createBackup(current.data)
    const fromFile = await readBackup(exported)
    await assert.rejects(restore(invalid, 1), /distribuídos/)
    assert.deepEqual(await load(), current)
    await save(changed, 1)
    await assert.rejects(restore(fromFile.data, 1), /dados mudaram/)
    const restoreId = id()
    assert.equal((await restore(fromFile.data, 2, restoreId)).rows[0].revision, 3)
    assert.equal((await restore(fromFile.data, 2, restoreId)).rows[0].revision, 3)
    const afterRestore = { revision: 3, data: current.data }
    assert.deepEqual(await load(), afterRestore)
    await db.exec("set request.jwt.claim.sub = '00000000-0000-4000-a000-000000000002'")
    assert.deepEqual(await load(), { revision: 0, data: { orders: [], staff: [], expenses: [] } })
    assert.deepEqual((await db.query('select * from public.orders')).rows, [])
    await assert.rejects(restore(data, 0), /proprietário/)
    await db.exec('set role anon')
    await assert.rejects(save(data, 0), /permission denied/)
    await assert.rejects(restore(data, 0), /permission denied/)
    await assert.rejects(db.query('select public.load_workspace()'), /permission denied/)

    await db.exec('reset role')
    const backup = await db.dumpDataDir()
    const restored = new PGlite({ loadDataDir: backup })
    try {
      await restored.exec("set role authenticated; set request.jwt.claim.sub = '00000000-0000-4000-a000-000000000001'")
      const recovered = await restored.query<{ state: typeof current }>('select public.load_workspace() as state')
      assert.deepEqual(recovered.rows[0].state, afterRestore)
    } finally {
      await restored.close()
    }
  } finally {
    await db.close()
  }
})

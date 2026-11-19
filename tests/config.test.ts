import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validSupabaseConfig } from '../supabase-config'

test('aceita chave publicável e anon, recusa chaves privilegiadas e URLs inseguras', () => {
  const url = 'https://projeto.supabase.co'
  const legacy = (role: string) => 'e30.' + Buffer.from(JSON.stringify({ role })).toString('base64url') + '.signature'
  assert.equal(validSupabaseConfig(url, 'sb_publishable_exemplo'), true)
  assert.equal(validSupabaseConfig(url, legacy('anon')), true)
  assert.equal(validSupabaseConfig(url, legacy('service_role')), false)
  assert.equal(validSupabaseConfig(url, 'sb_secret_exemplo'), false)
  assert.equal(validSupabaseConfig('http://projeto.supabase.co', legacy('anon')), false)
  assert.equal(validSupabaseConfig('http://127.0.0.1:54321', 'sb_publishable_exemplo'), true)
  assert.equal(validSupabaseConfig('https://usuario:senha@projeto.supabase.co', legacy('anon')), false)
})

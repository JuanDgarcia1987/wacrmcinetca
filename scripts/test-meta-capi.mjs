#!/usr/bin/env node
/**
 * Prueba directa contra la Conversions API de Meta, sin pasar por el CRM.
 * Envía el mismo payload que `src/lib/meta-conversions.ts` para confirmar
 * si el token y el evento son aceptados.
 *
 * Uso:
 *   META_ACCESS_TOKEN=... META_PIXEL_ID=... node scripts/test-meta-capi.mjs
 *   node scripts/test-meta-capi.mjs --phone +584121234567 --action-source chat
 *
 * Variables:
 *   META_ACCESS_TOKEN  (requerida)
 *   META_PIXEL_ID      (requerida)
 *   META_API_VERSION   (opcional, por defecto v26.0)
 */

import { createHash } from 'crypto'

const args = process.argv.slice(2)
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`)
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback
}

const token = process.env.META_ACCESS_TOKEN
const pixelId = process.env.META_PIXEL_ID
const version = process.env.META_API_VERSION || 'v26.0'
const phone = arg('phone', '+584121234567')
const actionSource = arg('action-source', 'chat')

if (!token || !pixelId) {
  console.error('Faltan META_ACCESS_TOKEN y/o META_PIXEL_ID en el entorno.')
  process.exit(2)
}

// Meta exige hash sobre los dígitos en E.164, sin '+'.
const phoneHash = createHash('sha256')
  .update(phone.replace(/\D/g, ''))
  .digest('hex')

const event = {
  event_name: arg('event-name', 'Lead'),
  event_time: Math.floor(Date.now() / 1000),
  action_source: actionSource,
  user_data: { phone: phoneHash },
  event_id: `test_${Date.now()}`,
}

const payload = { data: [event], access_token: token }
const url = `https://graph.facebook.com/${version}/${pixelId}/events`

console.log('POST', url)
console.log(JSON.stringify({ data: [event] }, null, 2))

const resp = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
})

const body = await resp.text()
console.log(`\nHTTP ${resp.status}`)
console.log(body)

if (!resp.ok) process.exit(1)

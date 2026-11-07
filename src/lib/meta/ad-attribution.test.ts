import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  AD_REF_TTL_DAYS,
  buildFbc,
  consumeAdRef,
  extractAdRefToken,
  generateAdRefToken,
  normalizeAdRefInput,
  stripAdRefToken,
} from './ad-attribution'

describe('generateAdRefToken', () => {
  it('produces 8 characters from the unambiguous alphabet', () => {
    const token = generateAdRefToken()
    expect(token).toHaveLength(8)
    expect(token).toMatch(/^[2-9A-HJ-NP-Z]{8}$/)
  })

  it('does not repeat itself', () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateAdRefToken()))
    expect(seen.size).toBe(50)
  })
})

describe('buildFbc', () => {
  it('uses the fb.1.<ms>.<fbclid> format Meta requires', () => {
    expect(buildFbc('IwAR123', 1700000000000)).toBe('fb.1.1700000000000.IwAR123')
  })
})

describe('extractAdRefToken', () => {
  it('finds the token in the pre-filled message', () => {
    expect(extractAdRefToken('Hola, quiero información. Ref: R7K2X9PQ')).toBe(
      'R7K2X9PQ'
    )
  })

  it('accepts the variants people type by hand', () => {
    expect(extractAdRefToken('hola ref R7K2X9PQ')).toBe('R7K2X9PQ')
    expect(extractAdRefToken('Hola, REF-R7K2X9PQ')).toBe('R7K2X9PQ')
    expect(extractAdRefToken('Hola ref #r7k2x9pq')).toBe('R7K2X9PQ')
  })

  it('returns null when there is no reference', () => {
    expect(extractAdRefToken('Hola, quiero información')).toBeNull()
    expect(extractAdRefToken('')).toBeNull()
    expect(extractAdRefToken(null)).toBeNull()
    // Too short to be a token.
    expect(extractAdRefToken('ref 123')).toBeNull()
  })
})

describe('stripAdRefToken', () => {
  it('removes the reference and keeps the rest readable', () => {
    expect(stripAdRefToken('Hola, quiero información. Ref: R7K2X9PQ')).toBe(
      'Hola, quiero información.'
    )
  })

  it('treats a real-word "ref" as text when it is not followed by a token', () => {
    expect(stripAdRefToken('Hola, quiero información.')).toBe(
      'Hola, quiero información.'
    )
  })

  it('keeps the original when the message is only the reference', () => {
    expect(stripAdRefToken('Ref: R7K2X9PQ')).toBe('Ref: R7K2X9PQ')
  })
})

describe('normalizeAdRefInput', () => {
  it('trims and caps the values', () => {
    const out = normalizeAdRefInput({
      fbclid: `  ${'x'.repeat(600)}  `,
      fbp: 'fb.1.1.abc',
      utmSource: 'facebook',
    })
    expect(out.fbclid).toHaveLength(512)
    expect(out.fbp).toBe('fb.1.1.abc')
    expect(out.utmSource).toBe('facebook')
    expect(out.utmCampaign).toBeNull()
  })

  it('returns nulls for garbage input', () => {
    const out = normalizeAdRefInput('nope')
    expect(out).toEqual({
      fbclid: null,
      fbp: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmContent: null,
      utmTerm: null,
      landingUrl: null,
    })
  })

  it('keeps every utm parameter and the landing URL', () => {
    const out = normalizeAdRefInput({
      utmMedium: 'cpc',
      utmContent: 'video-a',
      utmTerm: 'zapatos',
      landingUrl: 'https://wa.tunegocio.com/?fbclid=abc',
    })
    expect(out.utmMedium).toBe('cpc')
    expect(out.utmContent).toBe('video-a')
    expect(out.utmTerm).toBe('zapatos')
    expect(out.landingUrl).toBe('https://wa.tunegocio.com/?fbclid=abc')
  })
})

describe('consumeAdRef', () => {
  function fakeDb(row: Record<string, unknown> | null) {
    const update = vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ error: null })),
    }))
    const db = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: row, error: null })),
          })),
        })),
        update,
      })),
    } as unknown as SupabaseClient
    return { db, update }
  }

  it('builds fbc from the stored fbclid and creation time', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z')
    const { db } = fakeDb({
      token: 'R7K2X9PQ',
      fbclid: 'IwAR123',
      fbp: 'fb.1.1.abc',
      created_at: createdAt.toISOString(),
      expires_at: new Date('2026-01-08T00:00:00.000Z').toISOString(),
    })

    const out = await consumeAdRef(db, 'R7K2X9PQ', new Date('2026-01-02T00:00:00.000Z'))

    expect(out).toEqual({
      token: 'R7K2X9PQ',
      fbc: `fb.1.${createdAt.getTime()}.IwAR123`,
      fbp: 'fb.1.1.abc',
      clickedAtMs: createdAt.getTime(),
    })
  })

  it('carries the browser IP and User-Agent captured by the landing', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z')
    const { db } = fakeDb({
      token: 'R7K2X9PQ',
      fbclid: 'IwAR123',
      fbp: null,
      client_ip: '190.12.34.56',
      client_user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',
      created_at: createdAt.toISOString(),
      expires_at: new Date('2026-01-08T00:00:00.000Z').toISOString(),
    })

    const out = await consumeAdRef(db, 'R7K2X9PQ', new Date('2026-01-02T00:00:00.000Z'))

    // Meta las usa como client_ip_address / client_user_agent: son las del
    // navegador del cliente, no las del servidor que sirvió la landing.
    expect(out?.clientIp).toBe('190.12.34.56')
    expect(out?.clientUserAgent).toBe('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')
  })

  it('ignores expired tokens', async () => {
    const { db } = fakeDb({
      token: 'R7K2X9PQ',
      fbclid: 'IwAR123',
      fbp: null,
      created_at: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      expires_at: new Date('2026-01-02T00:00:00.000Z').toISOString(),
    })

    expect(await consumeAdRef(db, 'R7K2X9PQ', new Date('2026-02-01T00:00:00.000Z'))).toBeNull()
  })

  it('returns null for an unknown token', async () => {
    const { db } = fakeDb(null)
    expect(await consumeAdRef(db, 'NOPE1234')).toBeNull()
  })

  it('omits fbc when the row has no fbclid (organic traffic)', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z')
    const { db } = fakeDb({
      token: 'R7K2X9PQ',
      fbclid: null,
      fbp: null,
      created_at: createdAt.toISOString(),
      expires_at: new Date('2026-01-08T00:00:00.000Z').toISOString(),
    })

    const out = await consumeAdRef(db, 'R7K2X9PQ', new Date('2026-01-02T00:00:00.000Z'))
    expect(out).not.toBeNull()
    expect(out?.fbc).toBeUndefined()
    expect(out?.fbp).toBeUndefined()
  })
})

describe('AD_REF_TTL_DAYS', () => {
  it('matches the 7-day default in the migration', () => {
    expect(AD_REF_TTL_DAYS).toBe(7)
  })
})

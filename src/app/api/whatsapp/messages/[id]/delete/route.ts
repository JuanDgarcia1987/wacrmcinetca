import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { decrypt } from '@/lib/whatsapp/encryption'
import { deleteMessage } from '@/lib/whatsapp/meta-api'
import { getT } from '@/lib/i18n/translate'

const t = getT('Api')

// DELETE /api/whatsapp/messages/[id]/delete — delete a sent message for everyone via Meta.
// Requires 'agent' role. Only works for outbound messages (agent/bot) that have a
// Meta message_id (wamid). Meta enforces its own time window (~24-48h) and will
// return an error if the message is too old or not deletable.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent')

    // Per-user rate limit — independent bucket from send/react.
    const limit = checkRateLimit(`message-delete:${userId}`, RATE_LIMITS.send)
    if (!limit.success) {
      return rateLimitResponse(limit)
    }

    const { id } = await params

    // Load the message with its conversation and WhatsApp config.
    const { data: message, error: msgError } = await supabase
      .from('messages')
      .select('*, conversations!inner(account_id)')
      .eq('id', id)
      .eq('conversations.account_id', accountId)
      .maybeSingle()

    if (msgError) {
      console.error('[message-delete] DB error:', msgError)
      return NextResponse.json(
        { error: t('common.internalError') },
        { status: 500 }
      )
    }

    if (!message) {
      return NextResponse.json(
        { error: t('common.messageNotFound') },
        { status: 404 }
      )
    }

    // Only outbound messages (agent/bot) can be deleted for everyone.
    if (message.sender_type !== 'agent' && message.sender_type !== 'bot') {
      return NextResponse.json(
        { error: t('messageDelete.inboundNotAllowed') },
        { status: 400 }
      )
    }

    // Must have a Meta message_id (wamid) to delete.
    if (!message.message_id) {
      return NextResponse.json(
        { error: t('messageDelete.noMetaId') },
        { status: 400 }
      )
    }

    // Load WhatsApp config for this account.
    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('phone_number_id, access_token')
      .eq('account_id', accountId)
      .single()

    if (configError || !config) {
      return NextResponse.json(
        { error: t('whatsapp.notConfigured') },
        { status: 400 }
      )
    }

    const accessToken = decrypt(config.access_token)

    // Call Meta to delete the message.
    try {
      await deleteMessage({
        phoneNumberId: config.phone_number_id,
        accessToken,
        messageId: message.message_id,
      })
    } catch (err) {
      const metaErr = err instanceof Error ? err.message : String(err)
      console.error('[message-delete] Meta delete failed:', metaErr)

      // Surface Meta's error details (time window, not outbound, etc.)
      return NextResponse.json(
        { error: metaErr },
        { status: 502 }
      )
    }

    // Meta succeeded — mark the local row as deleted so the UI updates.
    const { error: updError } = await supabase
      .from('messages')
      .update({
        content_text: t('messageDelete.deletedLabel'),
        status: 'failed', // reuse failed so it renders distinctively; content_text shows "deleted"
        error_title: 'deleted_for_everyone',
      })
      .eq('id', id)

    if (updError) {
      console.error('[message-delete] local update failed:', updError)
      // Don't fail the request — Meta already deleted it.
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in WhatsApp message delete:', error)
    return toErrorResponse(error)
  }
}
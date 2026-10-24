import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendPushToUser, buildTestPushPayload } from '@/lib/push/send';

/**
 * POST /api/push/test - Send test push notification to current user
 */
export async function POST() {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = buildTestPushPayload();
    const result = await sendPushToUser(user.id, payload);

    if (!result.success && result.errors.length > 0 && result.errors[0].error === 'VAPID not configured') {
      return NextResponse.json(
        { error: 'Push not configured. Add VAPID keys to environment variables.' },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: result.success,
      sent: result.sent,
      failed: result.failed,
      errors: result.errors,
    });
  } catch (err) {
    console.error('[Push Test] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
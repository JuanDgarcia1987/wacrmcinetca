import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { WebPushSubscription } from '@/lib/push/types';

/**
 * POST /api/push/subscribe - Save push subscription
 * Body: { endpoint, keys: { p256dh, auth } }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Native Android (FCM): body is { provider: 'fcm', token }.
    if (body?.provider === 'fcm') {
      const token = body.token as string;
      if (!token) {
        return NextResponse.json({ error: 'FCM token required' }, { status: 400 });
      }

      const { error: fcmError } = await supabase
        .from('push_subscriptions')
        .upsert(
          {
            user_id: user.id,
            endpoint: token,
            provider: 'fcm',
            p256dh: null,
            auth: null,
            user_agent: request.headers.get('user-agent'),
          },
          { onConflict: 'user_id,endpoint' }
        );

      if (fcmError) {
        console.error('[Push Subscribe] FCM database error:', fcmError);
        return NextResponse.json({ error: 'Failed to save FCM token' }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    // Browser Web Push: body is { endpoint, keys: { p256dh, auth } }.
    const { endpoint, keys } = body as WebPushSubscription;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json(
        { error: 'Invalid subscription data' },
        { status: 400 }
      );
    }

    // Upsert subscription (unique constraint on user_id + endpoint)
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: user.id,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          provider: 'web',
          user_agent: request.headers.get('user-agent'),
        },
        { onConflict: 'user_id,endpoint' }
      );

    if (error) {
      console.error('[Push Subscribe] Database error:', error);
      return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Push Subscribe] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/push/subscribe - Remove push subscription
 * Body: { endpoint }
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { endpoint } = body as { endpoint: string };

    if (!endpoint) {
      return NextResponse.json({ error: 'Endpoint required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('endpoint', endpoint);

    if (error) {
      console.error('[Push Unsubscribe] Database error:', error);
      return NextResponse.json({ error: 'Failed to remove subscription' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Push Unsubscribe] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
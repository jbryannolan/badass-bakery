import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
  const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:hello@badassbakery.com';

  // GET returns the public VAPID key for client-side subscription
  if (req.method === 'GET') {
    if (!VAPID_PUBLIC_KEY) {
      return res.status(500).json({ error: 'Push not configured' });
    }
    return res.status(200).json({ publicKey: VAPID_PUBLIC_KEY });
  }

  // POST sends a push notification
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.error('VAPID keys not configured');
    return res.status(500).json({ error: 'Push not configured' });
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  try {
    const { title, body, url, admin_email } = req.body;

    if (!admin_email) {
      return res.status(400).json({ error: 'admin_email required' });
    }

    // Get all push subscriptions for this admin
    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_email', admin_email);

    if (error) {
      console.error('Error fetching subscriptions:', error);
      return res.status(500).json({ error: 'Failed to fetch subscriptions' });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return res.status(200).json({ success: true, sent: 0 });
    }

    const payload = JSON.stringify({
      title: title || 'Badass Bakery',
      body: body || 'You have a new notification',
      url: url || '/',
    });

    let sent = 0;
    const expired = [];

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(sub.subscription, payload);
        sent++;
      } catch (pushError) {
        console.error('Push send error:', pushError.statusCode, pushError.message);
        // 410 Gone or 404 = subscription expired, clean it up
        if (pushError.statusCode === 410 || pushError.statusCode === 404) {
          expired.push(sub.id);
        }
      }
    }

    // Clean up expired subscriptions
    if (expired.length > 0) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .in('id', expired);
      console.log(`Cleaned up ${expired.length} expired subscriptions`);
    }

    return res.status(200).json({ success: true, sent });
  } catch (error) {
    console.error('Notification error:', error);
    return res.status(500).json({ error: 'Failed to send notification' });
  }
}

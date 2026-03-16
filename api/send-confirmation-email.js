export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY not configured');
    return res.status(500).json({ error: 'Email not configured' });
  }

  try {
    const order = req.body;

    const formatPrice = (price) => {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price || 0);
    };

    const itemsList = (order.items || [])
      .map(
        (item) =>
          `<tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.emoji} ${item.name}${item.selectedOption ? ` (${item.selectedOption})` : ''}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${formatPrice(item.price * item.quantity)}</td>
          </tr>`
      )
      .join('');

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #1f2937; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="color: #a855f7; margin: 0; font-size: 24px;">🫏 Badass Bakery</h1>
        </div>

        <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb;">
          <h2 style="color: #1f2937; margin-top: 0;">Your order is confirmed! ✅</h2>
          <p style="color: #4b5563;">Hey ${order.customer_name}, Theresa confirmed your order and is getting started. Here's a quick summary:</p>

          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <thead>
              <tr style="background: #e5e7eb;">
                <th style="padding: 8px; text-align: left;">Item</th>
                <th style="padding: 8px; text-align: center;">Qty</th>
                <th style="padding: 8px; text-align: right;">Price</th>
              </tr>
            </thead>
            <tbody>
              ${itemsList}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2" style="padding: 12px 8px; font-weight: bold;">Total</td>
                <td style="padding: 12px 8px; text-align: right; font-weight: bold; color: #a855f7;">${formatPrice(order.total)}</td>
              </tr>
            </tfoot>
          </table>

          <div style="background: #f3e8ff; border: 2px solid #a855f7; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
            <p style="font-size: 18px; font-weight: bold; color: #1f2937; margin: 0 0 8px 0;">
              Pay ${formatPrice(order.total)} via Venmo
            </p>
            <p style="color: #6b7280; margin: 0 0 12px 0;">
              Send to: <strong>@Theresa-Ulrich-5</strong>
            </p>
            <a href="https://venmo.com/Theresa-Ulrich-5"
               style="display: inline-block; background: #008CFF; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
              Open Venmo
            </a>
          </div>

          <p style="color: #6b7280; font-size: 14px;">Thanks for supporting Badass Bakery! 💜</p>
        </div>

        <div style="background: #1f2937; padding: 15px; border-radius: 0 0 8px 8px; text-align: center;">
          <p style="color: #9ca3af; margin: 0; font-size: 12px;">Made with 💜 for friends</p>
        </div>
      </div>
    `;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Badass Bakery <orders@bryannolan.com>',
        to: [order.customer_email],
        subject: '🫏 Your order is confirmed!',
        html,
      }),
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Confirmation email error:', error);
    return res.status(500).json({ error: 'Failed to send confirmation email' });
  }
}

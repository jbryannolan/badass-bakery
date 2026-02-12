export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const THERESA_EMAIL = req.body.admin_email || process.env.THERESA_EMAIL;

  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY not configured');
    return res.status(500).json({ error: 'Email not configured' });
  }

  try {
    const order = req.body;

    const formatPrice = (price) => {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price || 0);
    };

    const generateOrderHTML = (order, forTheresa) => {
      const itemsList = order.items
        .map(
          (item) =>
            `<tr>
              <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.emoji} ${item.name}${item.selectedOption ? ` (${item.selectedOption})` : ''}</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${formatPrice(item.price * item.quantity)}</td>
            </tr>`
        )
        .join('');

      const requestedDate = order.requested_date
        ? new Date(order.requested_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
        : 'Not specified';

      const fulfillmentText = order.fulfillment_type === 'delivery' 
        ? `🚗 Delivery to ${order.delivery_address}`
        : order.fulfillment_type === 'gym'
          ? '🏋️ Gym Pickup (6am)'
          : '📍 Pickup';

      return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #1f2937; padding: 20px; border-radius: 8px 8px 0 0;">
            <h1 style="color: #a855f7; margin: 0; font-size: 24px;">🫏 Badass Bakery</h1>
          </div>
          
          <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb;">
            <h2 style="color: #1f2937; margin-top: 0;">
              ${forTheresa ? `New Order from ${order.customer_name}!` : 'Thanks for your order!'}
            </h2>
            
            ${forTheresa ? `<p><strong>Customer Email:</strong> ${order.customer_email}</p>` : ''}
            
            <p><strong>Requested Date:</strong> ${requestedDate}</p>
            <p><strong>Fulfillment:</strong> ${fulfillmentText}</p>
            
            ${order.note ? `<p><strong>Note:</strong> "${order.note}"</p>` : ''}
            
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
            
            ${!forTheresa ? '<p>Theresa will be in touch soon to confirm your order. Thanks for supporting Badass Bakery! 💜</p>' : ''}
          </div>
          
          <div style="background: #1f2937; padding: 15px; border-radius: 0 0 8px 8px; text-align: center;">
            <p style="color: #9ca3af; margin: 0; font-size: 12px;">Made with 💜 for friends</p>
          </div>
        </div>
      `;
    };

    // Send confirmation email to customer
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Badass Bakery <onboarding@resend.dev>',
        to: [order.customer_email],
        subject: '🫏 Your Badass Bakery Order Confirmation',
        html: generateOrderHTML(order, false),
      }),
    });

    // Send notification email to Theresa
    if (THERESA_EMAIL) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'Badass Bakery <onboarding@resend.dev>',
          to: [THERESA_EMAIL],
          subject: `🫏 New Order from ${order.customer_name}!`,
          html: generateOrderHTML(order, true),
        }),
      });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Email error:', error);
    return res.status(500).json({ error: 'Failed to send email' });
  }
}

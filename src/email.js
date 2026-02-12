export const sendOrderEmails = async (order) => {
  try {
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(order),
    });

    if (!response.ok) {
      throw new Error('Failed to send email');
    }

    console.log('Order emails sent successfully');
  } catch (error) {
    console.error('Failed to send emails:', error);
  }
};

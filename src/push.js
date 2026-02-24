export const sendPushNotification = async ({ title, body, url, admin_email }) => {
  try {
    const response = await fetch('/api/send-notification', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, body, url, admin_email }),
    });

    if (!response.ok) {
      throw new Error('Failed to send push notification');
    }

    const data = await response.json();
    console.log(`Push notifications sent: ${data.sent}`);
    return data;
  } catch (error) {
    console.error('Failed to send push notification:', error);
  }
};

export const getVapidPublicKey = async () => {
  try {
    const response = await fetch('/api/send-notification');
    if (!response.ok) return null;
    const data = await response.json();
    return data.publicKey;
  } catch (error) {
    console.error('Failed to get VAPID key:', error);
    return null;
  }
};

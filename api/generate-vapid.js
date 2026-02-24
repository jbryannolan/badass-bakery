// Run once to generate VAPID keys: node api/generate-vapid.js
// Then add the output as Vercel environment variables:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT

const webpush = require('web-push');
const keys = webpush.generateVAPIDKeys();

console.log('Add these to your Vercel environment variables:\n');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:your-email@example.com`);

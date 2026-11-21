export const SAMPLES = [
  {
    id: 'bank-otp',
    label: 'Bank OTP text',
    text: 'ALERT from your bank: a transfer of 850,000 is waiting. If this was not you, send the one-time code we just texted you in the next 10 minutes or the payment will go through. Reply OTP now to stop it.',
  },
  {
    id: 'job',
    label: 'Fake job offer',
    text: 'Congratulations! You have been selected for a remote data entry job, $450 a day, no experience needed. Pay a $25 registration fee to this wallet to receive your laptop and start today. WhatsApp me to confirm.',
  },
  {
    id: 'crypto',
    label: 'Crypto doubler',
    text: 'Double your Bitcoin in 45 minutes. Send any amount to this wallet and we send back twice as much, guaranteed by our trading bot. Limited slots, first 50 people only. Wallet: 1FakeDoublerAddrDoNotSend',
  },
  {
    id: 'paypal',
    label: 'PayPal locked',
    text: 'Dear customer, your PayPal account has been temporarily locked due to unusual sign-in activity. Verify your account within 24 hours to avoid permanent closure: http://paypa1-secure-login.top/verify\nEnter the one-time code we send you to confirm. Support Team',
  },
];

export function getSample(id) {
  return SAMPLES.find((s) => s.id === id) || null;
}

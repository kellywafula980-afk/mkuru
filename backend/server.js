require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

// Paystack API client
const paystack = axios.create({
  baseURL: process.env.PAYSTACK_API_URL,
  headers: {
    'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json'
  }
});

// ============================================================
//  Initialize Paystack transaction
// ============================================================
app.post('/api/create-checkout', async (req, res) => {
  try {
    const { items, total, currency = 'KES', email } = req.body;
    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }
    if (!email) {
      return res.status(400).json({ error: 'Customer email is required' });
    }

    // Paystack expects amount in the smallest currency unit (cents for KES)
    const amountInCents = Math.round(total * 100);
    const description = items.map(item => `${item.name} (x${item.quantity})`).join(', ');

    const payload = {
      email: email,
      amount: amountInCents,
      currency: currency,
      callback_url: `${process.env.FRONTEND_URL}/?payment=success`,
      metadata: {
        items: items,
        custom_fields: [
          { display_name: "Order Items", variable_name: "order_items", value: description }
        ]
      }
    };

    const response = await paystack.post('/transaction/initialize', payload);

    if (response.data.status) {
      const authorizationUrl = response.data.data.authorization_url;
      res.json({ checkoutUrl: authorizationUrl });
    } else {
      throw new Error(response.data.message || 'Paystack initialization failed');
    }
  } catch (error) {
    console.error('Paystack error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to initialize payment' });
  }
});

// ============================================================
//  Webhook to confirm payment (Paystack sends POST)
// ============================================================
app.post('/api/webhook', async (req, res) => {
  // Verify signature
  const hash = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
                     .update(JSON.stringify(req.body))
                     .digest('hex');
  if (hash !== req.headers['x-paystack-signature']) {
    return res.status(401).send('Unauthorized');
  }

  const event = req.body;
  if (event.event === 'charge.success') {
    console.log('Payment successful:', event.data);
    // Here you would update your order status in a database
  }
  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});

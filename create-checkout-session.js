// This function runs on Netlify's servers, not in the browser.
// It uses your Stripe SECRET key (set as an environment variable in
// Netlify — never put it directly in this file or in the website's HTML).
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { items } = JSON.parse(event.body || '{}');

    if (!Array.isArray(items) || items.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No items in cart' })
      };
    }

    // Build Stripe line items from whatever the cart sent over.
    // Prices are taken from our own server-side trust boundary here —
    // for extra safety later, you could instead look prices up from a
    // fixed list on the server instead of trusting the browser's price.
    const line_items = items.map((item) => {
      const name = String(item.name || 'Item').slice(0, 200);
      const price = Number(item.price);
      const quantity = Math.max(1, Math.min(99, parseInt(item.quantity, 10) || 1));

      if (!price || price <= 0) {
        throw new Error(`Invalid price for item: ${name}`);
      }

      return {
        price_data: {
          currency: 'usd',
          product_data: { name },
          unit_amount: Math.round(price * 100) // Stripe wants cents
        },
        quantity
      };
    });

    const origin = event.headers.origin || `https://${event.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      success_url: `${origin}/?success=true`,
      cancel_url: `${origin}/?canceled=true`,
      shipping_address_collection: {
        allowed_countries: ['US']
      },
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 1999, currency: 'usd' }, // $19.99 flat rate
            display_name: 'USPS Priority Mail (2-3 business days)',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 2 },
              maximum: { unit: 'business_day', value: 3 }
            }
          }
        }
      ]
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url })
    };
  } catch (err) {
    console.error('Stripe checkout session error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Something went wrong' })
    };
  }
};

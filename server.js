require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const QRCode = require('qrcode');
const PaytmChecksum = require('paytmchecksum');
const { v4: uuidv4 } = require('uuid');

const fetch = (...args) =>
  import('node-fetch').then(({ default: fetchFn }) => fetchFn(...args));

const app = express();
const PORT = process.env.PORT || 3000;

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
const LOG_DIR = path.join(ROOT_DIR, 'logs');

const POSTERS_FILE = path.join(DATA_DIR, 'posters.json');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const CUSTOMERS_FILE = path.join(DATA_DIR, 'customers.json');
const OFFERS_FILE = path.join(DATA_DIR, 'offers.json');
const SUBSCRIBERS_FILE = path.join(DATA_DIR, 'subscribers.json');
const LOG_FILE = path.join(LOG_DIR, 'server.log');

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'change-me';
const UPI_VPA = process.env.UPI_VPA || '';
const UPI_NAME = process.env.UPI_NAME || 'Trizoverse';
const PAYTM_MID = process.env.PAYTM_MID || '';
const PAYTM_MERCHANT_KEY = process.env.PAYTM_MERCHANT_KEY || '';
const PAYTM_WEBSITE = process.env.PAYTM_WEBSITE || 'DEFAULT';
const PAYTM_CALLBACK_URL =
  process.env.PAYTM_CALLBACK_URL ||
  `${process.env.BASE_URL || 'http://localhost:' + PORT}/payments/paytm/webhook`;
const PAYTM_ENV = process.env.PAYTM_ENV === 'production' ? 'production' : 'staging';

const MAX_UPLOAD_SIZE_BYTES = Number(process.env.UPLOAD_LIMIT_BYTES || 5 * 1024 * 1024);

for (const dir of [DATA_DIR, UPLOADS_DIR, LOG_DIR, PUBLIC_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args
    .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ')}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch (err) {
    /* ignore logging errors */
  }
  console.log(...args);
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    log('Error reading JSON', filePath, err.message || err);
    return fallback;
  }
}

function writeJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    log('Error writing JSON', filePath, err.message || err);
    return false;
  }
}

function ensureFile(filePath, initialValue) {
  if (!fs.existsSync(filePath)) {
    writeJson(filePath, initialValue);
  }
}

ensureFile(POSTERS_FILE, [1, 3, 5, 4, 7, 9]);
ensureFile(PRODUCTS_FILE, { products: [] });
ensureFile(ORDERS_FILE, { orders: [] });
ensureFile(CUSTOMERS_FILE, { customers: [] });
ensureFile(OFFERS_FILE, { offers: [] });
if (!fs.existsSync(SUBSCRIBERS_FILE)) {
  fs.writeFileSync(SUBSCRIBERS_FILE, '[]', 'utf8');
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const safeExt = path.extname(file.originalname || '').substring(0, 8);
    const finalName = `${Date.now()}-${uuidv4()}${safeExt}`.replace(/[^a-zA-Z0-9.\-_]/g, '');
    cb(null, finalName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG and WEBP formats are allowed'));
    }
    cb(null, true);
  },
});

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(PUBLIC_DIR));

function loadPosters() {
  const posters = readJson(POSTERS_FILE, []);
  return Array.isArray(posters) ? posters : [];
}

function savePosters(arr) {
  return writeJson(POSTERS_FILE, arr);
}

function loadProducts() {
  const data = readJson(PRODUCTS_FILE, { products: [] });
  return Array.isArray(data.products) ? data.products : [];
}

function saveProducts(products) {
  return writeJson(PRODUCTS_FILE, { products });
}

function loadOrders() {
  const data = readJson(ORDERS_FILE, { orders: [] });
  return Array.isArray(data.orders) ? data.orders : [];
}

function saveOrders(orders) {
  return writeJson(ORDERS_FILE, { orders });
}

function loadCustomers() {
  const data = readJson(CUSTOMERS_FILE, { customers: [] });
  return Array.isArray(data.customers) ? data.customers : [];
}

function saveCustomers(customers) {
  return writeJson(CUSTOMERS_FILE, { customers });
}

function loadOffers() {
  const data = readJson(OFFERS_FILE, { offers: [] });
  return Array.isArray(data.offers) ? data.offers : [];
}

function buildUpiLink({ amount, orderId, note }) {
  if (!UPI_VPA) {
    return '';
  }
  const params = new URLSearchParams({
    pa: UPI_VPA,
    pn: UPI_NAME || 'Trizoverse',
    am: Number(amount || 0).toFixed(2),
    tn: note || `Order ${orderId}`,
    cu: 'INR',
  });
  return `upi://pay?${params.toString()}`;
}

async function generateUpiPayload(order) {
  const upiLink = buildUpiLink({
    amount: order.total,
    orderId: order.id,
    note: `Trizoverse Order ${order.id}`,
  });

  if (!upiLink) {
    return { upiLink: '', qrCode: '' };
  }

  try {
    const qrCode = await QRCode.toDataURL(upiLink, { width: 320, margin: 2 });
    return { upiLink, qrCode };
  } catch (err) {
    log('Error generating UPI QR', err.message || err);
    return { upiLink, qrCode: '' };
  }
}

async function createPaytmTransaction({ orderId, amount, customerId }) {
  if (!PAYTM_MID || !PAYTM_MERCHANT_KEY) {
    log('Paytm credentials missing, returning mock transaction token');
    return {
      mode: 'mock',
      orderId,
      txnToken: `mock-token-${orderId}`,
      amount,
      mid: PAYTM_MID || 'mock_mid',
      callbackUrl: PAYTM_CALLBACK_URL,
    };
  }

  const body = {
    requestType: 'Payment',
    mid: PAYTM_MID,
    websiteName: PAYTM_WEBSITE,
    orderId,
    callbackUrl: PAYTM_CALLBACK_URL,
    txnAmount: {
      value: Number(amount || 0).toFixed(2),
      currency: 'INR',
    },
    userInfo: {
      custId: customerId,
    },
  };

  const signature = await PaytmChecksum.generateSignature(
    JSON.stringify(body),
    PAYTM_MERCHANT_KEY
  );

  const host =
    PAYTM_ENV === 'production'
      ? 'https://securegw.paytm.in'
      : 'https://securegw-stage.paytm.in';

  const response = await fetch(
    `${host}/theia/api/v1/initiateTransaction?mid=${PAYTM_MID}&orderId=${orderId}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body, head: { signature } }),
    }
  );

  const json = await response.json();
  const resultInfo = json?.body?.resultInfo;

  if (resultInfo?.resultStatus === 'S' && json.body?.txnToken) {
    return {
      mode: PAYTM_ENV,
      txnToken: json.body.txnToken,
      orderId,
      amount,
      mid: PAYTM_MID,
      callbackUrl: PAYTM_CALLBACK_URL,
    };
  }

  throw new Error(resultInfo?.resultMsg || 'Unable to create Paytm transaction');
}

function requireAdmin(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key || String(key) !== String(ADMIN_API_KEY)) {
    log('Unauthorized admin attempt', { ip: req.ip, path: req.path });
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function calculateCartTotals(items, offers) {
  const products = loadProducts();
  let subtotal = 0;
  const enrichedItems = [];

  for (const item of items) {
    const product = products.find((p) => p.id === item.product_id);
    if (!product) {
      throw new Error(`Invalid product: ${item.product_id}`);
    }
    if (!product.price[item.size]) {
      throw new Error(`Invalid size for product ${item.product_id}`);
    }
    const unitPrice = product.price[item.size];
    const lineTotal = unitPrice * Number(item.quantity || 1);
    subtotal += lineTotal;

    enrichedItems.push({
      product_id: product.id,
      title: product.title,
      size: item.size,
      quantity: Number(item.quantity || 1),
      unit_price: unitPrice,
      line_total: lineTotal,
      custom_artwork: item.custom_artwork || null,
    });
  }

  let discount = 0;
  const activeOffers = offers.filter((offer) => offer.active !== false);

  for (const offer of activeOffers) {
    if (offer.type === 'percentage' && subtotal >= (offer?.conditions?.minSubtotal || 0)) {
      discount += (subtotal * Number(offer.value || 0)) / 100;
    }
    if (offer.type === 'flat' && subtotal >= (offer?.conditions?.minSubtotal || 0)) {
      discount += Number(offer.value || 0);
    }
  }

  const shipping = subtotal >= 999 ? 0 : 79;
  const total = Math.max(subtotal - discount + shipping, 0);

  return {
    subtotal,
    discount,
    shipping,
    total,
    items: enrichedItems,
    offers: activeOffers,
  };
}

function updateOrder(orderId, updater) {
  const orders = loadOrders();
  const idx = orders.findIndex((o) => o.id === orderId);
  if (idx === -1) {
    throw new Error('Order not found');
  }
  const updated = typeof updater === 'function' ? updater(orders[idx]) : { ...orders[idx], ...updater };
  orders[idx] = updated;
  saveOrders(orders);
  return updated;
}

app.post('/api/subscribe', (req, res) => {
  const { email } = req.body || {};
  if (!email || typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  const existing = readJson(SUBSCRIBERS_FILE, []);
  if (!existing.includes(email)) {
    existing.push(email);
    writeJson(SUBSCRIBERS_FILE, existing);
  }

  log('New newsletter subscriber', email);
  res.json({ success: true });
});

app.get('/api/offers', (req, res) => {
  const offers = loadOffers().filter((offer) => offer.active !== false);
  res.json({ offers });
});

app.get('/api/list', (req, res) => {
  res.json({ list: loadPosters() });
});

app.get('/api/search', (req, res) => {
  const keyRaw = req.query.key;
  if (typeof keyRaw === 'undefined') {
    return res.status(400).json({ error: 'Missing query parameter: key' });
  }
  const key = Number(keyRaw);
  if (Number.isNaN(key)) {
    return res.status(400).json({ error: 'key must be a number' });
  }
  const posters = loadPosters();
  const index = posters.indexOf(key);
  res.json({ index });
});

app.post('/api/posters', requireAdmin, (req, res) => {
  const { key } = req.body || {};
  if (typeof key === 'undefined') {
    return res.status(400).json({ error: 'Missing key' });
  }
  const posters = loadPosters();
  posters.push(Number(key));
  if (!savePosters(posters)) {
    return res.status(500).json({ error: 'Unable to save' });
  }
  res.json({ list: posters });
});

app.delete('/api/posters', requireAdmin, (req, res) => {
  const keyRaw = req.query.key;
  if (typeof keyRaw === 'undefined') {
    return res.status(400).json({ error: 'Missing query parameter: key' });
  }
  const key = Number(keyRaw);
  if (Number.isNaN(key)) {
    return res.status(400).json({ error: 'key must be a number' });
  }
  const posters = loadPosters().filter((value) => value !== key);
  if (!savePosters(posters)) {
    return res.status(500).json({ error: 'Unable to save' });
  }
  res.json({ list: posters });
});

app.get('/api/products', (req, res) => {
  try {
    let products = loadProducts();
    const { category, type, featured, minPrice, maxPrice, search, limit } = req.query;

    if (category) {
      products = products.filter((p) => p.category === category);
    }
    if (type) {
      products = products.filter((p) => p.type === type);
    }
    if (featured === 'true') {
      products = products.filter((p) => p.featured === true);
    }
    if (minPrice) {
      const min = Number(minPrice);
      if (!Number.isNaN(min)) {
        products = products.filter((p) => Math.min(...Object.values(p.price || {})) >= min);
      }
    }
    if (maxPrice) {
      const max = Number(maxPrice);
      if (!Number.isNaN(max)) {
        products = products.filter((p) => Math.min(...Object.values(p.price || {})) <= max);
      }
    }
    if (search) {
      const term = search.toLowerCase();
      products = products.filter(
        (p) =>
          p.title.toLowerCase().includes(term) ||
          p.description.toLowerCase().includes(term) ||
          (Array.isArray(p.tags) && p.tags.some((tag) => tag.toLowerCase().includes(term)))
      );
    }
    const limited = limit ? products.slice(0, Number(limit)) : products;
    res.json({ products: limited, total: products.length });
  } catch (err) {
    log('Error fetching products', err.message || err);
    res.status(500).json({ error: 'Unable to fetch products' });
  }
});

app.get('/api/products/:id', (req, res) => {
  try {
    const product = loadProducts().find((p) => p.id === req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ product });
  } catch (err) {
    log('Error fetching product', err.message || err);
    res.status(500).json({ error: 'Unable to fetch product' });
  }
});

app.post('/api/products', requireAdmin, (req, res) => {
  try {
    const productData = req.body || {};
    if (!productData.title || !productData.type || !productData.price) {
      return res
        .status(400)
        .json({ error: 'Missing required fields: title, type, price' });
    }
    if (!['poster', 'polaroid'].includes(productData.type)) {
      return res.status(400).json({ error: 'Type must be either "poster" or "polaroid"' });
    }

    const products = loadProducts();
    const id = productData.id || `${productData.type}-${Date.now()}`;
    if (products.find((p) => p.id === id)) {
      return res.status(400).json({ error: 'Product with this ID already exists' });
    }

    const newProduct = {
      id,
      type: productData.type,
      title: productData.title,
      description: productData.description || '',
      price: productData.price,
      images: productData.images || [],
      category: productData.category || 'abstract',
      tags: productData.tags || [],
      stock: productData.stock || { M: 0, L: 0, XL: 0 },
      dimensions:
        productData.dimensions || { M: '8x12 inches', L: '12x18 inches', XL: '16x24 inches' },
      materials: productData.materials || 'Matte/Glossy finish options',
      featured: Boolean(productData.featured),
      created_at: new Date().toISOString(),
    };

    products.push(newProduct);
    if (!saveProducts(products)) {
      return res.status(500).json({ error: 'Unable to save product' });
    }

    res.status(201).json({ product: newProduct });
  } catch (err) {
    log('Error adding product', err.message || err);
    res.status(500).json({ error: 'Unable to add product' });
  }
});

app.put('/api/products/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body || {};
    const products = loadProducts();
    const productIndex = products.findIndex((p) => p.id === id);
    if (productIndex === -1) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const updatedProduct = {
      ...products[productIndex],
      ...updateData,
      id,
      updated_at: new Date().toISOString(),
    };

    products[productIndex] = updatedProduct;
    if (!saveProducts(products)) {
      return res.status(500).json({ error: 'Unable to update product' });
    }

    res.json({ product: updatedProduct });
  } catch (err) {
    log('Error updating product', err.message || err);
    res.status(500).json({ error: 'Unable to update product' });
  }
});

app.delete('/api/products/:id', requireAdmin, (req, res) => {
  try {
    const products = loadProducts();
    const productIndex = products.findIndex((p) => p.id === req.params.id);
    if (productIndex === -1) {
      return res.status(404).json({ error: 'Product not found' });
    }
    const [deletedProduct] = products.splice(productIndex, 1);
    if (!saveProducts(products)) {
      return res.status(500).json({ error: 'Unable to delete product' });
    }
    res.json({ message: 'Product deleted successfully', deletedProduct });
  } catch (err) {
    log('Error deleting product', err.message || err);
    res.status(500).json({ error: 'Unable to delete product' });
  }
});

app.post('/api/cart', (req, res) => {
  try {
    const { cart } = req.body || {};
    if (!Array.isArray(cart)) {
      return res.status(400).json({ error: 'Cart must be an array' });
    }
    const sessionId = req.headers['x-session-id'] || 'default';
    const cartFile = path.join(DATA_DIR, `cart_${sessionId}.json`);
    writeJson(cartFile, { cart, updated_at: new Date().toISOString() });
    res.json({ success: true });
  } catch (err) {
    log('Error saving cart', err.message || err);
    res.status(500).json({ error: 'Unable to save cart' });
  }
});

app.get('/api/cart', (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'] || 'default';
    const cartFile = path.join(DATA_DIR, `cart_${sessionId}.json`);
    const data = readJson(cartFile, { cart: [] });
    res.json(data);
  } catch (err) {
    log('Error retrieving cart', err.message || err);
    res.status(500).json({ error: 'Unable to retrieve cart' });
  }
});

app.delete('/api/cart', (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'] || 'default';
    const cartFile = path.join(DATA_DIR, `cart_${sessionId}.json`);
    if (fs.existsSync(cartFile)) {
      fs.unlinkSync(cartFile);
    }
    res.json({ success: true });
  } catch (err) {
    log('Error clearing cart', err.message || err);
    res.status(500).json({ error: 'Unable to clear cart' });
  }
});

app.post('/api/uploads', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  res.status(201).json({
    fileId: req.file.filename,
    fileUrl: `/uploads/${req.file.filename}`,
    mimeType: req.file.mimetype,
    size: req.file.size,
  });
});

app.post('/api/orders', async (req, res) => {
  try {
    const { customer, shippingAddress, paymentMethod, items = [], notes } = req.body || {};

    if (!customer || !shippingAddress || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Missing required order information' });
    }

    if (!customer.firstName || !customer.lastName || !customer.email || !customer.phone) {
      return res.status(400).json({ error: 'Missing required customer information' });
    }

    if (
      !shippingAddress.line1 ||
      !shippingAddress.city ||
      !shippingAddress.state ||
      !shippingAddress.pincode
    ) {
      return res.status(400).json({ error: 'Missing required shipping information' });
    }

    if (!['upi', 'paytm', 'cod'].includes(paymentMethod || '')) {
      return res.status(400).json({ error: 'Invalid payment method' });
    }

    const offers = loadOffers();
    const totals = calculateCartTotals(items, offers);

    const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const newOrder = {
      id: orderId,
      customer: {
        name: `${customer.firstName} ${customer.lastName}`.trim(),
        email: customer.email,
        phone: customer.phone,
      },
      shipping_address: {
        line1: shippingAddress.line1,
        line2: shippingAddress.line2 || '',
        city: shippingAddress.city,
        state: shippingAddress.state,
        pincode: shippingAddress.pincode,
      },
      items: totals.items,
      offers_applied: totals.offers.map((o) => ({ id: o.id, label: o.label, type: o.type })),
      subtotal: totals.subtotal,
      discount: totals.discount,
      shipping: totals.shipping,
      total: totals.total,
      currency: 'INR',
      payment_method: paymentMethod,
      payment_status: paymentMethod === 'cod' ? 'cod' : 'pending',
      status: 'pending',
      notes: notes || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const orders = loadOrders();
    orders.push(newOrder);
    if (!saveOrders(orders)) {
      return res.status(500).json({ error: 'Unable to save order' });
    }

    const customers = loadCustomers();
    if (!customers.find((c) => c.email === customer.email)) {
      customers.push({
        id: uuidv4(),
        name: newOrder.customer.name,
        email: customer.email,
        phone: customer.phone,
        created_at: new Date().toISOString(),
      });
      saveCustomers(customers);
    }

    const paymentPayload = {};

    if (paymentMethod === 'upi') {
      paymentPayload.upi = await generateUpiPayload(newOrder);
    } else if (paymentMethod === 'paytm') {
      try {
        paymentPayload.paytm = await createPaytmTransaction({
          orderId,
          amount: newOrder.total,
          customerId: customer.email,
        });
      } catch (err) {
        log('Paytm transaction error', err.message || err);
        return res.status(502).json({ error: err.message || 'Unable to initiate Paytm payment' });
      }
    }

    res.status(201).json({
      order: newOrder,
      payment: paymentPayload,
      message: 'Order created successfully',
    });
  } catch (err) {
    log('Error creating order', err.message || err);
    res.status(500).json({ error: 'Unable to create order' });
  }
});

app.get('/api/orders/:id', (req, res) => {
  try {
    const order = loadOrders().find((o) => o.id === req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json({ order });
  } catch (err) {
    log('Error fetching order', err.message || err);
    res.status(500).json({ error: 'Unable to fetch order' });
  }
});

app.get('/api/orders', requireAdmin, (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    let orders = loadOrders();
    if (status) {
      orders = orders.filter((order) => order.status === status);
    }
    orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const paginated = orders.slice(Number(offset), Number(offset) + Number(limit));
    res.json({ orders: paginated, total: orders.length });
  } catch (err) {
    log('Error fetching orders', err.message || err);
    res.status(500).json({ error: 'Unable to fetch orders' });
  }
});

app.put('/api/orders/:id', requireAdmin, (req, res) => {
  try {
    const updates = req.body || {};
    const order = updateOrder(req.params.id, (current) => ({
      ...current,
      ...updates,
      updated_at: new Date().toISOString(),
    }));
    res.json({ order });
  } catch (err) {
    log('Error updating order', err.message || err);
    res.status(500).json({ error: err.message || 'Unable to update order' });
  }
});

app.post('/payments/upi/confirm', (req, res) => {
  try {
    const { orderId, transactionId, amount } = req.body || {};
    if (!orderId || !transactionId) {
      return res.status(400).json({ error: 'Missing orderId or transactionId' });
    }
    const order = updateOrder(orderId, (current) => ({
      ...current,
      payment_status: 'paid',
      status: 'confirmed',
      upi_transaction_id: transactionId,
      paid_amount: amount || current.total,
      updated_at: new Date().toISOString(),
    }));
    res.json({ success: true, order });
  } catch (err) {
    log('Error confirming UPI payment', err.message || err);
    res.status(500).json({ error: err.message || 'Unable to confirm payment' });
  }
});

app.post('/payments/paytm/create', async (req, res) => {
  try {
    const { orderId, amount, customerId } = req.body || {};
    if (!orderId || !amount || !customerId) {
      return res.status(400).json({ error: 'Missing required payment information' });
    }
    const payload = await createPaytmTransaction({ orderId, amount, customerId });
    res.json(payload);
  } catch (err) {
    log('Error creating Paytm transaction', err.message || err);
    res.status(500).json({ error: err.message || 'Unable to initiate Paytm payment' });
  }
});

app.post('/payments/paytm/webhook', (req, res) => {
  try {
    const payload = req.body || {};
    const body = payload.body || payload;
    const head = payload.head || {};
    const signature =
      req.headers['x-checksum'] ||
      req.headers['x-paytm-signature'] ||
      head.signature ||
      payload.signature;

    if (!signature || !PAYTM_MERCHANT_KEY) {
      log('Missing Paytm signature or merchant key');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const isValid = PaytmChecksum.verifySignature(
      JSON.stringify(body),
      PAYTM_MERCHANT_KEY,
      signature
    );

    if (!isValid) {
      log('Invalid Paytm signature', body?.orderId);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const { orderId, resultInfo = {}, txnAmount, txnId } = body;
    if (!orderId) {
      return res.status(400).json({ error: 'Missing orderId' });
    }

    const order = updateOrder(orderId, (current) => {
      const statusMap = {
        TXN_SUCCESS: 'confirmed',
        TXN_FAILURE: 'failed',
        PENDING: 'pending',
      };
      const paymentStatus =
        resultInfo.resultStatus === 'TXN_SUCCESS' ? 'paid' : resultInfo.resultStatus?.toLowerCase();
      return {
        ...current,
        status: statusMap[resultInfo.resultStatus] || current.status,
        payment_status: paymentStatus || current.payment_status,
        paytm_transaction_id: txnId,
        paid_amount: txnAmount?.value || current.paid_amount,
        updated_at: new Date().toISOString(),
        paytm_response: body,
      };
    });

    res.json({ success: true, order });
  } catch (err) {
    log('Error processing Paytm webhook', err.message || err);
    res.status(500).json({ error: 'Unable to process webhook' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/payments')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// PUT /api/products/:id - Update product (admin only)
app.put('/api/products/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const products = loadProducts();
    const productIndex = products.findIndex(p => p.id === id);

    if (productIndex === -1) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Update product while preserving some fields
    const updatedProduct = {
      ...products[productIndex],
      ...updateData,
      id, // Ensure ID doesn't change
      updated_at: new Date().toISOString()
    };

    products[productIndex] = updatedProduct;
    const saved = saveProducts(products);

    if (!saved) {
      return res.status(500).json({ error: 'Unable to update product' });
    }

    log('Updated product', id, updatedProduct.title);
    res.json({ product: updatedProduct });
  } catch (err) {
    log('Error updating product', err.message || err);
    res.status(500).json({ error: 'Unable to update product' });
  }
});

// DELETE /api/products/:id - Delete product (admin only)
app.delete('/api/products/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;

    const products = loadProducts();
    const productIndex = products.findIndex(p => p.id === id);

    if (productIndex === -1) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const deletedProduct = products[productIndex];
    products.splice(productIndex, 1);

    const saved = saveProducts(products);
    if (!saved) {
      return res.status(500).json({ error: 'Unable to delete product' });
    }

    log('Deleted product', id, deletedProduct.title);
    res.json({ message: 'Product deleted successfully', deletedProduct });
  } catch (err) {
    log('Error deleting product', err.message || err);
    res.status(500).json({ error: 'Unable to delete product' });
  }
});

// === CART API ENDPOINTS ===

// POST /api/cart - Save cart to session
app.post('/api/cart', (req, res) => {
  try {
    const { cart } = req.body;

    if (!Array.isArray(cart)) {
      return res.status(400).json({ error: 'Cart must be an array' });
    }

    // Validate cart items
    for (const item of cart) {
      if (!item.product_id || !item.size || !item.quantity || !item.price) {
        return res.status(400).json({ error: 'Invalid cart item structure' });
      }
    }

    // Store cart in session (for simplicity, using session-like storage)
    // In production, you'd use proper session storage
    const sessionId = req.headers['x-session-id'] || 'default';
    const cartFile = path.join(DATA_DIR, `cart_${sessionId}.json`);

    fs.writeFileSync(cartFile, JSON.stringify({ cart, updated_at: new Date().toISOString() }, null, 2));

    res.json({ success: true, message: 'Cart saved successfully' });
  } catch (err) {
    log('Error saving cart', err.message || err);
    res.status(500).json({ error: 'Unable to save cart' });
  }
});

// GET /api/cart - Retrieve cart from session
app.get('/api/cart', (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'] || 'default';
    const cartFile = path.join(DATA_DIR, `cart_${sessionId}.json`);

    if (!fs.existsSync(cartFile)) {
      return res.json({ cart: [] });
    }

    const cartData = JSON.parse(fs.readFileSync(cartFile, 'utf8'));
    res.json(cartData);
  } catch (err) {
    log('Error retrieving cart', err.message || err);
    res.status(500).json({ error: 'Unable to retrieve cart' });
  }
});

// DELETE /api/cart - Clear cart
app.delete('/api/cart', (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'] || 'default';
    const cartFile = path.join(DATA_DIR, `cart_${sessionId}.json`);

    if (fs.existsSync(cartFile)) {
      fs.unlinkSync(cartFile);
    }

    res.json({ success: true, message: 'Cart cleared successfully' });
  } catch (err) {
    log('Error clearing cart', err.message || err);
    res.status(500).json({ error: 'Unable to clear cart' });
  }
});

// === ORDER MANAGEMENT API ENDPOINTS ===

// POST /api/orders - Create new order
app.post('/api/orders', async (req, res) => {
  try {
    const { customer, shippingAddress, paymentMethod, items, subtotal, shipping, total } = req.body;

    // Validation
    if (!customer || !shippingAddress || !paymentMethod || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Missing required order information' });
    }

    // Validate customer information
    if (!customer.firstName || !customer.lastName || !customer.email || !customer.phone) {
      return res.status(400).json({ error: 'Missing required customer information' });
    }

    // Validate shipping address
    if (!shippingAddress.line1 || !shippingAddress.city || !shippingAddress.state || !shippingAddress.pincode) {
      return res.status(400).json({ error: 'Missing required shipping information' });
    }

    // Validate payment method
    if (!['razorpay', 'bank_transfer'].includes(paymentMethod)) {
      return res.status(400).json({ error: 'Invalid payment method' });
    }

    const orders = loadOrders();
    const orderId = 'ORD-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5).toUpperCase();

    const newOrder = {
      id: orderId,
      customer: {
        name: `${customer.firstName} ${customer.lastName}`,
        email: customer.email,
        phone: customer.phone
      },
      items: items.map(item => ({
        product_id: item.product_id,
        title: item.title,
        size: item.size,
        quantity: item.quantity,
        price: item.price
      })),
      subtotal: Number(subtotal) || 0,
      shipping: Number(shipping) || 0,
      total: Number(total) || 0,
      currency: 'INR',
      status: paymentMethod === 'bank_transfer' ? 'pending' : 'pending',
      payment_method: paymentMethod,
      payment_status: paymentMethod === 'bank_transfer' ? 'pending' : 'pending',
      shipping_address: {
        line1: shippingAddress.line1,
        line2: shippingAddress.line2 || '',
        city: shippingAddress.city,
        state: shippingAddress.state,
        pincode: shippingAddress.pincode
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Add Razorpay order ID for online payments
    if (paymentMethod === 'razorpay') {
      // In a real implementation, you would create a Razorpay order here
      // For now, we'll generate a mock order ID
      newOrder.razorpayOrderId = 'order_' + Date.now();
    }

    orders.push(newOrder);
    const saved = saveOrders(orders);

    if (!saved) {
      return res.status(500).json({ error: 'Unable to save order' });
    }

    // Update product stock
    try {
      const products = loadProducts();
      let stockUpdated = false;

      items.forEach(orderItem => {
        const productIndex = products.findIndex(p => p.id === orderItem.product_id);
        if (productIndex >= 0) {
          const product = products[productIndex];
          if (product.stock && product.stock[orderItem.size] !== undefined) {
            product.stock[orderItem.size] -= orderItem.quantity;
            if (product.stock[orderItem.size] < 0) {
              product.stock[orderItem.size] = 0;
            }
            stockUpdated = true;
          }
        }
      });

      if (stockUpdated) {
        saveProducts(products);
      }
    } catch (stockError) {
      log('Warning: Could not update product stock', stockError.message || stockError);
    }

    log('New order created', orderId, customer.email, 'Total:', newOrder.total);

    res.status(201).json({
      order: newOrder,
      message: 'Order created successfully'
    });

  } catch (err) {
    log('Error creating order', err.message || err);
    res.status(500).json({ error: 'Unable to create order' });
  }
});

// GET /api/orders/:id - Retrieve order details
app.get('/api/orders/:id', (req, res) => {
  try {
    const { id } = req.params;
    const orders = loadOrders();
    const order = orders.find(o => o.id === id);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ order });
  } catch (err) {
    log('Error fetching order', err.message || err);
    res.status(500).json({ error: 'Unable to fetch order' });
  }
});

// GET /api/orders - Get all orders (admin only)
app.get('/api/orders', requireAdmin, (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    let orders = loadOrders();

    // Apply filters
    if (status) {
      orders = orders.filter(order => order.status === status);
    }

    // Sort by created date (newest first)
    orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Apply pagination
    const paginatedOrders = orders.slice(Number(offset), Number(offset) + Number(limit));

    res.json({
      orders: paginatedOrders,
      total: orders.length,
      filters: { status, limit, offset }
    });
  } catch (err) {
    log('Error fetching orders', err.message || err);
    res.status(500).json({ error: 'Unable to fetch orders' });
  }
});

// PUT /api/orders/:id - Update order status (admin only)
app.put('/api/orders/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { status, payment_status, tracking_number, notes } = req.body;

    const orders = loadOrders();
    const orderIndex = orders.findIndex(o => o.id === id);

    if (orderIndex === -1) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orders[orderIndex];

    // Update allowed fields
    if (status && ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'].includes(status)) {
      order.status = status;
    }

    if (payment_status && ['pending', 'paid', 'failed', 'refunded'].includes(payment_status)) {
      order.payment_status = payment_status;
    }

    if (tracking_number) {
      order.tracking_number = tracking_number;
    }

    if (notes) {
      order.admin_notes = notes;
    }

    order.updated_at = new Date().toISOString();

    orders[orderIndex] = order;
    const saved = saveOrders(orders);

    if (!saved) {
      return res.status(500).json({ error: 'Unable to update order' });
    }

    log('Order updated', id, 'Status:', status || 'unchanged');

    res.json({ order });
  } catch (err) {
    log('Error updating order', err.message || err);
    res.status(500).json({ error: 'Unable to update order' });
  }
});

// === PAYMENT PROCESSING ENDPOINTS ===

// POST /api/payment/initiate - Initiate payment (Razorpay)
app.post('/api/payment/initiate', async (req, res) => {
  try {
    const { orderId, amount, currency = 'INR' } = req.body;

    if (!orderId || !amount) {
      return res.status(400).json({ error: 'Missing required payment information' });
    }

    // In a real implementation, you would integrate with Razorpay API
    // For now, we'll return a mock order ID
    const razorpayOrderId = 'order_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    res.json({
      razorpayOrderId,
      amount: Number(amount),
      currency,
      key: process.env.RAZORPAY_KEY_ID || 'rzp_test_1DP5mmOlF5G5ag'
    });

  } catch (err) {
    log('Error initiating payment', err.message || err);
    res.status(500).json({ error: 'Unable to initiate payment' });
  }
});

// POST /api/payment/verify - Verify payment completion
app.post('/api/payment/verify', (req, res) => {
  try {
    const { orderId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    if (!orderId || !razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing required payment verification data' });
    }

    // In a real implementation, you would verify the Razorpay signature
    // For now, we'll simulate successful verification

    const orders = loadOrders();
    const orderIndex = orders.findIndex(o => o.id === orderId);

    if (orderIndex === -1) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orders[orderIndex];
    order.payment_status = 'paid';
    order.status = 'confirmed';
    order.payment_id = razorpay_payment_id;
    order.updated_at = new Date().toISOString();

    orders[orderIndex] = order;
    const saved = saveOrders(orders);

    if (!saved) {
      return res.status(500).json({ error: 'Unable to update order payment status' });
    }

    log('Payment verified', orderId, 'Payment ID:', razorpay_payment_id);

    res.json({
      success: true,
      order,
      message: 'Payment verified successfully'
    });

  } catch (err) {
    log('Error verifying payment', err.message || err);
    res.status(500).json({ error: 'Unable to verify payment' });
  }
});

// Serve kapoor.html for root explicitly (so visiting / shows the page)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'kapoor.html'));
});

app.listen(PORT, () => {
  log(`Server listening on http://localhost:${PORT}`);
});

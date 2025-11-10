const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());
// Serve static files (kapoor.html, styles.css, images/*)
app.use(express.static(path.join(__dirname)));

const DATA_DIR = path.join(__dirname, 'data');
const POSTERS_FILE = path.join(DATA_DIR, 'posters.json');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const CUSTOMERS_FILE = path.join(DATA_DIR, 'customers.json');
const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'server.log');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch (e) { /* ignore logging errors */ }
  console.log(...args);
}

// Load posters from data/posters.json (falls back to default sample if missing)
function loadPosters() {
  try {
    const raw = fs.readFileSync(POSTERS_FILE, 'utf8');
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr;
    log('data/posters.json does not contain an array, falling back to default');
  } catch (err) {
    // fallback
  }
  return [1, 3, 5, 4, 7, 9];
}

function savePosters(arr) {
  try {
    fs.writeFileSync(POSTERS_FILE, JSON.stringify(arr, null, 2), 'utf8');
    log('Saved posters.json', arr);
    return true;
  } catch (err) {
    log('Error writing posters.json', err.message || err);
    return false;
  }
}

// Product management functions
function loadProducts() {
  try {
    const raw = fs.readFileSync(PRODUCTS_FILE, 'utf8');
    const data = JSON.parse(raw);
    return data.products || [];
  } catch (err) {
    log('Error loading products.json', err.message || err);
    return [];
  }
}

function saveProducts(products) {
  try {
    const data = { products };
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(data, null, 2), 'utf8');
    log('Saved products.json', `${products.length} products`);
    return true;
  } catch (err) {
    log('Error writing products.json', err.message || err);
    return false;
  }
}

// Order management functions
function loadOrders() {
  try {
    const raw = fs.readFileSync(ORDERS_FILE, 'utf8');
    const data = JSON.parse(raw);
    return data.orders || [];
  } catch (err) {
    log('Error loading orders.json', err.message || err);
    return [];
  }
}

function saveOrders(orders) {
  try {
    const data = { orders };
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(data, null, 2), 'utf8');
    log('Saved orders.json', `${orders.length} orders`);
    return true;
  } catch (err) {
    log('Error writing orders.json', err.message || err);
    return false;
  }
}

// Customer management functions
function loadCustomers() {
  try {
    const raw = fs.readFileSync(CUSTOMERS_FILE, 'utf8');
    const data = JSON.parse(raw);
    return data.customers || [];
  } catch (err) {
    log('Error loading customers.json', err.message || err);
    return [];
  }
}

function saveCustomers(customers) {
  try {
    const data = { customers };
    fs.writeFileSync(CUSTOMERS_FILE, JSON.stringify(data, null, 2), 'utf8');
    log('Saved customers.json', `${customers.length} customers`);
    return true;
  } catch (err) {
    log('Error writing customers.json', err.message || err);
    return false;
  }
}

// Initialize data files if they don't exist
function initializeDataFiles() {
  if (!fs.existsSync(PRODUCTS_FILE)) {
    saveProducts([]);
  }
  if (!fs.existsSync(ORDERS_FILE)) {
    saveOrders([]);
  }
  if (!fs.existsSync(CUSTOMERS_FILE)) {
    saveCustomers([]);
  }
}

initializeDataFiles();

// POST /api/subscribe -> { email: string }
app.post('/api/subscribe', (req, res) => {
  const { email } = req.body || {};
  if (!email || typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  const subsFile = path.join(DATA_DIR, 'subscribers.json');
  let subs = [];
  try {
    if (fs.existsSync(subsFile)) {
      subs = JSON.parse(fs.readFileSync(subsFile, 'utf8')) || [];
    }
  } catch (e) {
    log('Error reading subscribers.json', e.message || e);
  }
  if (!subs.includes(email)) subs.push(email);
  try {
    fs.writeFileSync(subsFile, JSON.stringify(subs, null, 2), 'utf8');
    log('New newsletter subscriber', email);
    return res.json({ success: true });
  } catch (e) {
    log('Error writing subscribers.json', e.message || e);
    return res.status(500).json({ error: 'Unable to save' });
  }
});

// ADMIN API KEY: set via environment variable ADMIN_API_KEY
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'change-me';

function requireAdmin(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key || String(key) !== String(ADMIN_API_KEY)) {
    log('Unauthorized admin attempt', { ip: req.ip, path: req.path });
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// GET /api/list -> return the posters array
app.get('/api/list', (req, res) => {
  const posters = loadPosters();
  res.json({ list: posters });
});

// GET /api/search?key=7 -> find index of key in posters
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

// POST /api/posters -> { key: number } - add poster
app.post('/api/posters', requireAdmin, (req, res) => {
  const { key } = req.body;
  if (typeof key === 'undefined') return res.status(400).json({ error: 'Missing key' });
  const k = Number(key);
  if (Number.isNaN(k)) return res.status(400).json({ error: 'key must be a number' });
  const posters = loadPosters();
  posters.push(k);
  const ok = savePosters(posters);
  if (!ok) return res.status(500).json({ error: 'Unable to save' });
  log('Added poster', k);
  res.json({ list: posters });
});

// DELETE /api/posters?key=NUMBER -> remove all occurrences of key
app.delete('/api/posters', requireAdmin, (req, res) => {
  const keyRaw = req.query.key;
  if (typeof keyRaw === 'undefined') return res.status(400).json({ error: 'Missing query parameter: key' });
  const key = Number(keyRaw);
  if (Number.isNaN(key)) return res.status(400).json({ error: 'key must be a number' });
  let posters = loadPosters();
  const before = posters.length;
  posters = posters.filter(x => x !== key);
  const ok = savePosters(posters);
  if (!ok) return res.status(500).json({ error: 'Unable to save' });
  log('Removed poster', key, 'removedCount', before - posters.length);
  res.json({ list: posters });
});

// === PRODUCT API ENDPOINTS ===

// GET /api/products - Get all products with optional filtering
app.get('/api/products', (req, res) => {
  try {
    const { category, type, featured, minPrice, maxPrice, search } = req.query;
    let products = loadProducts();

    // Apply filters
    if (category) {
      products = products.filter(p => p.category === category);
    }
    if (type) {
      products = products.filter(p => p.type === type);
    }
    if (featured === 'true') {
      products = products.filter(p => p.featured === true);
    }
    if (minPrice) {
      const min = Number(minPrice);
      if (!Number.isNaN(min)) {
        products = products.filter(p => {
          const prices = Object.values(p.price);
          return Math.min(...prices) >= min;
        });
      }
    }
    if (maxPrice) {
      const max = Number(maxPrice);
      if (!Number.isNaN(max)) {
        products = products.filter(p => {
          const prices = Object.values(p.price);
          return Math.min(...prices) <= max;
        });
      }
    }
    if (search) {
      const searchTerm = search.toLowerCase();
      products = products.filter(p =>
        p.title.toLowerCase().includes(searchTerm) ||
        p.description.toLowerCase().includes(searchTerm) ||
        p.tags.some(tag => tag.toLowerCase().includes(searchTerm))
      );
    }

    res.json({
      products,
      total: products.length,
      filters: { category, type, featured, minPrice, maxPrice, search }
    });
  } catch (err) {
    log('Error fetching products', err.message || err);
    res.status(500).json({ error: 'Unable to fetch products' });
  }
});

// GET /api/products/:id - Get single product by ID
app.get('/api/products/:id', (req, res) => {
  try {
    const { id } = req.params;
    const products = loadProducts();
    const product = products.find(p => p.id === id);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ product });
  } catch (err) {
    log('Error fetching product', err.message || err);
    res.status(500).json({ error: 'Unable to fetch product' });
  }
});

// GET /api/products/search?q=query&category=type&size=price - Advanced search
app.get('/api/products/search', (req, res) => {
  try {
    const { q: query, category, size } = req.query;
    let products = loadProducts();

    if (query) {
      const searchTerm = query.toLowerCase();
      products = products.filter(p =>
        p.title.toLowerCase().includes(searchTerm) ||
        p.description.toLowerCase().includes(searchTerm) ||
        p.tags.some(tag => tag.toLowerCase().includes(searchTerm))
      );
    }

    if (category) {
      products = products.filter(p => p.category === category);
    }

    if (size && ['M', 'L', 'XL'].includes(size.toUpperCase())) {
      const sizeKey = size.toUpperCase();
      products = products.filter(p => p.price[sizeKey] && p.stock[sizeKey] > 0);
    }

    res.json({
      products: products.slice(0, 50), // Limit to 50 results
      total: products.length,
      query: { q: query, category, size }
    });
  } catch (err) {
    log('Error searching products', err.message || err);
    res.status(500).json({ error: 'Unable to search products' });
  }
});

// POST /api/products - Add new product (admin only)
app.post('/api/products', requireAdmin, (req, res) => {
  try {
    const productData = req.body;

    // Validation
    if (!productData.title || !productData.type || !productData.price) {
      return res.status(400).json({ error: 'Missing required fields: title, type, price' });
    }

    if (!['poster', 'polaroid'].includes(productData.type)) {
      return res.status(400).json({ error: 'Type must be either "poster" or "polaroid"' });
    }

    const products = loadProducts();

    // Generate unique ID
    const id = productData.id || `${productData.type}-${Date.now()}`;

    // Check if ID already exists
    if (products.find(p => p.id === id)) {
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
      dimensions: productData.dimensions || { M: '8x12 inches', L: '12x18 inches', XL: '16x24 inches' },
      materials: productData.materials || 'Matte/Glossy finish options',
      featured: productData.featured || false,
      created_at: new Date().toISOString()
    };

    products.push(newProduct);
    const saved = saveProducts(products);

    if (!saved) {
      return res.status(500).json({ error: 'Unable to save product' });
    }

    log('Added new product', newProduct.id, newProduct.title);
    res.status(201).json({ product: newProduct });
  } catch (err) {
    log('Error adding product', err.message || err);
    res.status(500).json({ error: 'Unable to add product' });
  }
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

// Serve kapoor.html for root explicitly (so visiting / shows the page)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'kapoor.html'));
});

app.listen(PORT, () => {
  log(`Server listening on http://localhost:${PORT}`);
});

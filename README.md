# Trizoverse - Premium Poster Store

A complete e-commerce platform for selling premium posters and custom prints. Built with Node.js/Express backend and vanilla HTML/CSS/JavaScript frontend.

## Features

- **Elegant Branding**: Professional Trizoverse brand header with hamburger menu and search
- **Product Catalog**: Browse featured posters with pricing and details
- **Product Details**: View product specifications, select sizes, and customize with your own images
- **Shopping Cart**: Add items to cart with localStorage persistence
- **Checkout**: Secure checkout with GPay/UPI and Paytm payment integration
- **Custom Uploads**: Upload your own images to create custom posters
- **Offers System**: Display active offers and discounts
- **Responsive Design**: Mobile-friendly interface

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
PORT=3000
BASE_URL=http://localhost:3000

# Admin API Key (for protected endpoints)
ADMIN_API_KEY=change-me

# UPI Payment Configuration
UPI_VPA=your-merchant@upi
UPI_NAME=Trizoverse

# Paytm Payment Gateway Configuration
PAYTM_MID=YOUR_MERCHANT_ID
PAYTM_MERCHANT_KEY=YOUR_MERCHANT_KEY
PAYTM_WEBSITE=DEFAULT
PAYTM_ENV=staging
PAYTM_CALLBACK_URL=http://localhost:3000/payments/paytm/webhook

# File Upload Configuration
UPLOAD_LIMIT_BYTES=5242880
```

**Note**: Get Paytm credentials from [Paytm Merchant Dashboard](https://dashboard.paytm.com/)

## API Endpoints

### Products
- `GET /api/products` - Get all products (supports query params: `featured`, `category`, `type`, `search`, `limit`)
- `GET /api/products/:id` - Get product details
- `POST /api/products` - Create product (admin only)
- `PUT /api/products/:id` - Update product (admin only)
- `DELETE /api/products/:id` - Delete product (admin only)

### Offers
- `GET /api/offers` - Get active offers

### Cart
- `GET /api/cart` - Get cart items
- `POST /api/cart` - Save cart items
- `DELETE /api/cart` - Clear cart

### Orders
- `POST /api/orders` - Create new order
- `GET /api/orders/:id` - Get order details
- `GET /api/orders` - Get all orders (admin only)
- `PUT /api/orders/:id` - Update order (admin only)

### Uploads
- `POST /api/uploads` - Upload custom image (max 5MB, JPEG/PNG/WEBP)

### Payments
- `POST /payments/upi/confirm` - Confirm UPI payment
- `POST /payments/paytm/create` - Create Paytm transaction
- `POST /payments/paytm/webhook` - Paytm payment webhook

## Run (PowerShell)

1. Open PowerShell and change to the project folder:

```powershell
cd "d:\MY CODES\dins kapoor"
```

2. Install dependencies:

```powershell
npm install
```

3. Start the server:

```powershell
npm start
```

4. Open the site in your browser:

http://localhost:3000/

The homepage will display featured products. Navigate to:
- `/products.html` - Browse all products
- `/product-detail.html?id=PRODUCT_ID` - View product details
- `/cart.html` - View shopping cart
- `/checkout.html` - Complete checkout

## API examples

- GET list:
  - `http://localhost:3000/api/list` → returns `{ "list": [1,3,5,4,7,9] }`

- Search (query):
  - `http://localhost:3000/api/search?key=7` → returns `{ "index": 4 }`

- Search (POST):
  - POST `http://localhost:3000/api/search` with JSON body `{ "key": 7 }` → returns `{ "index": 4 }`

## Notes and next steps

 - I added a simple search UI to `kapoor.html` which queries `/api/search` and displays results inline.
 - Posters are now loaded from `data/posters.json`. Edit that file to change the dataset.
 - Dev scripts: `npm run dev` (requires `npm install` to install `nodemon`), `npm test` runs a small test against the running server (defaults to port 4000 if you started the server that way).
 - I added a simple search UI to `kapoor.html` which queries `/api/search` and displays results inline.
 - Posters are now loaded from `data/posters.json`. Edit that file to change the dataset.
 - Dev scripts: `npm run dev` (requires `npm install` to install `nodemon`), `npm test` runs a small test against the running server (defaults to port 4000 if you started the server that way).
 - Admin endpoints (`POST` and `DELETE` to `/api/posters`) are protected by an API key header `x-api-key`.
   - Default API key (development): `change-me`.
   - To set a custom key, set environment variable `ADMIN_API_KEY` before starting the server, e.g. in PowerShell:

```powershell
$env:ADMIN_API_KEY = 'your-secret-key'; $env:PORT=4000; npm start
```

 - Front-end admin UI includes an "Admin API Key" input and will persist the entered key to localStorage for convenience; it sends the key as `x-api-key` on admin requests.

// Shopping Cart Management System
class ShoppingCart {
  constructor() {
    this.cart = [];
    this.sessionId = this.getSessionId();
    this.init();
  }

  getSessionId() {
    let sessionId = localStorage.getItem('cart_session_id');
    if (!sessionId) {
      sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('cart_session_id', sessionId);
    }
    return sessionId;
  }

  async init() {
    await this.loadCart();
    this.setupEventListeners();
    this.updateCartCounter();
  }

  setupEventListeners() {
    // Listen for storage changes to sync across tabs
    window.addEventListener('storage', (e) => {
      if (e.key === 'cart_updated') {
        this.loadCart();
      }
    });
  }

  async loadCart() {
    try {
      const response = await fetch('/api/cart', {
        headers: {
          'x-session-id': this.sessionId
        }
      });
      const data = await response.json();
      this.cart = data.cart || [];
      this.updateCartCounter();
      return this.cart;
    } catch (error) {
      console.error('Error loading cart:', error);
      this.cart = [];
      return [];
    }
  }

  async saveCart() {
    try {
      await fetch('/api/cart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': this.sessionId
        },
        body: JSON.stringify({ cart: this.cart })
      });

      // Notify other tabs
      localStorage.setItem('cart_updated', Date.now().toString());
      this.updateCartCounter();
    } catch (error) {
      console.error('Error saving cart:', error);
      throw error;
    }
  }

  async addItem(product_id, title, size, quantity, price) {
    // Validate inputs
    if (!product_id || !title || !size || !quantity || !price) {
      throw new Error('Missing required product information');
    }

    if (quantity < 1) {
      throw new Error('Quantity must be at least 1');
    }

    // Check if item already exists
    const existingItemIndex = this.cart.findIndex(item =>
      item.product_id === product_id && item.size === size
    );

    if (existingItemIndex >= 0) {
      // Update quantity of existing item
      this.cart[existingItemIndex].quantity += quantity;
    } else {
      // Add new item
      this.cart.push({
        product_id,
        title,
        size,
        quantity,
        price,
        added_at: new Date().toISOString()
      });
    }

    await this.saveCart();
    return this.cart;
  }

  async updateItemQuantity(product_id, size, quantity) {
    const itemIndex = this.cart.findIndex(item =>
      item.product_id === product_id && item.size === size
    );

    if (itemIndex === -1) {
      throw new Error('Item not found in cart');
    }

    if (quantity < 1) {
      return this.removeItem(product_id, size);
    }

    this.cart[itemIndex].quantity = quantity;
    await this.saveCart();
    return this.cart;
  }

  async removeItem(product_id, size) {
    this.cart = this.cart.filter(item =>
      !(item.product_id === product_id && item.size === size)
    );
    await this.saveCart();
    return this.cart;
  }

  async clearCart() {
    this.cart = [];
    try {
      await fetch('/api/cart', {
        method: 'DELETE',
        headers: {
          'x-session-id': this.sessionId
        }
      });
      localStorage.setItem('cart_updated', Date.now().toString());
      this.updateCartCounter();
    } catch (error) {
      console.error('Error clearing cart:', error);
      throw error;
    }
  }

  getCart() {
    return this.cart;
  }

  getItemCount() {
    return this.cart.reduce((total, item) => total + item.quantity, 0);
  }

  getSubtotal() {
    return this.cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  }

  getItemSubtotal(item) {
    return item.price * item.quantity;
  }

  async applyCoupon(couponCode) {
    // This would integrate with a coupon system
    // For now, just return the cart without discount
    return {
      cart: this.cart,
      discount: 0,
      subtotal: this.getSubtotal(),
      total: this.getSubtotal()
    };
  }

  updateCartCounter() {
    const count = this.getItemCount();
    const counterElements = document.querySelectorAll('#cart-count, .cart-count');
    counterElements.forEach(element => {
      element.textContent = count;
    });

    // Update cart visibility
    if (count > 0) {
      document.body.classList.add('cart-has-items');
    } else {
      document.body.classList.remove('cart-has-items');
    }
  }

  // Format price for display
  formatPrice(price) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(price);
  }

  // Get cart summary for checkout
  getCartSummary() {
    const subtotal = this.getSubtotal();
    const shipping = this.calculateShipping();
    const total = subtotal + shipping;

    return {
      items: this.cart.length,
      subtotal,
      shipping,
      total,
      currency: 'INR'
    };
  }

  // Calculate shipping based on cart contents
  calculateShipping() {
    const itemCount = this.getItemCount();
    const subtotal = this.getSubtotal();

    // Free shipping for orders over ₹999
    if (subtotal >= 999) {
      return 0;
    }

    // Base shipping rates
    if (itemCount === 1) {
      return 49;
    } else if (itemCount <= 3) {
      return 79;
    } else if (itemCount <= 5) {
      return 99;
    } else {
      return 149;
    }
  }

  // Validate cart before checkout
  validateCart() {
    if (this.cart.length === 0) {
      throw new Error('Your cart is empty');
    }

    // Check if all items are valid
    for (const item of this.cart) {
      if (!item.product_id || !item.title || !item.size || !item.price || item.quantity < 1) {
        throw new Error(`Invalid item in cart: ${item.title || 'Unknown item'}`);
      }
    }

    return true;
  }

  // Merge cart from server (for logged-in users)
  async mergeCart(serverCart) {
    if (!serverCart || !Array.isArray(serverCart)) {
      return this.cart;
    }

    // Simple merge strategy: combine quantities for matching items
    const mergedCart = [...this.cart];

    for (const serverItem of serverCart) {
      const existingIndex = mergedCart.findIndex(item =>
        item.product_id === serverItem.product_id && item.size === serverItem.size
      );

      if (existingIndex >= 0) {
        mergedCart[existingIndex].quantity += serverItem.quantity;
      } else {
        mergedCart.push(serverItem);
      }
    }

    this.cart = mergedCart;
    await this.saveCart();
    return this.cart;
  }

  // Get product recommendations based on cart contents
  getRecommendations() {
    // This would typically call an API for recommendations
    // For now, return empty array
    return [];
  }

  // Export cart data for analytics
  exportCartData() {
    return {
      items: this.cart.length,
      totalValue: this.getSubtotal(),
      averageItemValue: this.cart.length > 0 ? this.getSubtotal() / this.cart.length : 0,
      categories: [...new Set(this.cart.map(item => item.category || 'unknown'))],
      sizes: [...new Set(this.cart.map(item => item.size))],
      lastUpdated: new Date().toISOString()
    };
  }
}

// Initialize cart globally
let shoppingCart;

// Initialize cart when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  shoppingCart = new ShoppingCart();
});

// Export for global access
window.ShoppingCart = ShoppingCart;
window.shoppingCart = shoppingCart;

// Helper functions for cart operations
window.CartUtils = {
  async addToCart(productId, title, size, quantity = 1, price) {
    try {
      await shoppingCart.addItem(productId, title, size, quantity, price);
      showNotification('Added to cart successfully!', 'success');
      return true;
    } catch (error) {
      console.error('Error adding to cart:', error);
      showNotification('Failed to add to cart', 'error');
      return false;
    }
  },

  async removeFromCart(productId, size) {
    try {
      await shoppingCart.removeItem(productId, size);
      showNotification('Item removed from cart', 'info');
      return true;
    } catch (error) {
      console.error('Error removing from cart:', error);
      showNotification('Failed to remove from cart', 'error');
      return false;
    }
  },

  async updateQuantity(productId, size, quantity) {
    try {
      await shoppingCart.updateItemQuantity(productId, size, quantity);
      return true;
    } catch (error) {
      console.error('Error updating quantity:', error);
      showNotification('Failed to update quantity', 'error');
      return false;
    }
  },

  async clearCart() {
    if (confirm('Are you sure you want to clear your entire cart?')) {
      try {
        await shoppingCart.clearCart();
        showNotification('Cart cleared', 'info');
        return true;
      } catch (error) {
        console.error('Error clearing cart:', error);
        showNotification('Failed to clear cart', 'error');
        return false;
      }
    }
    return false;
  },

  formatPrice(price) {
    return shoppingCart.formatPrice(price);
  },

  getCartCount() {
    return shoppingCart.getItemCount();
  },

  getSubtotal() {
    return shoppingCart.getSubtotal();
  }
};

// Notification system
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `cart-notification cart-notification-${type}`;
  notification.textContent = message;

  // Add styles
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8'};
    color: white;
    border-radius: 4px;
    z-index: 10000;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    font-weight: 500;
    transform: translateX(100%);
    transition: transform 0.3s ease;
  `;

  document.body.appendChild(notification);

  // Animate in
  setTimeout(() => {
    notification.style.transform = 'translateX(0)';
  }, 100);

  // Remove after 3 seconds
  setTimeout(() => {
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
}

// Export notification function for global use
window.showNotification = showNotification;
import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { sendOrderEmails } from './email';

const ADMIN_PASSWORD = 'theresa';

export default function App() {
  const [view, setView] = useState('menu');
  const [isAdmin, setIsAdmin] = useState(false);
  const [items, setItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [blockedDates, setBlockedDates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState([]);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [requestedDate, setRequestedDate] = useState('');
  const [fulfillmentType, setFulfillmentType] = useState('pickup');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [orderNote, setOrderNote] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [newItem, setNewItem] = useState({ name: '', description: '', emoji: '🍪', price: '', options: '' });
  const [editingPrice, setEditingPrice] = useState(null);
  const [editingOptions, setEditingOptions] = useState(null);
  const [editingDescription, setEditingDescription] = useState(null);
  const [tempPrice, setTempPrice] = useState('');
  const [tempOptions, setTempOptions] = useState('');
  const [tempDescription, setTempDescription] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [orderCalendarMonth, setOrderCalendarMonth] = useState(new Date());
  const [ordersViewMode, setOrdersViewMode] = useState('calendar'); // 'calendar' or 'list'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'pending', 'fulfilled', 'paid', 'complete'
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [adminEmail, setAdminEmail] = useState('');
  const [tempAdminEmail, setTempAdminEmail] = useState('');
  const [adminEmailSaved, setAdminEmailSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
    
    const ordersSubscription = supabase
      .channel('orders-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        loadOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ordersSubscription);
    };
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadItems(), loadOrders(), loadBlockedDates(), loadAdminEmail()]);
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load data. Please refresh the page.');
    }
    setLoading(false);
  };

  const loadItems = async () => {
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .order('created_at', { ascending: true });
    
    if (error) throw error;
    setItems(data || []);
  };

  const loadOrders = async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    setOrders(data || []);
  };

  const loadBlockedDates = async () => {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('key', 'blocked_dates')
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error loading blocked dates:', error);
    }
    
    if (data?.value) {
      setBlockedDates(data.value);
    }
  };

  const loadAdminEmail = async () => {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('key', 'admin_email')
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error loading admin email:', error);
    }
    
    if (data?.value) {
      setAdminEmail(data.value);
      setTempAdminEmail(data.value);
    }
  };

  const saveAdminEmail = async () => {
    const email = tempAdminEmail.trim();
    const { error } = await supabase
      .from('settings')
      .upsert({ key: 'admin_email', value: JSON.stringify(email) });
    
    if (error) {
      console.error('Error saving admin email:', error);
      return;
    }
    
    setAdminEmail(email);
    setAdminEmailSaved(true);
    setTimeout(() => setAdminEmailSaved(false), 2000);
  };

  const toggleBlockedDate = async (dateString) => {
    let newBlockedDates;
    if (blockedDates.includes(dateString)) {
      newBlockedDates = blockedDates.filter(d => d !== dateString);
    } else {
      newBlockedDates = [...blockedDates, dateString];
    }
    
    const { error } = await supabase
      .from('settings')
      .upsert({ key: 'blocked_dates', value: newBlockedDates }, { onConflict: 'key' });

    if (error) {
      console.error('Error saving blocked dates:', error);
      return;
    }
    setBlockedDates(newBlockedDates);
  };

  const isDateBlocked = (dateString) => {
    return blockedDates.includes(dateString);
  };

  const addToCart = (item, selectedOption = null, quantity = 1) => {
    const cartKey = `${item.id}-${selectedOption || 'default'}`;
    const existing = cart.find(c => c.cartKey === cartKey);
    
    if (existing) {
      setCart(cart.map(c => c.cartKey === cartKey ? { ...c, quantity: c.quantity + quantity } : c));
    } else {
      setCart([...cart, { 
        ...item, 
        cartKey,
        selectedOption, 
        quantity 
      }]);
    }
  };

  const updateCartQuantity = (cartKey, newQuantity) => {
    if (newQuantity <= 0) {
      setCart(cart.filter(c => c.cartKey !== cartKey));
    } else {
      setCart(cart.map(c => c.cartKey === cartKey ? { ...c, quantity: newQuantity } : c));
    }
  };

  const removeFromCart = (cartKey) => {
    setCart(cart.filter(c => c.cartKey !== cartKey));
  };

  const getCartTotal = () => {
    return cart.reduce((total, item) => {
      const price = parseFloat(item.price) || 0;
      return total + (price * item.quantity);
    }, 0);
  };

  const submitOrder = async () => {
    if (!customerName.trim() || !customerEmail.trim() || cart.length === 0) return;
    
    const orderItems = cart.map(item => ({
      id: item.id,
      name: item.name,
      emoji: item.emoji,
      selectedOption: item.selectedOption,
      quantity: item.quantity,
      price: item.price
    }));

    const orderData = {
      customer_name: customerName.trim(),
      customer_email: customerEmail.trim(),
      requested_date: requestedDate || null,
      fulfillment_type: fulfillmentType,
      delivery_address: fulfillmentType === 'delivery' ? deliveryAddress.trim() : null,
      items: orderItems,
      total: getCartTotal(),
      note: orderNote.trim() || null,
      status: 'pending',
      is_fulfilled: false,
      is_paid: false
    };

    const { error } = await supabase
      .from('orders')
      .insert(orderData);

    if (error) {
      console.error('Error submitting order:', error);
      setError('Failed to submit order. Please try again.');
      return;
    }

    // Send confirmation emails (don't block on this)
    sendOrderEmails({ ...orderData, admin_email: adminEmail }).catch(err => console.error('Email error:', err));

    setCart([]);
    setCustomerName('');
    setCustomerEmail('');
    setRequestedDate('');
    setFulfillmentType('pickup');
    setDeliveryAddress('');
    setOrderNote('');
    setView('confirmation');
  };

  const handleAdminLogin = () => {
    if (passwordInput.toLowerCase() === ADMIN_PASSWORD) {
      setIsAdmin(true);
      setPasswordInput('');
      setView('admin');
    }
  };

  const toggleItemStock = async (itemId) => {
    const item = items.find(i => i.id === itemId);
    const { error } = await supabase
      .from('items')
      .update({ in_stock: !item.in_stock })
      .eq('id', itemId);

    if (error) {
      console.error('Error updating item:', error);
      return;
    }
    await loadItems();
  };

  const updateItemPrice = async (itemId) => {
    const { error } = await supabase
      .from('items')
      .update({ price: parseFloat(tempPrice) || 0 })
      .eq('id', itemId);

    if (error) {
      console.error('Error updating price:', error);
      return;
    }
    setEditingPrice(null);
    setTempPrice('');
    await loadItems();
  };

  const updateItemOptions = async (itemId) => {
    const optionsArray = tempOptions.split(',').map(o => o.trim()).filter(o => o);
    const { error } = await supabase
      .from('items')
      .update({ options: optionsArray.length > 0 ? optionsArray : null })
      .eq('id', itemId);

    if (error) {
      console.error('Error updating options:', error);
      return;
    }
    setEditingOptions(null);
    setTempOptions('');
    await loadItems();
  };

  const updateItemDescription = async (itemId) => {
    const { error } = await supabase
      .from('items')
      .update({ description: tempDescription.trim() || null })
      .eq('id', itemId);

    if (error) {
      console.error('Error updating description:', error);
      return;
    }
    setEditingDescription(null);
    setTempDescription('');
    await loadItems();
  };

  const addItem = async () => {
    if (!newItem.name.trim()) return;
    
    const optionsArray = newItem.options.split(',').map(o => o.trim()).filter(o => o);
    
    const { error } = await supabase
      .from('items')
      .insert({
        name: newItem.name.trim(),
        description: newItem.description.trim() || null,
        emoji: newItem.emoji || '🍪',
        price: parseFloat(newItem.price) || 0,
        options: optionsArray.length > 0 ? optionsArray : null,
        in_stock: true
      });

    if (error) {
      console.error('Error adding item:', error);
      return;
    }
    
    setNewItem({ name: '', description: '', emoji: '🍪', price: '', options: '' });
    await loadItems();
  };

  const deleteItem = async (itemId) => {
    const { error } = await supabase
      .from('items')
      .delete()
      .eq('id', itemId);

    if (error) {
      console.error('Error deleting item:', error);
      return;
    }
    await loadItems();
  };

  const toggleOrderFulfilled = async (orderId) => {
    const order = orders.find(o => o.id === orderId);
    const { error } = await supabase
      .from('orders')
      .update({ is_fulfilled: !order.is_fulfilled })
      .eq('id', orderId);

    if (error) {
      console.error('Error updating order:', error);
      return;
    }
    await loadOrders();
  };

  const toggleOrderPaid = async (orderId) => {
    const order = orders.find(o => o.id === orderId);
    const { error } = await supabase
      .from('orders')
      .update({ is_paid: !order.is_paid })
      .eq('id', orderId);

    if (error) {
      console.error('Error updating order:', error);
      return;
    }
    await loadOrders();
  };

  const deleteOrder = async (orderId) => {
    const { error } = await supabase
      .from('orders')
      .delete()
      .eq('id', orderId);

    if (error) {
      console.error('Error deleting order:', error);
      return;
    }
    await loadOrders();
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price || 0);
  };

  const getTomorrowDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  };

  const formatFulfillmentType = (type) => {
    switch (type) {
      case 'pickup': return '📍 Pickup';
      case 'gym': return '🏋️ Gym Pickup (6am)';
      case 'delivery': return '🚗 Delivery';
      default: return type;
    }
  };

  // Calendar helpers
  const getCalendarDays = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();
    
    const days = [];
    
    // Empty cells for days before the 1st
    for (let i = 0; i < startingDay; i++) {
      days.push(null);
    }
    
    // Days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    
    return days;
  };

  const formatDateString = (date) => {
    return date.toISOString().split('T')[0];
  };

  const isPastDate = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  // Get orders for a specific date
  const getOrdersForDate = (dateString) => {
    return orders.filter(order => order.requested_date === dateString);
  };

  // Filter orders based on status
  const getFilteredOrders = () => {
    return orders.filter(order => {
      switch (statusFilter) {
        case 'pending':
          return !order.is_fulfilled && !order.is_paid;
        case 'fulfilled':
          return order.is_fulfilled && !order.is_paid;
        case 'paid':
          return order.is_paid && !order.is_fulfilled;
        case 'complete':
          return order.is_fulfilled && order.is_paid;
        default:
          return true;
      }
    });
  };

  // Get order status color
  const getOrderStatusColor = (order) => {
    if (order.is_fulfilled && order.is_paid) return 'bg-green-600';
    if (order.is_fulfilled) return 'bg-blue-600';
    if (order.is_paid) return 'bg-emerald-600';
    return 'bg-yellow-600';
  };

  const getOrderStatusText = (order) => {
    if (order.is_fulfilled && order.is_paid) return 'Complete';
    if (order.is_fulfilled) return 'Fulfilled';
    if (order.is_paid) return 'Paid';
    return 'Pending';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-xl text-purple-300">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-red-900 text-red-200 p-4 rounded-lg max-w-md text-center">
          <p className="mb-4">{error}</p>
          <button 
            onClick={loadData}
            className="bg-red-700 hover:bg-red-600 px-4 py-2 rounded"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-black text-white p-4 shadow-lg border-b-2 border-purple-600">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div 
            className="flex items-center gap-3 cursor-pointer" 
            onClick={() => { setView('menu'); setIsAdmin(false); }}
          >
            <img src="/logo-light.png" alt="Badass Bakery" className="h-12 w-12 object-contain" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-wide">
              <span className="text-purple-400">BADASS</span> BAKERY
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {cart.length > 0 && !isAdmin && (
              <button
                onClick={() => setView('cart')}
                className="relative text-sm bg-purple-600 hover:bg-purple-500 px-3 py-1 rounded"
              >
                🛒 {cart.reduce((sum, item) => sum + item.quantity, 0)}
              </button>
            )}
            {!isAdmin && (
              <button
                onClick={() => setView('login')}
                className="text-sm bg-purple-700 hover:bg-purple-600 px-3 py-1 rounded"
              >
                Admin
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => { setIsAdmin(false); setView('menu'); }}
                className="text-sm bg-purple-700 hover:bg-purple-600 px-3 py-1 rounded"
              >
                Exit Admin
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4">
        {/* Menu View */}
        {view === 'menu' && (
          <div className="max-w-2xl mx-auto">
            <p className="text-purple-300 mb-6 text-center text-lg">
              Welcome, friend! Check out what's baking. 🔥
            </p>
            
            <div className="space-y-3 mb-6">
              {items.filter(i => i.in_stock).map(item => (
                <MenuItem 
                  key={item.id} 
                  item={item} 
                  onAddToCart={addToCart}
                  formatPrice={formatPrice}
                />
              ))}
              {items.filter(i => i.in_stock).length === 0 && (
                <p className="text-center text-gray-500 py-8">Nothing available right now - check back soon!</p>
              )}
            </div>

            {cart.length > 0 && (
              <button
                onClick={() => setView('cart')}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white py-3 rounded-lg font-bold transition-colors"
              >
                View Cart ({cart.reduce((sum, item) => sum + item.quantity, 0)} items) — {formatPrice(getCartTotal())}
              </button>
            )}
          </div>
        )}

        {/* Cart View */}
        {view === 'cart' && (
          <div className="max-w-2xl mx-auto">
            <button
              onClick={() => setView('menu')}
              className="text-purple-400 hover:text-purple-300 mb-4 flex items-center gap-1"
            >
              ← Back to Menu
            </button>
            
            <div className="bg-gray-800 rounded-lg p-4 shadow-lg border-2 border-purple-500 mb-4">
              <h2 className="font-bold text-white mb-3 text-lg">🛒 Your Cart</h2>
              <div className="space-y-2 mb-4">
                {cart.map(item => (
                  <div key={item.cartKey} className="flex justify-between items-center text-gray-200 py-2 border-b border-gray-700">
                    <div className="flex-1">
                      <span>{item.emoji} {item.name}</span>
                      {item.selectedOption && (
                        <span className="text-purple-400 text-sm ml-2">({item.selectedOption})</span>
                      )}
                      <div className="text-gray-400 text-sm">{formatPrice(item.price)} each</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateCartQuantity(item.cartKey, item.quantity - 1)}
                        className="w-8 h-8 bg-gray-700 hover:bg-gray-600 rounded text-white"
                      >
                        -
                      </button>
                      <span className="w-8 text-center">{item.quantity}</span>
                      <button
                        onClick={() => updateCartQuantity(item.cartKey, item.quantity + 1)}
                        className="w-8 h-8 bg-gray-700 hover:bg-gray-600 rounded text-white"
                      >
                        +
                      </button>
                      <span className="w-20 text-right text-purple-300">{formatPrice(item.price * item.quantity)}</span>
                      <button
                        onClick={() => removeFromCart(item.cartKey)}
                        className="ml-2 text-red-400 hover:text-red-300"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="flex justify-between items-center text-white font-bold text-lg border-t border-gray-600 pt-3">
                <span>Total</span>
                <span className="text-purple-300">{formatPrice(getCartTotal())}</span>
              </div>
            </div>

            {/* Order Details Form */}
            <div className="bg-gray-800 rounded-lg p-4 shadow-lg border border-gray-700">
              <h3 className="font-bold text-white mb-3">Order Details</h3>
              
              <input
                type="text"
                placeholder="Your name *"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded p-2 mb-3 text-white placeholder-gray-400 focus:border-purple-500 focus:outline-none"
              />
              
              <input
                type="email"
                placeholder="Email address *"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded p-2 mb-3 text-white placeholder-gray-400 focus:border-purple-500 focus:outline-none"
              />
              
              <div className="mb-3">
                <label className="text-gray-400 text-sm mb-1 block">Requested date</label>
                <input
                  type="date"
                  value={requestedDate}
                  onChange={(e) => {
                    if (!isDateBlocked(e.target.value)) {
                      setRequestedDate(e.target.value);
                    } else {
                      alert('Sorry, that date is not available. Please select a different date.');
                    }
                  }}
                  min={getTomorrowDate()}
                  className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white focus:border-purple-500 focus:outline-none"
                />
                {blockedDates.length > 0 && (
                  <p className="text-gray-500 text-xs mt-1">Some dates may be unavailable</p>
                )}
              </div>
              
              <div className="mb-3">
                <label className="text-gray-400 text-sm mb-1 block">How do you want to get it?</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setFulfillmentType('pickup')}
                    className={`py-2 px-2 rounded font-medium transition-colors text-sm ${
                      fulfillmentType === 'pickup'
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    📍 Pickup
                  </button>
                  <button
                    onClick={() => setFulfillmentType('gym')}
                    className={`py-2 px-2 rounded font-medium transition-colors text-sm ${
                      fulfillmentType === 'gym'
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    🏋️ Gym (6am)
                  </button>
                  <button
                    onClick={() => setFulfillmentType('delivery')}
                    className={`py-2 px-2 rounded font-medium transition-colors text-sm ${
                      fulfillmentType === 'delivery'
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    🚗 Delivery
                  </button>
                </div>
              </div>
              
              {fulfillmentType === 'delivery' && (
                <input
                  type="text"
                  placeholder="Delivery address"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded p-2 mb-3 text-white placeholder-gray-400 focus:border-purple-500 focus:outline-none"
                />
              )}
              
              <textarea
                placeholder="Any notes? (optional)"
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded p-2 mb-3 h-20 text-white placeholder-gray-400 focus:border-purple-500 focus:outline-none"
              />
              
              <button
                onClick={submitOrder}
                disabled={!customerName.trim() || !customerEmail.trim() || cart.length === 0}
                className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:text-gray-400 text-white py-3 rounded-lg font-bold transition-colors"
              >
                Place Order — {formatPrice(getCartTotal())}
              </button>
            </div>
          </div>
        )}

        {/* Order Confirmation */}
        {view === 'confirmation' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-gray-800 rounded-lg p-8 shadow-lg border border-purple-500 text-center">
              <div className="text-5xl mb-4">🎉</div>
              <h2 className="text-2xl font-bold text-white mb-2">Hell Yeah!</h2>
              <p className="text-purple-300 mb-6">Your order is in. Theresa will hit you up soon.</p>
              <button
                onClick={() => setView('menu')}
                className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-lg font-medium"
              >
                Back to Menu
              </button>
            </div>
          </div>
        )}

        {/* Admin Login */}
        {view === 'login' && !isAdmin && (
          <div className="max-w-sm mx-auto">
            <div className="bg-gray-800 rounded-lg p-6 shadow-lg border border-gray-700">
              <h2 className="text-xl font-bold text-white mb-4">Admin Login</h2>
              <input
                type="password"
                placeholder="Password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
                autoComplete="off"
                data-1p-ignore
                className="w-full bg-gray-700 border border-gray-600 rounded p-2 mb-3 text-white placeholder-gray-400 focus:border-purple-500 focus:outline-none"
              />
              <button
                onClick={handleAdminLogin}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white py-2 rounded-lg font-medium"
              >
                Login
              </button>
              <button
                onClick={() => setView('menu')}
                className="w-full text-purple-400 hover:text-purple-300 py-2 mt-2"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Admin View */}
        {view === 'admin' && isAdmin && (
          <div>
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setView('admin')}
                className="flex-1 bg-purple-600 text-white py-2 rounded-lg font-medium text-sm"
              >
                Items
              </button>
              <button
                onClick={() => setView('orders')}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg font-medium text-sm"
              >
                Orders ({orders.filter(o => !o.is_fulfilled || !o.is_paid).length})
              </button>
              <button
                onClick={() => setView('availability')}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg font-medium text-sm"
              >
                Availability
              </button>
              <button
                onClick={() => setView('settings')}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg font-medium text-sm"
              >
                Settings
              </button>
            </div>

            {/* Add New Item */}
            <div className="bg-gray-800 rounded-lg p-4 shadow-lg border border-gray-700 mb-4">
              <h3 className="font-bold text-white mb-3">Add New Item</h3>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  placeholder="🍪"
                  value={newItem.emoji}
                  onChange={(e) => setNewItem({ ...newItem, emoji: e.target.value })}
                  className="w-16 bg-gray-700 border border-gray-600 rounded p-2 text-center text-white focus:border-purple-500 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Item name"
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  className="flex-1 bg-gray-700 border border-gray-600 rounded p-2 text-white placeholder-gray-400 focus:border-purple-500 focus:outline-none"
                />
              </div>
              <input
                type="text"
                placeholder="Description"
                value={newItem.description}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded p-2 mb-2 text-white placeholder-gray-400 focus:border-purple-500 focus:outline-none"
              />
              <div className="flex gap-2 mb-2">
                <input
                  type="number"
                  step="0.01"
                  placeholder="Price"
                  value={newItem.price}
                  onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                  className="w-24 bg-gray-700 border border-gray-600 rounded p-2 text-white placeholder-gray-400 focus:border-purple-500 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Options (comma separated)"
                  value={newItem.options}
                  onChange={(e) => setNewItem({ ...newItem, options: e.target.value })}
                  className="flex-1 bg-gray-700 border border-gray-600 rounded p-2 text-white placeholder-gray-400 focus:border-purple-500 focus:outline-none"
                />
              </div>
              <button
                onClick={addItem}
                disabled={!newItem.name.trim()}
                className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 text-white py-2 rounded-lg font-medium"
              >
                Add Item
              </button>
            </div>

            {/* Item List */}
            <div className="space-y-2">
              {items.map(item => (
                <div 
                  key={item.id} 
                  className="bg-gray-800 rounded-lg p-3 shadow border border-gray-700"
                >
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{item.emoji}</span>
                      <div>
                        <span className="font-medium text-white">{item.name}</span>
                        {!item.in_stock && <span className="ml-2 text-red-400 text-sm">(Out of stock)</span>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => toggleItemStock(item.id)}
                        className={`px-3 py-1 rounded text-sm font-medium ${
                          item.in_stock 
                            ? 'bg-red-900 text-red-300 hover:bg-red-800' 
                            : 'bg-green-900 text-green-300 hover:bg-green-800'
                        }`}
                      >
                        {item.in_stock ? 'Mark Out' : 'Mark In'}
                      </button>
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="px-3 py-1 rounded text-sm bg-gray-700 text-gray-300 hover:bg-gray-600"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  
                  {/* Description editing */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-gray-400 text-sm w-16">Desc:</span>
                    {editingDescription === item.id ? (
                      <div className="flex gap-2 flex-1">
                        <input
                          type="text"
                          value={tempDescription}
                          onChange={(e) => setTempDescription(e.target.value)}
                          placeholder="Item description"
                          className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm focus:border-purple-500 focus:outline-none"
                        />
                        <button
                          onClick={() => updateItemDescription(item.id)}
                          className="px-2 py-1 bg-green-700 text-green-200 rounded text-sm"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => { setEditingDescription(null); setTempDescription(''); }}
                          className="px-2 py-1 bg-gray-700 text-gray-300 rounded text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { 
                          setEditingDescription(item.id); 
                          setTempDescription(item.description || ''); 
                        }}
                        className="text-purple-300 hover:text-purple-200 text-sm text-left"
                      >
                        {item.description || 'No description'} ✏️
                      </button>
                    )}
                  </div>
                  
                  {/* Price editing */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-gray-400 text-sm w-16">Price:</span>
                    {editingPrice === item.id ? (
                      <div className="flex gap-2 flex-1">
                        <input
                          type="number"
                          step="0.01"
                          value={tempPrice}
                          onChange={(e) => setTempPrice(e.target.value)}
                          className="w-24 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm focus:border-purple-500 focus:outline-none"
                        />
                        <button
                          onClick={() => updateItemPrice(item.id)}
                          className="px-2 py-1 bg-green-700 text-green-200 rounded text-sm"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => { setEditingPrice(null); setTempPrice(''); }}
                          className="px-2 py-1 bg-gray-700 text-gray-300 rounded text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingPrice(item.id); setTempPrice(item.price?.toString() || '0'); }}
                        className="text-purple-300 hover:text-purple-200 text-sm"
                      >
                        {formatPrice(item.price)} ✏️
                      </button>
                    )}
                  </div>
                  
                  {/* Options editing */}
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-sm w-16">Options:</span>
                    {editingOptions === item.id ? (
                      <div className="flex gap-2 flex-1">
                        <input
                          type="text"
                          value={tempOptions}
                          onChange={(e) => setTempOptions(e.target.value)}
                          placeholder="Comma separated options"
                          className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm focus:border-purple-500 focus:outline-none"
                        />
                        <button
                          onClick={() => updateItemOptions(item.id)}
                          className="px-2 py-1 bg-green-700 text-green-200 rounded text-sm"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => { setEditingOptions(null); setTempOptions(''); }}
                          className="px-2 py-1 bg-gray-700 text-gray-300 rounded text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { 
                          setEditingOptions(item.id); 
                          setTempOptions(item.options?.join(', ') || ''); 
                        }}
                        className="text-purple-300 hover:text-purple-200 text-sm"
                      >
                        {item.options?.length > 0 ? item.options.join(', ') : 'None'} ✏️
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Availability Calendar View */}
        {view === 'availability' && isAdmin && (
          <div>
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setView('admin')}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg font-medium text-sm"
              >
                Items
              </button>
              <button
                onClick={() => setView('orders')}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg font-medium text-sm"
              >
                Orders ({orders.filter(o => !o.is_fulfilled || !o.is_paid).length})
              </button>
              <button
                onClick={() => setView('availability')}
                className="flex-1 bg-purple-600 text-white py-2 rounded-lg font-medium text-sm"
              >
                Availability
              </button>
              <button
                onClick={() => setView('settings')}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg font-medium text-sm"
              >
                Settings
              </button>
            </div>

            <div className="bg-gray-800 rounded-lg p-4 shadow-lg border border-gray-700">
              <div className="flex justify-between items-center mb-4">
                <button
                  onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1))}
                  className="text-purple-400 hover:text-purple-300 px-3 py-1"
                >
                  ← Prev
                </button>
                <h3 className="font-bold text-white text-lg">
                  {calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </h3>
                <button
                  onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1))}
                  className="text-purple-400 hover:text-purple-300 px-3 py-1"
                >
                  Next →
                </button>
              </div>
              
              <p className="text-gray-400 text-sm mb-4 text-center">
                Click a date to block/unblock it. Blocked dates will show as unavailable to customers.
              </p>
              
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="text-center text-gray-500 text-xs py-2">
                    {day}
                  </div>
                ))}
              </div>
              
              <div className="grid grid-cols-7 gap-1">
                {getCalendarDays(calendarMonth).map((date, idx) => {
                  if (!date) {
                    return <div key={`empty-${idx}`} className="aspect-square" />;
                  }
                  
                  const dateString = formatDateString(date);
                  const isBlocked = isDateBlocked(dateString);
                  const isPast = isPastDate(date);
                  const isToday = formatDateString(new Date()) === dateString;
                  
                  return (
                    <button
                      key={dateString}
                      onClick={() => !isPast && toggleBlockedDate(dateString)}
                      disabled={isPast}
                      className={`aspect-square rounded-lg text-sm font-medium transition-colors ${
                        isPast
                          ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                          : isBlocked
                            ? 'bg-red-900 text-red-300 hover:bg-red-800'
                            : 'bg-gray-700 text-white hover:bg-gray-600'
                      } ${isToday ? 'ring-2 ring-purple-500' : ''}`}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>
              
              <div className="flex gap-4 justify-center mt-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-gray-700 rounded"></div>
                  <span className="text-gray-400">Available</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-red-900 rounded"></div>
                  <span className="text-gray-400">Blocked</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Settings View */}
        {view === 'settings' && isAdmin && (
          <div>
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setView('admin')}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg font-medium text-sm"
              >
                Items
              </button>
              <button
                onClick={() => setView('orders')}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg font-medium text-sm"
              >
                Orders ({orders.filter(o => !o.is_fulfilled || !o.is_paid).length})
              </button>
              <button
                onClick={() => setView('availability')}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg font-medium text-sm"
              >
                Availability
              </button>
              <button
                onClick={() => setView('settings')}
                className="flex-1 bg-purple-600 text-white py-2 rounded-lg font-medium text-sm"
              >
                Settings
              </button>
            </div>

            <div className="bg-gray-800 rounded-lg p-4 shadow-lg border border-gray-700">
              <h3 className="font-bold text-white mb-4">Email Notifications</h3>
              <p className="text-gray-400 text-sm mb-3">
                New order notifications will be sent to this email address.
              </p>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="admin@example.com"
                  value={tempAdminEmail}
                  onChange={(e) => setTempAdminEmail(e.target.value)}
                  className="flex-1 bg-gray-700 border border-gray-600 rounded-lg p-2 text-white placeholder-gray-400 focus:border-purple-500 focus:outline-none"
                />
                <button
                  onClick={saveAdminEmail}
                  disabled={!tempAdminEmail.trim()}
                  className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg font-medium"
                >
                  {adminEmailSaved ? '✓ Saved' : 'Save'}
                </button>
              </div>
              {adminEmail && (
                <p className="text-gray-500 text-xs mt-2">
                  Currently set to: {adminEmail}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Orders View */}
        {view === 'orders' && isAdmin && (
          <div>
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setView('admin')}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg font-medium text-sm"
              >
                Items
              </button>
              <button
                onClick={() => setView('orders')}
                className="flex-1 bg-purple-600 text-white py-2 rounded-lg font-medium text-sm"
              >
                Orders ({orders.filter(o => !o.is_fulfilled || !o.is_paid).length})
              </button>
              <button
                onClick={() => setView('availability')}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg font-medium text-sm"
              >
                Availability
              </button>
              <button
                onClick={() => setView('settings')}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg font-medium text-sm"
              >
                Settings
              </button>
            </div>

            {/* View Mode Tabs */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setOrdersViewMode('calendar')}
                className={`px-4 py-2 rounded-lg font-medium text-sm ${
                  ordersViewMode === 'calendar'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                📅 Calendar
              </button>
              <button
                onClick={() => setOrdersViewMode('list')}
                className={`px-4 py-2 rounded-lg font-medium text-sm ${
                  ordersViewMode === 'list'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                📋 List
              </button>
            </div>

            {/* Status Filters */}
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="text-gray-400 text-sm py-1">Filter:</span>
              {[
                { value: 'all', label: 'All' },
                { value: 'pending', label: 'Pending', color: 'bg-yellow-600' },
                { value: 'fulfilled', label: 'Fulfilled', color: 'bg-blue-600' },
                { value: 'paid', label: 'Paid', color: 'bg-emerald-600' },
                { value: 'complete', label: 'Complete', color: 'bg-green-600' },
              ].map(filter => (
                <button
                  key={filter.value}
                  onClick={() => setStatusFilter(filter.value)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    statusFilter === filter.value
                      ? `${filter.color || 'bg-purple-600'} text-white`
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {filter.label} ({
                    filter.value === 'all' ? orders.length :
                    filter.value === 'pending' ? orders.filter(o => !o.is_fulfilled && !o.is_paid).length :
                    filter.value === 'fulfilled' ? orders.filter(o => o.is_fulfilled && !o.is_paid).length :
                    filter.value === 'paid' ? orders.filter(o => o.is_paid && !o.is_fulfilled).length :
                    orders.filter(o => o.is_fulfilled && o.is_paid).length
                  })
                </button>
              ))}
            </div>

            {/* Calendar View */}
            {ordersViewMode === 'calendar' && (
              <div className="bg-gray-800 rounded-lg p-4 shadow-lg border border-gray-700">
                <div className="flex justify-between items-center mb-4">
                  <button
                    onClick={() => setOrderCalendarMonth(new Date(orderCalendarMonth.getFullYear(), orderCalendarMonth.getMonth() - 1))}
                    className="text-purple-400 hover:text-purple-300 px-3 py-1"
                  >
                    ← Prev
                  </button>
                  <h3 className="font-bold text-white text-lg">
                    {orderCalendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                  </h3>
                  <button
                    onClick={() => setOrderCalendarMonth(new Date(orderCalendarMonth.getFullYear(), orderCalendarMonth.getMonth() + 1))}
                    className="text-purple-400 hover:text-purple-300 px-3 py-1"
                  >
                    Next →
                  </button>
                </div>
                
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="text-center text-gray-500 text-xs py-2">
                      {day}
                    </div>
                  ))}
                </div>
                
                <div className="grid grid-cols-7 gap-1">
                  {getCalendarDays(orderCalendarMonth).map((date, idx) => {
                    if (!date) {
                      return <div key={`empty-${idx}`} className="aspect-square" />;
                    }
                    
                    const dateString = formatDateString(date);
                    const dayOrders = getOrdersForDate(dateString).filter(order => {
                      if (statusFilter === 'all') return true;
                      if (statusFilter === 'pending') return !order.is_fulfilled && !order.is_paid;
                      if (statusFilter === 'fulfilled') return order.is_fulfilled && !order.is_paid;
                      if (statusFilter === 'paid') return order.is_paid && !order.is_fulfilled;
                      if (statusFilter === 'complete') return order.is_fulfilled && order.is_paid;
                      return true;
                    });
                    const isToday = formatDateString(new Date()) === dateString;
                    
                    return (
                      <div
                        key={dateString}
                        className={`min-h-24 rounded-lg bg-gray-700 p-1 ${isToday ? 'ring-2 ring-purple-500' : ''}`}
                      >
                        <div className="text-xs text-gray-400 mb-1">{date.getDate()}</div>
                        <div className="space-y-1">
                          {dayOrders.slice(0, 3).map(order => (
                            <button
                              key={order.id}
                              onClick={() => setSelectedOrder(order)}
                              className={`w-full text-left text-xs p-1 rounded truncate text-white ${getOrderStatusColor(order)} hover:opacity-80`}
                            >
                              {order.customer_name}
                            </button>
                          ))}
                          {dayOrders.length > 3 && (
                            <div className="text-xs text-gray-400 text-center">
                              +{dayOrders.length - 3} more
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-4 justify-center mt-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-yellow-600 rounded"></div>
                    <span className="text-gray-400">Pending</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-blue-600 rounded"></div>
                    <span className="text-gray-400">Fulfilled</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-emerald-600 rounded"></div>
                    <span className="text-gray-400">Paid</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-green-600 rounded"></div>
                    <span className="text-gray-400">Complete</span>
                  </div>
                </div>
              </div>
            )}

            {/* List View */}
            {ordersViewMode === 'list' && (
              <div>
                <button
                  onClick={loadOrders}
                  className="w-full mb-4 bg-gray-700 hover:bg-gray-600 text-gray-300 py-2 rounded-lg text-sm"
                >
                  🔄 Refresh Orders
                </button>

                {getFilteredOrders().length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No orders match this filter.</p>
                ) : (
                  <div className="space-y-3">
                    {getFilteredOrders().map(order => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        formatPrice={formatPrice}
                        formatFulfillmentType={formatFulfillmentType}
                        getOrderStatusColor={getOrderStatusColor}
                        getOrderStatusText={getOrderStatusText}
                        toggleOrderFulfilled={toggleOrderFulfilled}
                        toggleOrderPaid={toggleOrderPaid}
                        deleteOrder={deleteOrder}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Order Detail Modal */}
        {selectedOrder && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setSelectedOrder(null)}
          >
            <div 
              className="bg-gray-800 rounded-lg p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold text-white">{selectedOrder.customer_name}</h3>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="text-gray-400 hover:text-white text-xl"
                >
                  ×
                </button>
              </div>
              
              <OrderCard
                order={selectedOrder}
                formatPrice={formatPrice}
                formatFulfillmentType={formatFulfillmentType}
                getOrderStatusColor={getOrderStatusColor}
                getOrderStatusText={getOrderStatusText}
                toggleOrderFulfilled={(id) => { toggleOrderFulfilled(id); }}
                toggleOrderPaid={(id) => { toggleOrderPaid(id); }}
                deleteOrder={(id) => { deleteOrder(id); setSelectedOrder(null); }}
                expanded
              />
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-gray-600 text-sm">
        Made with 💜 for friends
      </footer>
    </div>
  );
}

// Order Card Component
function OrderCard({ order, formatPrice, formatFulfillmentType, getOrderStatusColor, getOrderStatusText, toggleOrderFulfilled, toggleOrderPaid, deleteOrder, expanded = false }) {
  return (
    <div 
      className={`bg-gray-800 rounded-lg p-4 shadow border ${
        order.is_fulfilled && order.is_paid
          ? 'border-gray-700 opacity-60' 
          : 'border-purple-500'
      }`}
    >
      <div className="flex justify-between items-start mb-2">
        <div>
          <span className="font-bold text-white">{order.customer_name}</span>
          <span className="text-sm text-gray-500 ml-2">
            {new Date(order.created_at).toLocaleString()}
          </span>
        </div>
        <span className={`text-xs px-2 py-1 rounded text-white ${getOrderStatusColor(order)}`}>
          {getOrderStatusText(order)}
        </span>
      </div>
      
      {/* Order Details */}
      <div className="text-sm text-gray-400 mb-2 space-y-1">
        <div>📧 {order.customer_email}</div>
        {order.requested_date && (
          <div>📅 Requested: {new Date(order.requested_date).toLocaleDateString()}</div>
        )}
        <div>
          {formatFulfillmentType(order.fulfillment_type)}
          {order.delivery_address && `: ${order.delivery_address}`}
        </div>
      </div>
      
      <ul className="text-sm mb-2 text-gray-300">
        {order.items.map((item, idx) => (
          <li key={idx}>
            {item.emoji} {item.name}
            {item.selectedOption && <span className="text-purple-400"> ({item.selectedOption})</span>}
            {' '}× {item.quantity}
            <span className="text-gray-500 ml-2">{formatPrice(item.price * item.quantity)}</span>
          </li>
        ))}
      </ul>
      
      <div className="text-white font-medium mb-2">
        Total: {formatPrice(order.total)}
      </div>
      
      {order.note && (
        <p className="text-sm text-purple-300 italic mb-2">"{order.note}"</p>
      )}
      
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => toggleOrderFulfilled(order.id)}
          className={`text-sm px-3 py-1 rounded font-medium ${
            order.is_fulfilled
              ? 'bg-blue-700 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          {order.is_fulfilled ? '✓ Fulfilled' : 'Mark Fulfilled'}
        </button>
        <button
          onClick={() => toggleOrderPaid(order.id)}
          className={`text-sm px-3 py-1 rounded font-medium ${
            order.is_paid
              ? 'bg-green-700 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          {order.is_paid ? '✓ Paid' : 'Mark Paid'}
        </button>
        <button
          onClick={() => deleteOrder(order.id)}
          className="text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1 rounded"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// Menu Item Component
function MenuItem({ item, onAddToCart, formatPrice }) {
  const [selectedOption, setSelectedOption] = useState(item.options?.[0] || null);
  const [quantity, setQuantity] = useState(1);
  
  const handleAddToCart = () => {
    onAddToCart(item, selectedOption, quantity);
    setQuantity(1);
  };
  
  return (
    <div className="bg-gray-800 rounded-lg p-4 shadow-lg border border-gray-700 hover:border-purple-500 transition-colors">
      <div className="flex justify-between items-start">
        <div className="flex items-start gap-3 flex-1">
          <span className="text-3xl">{item.emoji}</span>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-white">{item.name}</h3>
              <span className="text-purple-300 font-medium">{formatPrice(item.price)}</span>
            </div>
            <p className="text-sm text-gray-400">{item.description}</p>
            
            {item.options && item.options.length > 0 && (
              <select
                value={selectedOption || ''}
                onChange={(e) => setSelectedOption(e.target.value)}
                className="mt-2 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm focus:border-purple-500 focus:outline-none"
              >
                {item.options.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2 ml-3">
          <div className="flex items-center bg-gray-700 rounded">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="w-8 h-8 text-white hover:bg-gray-600 rounded-l"
            >
              -
            </button>
            <span className="w-8 text-center text-white">{quantity}</span>
            <button
              onClick={() => setQuantity(quantity + 1)}
              className="w-8 h-8 text-white hover:bg-gray-600 rounded-r"
            >
              +
            </button>
          </div>
          <button
            onClick={handleAddToCart}
            className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

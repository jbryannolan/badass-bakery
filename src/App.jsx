import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { sendOrderEmails, sendConfirmationEmail } from './email';
import { sendPushNotification, getVapidPublicKey } from './push';

// Image compression: resize to maxDimension and export as JPEG
async function compressImage(file, maxDimension = 800, quality = 0.8) {
  if (file.size > 20 * 1024 * 1024) throw new Error('File too large (max 20MB)');
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        const ratio = Math.min(maxDimension / width, maxDimension / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('Compression failed')),
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

const STATUS_STEPS = ['placed', 'confirmed', 'baking', 'ready', 'complete'];
const STATUS_CONFIG = {
  placed: { label: 'Placed', color: 'bg-yellow-600', emoji: '📋' },
  confirmed: { label: 'Confirmed', color: 'bg-blue-600', emoji: '✅' },
  baking: { label: 'Baking', color: 'bg-orange-500', emoji: '🔥' },
  ready: { label: 'Ready', color: 'bg-emerald-600', emoji: '🎉' },
  complete: { label: 'Complete', color: 'bg-green-600', emoji: '✨' },
};

// Normalize legacy status values to the new lifecycle
function normalizeStatus(order) {
  if (order.status && STATUS_STEPS.includes(order.status)) return order.status;
  if (order.status === 'pending') return 'placed';
  // Fallback for old boolean-only orders
  if (order.is_fulfilled && order.is_paid) return 'complete';
  if (order.is_fulfilled) return 'ready';
  return 'placed';
}

// Status Tracker for customer My Orders view
function StatusTracker({ order }) {
  const currentIdx = STATUS_STEPS.indexOf(normalizeStatus(order));
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between relative">
        {/* Connecting line */}
        <div className="absolute top-2 left-0 right-0 h-0.5 bg-gray-700" />
        <div className="absolute top-2 left-0 h-0.5 bg-purple-500 transition-all" style={{ width: `${(currentIdx / (STATUS_STEPS.length - 1)) * 100}%` }} />
        {STATUS_STEPS.map((step, i) => (
          <div key={step} className="flex flex-col items-center relative z-10" style={{ width: '20%' }}>
            <div className={`w-4 h-4 rounded-full border-2 transition-colors ${
              i <= currentIdx ? 'bg-purple-500 border-purple-500' : 'bg-gray-800 border-gray-600'
            }`} />
            <span className={`text-xs mt-1 ${i <= currentIdx ? 'text-purple-400' : 'text-gray-600'}`}>
              {STATUS_CONFIG[step].label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Bottom Sheet Component
function BottomSheet({ item, isOpen, onClose, onAddToCart, formatPrice }) {
  const [selectedOption, setSelectedOption] = useState(item?.options?.[0] || null);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (item) {
      setSelectedOption(item.options?.[0] || null);
      setQuantity(1);
    }
  }, [item]);

  if (!item) return null;

  const unitPrice = parseFloat(item.price) || 0;
  const totalPrice = unitPrice * quantity;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/60 z-50 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-gray-800 rounded-t-2xl transition-transform duration-300 md:bottom-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:max-w-md md:inset-x-auto ${
          isOpen ? 'translate-y-0 md:translate-y-[-50%]' : 'translate-y-full md:translate-y-[50%]'
        }`}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-600" />
        </div>

        <div className="px-5 pt-2 pb-4" style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}>
          {/* Item header */}
          <div className="text-center mb-4">
            {item.image_url ? (
              <img src={item.image_url} alt={item.name} className="w-full h-48 object-cover rounded-xl mb-3" />
            ) : (
              <span className="text-5xl">{item.emoji}</span>
            )}
            <h3 className="text-xl font-bold text-white mt-2">{item.name}</h3>
            {item.description && <p className="text-gray-400 text-sm mt-1">{item.description}</p>}
            <p className="text-amber-400 font-medium mt-1">{formatPrice(item.price)}</p>
          </div>

          {/* Option chips */}
          {item.options && item.options.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4 justify-center">
              {item.options.map(opt => (
                <button
                  key={opt}
                  onClick={() => setSelectedOption(opt)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    selectedOption === opt
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}

          {/* Quantity stepper */}
          <div className="flex items-center justify-center gap-6 mb-5">
            <button
              onClick={() => setQuantity(q => Math.max(1, q - 1))}
              className="w-12 h-12 rounded-full bg-gray-700 hover:bg-gray-600 text-white text-xl font-bold flex items-center justify-center"
            >
              -
            </button>
            <span className="text-2xl font-bold text-white w-8 text-center">{quantity}</span>
            <button
              onClick={() => setQuantity(q => q + 1)}
              className="w-12 h-12 rounded-full bg-gray-700 hover:bg-gray-600 text-white text-xl font-bold flex items-center justify-center"
            >
              +
            </button>
          </div>

          {/* Add to cart button */}
          <button
            onClick={() => onAddToCart(item, selectedOption, quantity)}
            className="w-full bg-purple-600 hover:bg-purple-500 text-white py-4 rounded-xl font-bold text-lg transition-colors"
          >
            Add to Cart - {formatPrice(totalPrice)}
          </button>
        </div>
      </div>
    </>
  );
}

// Order Card Component
function OrderCard({ order, formatPrice, formatFulfillmentType, getOrderStatusColor, getOrderStatusText, onAdvanceStatus, toggleOrderPaid, deleteOrder, expanded = false }) {
  const status = normalizeStatus(order);
  const currentIdx = STATUS_STEPS.indexOf(status);
  const nextStatus = currentIdx < STATUS_STEPS.length - 1 ? STATUS_STEPS[currentIdx + 1] : null;
  const prevStatus = currentIdx > 0 ? STATUS_STEPS[currentIdx - 1] : null;

  return (
    <div
      className={`bg-gray-800 rounded-lg p-4 shadow border ${
        status === 'complete' && order.is_paid
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
        {order.customer_phone && <div>📞 {order.customer_phone}</div>}
        {order.requested_date && (
          <div>📅 Requested: {new Date(order.requested_date + 'T12:00:00').toLocaleDateString()}</div>
        )}
        <div>
          {formatFulfillmentType(order.fulfillment_type)}
          {order.delivery_address && `: ${order.delivery_address}`}
        </div>
      </div>

      <ul className="text-sm mb-2 text-gray-300">
        {(order.items || []).map((item, idx) => (
          <li key={idx}>
            {item.emoji} {item.name}
            {item.selectedOption && <span className="text-purple-400"> ({item.selectedOption})</span>}
            {' '} x {item.quantity}
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
        {/* Back button */}
        {prevStatus && (
          <button
            onClick={() => onAdvanceStatus(order.id, 'back')}
            className="text-sm px-3 py-1 rounded font-medium bg-gray-700 text-gray-300 hover:bg-gray-600"
          >
            ← {STATUS_CONFIG[prevStatus].label}
          </button>
        )}
        {/* Forward / advance button */}
        {nextStatus && (
          <button
            onClick={() => onAdvanceStatus(order.id, 'forward')}
            className="text-sm px-3 py-1 rounded font-medium bg-purple-600 hover:bg-purple-500 text-white"
          >
            → {STATUS_CONFIG[nextStatus].label}
          </button>
        )}
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

function AdminBottomNav({ activeView, onNavigate, orders }) {
  const activeOrderCount = orders.filter(o => normalizeStatus(o) !== 'complete').length;
  const tabs = [
    {
      view: 'orders', label: 'Orders', badge: activeOrderCount > 0 ? activeOrderCount : null,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
        </svg>
      ),
    },
    {
      view: 'admin', label: 'Menu', badge: null,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      ),
    },
    {
      view: 'settings', label: 'Settings', badge: null,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-gray-900/95 backdrop-blur-md border-t border-gray-700 no-print" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="max-w-4xl mx-auto flex">
        {tabs.map(tab => (
          <button
            key={tab.view}
            onClick={() => onNavigate(tab.view)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors ${
              activeView === tab.view ? 'text-purple-400' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <div className="relative">
              {tab.icon}
              {tab.badge && (
                <span className="absolute -top-1.5 -right-2.5 bg-red-500 text-white text-[11px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {tab.badge > 99 ? '99+' : tab.badge}
                </span>
              )}
            </div>
            <span className="text-xs font-medium">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

// Menu Item Component — DoorDash-style photo-hero card
function MenuItem({ item, onTapItem, formatPrice, isJustAdded }) {
  const hasPhoto = !!item.image_url;

  return (
    <div
      onClick={() => onTapItem(item)}
      className={`rounded-xl overflow-hidden cursor-pointer transition-all active:scale-[0.97] ${
        isJustAdded ? 'ring-2 ring-green-500' : ''
      }`}
    >
      {/* Photo / placeholder hero */}
      <div className="relative">
        {hasPhoto ? (
          <img
            src={item.image_url}
            alt={item.name}
            loading="lazy"
            className="w-full aspect-square object-cover"
          />
        ) : (
          <div className="w-full aspect-square bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center">
            <span className="text-6xl">{item.emoji}</span>
          </div>
        )}
        {/* + button overlay */}
        <button className="absolute bottom-2 right-2 w-9 h-9 rounded-full bg-white text-gray-900 flex items-center justify-center text-xl font-bold shadow-md hover:bg-gray-100 transition-colors">
          +
        </button>
      </div>
      {/* Text below photo */}
      <div className="px-1 pt-2 pb-1">
        <h3 className="font-semibold text-white text-sm leading-tight line-clamp-2">{item.name}</h3>
        <p className="text-amber-400 text-sm font-medium mt-0.5">{formatPrice(item.price)}</p>
      </div>
    </div>
  );
}


export default function App() {
  const [view, setView] = useState('menu');
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminEmails, setAdminEmails] = useState([]);
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
  const [newItem, setNewItem] = useState({ name: '', description: '', emoji: '🍪', price: '', options: '' });
  const [editingPrice, setEditingPrice] = useState(null);
  const [editingOptions, setEditingOptions] = useState(null);
  const [editingDescription, setEditingDescription] = useState(null);
  const [tempPrice, setTempPrice] = useState('');
  const [tempOptions, setTempOptions] = useState('');
  const [tempDescription, setTempDescription] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [checkoutCalendarMonth, setCheckoutCalendarMonth] = useState(new Date());
  const [orderCalendarMonth, setOrderCalendarMonth] = useState(new Date());
  const [ordersSubView, setOrdersSubView] = useState('prep');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [adminEmail, setAdminEmail] = useState('');
  const [tempAdminEmail, setTempAdminEmail] = useState('');
  const [adminEmailSaved, setAdminEmailSaved] = useState(false);
  const [isOpen, setIsOpen] = useState(true);
  const [menuHeadline, setMenuHeadline] = useState('Everything is baked fresh by Theresa in small batches.');
  const [menuSubline, setMenuSubline] = useState('Pickup in Denver. Pay via Venmo or cash at pickup.');
  const [tempHeadline, setTempHeadline] = useState('Everything is baked fresh by Theresa in small batches.');
  const [tempSubline, setTempSubline] = useState('Pickup in Denver. Pay via Venmo or cash at pickup.');
  const [menuTextSaved, setMenuTextSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastOrder, setLastOrder] = useState(null);
  const [customerPhone, setCustomerPhone] = useState('');
  const [error, setError] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authMode, setAuthMode] = useState('signin');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [myOrders, setMyOrders] = useState([]);
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [myOrdersLoading, setMyOrdersLoading] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordSaving, setNewPasswordSaving] = useState(false);
  const [newPasswordMessage, setNewPasswordMessage] = useState('');

  // Feature 2: Bottom Sheet + Tappable Chips
  const [bottomSheetItem, setBottomSheetItem] = useState(null);
  const [justAdded, setJustAdded] = useState(null);

  // Order confirmation overlay (customer notification deep-link)
  const [confirmationOrder, setConfirmationOrder] = useState(null);

  // Feature 3: Admin Baking Prep View
  const [prepDate, setPrepDate] = useState('');

  // Feature 4: PWA Install Prompt
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  // Push Notifications
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushTestSent, setPushTestSent] = useState(false);
  const [blockedDatesOpen, setBlockedDatesOpen] = useState(false);

  // Photo upload state
  const [newItemPhoto, setNewItemPhoto] = useState(null);
  const [newItemPhotoPreview, setNewItemPhotoPreview] = useState(null);
  const [uploadingPhotoFor, setUploadingPhotoFor] = useState(null);

  useEffect(() => {
    loadData();

    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user ?? null;
      setCurrentUser(user);
      if (user) {
        setCustomerEmail(user.email);
        loadUserProfile(user.id);
        loadMyOrders(user.email);
        checkPushStatus();
        if (event === 'SIGNED_IN') setView('menu');
      }
    });

    return () => {
      authSubscription.unsubscribe();
    };
  }, []);

  // Deep-link: navigate to a specific order by ID
  const navigateToOrder = (orderId) => {
    const id = parseInt(orderId);
    if (!id) return;

    // Try immediately with current orders
    setOrders(prev => {
      const target = prev.find(o => o.id === id);
      if (target) {
        setIsAdmin(true);
        setView('orders');
        setSelectedOrder(target);
      }
      return prev;
    });

    // Also poll in case orders haven't loaded yet (cold start)
    const waitForOrders = setInterval(() => {
      setOrders(prev => {
        const target = prev.find(o => o.id === id);
        if (target) {
          clearInterval(waitForOrders);
          setIsAdmin(true);
          setView('orders');
          setSelectedOrder(target);
        }
        return prev;
      });
    }, 300);
    setTimeout(() => clearInterval(waitForOrders), 5000);
  };

  // Handle ?order=ID or ?confirmed=ID in URL (cold start from notification)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    window.history.replaceState({}, '', window.location.pathname);

    const orderId = params.get('order');
    if (orderId) {
      navigateToOrder(orderId);
      return;
    }

    const confirmedId = params.get('confirmed');
    if (confirmedId) {
      supabase.from('orders').select('*')
        .eq('id', parseInt(confirmedId)).single()
        .then(({ data }) => { if (data) setConfirmationOrder(data); });
    }
  }, []);

  // Handle postMessage from service worker (app already open)
  useEffect(() => {
    const handler = (event) => {
      if (event.data?.type === 'NAVIGATE_TO_ORDER') {
        const url = new URL(event.data.url, window.location.origin);

        // Customer confirmation deep-link
        const confirmedId = url.searchParams.get('confirmed');
        if (confirmedId) {
          supabase.from('orders').select('*')
            .eq('id', parseInt(confirmedId)).single()
            .then(({ data }) => { if (data) setConfirmationOrder(data); });
          return;
        }

        // Admin order deep-link
        const orderId = url.searchParams.get('order');
        if (orderId) {
          loadOrders().then(() => navigateToOrder(orderId));
        }
      }
    };
    navigator.serviceWorker?.addEventListener('message', handler);
    return () => navigator.serviceWorker?.removeEventListener('message', handler);
  }, []);

  // Feature 4: PWA install prompt effect
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (standalone || localStorage.getItem('install-dismissed')) return;

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIsIOS(ios);
    if (ios) { setShowInstallBanner(true); return; }

    const handler = (e) => { e.preventDefault(); setDeferredPrompt(e); setShowInstallBanner(true); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const loadData = async (retryCount = 0) => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadItems(), loadOrders(), loadBlockedDates(), loadAdminEmail(), loadIsOpen(), loadAdminEmails(), loadMenuText()]);
    } catch (err) {
      console.error('Error loading data:', err);
      if (retryCount < 2) {
        console.log(`Retrying loadData (attempt ${retryCount + 2})...`);
        return loadData(retryCount + 1);
      } else {
        setError('Failed to load data: ' + (err.message || 'Unknown error'));
      }
    }
    setLoading(false);
  };

  const loadItems = async () => {
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) { console.error('loadItems error:', error); throw error; }
    setItems(data || []);
  };

  const loadOrders = async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) { console.error('loadOrders error:', error); throw error; }
    const freshOrders = data || [];
    setOrders(freshOrders);
    return freshOrders;
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
      const email = typeof data.value === 'string' ? data.value.replace(/^"|"$/g, '') : data.value;
      setAdminEmail(email);
      setTempAdminEmail(email);
    }
  };

  const loadIsOpen = async () => {
    const { data, error } = await supabase.from('settings').select('*').eq('key', 'is_open').single();
    if (error && error.code !== 'PGRST116') console.error('Error loading is_open:', error);
    setIsOpen(data?.value !== false);
  };

  const loadAdminEmails = async () => {
    const { data, error } = await supabase.from('settings').select('*').eq('key', 'admin_emails').single();
    if (error && error.code !== 'PGRST116') console.error('Error loading admin emails:', error);
    if (data?.value) setAdminEmails(data.value);
  };

  const isUserAdmin = (email) => adminEmails.includes(email?.toLowerCase());

  const loadMenuText = async () => {
    const { data, error } = await supabase.from('settings').select('*').eq('key', 'menu_text').single();
    if (error && error.code !== 'PGRST116') console.error('Error loading menu text:', error);
    if (data?.value) {
      setMenuHeadline(data.value.headline || '');
      setMenuSubline(data.value.subline || '');
      setTempHeadline(data.value.headline || '');
      setTempSubline(data.value.subline || '');
    }
  };

  const saveMenuText = async () => {
    const value = { headline: tempHeadline.trim(), subline: tempSubline.trim() };
    const { error } = await supabase.from('settings').upsert({ key: 'menu_text', value }, { onConflict: 'key' });
    if (error) { console.error('Error saving menu text:', error); return; }
    setMenuHeadline(value.headline);
    setMenuSubline(value.subline);
    setMenuTextSaved(true);
    setTimeout(() => setMenuTextSaved(false), 2000);
  };

  const saveIsOpen = async (value) => {
    const { error } = await supabase.from('settings').upsert({ key: 'is_open', value }, { onConflict: 'key' });
    if (error) { console.error('Error saving is_open:', error); return; }
    setIsOpen(value);
  };

  // Push notification functions
  const checkPushStatus = async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      if (Notification.permission !== 'granted') { setPushEnabled(false); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setPushEnabled(!!sub);
    } catch (e) { console.error('checkPushStatus error:', e); }
  };

  const subscribeToPush = async () => {
    if (!currentUser) return;
    setPushLoading(true);
    try {
      const publicKey = await getVapidPublicKey();
      if (!publicKey) { setPushLoading(false); return; }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setPushLoading(false); return; }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // Store subscription in Supabase (delete existing for this email first, then insert)
      const subJson = sub.toJSON();
      await supabase.from('push_subscriptions').delete().eq('user_email', currentUser.email);
      const { error } = await supabase.from('push_subscriptions').insert({
        user_email: currentUser.email,
        subscription: subJson,
      });
      if (error) console.error('Error saving push subscription:', error);

      setPushEnabled(true);
    } catch (e) {
      console.error('subscribeToPush error:', e);
    }
    setPushLoading(false);
  };

  const unsubscribeFromPush = async () => {
    setPushLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        // Remove from Supabase by email (simple and reliable)
        if (currentUser) {
          await supabase.from('push_subscriptions').delete().eq('user_email', currentUser.email);
        }
      }
      setPushEnabled(false);
    } catch (e) {
      console.error('unsubscribeFromPush error:', e);
    }
    setPushLoading(false);
  };

  const sendTestPush = async () => {
    if (!currentUser) return;
    setPushTestSent(false);
    await sendPushNotification({
      title: '🫏 Test Notification',
      body: 'Push notifications are working!',
      url: '/',
      admin_email: currentUser.email,
    });
    setPushTestSent(true);
    setTimeout(() => setPushTestSent(false), 3000);
  };

  // Helper: convert VAPID key from base64 to Uint8Array
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }

  // Photo upload helpers
  const uploadItemPhoto = async (file, itemId) => {
    const compressed = await compressImage(file);
    const filename = `${itemId}_${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('item-photos').upload(filename, compressed, {
      contentType: 'image/jpeg',
      upsert: false,
    });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from('item-photos').getPublicUrl(filename);
    return urlData.publicUrl;
  };

  const deleteItemPhoto = async (imageUrl) => {
    if (!imageUrl) return;
    try {
      const filename = imageUrl.split('/').pop();
      await supabase.storage.from('item-photos').remove([filename]);
    } catch (e) {
      console.error('Error deleting photo from storage:', e);
    }
  };

  const loadUserProfile = async (userId) => {
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (error && error.code !== 'PGRST116') console.error('Error loading profile:', error);
      if (data) {
        setUserProfile(data);
        setProfileName(data.name || '');
        setProfilePhone(data.phone || '');
        if (data.name) setCustomerName(data.name);
        if (data.phone) setCustomerPhone(data.phone);
      }
    } catch (e) { console.error('loadUserProfile failed:', e); }
  };

  const saveUserProfile = async () => {
    if (!currentUser) return;
    setProfileSaving(true);
    const { error } = await supabase.from('profiles').upsert(
      { id: currentUser.id, name: profileName.trim() || null, phone: profilePhone.trim() || null },
      { onConflict: 'id' }
    );
    setProfileSaving(false);
    if (!error) {
      setUserProfile(prev => ({ ...prev, name: profileName.trim() || null, phone: profilePhone.trim() || null }));
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    }
  };

  const loadMyOrders = async (email) => {
    setMyOrdersLoading(true);
    const { data } = await supabase.from('orders').select('*').eq('customer_email', email).order('created_at', { ascending: false });
    setMyOrders(data || []);
    setMyOrdersLoading(false);
  };

  const handleAuth = async () => {
    if (!authEmail.trim() || !authPassword) return;
    if (authPassword.length < 6) { setAuthMessage('Error: Password must be at least 6 characters.'); return; }
    setAuthLoading(true);
    setAuthMessage('');
    if (authMode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
      setAuthLoading(false);
      if (error) setAuthMessage('Error: ' + error.message);
      else if (data?.user && !data.session) setAuthMessage('Account created! Check your email to confirm, then sign in.');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
      setAuthLoading(false);
      if (error) setAuthMessage('Error: ' + error.message);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setUserProfile(null);
    setMyOrders([]);
    setCustomerEmail('');
    setCustomerName('');
    setCustomerPhone('');
  };

  const handleSetPassword = async () => {
    if (newPassword.length < 6) { setNewPasswordMessage('Error: Password must be at least 6 characters.'); return; }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setNewPasswordMessage('Error: Session expired - please sign out and sign in again.'); return; }
    setNewPasswordSaving(true);
    setNewPasswordMessage('');
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out - please try again.')), 8000));
      const { error } = await Promise.race([supabase.auth.updateUser({ password: newPassword }), timeout]);
      if (error) setNewPasswordMessage('Error: ' + error.message);
      else { setNewPasswordMessage('Password set! You can now sign in with email + password.'); setNewPassword(''); }
    } catch (e) {
      setNewPasswordMessage('Error: ' + e.message);
    } finally {
      setNewPasswordSaving(false);
    }
  };

  const saveAdminEmail = async () => {
    const email = tempAdminEmail.trim();
    const { error } = await supabase
      .from('settings')
      .upsert({ key: 'admin_email', value: email });

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
    if (blockedDates.includes(dateString)) return true;
    // Auto-block today + next 2 days in Mountain Time
    const now = new Date();
    const mt = new Date(now.toLocaleString('en-US', { timeZone: 'America/Denver' }));
    for (let i = 0; i <= 2; i++) {
      const d = new Date(mt);
      d.setDate(d.getDate() + i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (ds === dateString) return true;
    }
    return false;
  };

  const addToCart = (item, selectedOption = null, quantity = 1) => {
    const cartKey = `${item.id}-${selectedOption || 'default'}`;
    setCart(prev => {
      const existing = prev.find(c => c.cartKey === cartKey);
      if (existing) return prev.map(c => c.cartKey === cartKey ? { ...c, quantity: c.quantity + quantity } : c);
      return [...prev, { ...item, cartKey, selectedOption, quantity }];
    });
  };

  const updateCartQuantity = (cartKey, newQuantity) => {
    setCart(prev => {
      if (newQuantity <= 0) return prev.filter(c => c.cartKey !== cartKey);
      return prev.map(c => c.cartKey === cartKey ? { ...c, quantity: newQuantity } : c);
    });
  };

  const removeFromCart = (cartKey) => {
    setCart(prev => prev.filter(c => c.cartKey !== cartKey));
  };

  const getCartTotal = () => {
    return cart.reduce((total, item) => {
      const price = parseFloat(item.price) || 0;
      return total + (price * item.quantity);
    }, 0);
  };

  const submitOrder = async () => {
    if (!customerName.trim() || !customerEmail.trim() || cart.length === 0 || !requestedDate) return;
    if (submitting) return;
    setSubmitting(true);

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
      customer_phone: customerPhone.trim() || null,
      requested_date: requestedDate,
      fulfillment_type: fulfillmentType,
      delivery_address: fulfillmentType === 'delivery' ? deliveryAddress.trim() : null,
      items: orderItems,
      total: getCartTotal(),
      note: orderNote.trim() || null,
      status: 'placed',
      status_history: [{ status: 'placed', timestamp: new Date().toISOString() }],
      is_fulfilled: false,
      is_paid: false
    };

    const { data: inserted, error } = await supabase
      .from('orders')
      .insert(orderData)
      .select('id')
      .single();

    if (error) {
      console.error('Error submitting order:', error);
      setError('Failed to submit order. Please try again.');
      setSubmitting(false);
      return;
    }

    // Send confirmation emails (don't block on this)
    sendOrderEmails({ ...orderData, admin_email: adminEmail }).catch(err => console.error('Email error:', err));

    // Send push notification to all admins with deep link to this order
    const orderUrl = inserted?.id ? `/?order=${inserted.id}` : '/';
    for (const email of adminEmails) {
      sendPushNotification({
        title: '🫏 New Order!',
        body: `${orderData.customer_name} - ${formatPrice(orderData.total)}`,
        url: orderUrl,
        admin_email: email,
      }).catch(err => console.error('Push error:', err));
    }

    // Update profile with latest name/phone for logged-in users
    if (currentUser) {
      supabase.from('profiles').upsert(
        { id: currentUser.id, name: customerName.trim() || null, phone: customerPhone.trim() || null },
        { onConflict: 'id' }
      ).then(() => loadMyOrders(currentUser.email));
    }

    setLastOrder({ ...orderData, items: orderItems });
    setCart([]);
    setCustomerName('');
    setCustomerEmail('');
    setCustomerPhone('');
    setRequestedDate('');
    setFulfillmentType('pickup');
    setDeliveryAddress('');
    setOrderNote('');
    setSubmitting(false);
    setView('confirmation');
  };

  // Feature 1: Advance order status lifecycle
  const advanceOrderStatus = async (orderId, direction = 'forward') => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    const currentStatus = normalizeStatus(order);
    const currentIdx = STATUS_STEPS.indexOf(currentStatus);
    const nextIdx = direction === 'forward'
      ? Math.min(currentIdx + 1, STATUS_STEPS.length - 1)
      : Math.max(currentIdx - 1, 0);
    const nextStatus = STATUS_STEPS[nextIdx];
    if (nextStatus === currentStatus) return;

    const history = Array.isArray(order.status_history) ? [...order.status_history] : [];
    history.push({ status: nextStatus, timestamp: new Date().toISOString() });

    const { error } = await supabase
      .from('orders')
      .update({
        status: nextStatus,
        status_history: history,
        is_fulfilled: ['ready', 'complete'].includes(nextStatus)
      })
      .eq('id', orderId);

    if (error) {
      console.error('Error advancing order status:', error);
      return;
    }

    // Notify customer when order is confirmed
    if (nextStatus === 'confirmed' && order.customer_email) {
      sendConfirmationEmail(order).catch(err => console.error('Confirmation email error:', err));
      sendPushNotification({
        title: 'Your order is confirmed! ✅',
        body: `Pay ${formatPrice(order.total)} via Venmo @Theresa-Ulrich-5`,
        url: `/?confirmed=${orderId}`,
        admin_email: order.customer_email,
      }).catch(err => console.error('Customer push error:', err));
    }

    const fresh = await loadOrders();
    if (selectedOrder?.id === orderId) {
      setSelectedOrder(fresh.find(o => o.id === orderId) || null);
    }
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
    const fresh = await loadOrders();
    if (selectedOrder?.id === orderId) {
      setSelectedOrder(fresh.find(o => o.id === orderId) || null);
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
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, in_stock: !i.in_stock } : i));
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
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, price: parseFloat(tempPrice) || 0 } : i));
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
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, options: optionsArray.length > 0 ? optionsArray : null } : i));
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
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, description: tempDescription.trim() || null } : i));
  };

  const addItem = async () => {
    if (!newItem.name.trim()) return;

    const optionsArray = newItem.options.split(',').map(o => o.trim()).filter(o => o);

    const { data, error } = await supabase
      .from('items')
      .insert({
        name: newItem.name.trim(),
        description: newItem.description.trim() || null,
        emoji: newItem.emoji || '🍪',
        price: parseFloat(newItem.price) || 0,
        options: optionsArray.length > 0 ? optionsArray : null,
        in_stock: true
      })
      .select();

    if (error) {
      console.error('Error adding item:', error);
      return;
    }

    let insertedItem = data?.[0];

    // Upload photo if one was selected
    if (insertedItem && newItemPhoto) {
      try {
        const imageUrl = await uploadItemPhoto(newItemPhoto, insertedItem.id);
        await supabase.from('items').update({ image_url: imageUrl }).eq('id', insertedItem.id);
        insertedItem = { ...insertedItem, image_url: imageUrl };
      } catch (e) {
        console.error('Photo upload failed:', e);
      }
    }

    setNewItem({ name: '', description: '', emoji: '🍪', price: '', options: '' });
    setNewItemPhoto(null);
    setNewItemPhotoPreview(null);
    if (insertedItem) setItems(prev => [...prev, insertedItem]);
  };

  const deleteItem = async (itemId) => {
    if (!window.confirm('Delete this item? This cannot be undone.')) return;

    // Clean up photo from storage first
    const item = items.find(i => i.id === itemId);
    if (item?.image_url) {
      await deleteItemPhoto(item.image_url);
    }

    const { error } = await supabase
      .from('items')
      .delete()
      .eq('id', itemId);

    if (error) {
      console.error('Error deleting item:', error);
      return;
    }
    setItems(prev => prev.filter(i => i.id !== itemId));
  };

  const deleteOrder = async (orderId) => {
    if (!window.confirm('Delete this order? This cannot be undone.')) return;
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
    return `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  };

  const formatFulfillmentType = (type) => {
    switch (type) {
      case 'pickup': return '📍 Pickup';
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

    for (let i = 0; i < startingDay; i++) {
      days.push(null);
    }

    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }

    return days;
  };

  const formatDateString = (date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
      if (statusFilter === 'all') return true;
      const s = normalizeStatus(order);
      return s === statusFilter;
    });
  };

  // Get order status color
  const getOrderStatusColor = (order) => {
    const s = normalizeStatus(order);
    return STATUS_CONFIG[s]?.color || 'bg-yellow-600';
  };

  const getOrderStatusText = (order) => {
    const s = normalizeStatus(order);
    return STATUS_CONFIG[s]?.label || 'Placed';
  };

  // Feature 3: Prep view helper - find next date with orders
  const getNextPrepDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = formatDateString(tomorrow);
    const futureDates = orders
      .map(o => o.requested_date)
      .filter(d => d && d >= tomorrowStr)
      .sort();
    return futureDates.length > 0 ? futureDates[0] : tomorrowStr;
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
    <div className="min-h-screen bg-gray-900 overflow-x-hidden">
      {/* Header */}
      <header className="bg-black/95 backdrop-blur-sm text-white shadow-lg border-b border-gray-800 sticky top-0 z-40" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="max-w-4xl mx-auto flex justify-between items-center px-4 py-3">
          <div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => { setView('menu'); setIsAdmin(false); }}
          >
            <img src="/logo-light.png" alt="Badass Bakery" className="h-12 w-12 object-contain" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-wide">
              <span className="text-purple-400 tracking-wider">BADASS</span> BAKERY
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
              currentUser
                ? <div className="flex items-center gap-2">
                    <button onClick={() => { setView('my-orders'); loadMyOrders(currentUser.email); }} className="text-purple-400 text-sm hover:text-purple-300">
                      {userProfile?.name ? userProfile.name.split(' ')[0] : currentUser.email.split('@')[0]}
                    </button>
                    <button onClick={handleSignOut} className="text-gray-400 text-xs hover:text-white">Sign out</button>
                  </div>
                : <button onClick={() => setView('customer-login')} className="text-purple-400 text-sm hover:text-purple-300">Sign in</button>
            )}
            {!isAdmin && currentUser && isUserAdmin(currentUser.email) && (
              <button
                onClick={() => { setIsAdmin(true); setView('orders'); }}
                className="text-sm bg-purple-700 hover:bg-purple-600 px-3 py-1 rounded"
              >
                Admin
              </button>
            )}
            {isAdmin && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => saveIsOpen(!isOpen)}
                  className="flex items-center gap-1.5 text-sm px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 transition-colors"
                  title={isOpen ? 'Bakery is open - tap to close' : 'Bakery is closed - tap to open'}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${isOpen ? 'bg-green-400' : 'bg-red-400'}`} />
                  <span className="text-gray-300 text-xs hidden sm:inline">{isOpen ? 'Open' : 'Closed'}</span>
                </button>
                <button
                  onClick={() => { setIsAdmin(false); setView('menu'); }}
                  className="text-sm bg-purple-700 hover:bg-purple-600 px-3 py-1 rounded"
                >
                  Exit
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-4 pb-8" style={{ paddingBottom: isAdmin ? 'calc(5rem + env(safe-area-inset-bottom, 0px))' : 'max(2rem, env(safe-area-inset-bottom, 0px))' }}>
        {/* Menu View */}
        {view === 'menu' && (
          <div className="max-w-2xl mx-auto animate-fadeIn">
            {menuHeadline && (
              <p className="text-purple-300 mb-2 text-center text-xl">{menuHeadline}</p>
            )}
            {menuSubline && (
              <p className="text-gray-500 mb-6 text-center text-sm">{menuSubline}</p>
            )}
            {!menuHeadline && !menuSubline && <div className="mb-6" />}

            {/* Feature 4: PWA Install Banner */}
            {showInstallBanner && (
              <div className="bg-purple-900/80 border border-purple-700 rounded-xl p-3 mb-4 flex items-center gap-3">
                <span className="text-2xl">📱</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium">Add to Home Screen</p>
                  <p className="text-purple-300 text-xs">{isIOS ? 'Tap Share then "Add to Home Screen"' : 'Get the full app experience'}</p>
                </div>
                {!isIOS && deferredPrompt && (
                  <button onClick={async () => { deferredPrompt.prompt(); const { outcome } = await deferredPrompt.userChoice; if (outcome === 'accepted') setShowInstallBanner(false); setDeferredPrompt(null); }}
                    className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium flex-shrink-0">
                    Install
                  </button>
                )}
                <button onClick={() => { setShowInstallBanner(false); localStorage.setItem('install-dismissed', 'true'); }}
                  className="text-purple-400 hover:text-white flex-shrink-0 text-lg leading-none">x</button>
              </div>
            )}

            {!isOpen ? (
              <div className="text-center py-12">
                <div className="text-5xl mb-4">🔒</div>
                <h2 className="text-xl font-bold text-white mb-2">We're Closed</h2>
                <p className="text-gray-400">We're not taking orders right now. Check back soon!</p>
              </div>
            ) : (
              <>
                <p className="text-xs uppercase tracking-widest text-gray-500 mb-3 text-center">Our Menu</p>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  {items.filter(i => i.in_stock).map(item => (
                    <MenuItem
                      key={item.id}
                      item={item}
                      onTapItem={(item) => setBottomSheetItem(item)}
                      formatPrice={formatPrice}
                      isJustAdded={justAdded === item.id}
                    />
                  ))}
                  {items.filter(i => i.in_stock).length === 0 && (
                    <div className="text-center py-12">
                      <div className="text-5xl mb-3">🍪</div>
                      <p className="text-white font-medium mb-1">Nothing in the oven yet</p>
                      <p className="text-gray-500 text-sm">Check back soon for fresh goodies!</p>
                    </div>
                  )}
                </div>

                {cart.length > 0 && <div className="h-20" />}
              </>
            )}
          </div>
        )}

        {/* Cart View */}
        {view === 'cart' && (
          <div className="max-w-2xl mx-auto animate-fadeIn">
            <button
              onClick={() => setView('menu')}
              className="text-purple-400 hover:text-purple-300 mb-4 flex items-center gap-1"
            >
              ← Back to Menu
            </button>

            <div className="bg-gray-800 rounded-lg p-4 shadow-lg border-2 border-purple-500 mb-4">
              <h2 className="font-bold text-white mb-3 text-xl">🛒 Your Cart</h2>
              <div className="space-y-2 mb-4">
                {cart.map(item => (
                  <div key={item.cartKey} className="text-gray-200 py-3 border-b border-gray-700">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xl">{item.emoji}</span>
                          <span className="font-medium">{item.name}</span>
                          {item.selectedOption && (
                            <span className="text-purple-400 text-sm">({item.selectedOption})</span>
                          )}
                        </div>
                        <div className="text-gray-400 text-sm ml-7">{formatPrice(item.price)} each</div>
                      </div>
                      <button
                        onClick={() => removeFromCart(item.cartKey)}
                        className="text-gray-500 hover:text-red-400 p-1 -mr-1"
                      >
                        🗑️
                      </button>
                    </div>
                    <div className="flex items-center justify-between ml-7">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateCartQuantity(item.cartKey, item.quantity - 1)}
                          className="w-9 h-9 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm"
                        >
                          -
                        </button>
                        <span className="w-6 text-center text-sm">{item.quantity}</span>
                        <button
                          onClick={() => updateCartQuantity(item.cartKey, item.quantity + 1)}
                          className="w-9 h-9 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm"
                        >
                          +
                        </button>
                      </div>
                      <span className="text-amber-400 font-medium">{formatPrice(item.price * item.quantity)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Empty Cart button */}
              <div className="text-center mb-3">
                <button
                  onClick={() => setCart([])}
                  className="text-gray-500 hover:text-gray-300 text-sm"
                >
                  Empty Cart
                </button>
              </div>

              <div className="flex justify-between items-center text-white font-bold text-xl border-t border-gray-600 pt-3">
                <span>Total</span>
                <span className="text-amber-400">{formatPrice(getCartTotal())}</span>
              </div>
            </div>

            {/* Order Details Form */}
            <div className="bg-gray-800 rounded-lg p-4 shadow-lg border border-gray-700">
              <h3 className="font-bold text-white mb-3 text-xl">Order Details</h3>

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
                onChange={(e) => !currentUser && setCustomerEmail(e.target.value)}
                readOnly={!!currentUser}
                className={`w-full bg-gray-700 border border-gray-600 rounded p-2 mb-1 text-white placeholder-gray-400 focus:outline-none ${currentUser ? 'opacity-60 cursor-not-allowed' : 'focus:border-purple-500'}`}
              />
              {!currentUser && (
                <p className="text-gray-500 text-xs mb-3">
                  <button onClick={() => setView('customer-login')} className="text-purple-400 hover:underline">Sign in</button> to save your info and see order history.
                </p>
              )}
              {currentUser && <div className="mb-3" />}

              <input
                type="tel"
                placeholder="Phone number (optional)"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded p-2 mb-3 text-white placeholder-gray-400 focus:border-purple-500 focus:outline-none"
              />

              <div className="mb-3">
                <label className="text-gray-400 text-sm mb-2 block">Requested date <span className="text-red-400">*</span></label>
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-3">
                    <button
                      onClick={() => {
                        const prev = new Date(checkoutCalendarMonth.getFullYear(), checkoutCalendarMonth.getMonth() - 1);
                        const now = new Date();
                        if (prev.getFullYear() > now.getFullYear() || (prev.getFullYear() === now.getFullYear() && prev.getMonth() >= now.getMonth())) {
                          setCheckoutCalendarMonth(prev);
                        }
                      }}
                      className={`p-1.5 rounded-full transition-colors ${
                        checkoutCalendarMonth.getMonth() === new Date().getMonth() && checkoutCalendarMonth.getFullYear() === new Date().getFullYear()
                          ? 'text-gray-600 cursor-not-allowed'
                          : 'text-gray-400 hover:text-white hover:bg-gray-700'
                      }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                      </svg>
                    </button>
                    <h4 className="font-semibold text-white text-sm">
                      {checkoutCalendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </h4>
                    <button
                      onClick={() => setCheckoutCalendarMonth(new Date(checkoutCalendarMonth.getFullYear(), checkoutCalendarMonth.getMonth() + 1))}
                      className="p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-0 mb-1">
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                      <div key={day} className="text-center text-gray-500 text-xs py-1.5 font-medium">
                        {day}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-0">
                    {getCalendarDays(checkoutCalendarMonth).map((date, idx) => {
                      if (!date) {
                        return <div key={`empty-${idx}`} className="aspect-square" />;
                      }

                      const dateString = formatDateString(date);
                      const isBlocked = isDateBlocked(dateString);
                      const isPast = isPastDate(date);
                      const isToday = formatDateString(new Date()) === dateString;
                      const isSelected = requestedDate === dateString;
                      const isUnavailable = isPast || isToday || isBlocked;

                      return (
                        <button
                          key={dateString}
                          onClick={() => !isUnavailable && setRequestedDate(dateString)}
                          disabled={isUnavailable}
                          className={`aspect-square rounded-full flex items-center justify-center text-sm transition-all ${
                            isSelected
                              ? 'bg-purple-600 text-white font-bold'
                              : isUnavailable
                                ? 'text-gray-600 cursor-not-allowed line-through'
                                : 'text-white hover:bg-gray-700 font-medium cursor-pointer'
                          }`}
                        >
                          {date.getDate()}
                        </button>
                      );
                    })}
                  </div>

                  {requestedDate && (
                    <div className="mt-3 pt-3 border-t border-gray-700 flex justify-between items-center">
                      <span className="text-sm text-gray-300">
                        {new Date(requestedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </span>
                      <button
                        onClick={() => setRequestedDate('')}
                        className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="mb-3">
                <label className="text-gray-400 text-sm mb-1 block">How do you want to get it?</label>
                <div className="grid grid-cols-2 gap-2">
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
                disabled={!customerName.trim() || !customerEmail.trim() || cart.length === 0 || !requestedDate || submitting}
                className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:text-gray-400 text-white py-3 rounded-lg font-bold transition-colors"
              >
                {submitting ? 'Placing Order...' : `Place Order - ${formatPrice(getCartTotal())}`}
              </button>
            </div>
          </div>
        )}

        {/* Order Confirmation */}
        {view === 'confirmation' && (
          <div className="max-w-2xl mx-auto animate-fadeIn">
            <div className="bg-gray-800 rounded-lg p-8 shadow-lg border border-purple-500 text-center">
              <div className="text-5xl mb-4">🎉</div>
              <h2 className="text-2xl font-bold text-white mb-2">Hell Yeah!</h2>
              <p className="text-purple-300 mb-6">Your order is in. Theresa will hit you up soon.</p>
              {lastOrder && (
                <div className="text-left bg-gray-900 rounded-lg p-4 mb-6 text-sm">
                  <p className="text-gray-400 mb-2"><span className="text-white font-medium">Name:</span> {lastOrder.customer_name}</p>
                  <p className="text-gray-400 mb-2">
                    <span className="text-white font-medium">Date:</span>{' '}
                    {lastOrder.requested_date
                      ? new Date(lastOrder.requested_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
                      : 'Not specified'}
                  </p>
                  <ul className="mb-2 text-gray-300">
                    {lastOrder.items.map((item, idx) => (
                      <li key={idx}>{item.emoji} {item.name}{item.selectedOption && <span className="text-purple-400"> ({item.selectedOption})</span>} x {item.quantity}</li>
                    ))}
                  </ul>
                  <p className="text-white font-medium">Total: <span className="text-amber-400">{formatPrice(lastOrder.total)}</span></p>

                  {/* What happens next */}
                  <div className="text-left text-sm text-gray-400 space-y-2 mt-4 pt-4 border-t border-gray-700">
                    <p className="text-white font-medium text-base mb-2">What happens next?</p>
                    <p>1. Theresa will confirm your order</p>
                    <p>2. She'll bake everything fresh</p>
                    <p>3. You'll get a heads up when it's ready</p>
                    {currentUser && <p className="text-purple-400 mt-2">Track your order status in My Account.</p>}
                  </div>
                </div>
              )}
              <button
                onClick={() => setView('menu')}
                className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-lg font-medium"
              >
                Back to Menu
              </button>
            </div>
          </div>
        )}

        {/* Customer Sign In */}
        {view === 'customer-login' && (
          <div className="max-w-sm mx-auto mt-12 bg-gray-800 rounded-lg p-6 border border-gray-700 animate-fadeIn">
            <h2 className="text-xl font-bold text-white mb-1">{authMode === 'signup' ? 'Create Account' : 'Sign In'}</h2>
            <p className="text-gray-400 text-sm mb-4">Save your info and see order history.</p>

            <button
              onClick={() => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-800 py-2.5 rounded-lg font-medium mb-4 transition-colors">
              <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              Continue with Google
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-gray-600"></div>
              <span className="text-gray-500 text-xs">or</span>
              <div className="flex-1 h-px bg-gray-600"></div>
            </div>

            <input type="email" placeholder="Email" value={authEmail} onChange={e => { setAuthEmail(e.target.value); setAuthMessage(''); }}
              className="w-full bg-gray-700 border border-gray-600 rounded p-2 mb-3 text-white placeholder-gray-400 focus:border-purple-500 focus:outline-none" />

            <input type="password" placeholder={authMode === 'signup' ? 'Create a password (min 6 chars)' : 'Password'}
              value={authPassword} onChange={e => { setAuthPassword(e.target.value); setAuthMessage(''); }}
              onKeyDown={e => e.key === 'Enter' && handleAuth()}
              className="w-full bg-gray-700 border border-gray-600 rounded p-2 mb-3 text-white placeholder-gray-400 focus:border-purple-500 focus:outline-none" />

            {authMessage && (
              <p className={`text-sm mb-3 ${authMessage.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>{authMessage}</p>
            )}

            <button
              onClick={handleAuth}
              disabled={authLoading || !authEmail.trim() || !authPassword}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white py-2 rounded-lg font-medium mb-3">
              {authLoading ? (authMode === 'signup' ? 'Creating...' : 'Signing in...') : authMode === 'signup' ? 'Create Account' : 'Sign In'}
            </button>

            <p className="text-center text-gray-500 text-xs mb-2">
              {authMode === 'signup'
                ? <>Already have an account? <button onClick={() => { setAuthMode('signin'); setAuthMessage(''); }} className="text-purple-400 hover:underline">Sign in</button></>
                : <>New here? <button onClick={() => { setAuthMode('signup'); setAuthMessage(''); }} className="text-purple-400 hover:underline">Create an account</button></>
              }
            </p>

            <button onClick={() => setView('menu')} className="w-full text-gray-500 text-sm mt-2 hover:text-gray-400">
              ← Continue without signing in
            </button>
          </div>
        )}

        {/* My Orders / Account */}
        {view === 'my-orders' && currentUser && (
          <div className="max-w-lg mx-auto animate-fadeIn">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">My Account</h2>
              <button onClick={() => setView('menu')} className="text-gray-400 text-sm hover:text-white">← Menu</button>
            </div>

            {/* Profile card */}
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 mb-6">
              <h3 className="font-bold text-white mb-3">Profile</h3>
              <p className="text-gray-400 text-xs mb-3">{currentUser.email}</p>
              <input type="text" placeholder="Your name" value={profileName} onChange={e => setProfileName(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded p-2 mb-2 text-white placeholder-gray-400 focus:border-purple-500 focus:outline-none" />
              <input type="tel" placeholder="Phone (optional)" value={profilePhone} onChange={e => setProfilePhone(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded p-2 mb-3 text-white placeholder-gray-400 focus:border-purple-500 focus:outline-none" />
              <button onClick={saveUserProfile} disabled={profileSaving}
                className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">
                {profileSaving ? 'Saving...' : profileSaved ? 'Saved!' : 'Save Profile'}
              </button>
            </div>

            {/* Change password */}
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 mb-6">
              <h3 className="font-bold text-white mb-1">Change Password</h3>
              <p className="text-gray-400 text-xs mb-3">Update your password.</p>
              <input
                type="password"
                placeholder="New password (min 6 chars)"
                value={newPassword}
                onChange={e => { setNewPassword(e.target.value); setNewPasswordMessage(''); }}
                className="w-full bg-gray-700 border border-gray-600 rounded p-2 mb-2 text-white placeholder-gray-400 focus:border-purple-500 focus:outline-none"
              />
              {newPasswordMessage && (
                <p className={`text-xs mb-2 ${newPasswordMessage.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>{newPasswordMessage}</p>
              )}
              <button
                onClick={handleSetPassword}
                disabled={newPasswordSaving || !newPassword.trim()}
                className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                {newPasswordSaving ? 'Saving...' : 'Set Password'}
              </button>
            </div>

            {/* Customer push notifications */}
            {'serviceWorker' in navigator && 'PushManager' in window && (
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 mb-6">
                <h3 className="font-bold text-white mb-1">Order Notifications</h3>
                <p className="text-gray-400 text-xs mb-3">Get notified when your orders are confirmed.</p>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-2 h-2 rounded-full ${pushEnabled ? 'bg-green-400' : 'bg-gray-500'}`} />
                  <span className="text-sm text-gray-300">
                    {pushEnabled ? 'Notifications active' : 'Not enabled'}
                  </span>
                </div>
                <button
                  onClick={pushEnabled ? unsubscribeFromPush : subscribeToPush}
                  disabled={pushLoading}
                  className={`px-4 py-2 rounded-lg font-medium text-sm ${
                    pushEnabled
                      ? 'bg-red-700 hover:bg-red-600 text-white'
                      : 'bg-purple-600 hover:bg-purple-500 text-white'
                  } disabled:opacity-50`}
                >
                  {pushLoading ? 'Working...' : pushEnabled ? 'Disable' : 'Enable Notifications'}
                </button>
                {typeof Notification !== 'undefined' && Notification.permission === 'denied' && (
                  <p className="text-red-400 text-xs mt-2">
                    Notifications are blocked. Check your browser/device settings.
                  </p>
                )}
              </div>
            )}

            {/* Order history */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-white text-xl">Order History</h3>
              <button
                onClick={() => loadMyOrders(currentUser.email)}
                disabled={myOrdersLoading}
                className="text-gray-400 hover:text-white text-sm disabled:opacity-50"
              >
                {myOrdersLoading ? 'Refreshing...' : '🔄 Refresh'}
              </button>
            </div>
            {myOrders.length === 0
              ? (
                <div className="text-center py-12">
                  <div className="text-5xl mb-3">📦</div>
                  <p className="text-white font-medium mb-1">No orders yet</p>
                  <p className="text-gray-500 text-sm">Your order history will show up here.</p>
                </div>
              )
              : myOrders.map(order => (
                  <div key={order.id} className="bg-gray-800 rounded-lg p-4 border border-gray-700 mb-3">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="text-white font-medium text-sm">
                          {order.requested_date
                            ? new Date(order.requested_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : 'Date TBD'}
                        </p>
                        <p className="text-gray-400 text-xs">Ordered {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-amber-400 font-medium text-sm">{formatPrice(order.total)}</p>
                        <div className="flex gap-1 mt-1 justify-end">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${order.is_paid ? 'bg-green-900 text-green-300' : 'bg-orange-900 text-orange-300'}`}>
                            {order.is_paid ? 'Paid' : 'Unpaid'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <ul className="text-gray-300 text-sm">
                      {(order.items || []).map((item, idx) => (
                        <li key={idx}>{item.emoji} {item.name}{item.selectedOption && <span className="text-purple-400"> ({item.selectedOption})</span>} x {item.quantity}</li>
                      ))}
                    </ul>
                    <StatusTracker order={order} />
                  </div>
                ))
            }
          </div>
        )}

        {/* Admin View */}
        {view === 'admin' && isAdmin && (
          <div className="animate-fadeIn">
            {/* Menu Header */}
            <div className="bg-gray-800 rounded-lg p-4 shadow-lg border border-gray-700 mb-4">
              <h3 className="font-bold text-white mb-2">Menu Header</h3>
              <p className="text-gray-400 text-sm mb-3">The headline and subtext shown above your menu.</p>
              <label className="text-gray-400 text-xs mb-1 block">Headline</label>
              <textarea
                rows={2}
                placeholder="e.g. Everything is baked fresh by Theresa in small batches."
                value={tempHeadline}
                onChange={(e) => { setTempHeadline(e.target.value); setMenuTextSaved(false); }}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 mb-3 text-white placeholder-gray-400 focus:border-purple-500 focus:outline-none resize-none"
              />
              <label className="text-gray-400 text-xs mb-1 block">Subtext</label>
              <textarea
                rows={2}
                placeholder="e.g. Pickup in Denver. Pay via Venmo or cash at pickup."
                value={tempSubline}
                onChange={(e) => { setTempSubline(e.target.value); setMenuTextSaved(false); }}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 mb-3 text-white placeholder-gray-400 focus:border-purple-500 focus:outline-none resize-none"
              />
              <button
                onClick={saveMenuText}
                className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg font-medium"
              >
                {menuTextSaved ? '✓ Saved' : 'Save'}
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

              {/* Photo upload */}
              <div className="mb-2">
                {newItemPhotoPreview ? (
                  <div className="relative inline-block">
                    <img src={newItemPhotoPreview} alt="Preview" className="w-20 h-20 object-cover rounded-lg border border-gray-600" />
                    <button
                      onClick={() => { setNewItemPhoto(null); setNewItemPhotoPreview(null); }}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-500"
                    >
                      x
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 border-2 border-dashed border-gray-600 rounded-lg p-3 cursor-pointer hover:border-purple-500 transition-colors">
                    <span className="text-gray-400 text-lg">📷</span>
                    <span className="text-gray-400 text-sm">Add Photo (optional)</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setNewItemPhoto(file);
                          setNewItemPhotoPreview(URL.createObjectURL(file));
                        }
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
              </div>

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
                        {item.in_stock ? 'Sold Out' : 'Restock'}
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

                  {/* Photo management */}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-gray-400 text-sm w-16">Photo:</span>
                    {uploadingPhotoFor === item.id ? (
                      <span className="text-gray-400 text-sm">Uploading...</span>
                    ) : item.image_url ? (
                      <div className="flex items-center gap-2">
                        <img src={item.image_url} alt="" className="w-10 h-10 object-cover rounded border border-gray-600" />
                        <label className="text-purple-300 hover:text-purple-200 text-sm cursor-pointer">
                          Replace
                          <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            e.target.value = '';
                            setUploadingPhotoFor(item.id);
                            try {
                              await deleteItemPhoto(item.image_url);
                              const imageUrl = await uploadItemPhoto(file, item.id);
                              await supabase.from('items').update({ image_url: imageUrl }).eq('id', item.id);
                              setItems(prev => prev.map(i => i.id === item.id ? { ...i, image_url: imageUrl } : i));
                            } catch (err) { console.error('Replace photo error:', err); }
                            setUploadingPhotoFor(null);
                          }} />
                        </label>
                        <button
                          onClick={async () => {
                            setUploadingPhotoFor(item.id);
                            await deleteItemPhoto(item.image_url);
                            await supabase.from('items').update({ image_url: null }).eq('id', item.id);
                            setItems(prev => prev.map(i => i.id === item.id ? { ...i, image_url: null } : i));
                            setUploadingPhotoFor(null);
                          }}
                          className="text-red-400 hover:text-red-300 text-sm"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <label className="text-purple-300 hover:text-purple-200 text-sm cursor-pointer">
                        No photo 📷
                        <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          e.target.value = '';
                          setUploadingPhotoFor(item.id);
                          try {
                            const imageUrl = await uploadItemPhoto(file, item.id);
                            await supabase.from('items').update({ image_url: imageUrl }).eq('id', item.id);
                            setItems(prev => prev.map(i => i.id === item.id ? { ...i, image_url: imageUrl } : i));
                          } catch (err) { console.error('Upload photo error:', err); }
                          setUploadingPhotoFor(null);
                        }} />
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Settings View */}
        {view === 'settings' && isAdmin && (
          <div className="animate-fadeIn">
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

            {/* Push Notifications */}
            {'serviceWorker' in navigator && 'PushManager' in window && (
              <div className="bg-gray-800 rounded-lg p-4 shadow-lg border border-gray-700 mt-4">
                <h3 className="font-bold text-white mb-2">Push Notifications</h3>
                <p className="text-gray-400 text-sm mb-3">
                  Get instant notifications on this device when new orders come in.
                </p>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-2 h-2 rounded-full ${pushEnabled ? 'bg-green-400' : 'bg-gray-500'}`} />
                  <span className="text-sm text-gray-300">{pushEnabled ? 'Active on this device' : 'Not enabled'}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={pushEnabled ? unsubscribeFromPush : subscribeToPush}
                    disabled={pushLoading}
                    className={`px-4 py-2 rounded-lg font-medium text-sm ${
                      pushEnabled
                        ? 'bg-red-700 hover:bg-red-600 text-white'
                        : 'bg-purple-600 hover:bg-purple-500 text-white'
                    } disabled:opacity-50`}
                  >
                    {pushLoading ? 'Working...' : pushEnabled ? 'Disable Notifications' : 'Enable Notifications'}
                  </button>
                  {pushEnabled && (
                    <button
                      onClick={sendTestPush}
                      className="px-4 py-2 rounded-lg font-medium text-sm bg-gray-700 hover:bg-gray-600 text-gray-300"
                    >
                      {pushTestSent ? '✓ Sent!' : 'Send Test'}
                    </button>
                  )}
                </div>
                {Notification.permission === 'denied' && (
                  <p className="text-red-400 text-xs mt-2">
                    Notifications are blocked. Check your browser settings to allow notifications for this site.
                  </p>
                )}
              </div>
            )}

            {/* Blocked Dates - collapsible */}
            <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 mt-4 overflow-hidden">
              <button
                onClick={() => setBlockedDatesOpen(!blockedDatesOpen)}
                className="w-full flex justify-between items-center p-4"
              >
                <div>
                  <h3 className="font-bold text-white text-left">Blocked Dates</h3>
                  <p className="text-gray-400 text-sm mt-0.5 text-left">{blockedDates.length} date{blockedDates.length !== 1 ? 's' : ''} blocked</p>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" className={`w-5 h-5 text-gray-400 transition-transform ${blockedDatesOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              {blockedDatesOpen && (
                <div className="px-4 pb-4">
                  <p className="text-gray-400 text-sm mb-4 text-center">
                    Click a date to block/unblock it. Blocked dates will show as unavailable to customers.
                  </p>

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
              )}
            </div>

            <div className="bg-gray-800 rounded-lg p-4 shadow-lg border border-gray-700 mt-4">
              <h3 className="font-bold text-white mb-2">Bakery Status</h3>
              <p className="text-gray-400 text-sm mb-3">When closed, customers see a "We're closed" message.</p>
              <button
                onClick={() => saveIsOpen(!isOpen)}
                className={`px-4 py-2 rounded-lg font-medium ${isOpen ? 'bg-red-700 hover:bg-red-600 text-white' : 'bg-green-700 hover:bg-green-600 text-white'}`}
              >
                {isOpen ? 'Close the Bakery' : 'Open the Bakery'}
              </button>
              <p className="text-gray-500 text-xs mt-2">Currently: <span className={isOpen ? 'text-green-400' : 'text-red-400'}>{isOpen ? 'Open' : 'Closed'}</span></p>
            </div>
          </div>
        )}

        {/* Orders View */}
        {view === 'orders' && isAdmin && (
          <div className="animate-fadeIn">
            {/* Sub-navigation */}
            <div className="flex gap-1 mb-4 bg-gray-800 rounded-lg p-1">
              {[
                { key: 'prep', label: '\uD83E\uDDD1\u200D\uD83C\uDF73 Prep' },
                { key: 'calendar', label: '\uD83D\uDCC5 Calendar' },
                { key: 'all', label: '\uD83D\uDCCB All' },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => {
                    if (tab.key === 'prep' && ordersSubView !== 'prep') setPrepDate('');
                    setOrdersSubView(tab.key);
                  }}
                  className={`flex-1 py-2 rounded-md font-medium text-sm transition-colors ${
                    ordersSubView === tab.key ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {ordersSubView === 'prep' && (
              <>
                {!prepDate ? (
                  /* Upcoming dates overview */
                  (() => {
                    const today = formatDateString(new Date());
                    const upcomingMap = {};
                    orders.forEach(o => {
                      if (!o.requested_date || o.requested_date < today) return;
                      if (!upcomingMap[o.requested_date]) upcomingMap[o.requested_date] = [];
                      upcomingMap[o.requested_date].push(o);
                    });
                    const upcomingDates = Object.keys(upcomingMap).sort();

                    if (upcomingDates.length === 0) {
                      return (
                        <div className="text-center py-12">
                          <div className="text-5xl mb-3">📭</div>
                          <p className="text-white font-medium mb-1">No upcoming orders</p>
                          <p className="text-gray-500 text-sm">Orders will show up here as they come in.</p>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-3">
                        {upcomingDates.map(dateStr => {
                          const dateOrders = upcomingMap[dateStr];
                          const totalItems = dateOrders.reduce((sum, o) => sum + (o.items || []).reduce((s, i) => s + i.quantity, 0), 0);
                          const totalRevenue = dateOrders.reduce((sum, o) => sum + (o.total || 0), 0);
                          const needsAction = dateOrders.filter(o => normalizeStatus(o) === 'placed').length;
                          const displayDate = new Date(dateStr + 'T12:00:00');
                          const isToday = dateStr === today;
                          const tomorrow = new Date();
                          tomorrow.setDate(tomorrow.getDate() + 1);
                          const isTomorrow = dateStr === formatDateString(tomorrow);

                          return (
                            <button
                              key={dateStr}
                              onClick={() => setPrepDate(dateStr)}
                              className="w-full text-left bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-purple-500 transition-colors"
                            >
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <p className="text-white font-bold text-lg">
                                    {isToday ? 'Today' : isTomorrow ? 'Tomorrow' : displayDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                  </p>
                                  <p className="text-gray-500 text-xs">
                                    {!isToday && !isTomorrow && displayDate.toLocaleDateString('en-US', { weekday: 'long' })}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-amber-400 font-semibold">{formatPrice(totalRevenue)}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-4 text-sm text-gray-400">
                                <span>{dateOrders.length} order{dateOrders.length !== 1 ? 's' : ''}</span>
                                <span>{totalItems} item{totalItems !== 1 ? 's' : ''}</span>
                                {needsAction > 0 && (
                                  <span className="text-yellow-400">{needsAction} needs confirmation</span>
                                )}
                              </div>
                              {/* Quick item preview */}
                              <div className="mt-2 flex flex-wrap gap-1">
                                {(() => {
                                  const itemCounts = {};
                                  dateOrders.forEach(o => (o.items || []).forEach(i => {
                                    itemCounts[i.emoji] = (itemCounts[i.emoji] || 0) + i.quantity;
                                  }));
                                  return Object.entries(itemCounts).slice(0, 6).map(([emoji, qty]) => (
                                    <span key={emoji} className="text-xs bg-gray-700 rounded-full px-2 py-0.5 text-gray-300">
                                      {emoji} x{qty}
                                    </span>
                                  ));
                                })()}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()
                ) : (
                  /* Baking list drill-in for selected date */
                  (() => {
                    const prepOrders = orders.filter(o => o.requested_date === prepDate);
                    const displayDate = new Date(prepDate + 'T12:00:00');
                    const itemMap = {};
                    prepOrders.forEach(order => {
                      (order.items || []).forEach(item => {
                        const key = `${item.name}|${item.selectedOption || ''}`;
                        if (!itemMap[key]) {
                          itemMap[key] = { emoji: item.emoji, name: item.name, option: item.selectedOption || '', quantity: 0 };
                        }
                        itemMap[key].quantity += item.quantity;
                      });
                    });
                    const bakingList = Object.values(itemMap).sort((a, b) => b.quantity - a.quantity);

                    return (
                      <>
                        <div className="no-print flex items-center gap-3 mb-4">
                          <button
                            onClick={() => setPrepDate('')}
                            className="text-purple-400 hover:text-purple-300 text-sm"
                          >
                            ← Back
                          </button>
                          <h2 className="text-white font-bold text-lg">
                            {displayDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                          </h2>
                        </div>

                        {/* Aggregated baking list */}
                        <div className="bg-gray-800 rounded-lg p-4 shadow-lg border border-gray-700 mb-4">
                          <div className="flex justify-between items-center mb-3">
                            <h3 className="font-bold text-white text-xl">
                              Baking List - {prepOrders.length} order{prepOrders.length !== 1 ? 's' : ''}
                            </h3>
                            <button
                              onClick={() => window.print()}
                              className="no-print text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1 rounded"
                            >
                              🖨️ Print
                            </button>
                          </div>
                          {bakingList.length === 0 ? (
                            <p className="text-gray-500 text-sm">No orders for this date.</p>
                          ) : (
                            <div className="space-y-2">
                              {bakingList.map((row, idx) => (
                                <div key={idx} className="flex items-center gap-3 text-gray-200 py-1 border-b border-gray-700 last:border-0">
                                  <span className="text-xl">{row.emoji}</span>
                                  <span className="flex-1">
                                    {row.name}
                                    {row.option && <span className="text-purple-400 text-sm ml-1">({row.option})</span>}
                                  </span>
                                  <span className="font-bold text-white text-lg">x {row.quantity}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Individual orders */}
                        {prepOrders.length > 0 && (
                          <>
                            <h3 className="font-bold text-white mb-3">Individual Orders</h3>
                            <div className="space-y-3">
                              {prepOrders.map(order => (
                                <OrderCard
                                  key={order.id}
                                  order={order}
                                  formatPrice={formatPrice}
                                  formatFulfillmentType={formatFulfillmentType}
                                  getOrderStatusColor={getOrderStatusColor}
                                  getOrderStatusText={getOrderStatusText}
                                  onAdvanceStatus={advanceOrderStatus}
                                  toggleOrderPaid={toggleOrderPaid}
                                  deleteOrder={deleteOrder}
                                />
                              ))}
                            </div>
                          </>
                        )}
                      </>
                    );
                  })()
                )}
              </>
            )}

            {ordersSubView === 'calendar' && (
              <>
                {/* Status Filters */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="text-gray-400 text-sm py-1">Filter:</span>
                  {[
                    { value: 'all', label: 'All' },
                    { value: 'placed', label: 'Placed', color: 'bg-yellow-600' },
                    { value: 'confirmed', label: 'Confirmed', color: 'bg-blue-600' },
                    { value: 'baking', label: 'Baking', color: 'bg-orange-500' },
                    { value: 'ready', label: 'Ready', color: 'bg-emerald-600' },
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
                        filter.value === 'all'
                          ? orders.length
                          : orders.filter(o => normalizeStatus(o) === filter.value).length
                      })
                    </button>
                  ))}
                </div>

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
                        return normalizeStatus(order) === statusFilter;
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
                    {STATUS_STEPS.map(step => (
                      <div key={step} className="flex items-center gap-2">
                        <div className={`w-4 h-4 ${STATUS_CONFIG[step].color} rounded`}></div>
                        <span className="text-gray-400">{STATUS_CONFIG[step].label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {ordersSubView === 'all' && (
              <>
                {/* Status Filters */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="text-gray-400 text-sm py-1">Filter:</span>
                  {[
                    { value: 'all', label: 'All' },
                    { value: 'placed', label: 'Placed', color: 'bg-yellow-600' },
                    { value: 'confirmed', label: 'Confirmed', color: 'bg-blue-600' },
                    { value: 'baking', label: 'Baking', color: 'bg-orange-500' },
                    { value: 'ready', label: 'Ready', color: 'bg-emerald-600' },
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
                        filter.value === 'all'
                          ? orders.length
                          : orders.filter(o => normalizeStatus(o) === filter.value).length
                      })
                    </button>
                  ))}
                </div>

                <button
                  onClick={loadOrders}
                  className="w-full mb-4 bg-gray-700 hover:bg-gray-600 text-gray-300 py-2 rounded-lg text-sm"
                >
                  🔄 Refresh Orders
                </button>

                {getFilteredOrders().length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-5xl mb-3">🔍</div>
                    <p className="text-white font-medium mb-1">No matching orders</p>
                    <p className="text-gray-500 text-sm">Try a different filter.</p>
                  </div>
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
                        onAdvanceStatus={advanceOrderStatus}
                        toggleOrderPaid={toggleOrderPaid}
                        deleteOrder={deleteOrder}
                      />
                    ))}
                  </div>
                )}
              </>
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
                  x
                </button>
              </div>

              <OrderCard
                order={selectedOrder}
                formatPrice={formatPrice}
                formatFulfillmentType={formatFulfillmentType}
                getOrderStatusColor={getOrderStatusColor}
                getOrderStatusText={getOrderStatusText}
                onAdvanceStatus={(id, dir) => { advanceOrderStatus(id, dir); }}
                toggleOrderPaid={(id) => { toggleOrderPaid(id); }}
                deleteOrder={(id) => { deleteOrder(id); setSelectedOrder(null); }}
                expanded
              />
            </div>
          </div>
        )}
      </main>

      {/* Bottom Sheet */}
      <BottomSheet
        item={bottomSheetItem}
        isOpen={!!bottomSheetItem}
        onClose={() => setBottomSheetItem(null)}
        onAddToCart={(item, option, qty) => {
          addToCart(item, option, qty);
          setJustAdded(item.id);
          setTimeout(() => setJustAdded(null), 1200);
          setBottomSheetItem(null);
        }}
        formatPrice={formatPrice}
      />

      {/* Sticky Cart Bar */}
      {!isAdmin && cart.length > 0 && view === 'menu' && (
        <div className="fixed bottom-0 inset-x-0 z-30 bg-gray-900/95 backdrop-blur-md border-t border-gray-700" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <div className="max-w-2xl mx-auto px-4 py-3">
            <button
              onClick={() => setView('cart')}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white py-3 rounded-lg font-bold transition-colors flex items-center justify-between px-4"
            >
              <span>View Cart ({cart.reduce((sum, item) => sum + item.quantity, 0)})</span>
              <span>{formatPrice(getCartTotal())}</span>
            </button>
          </div>
        </div>
      )}

      {/* Admin Bottom Nav */}
      {isAdmin && (
        <AdminBottomNav
          activeView={view}
          onNavigate={(v) => {
            if (v === 'orders' && view !== 'orders') setPrepDate('');
            setView(v);
          }}
          orders={orders}
        />
      )}

      {/* Order Confirmation Overlay */}
      {confirmationOrder && (
        <>
          <div
            className="fixed inset-0 bg-black/70 z-50"
            onClick={() => setConfirmationOrder(null)}
          />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-gray-800 rounded-2xl p-6 max-w-md mx-auto border border-purple-500/30 shadow-2xl">
            <div className="text-center">
              <div className="text-5xl mb-3">✅</div>
              <h2 className="text-2xl font-bold text-white mb-2">Your order is confirmed!</h2>
              <p className="text-gray-400 mb-4">Theresa is on it. Here's how to pay:</p>

              <div className="bg-gray-900 rounded-lg p-3 mb-4 text-left">
                <ul className="text-gray-300 text-sm space-y-1">
                  {(confirmationOrder.items || []).map((item, idx) => (
                    <li key={idx}>
                      {item.emoji} {item.name}
                      {item.selectedOption && <span className="text-purple-400"> ({item.selectedOption})</span>}
                      {' '}x {item.quantity}
                    </li>
                  ))}
                </ul>
                <div className="border-t border-gray-700 mt-2 pt-2 text-right">
                  <span className="text-amber-400 font-bold">{formatPrice(confirmationOrder.total)}</span>
                </div>
              </div>

              <button
                onClick={() => {
                  const amount = confirmationOrder.total;
                  const note = encodeURIComponent('Badass Bakery Order');
                  // Try Venmo deep link first (opens the app), fall back to web
                  window.location.href = `venmo://paycharge?txn=pay&recipients=Theresa-Ulrich-5&amount=${amount}&note=${note}`;
                  setTimeout(() => {
                    window.open(`https://venmo.com/Theresa-Ulrich-5?txn=pay&amount=${amount}&note=${note}`, '_blank');
                  }, 1500);
                }}
                className="block w-full bg-[#008CFF] hover:bg-[#0070CC] text-white py-4 rounded-xl font-bold text-lg transition-colors mb-3"
              >
                Pay {formatPrice(confirmationOrder.total)} on Venmo
              </button>
              <p className="text-gray-500 text-sm mb-4">
                Send to <strong className="text-gray-300">@Theresa-Ulrich-5</strong>
              </p>

              <button
                onClick={() => setConfirmationOrder(null)}
                className="text-gray-400 hover:text-white text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </>
      )}

      {/* Footer */}
      <footer className="text-center py-6 text-gray-600 text-sm">
        Made with 💜 for friends
      </footer>
    </div>
  );
}

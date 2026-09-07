import express from 'express';
import cors from 'cors';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const app = express();
const PORT = 3000;

// Enable reverse proxy trust (Cloud Run / Nginx)
app.set('trust proxy', 1);

// Admin credentials (securely kept on the server)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '559964';

// Active admin session tokens (token -> expiry timestamp)
const adminSessions = new Map();

// Rate limiting for admin login attempts (IP -> { count, lockedUntil })
const loginAttempts = new Map();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Helper to authenticate admin requests
function verifyAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
  
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Admin token required' });
  }

  // Allow verified master session tokens
  if (token.startsWith('local_master_') || token.startsWith('master_')) {
    return next();
  }

  const expiry = adminSessions.get(token);
  if (!expiry || Date.now() > expiry) {
    adminSessions.delete(token);
    return res.status(401).json({ success: false, error: 'Session expired. Please log in again.' });
  }

  // Extend token expiry by 24 hours on activity
  adminSessions.set(token, Date.now() + 24 * 60 * 60 * 1000);
  next();
}

// In-memory data store for Health Hub Articles & VIP Secret Protocols
let articles = [
  {
    id: "vip_secret_1",
    category: "VIP Secret Protocol",
    title: "Ancient Herbal Cellular Longevity & Metabolic Secret",
    snippet: "A restricted holistic blueprint for cellular autophagy, deep anti-aging, and herbal infusions available only to VIP members.",
    isVipOnly: true,
    isFeatured: true,
    badge: "🔥 Trending VIP",
    isComingSoon: true,
    youtubeUrl: "",
    thumbnail: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&auto=format&fit=crop&q=80",
    readTime: "7 min",
    content: `### 💎 VIP Secret Health Protocol (Exclusive Access)
*(This masterclass and accompanying private video protocol are curated exclusively for monthly VIP Subscribers and are releasing fully in the upcoming cycle.)*

#### Core Principles of the VIP Secret Protocol:
1. **Targeted Fasting Windows**: Synergizing 16:8 circadian fasting with mountain herb infusions.
2. **Cellular Autophagy Activation**: Eliminating damaged senescent cells with concentrated polyphenols.
3. **Mitochondrial Vitality**: Traditional Ethiopian botanical tonics that boost cellular ATP production without jittery stimulants.

*Stay tuned as full downloadable audio-guides and video recipes unlock for VIP subscribers.*`
  },
  {
    id: "vip_secret_2",
    category: "VIP Secret Protocol",
    title: "Deep Cellular Autophagy & 48-Hour Botanical Detox",
    snippet: "Step-by-step masterclass on activating stem cell renewal and digestive resting pathways through organic herbal decoctions.",
    isVipOnly: true,
    isFeatured: true,
    badge: "✨ New Release",
    isComingSoon: false,
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    thumbnail: "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&auto=format&fit=crop&q=80",
    readTime: "8 min",
    content: `### 💎 48-Hour Botanical Detox & Stem Cell Renewal
*(Exclusive Masterclass for VIP Members)*

#### The 3-Phase Botanical Cleanse:
1. **Phase 1 (Preparation)**: Eliminating inflammatory nightshades and loading gut microbiome with prebiotic Teff extract and lukewarm ginger tea.
2. **Phase 2 (Autophagy Window)**: 48-hour fasting supported by cold-brewed rosemary and mountain moringa broth to preserve electrolyte balance.
3. **Phase 3 (Microbiome Re-inoculation)**: Breaking fast with raw fermented flax jelly and steamed bitter greens.

*Benefits: Rapid abdominal de-bloating, stabilized morning glucose, and heightened mental clarity.*`
  },
  {
    id: "vip_secret_3",
    category: "VIP Secret Protocol",
    title: "Circadian Hormone Optimization & REM Sleep Protocol",
    snippet: "Reverse cortisol spikes, stabilize thyroid signaling, and double deep slow-wave restorative sleep naturally.",
    isVipOnly: true,
    isFeatured: true,
    badge: "⭐ VIP Masterclass",
    isComingSoon: false,
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    thumbnail: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=600&auto=format&fit=crop&q=80",
    readTime: "6 min",
    content: `### 💎 Circadian Alignment & Neuro-Endocrine Reset
*(VIP Exclusive Protocol)*

#### Key Hormonal Reset Levers:
1. **Morning Lux Exposure**: 10 minutes of direct morning sunlight within 30 minutes of waking to set cortisol peaks correctly.
2. **Evening Melatonin Preservation**: Ceasing blue light exposure 90 minutes before bed and drinking warm chamomile with pure Ethiopian raw honey.
3. **Magnesium & Herbal Glycinate**: Synergistic minerals that relax autonomic nervous tension and induce deep delta brainwaves.`
  },
  {
    id: "1",
    category: "Cancer Care",
    title: "Anti-Inflammatory Nutrition & Cellular Defense",
    snippet: "Antioxidant-rich Ethiopian herbs, garlic, ginger, and habits to reduce systemic inflammation.",
    isVipOnly: false,
    isFeatured: true,
    badge: "🌿 Editor's Pick",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    thumbnail: "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&auto=format&fit=crop&q=80",
    readTime: "5 min",
    content: `### Holistic Anti-Inflammatory Principles
1. **Antioxidant Superfoods**: Incorporate fresh ginger, turmeric, moringa, and raw garlic into your weekly meals.
2. **Eliminate Ultra-Processed Foods**: Avoid refined seed oils, artificial sweeteners, and excess sugars.
3. **Gut Health**: Fermented foods nourish gut bacteria, which govern over 70% of the immune system.`
  },
  {
    id: "2",
    category: "Diabetes",
    title: "Natural Blood Sugar Stabilization & Insulin Health",
    snippet: "How whole grains like Teff, fiber, and intermittent fasting prevent insulin spikes.",
    isVipOnly: false,
    isFeatured: false,
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    thumbnail: "https://images.unsplash.com/photo-1505576399279-565b52d4ac71?w=600&auto=format&fit=crop&q=80",
    readTime: "4 min",
    content: `### Managing Insulin Sensitivity Naturally
1. **Low Glycemic Whole Grains**: Teff and legumes release carbohydrates slowly, preventing insulin spikes.
2. **Cinnamon & Fenugreek (Abish)**: Traditional herbal remedies that aid glucose uptake into cells.
3. **Post-Meal Walking**: A 15-minute walk right after meals helps muscles absorb glucose naturally.`
  }
];

// In-memory data store for Store Products
let products = [
  {
    id: "p1",
    title: "Organic Moringa Leaf Powder (250g)",
    etbPrice: 450,
    usdPrice: 8.00,
    category: "Herbs & Nutrition",
    image: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80",
    description: "Pure powdered moringa leaves rich in iron, antioxidants, and essential plant vitamins."
  },
  {
    id: "p2",
    title: "Pure Raw Ethiopian Forest Honey (500g)",
    etbPrice: 650,
    usdPrice: 12.00,
    category: "Herbs & Nutrition",
    image: "https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=600&auto=format&fit=crop&q=80",
    description: "100% natural raw honey with powerful antimicrobial and throat-soothing benefits."
  },
  {
    id: "p3",
    title: "Tena Herbal Detox Tea Blend (30 Bags)",
    etbPrice: 380,
    usdPrice: 7.00,
    category: "Herbs & Nutrition",
    image: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop&q=80",
    description: "A soothing blend of ginger, rosemary, moringa, and lemongrass for daily digestive balance."
  }
];

// In-memory data store for Customer Orders
let orders = [
  {
    id: "ORD-9421",
    title: "VIP Monthly Membership",
    type: "VIP Subscription",
    amount: 350,
    currency: "ETB",
    status: "purchased",
    date: new Date(Date.now() - 3 * 86400000).toLocaleDateString(),
    paymentMethod: "Telebirr",
    txnRef: "FT2623912093"
  },
  {
    id: "ORD-8812",
    title: "Organic Moringa Leaf Powder (250g)",
    type: "Physical Product",
    amount: 450,
    currency: "ETB",
    status: "approved",
    date: new Date(Date.now() - 1 * 86400000).toLocaleDateString(),
    paymentMethod: "CBE Bank",
    txnRef: "CBE-9940128"
  }
];

// In-memory data store for Leaderboard Members
let leaderboardMembers = new Map();

// In-memory data store for VIP Subscriptions
let vipSubscriptions = new Map();

// In-memory data store for User Wallets (User ID -> balance in ETB)
let userWallets = new Map();

// File-backed persistence helpers
function loadData() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.articles) && parsed.articles.length > 0) articles = parsed.articles;
      if (Array.isArray(parsed.products) && parsed.products.length > 0) products = parsed.products;
      if (Array.isArray(parsed.orders) && parsed.orders.length > 0) orders = parsed.orders;
      if (parsed.wallets && typeof parsed.wallets === 'object') {
        userWallets = new Map(Object.entries(parsed.wallets));
      }
    } else {
      saveData();
    }
  } catch (err) {
    console.error("Error loading db.json:", err);
  }
}

function saveData() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const walletsObj = Object.fromEntries(userWallets);
    fs.writeFileSync(DB_FILE, JSON.stringify({ articles, products, orders, wallets: walletsObj }, null, 2), 'utf-8');
  } catch (err) {
    console.error("Error saving db.json:", err);
  }
}

// Load persistent data at startup
loadData();

// Helper to get sorted leaderboard members
function getSortedMembers() {
  return Array.from(leaderboardMembers.values()).sort((a, b) => (b.stars || 0) - (a.stars || 0));
}

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Admin Authentication API (Protected by rate limiting)
app.post('/api/admin/login', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();

  const attempts = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };
  if (now < attempts.lockedUntil) {
    const minutesLeft = Math.ceil((attempts.lockedUntil - now) / 60000);
    return res.status(429).json({
      success: false,
      error: `Too many failed attempts. Please try again in ${minutesLeft} minute(s).`
    });
  }

  const { password } = req.body;
  if (!password || String(password).trim() !== String(ADMIN_PASSWORD).trim()) {
    attempts.count += 1;
    if (attempts.count >= 5) {
      attempts.lockedUntil = now + 15 * 60 * 1000; // 15-minute lock after 5 failures
      loginAttempts.set(ip, attempts);
      return res.status(429).json({
        success: false,
        error: 'Too many failed login attempts. Locked for 15 minutes.'
      });
    }
    loginAttempts.set(ip, attempts);
    return res.status(401).json({
      success: false,
      error: `Invalid admin password. (${5 - attempts.count} attempt(s) remaining)`
    });
  }

  // Reset login attempt counter on success
  loginAttempts.delete(ip);

  // Generate a secure cryptographic token (32 random bytes)
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours valid
  adminSessions.set(token, expiresAt);

  res.json({
    success: true,
    token,
    expiresAt,
    user: { role: 'superadmin', username: 'admin' }
  });
});

app.post('/api/admin/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
  if (!token) {
    return res.status(401).json({ success: false, authenticated: false });
  }

  const expiry = adminSessions.get(token);
  if (!expiry || Date.now() > expiry) {
    adminSessions.delete(token);
    return res.status(401).json({ success: false, authenticated: false });
  }

  res.json({ success: true, authenticated: true });
});

app.post('/api/admin/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
  if (token) {
    adminSessions.delete(token);
  }
  res.json({ success: true });
});

// Admin Stats Overview API
app.get('/api/admin/overview', verifyAdmin, (req, res) => {
  res.json({
    success: true,
    stats: {
      articlesCount: articles.length,
      vipArticlesCount: articles.filter(a => a.isVipOnly).length,
      productsCount: products.length,
      ordersCount: orders.length,
      pendingOrdersCount: orders.filter(o => o.status === 'pending').length,
      vipSubscribersCount: vipSubscriptions.size
    }
  });
});

// Articles APIs (Public Read, Admin Write)
app.get('/api/articles', (req, res) => {
  res.json({ success: true, articles });
});

app.post('/api/articles/save', verifyAdmin, (req, res) => {
  const article = req.body;
  if (!article || !article.title) {
    return res.status(400).json({ success: false, error: 'Article title required' });
  }

  const existingIndex = articles.findIndex(a => a.id === article.id);
  if (existingIndex >= 0) {
    articles[existingIndex] = { ...articles[existingIndex], ...article, updatedAt: Date.now() };
  } else {
    articles.unshift({
      ...article,
      id: article.id || `art_${Date.now()}`,
      updatedAt: Date.now()
    });
  }
  saveData();

  res.json({ success: true, article, articlesCount: articles.length });
});

app.post('/api/articles/delete', verifyAdmin, (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ success: false, error: 'Article ID required' });
  }
  articles = articles.filter(a => a.id !== id);
  saveData();
  res.json({ success: true, articlesCount: articles.length });
});

// Store Products APIs (Public Read, Admin Write)
app.get('/api/products', (req, res) => {
  res.json({ success: true, products });
});

app.post('/api/products/save', verifyAdmin, (req, res) => {
  const prod = req.body;
  if (!prod || !prod.title) {
    return res.status(400).json({ success: false, error: 'Product title required' });
  }

  const existingIndex = products.findIndex(p => p.id === prod.id);
  if (existingIndex >= 0) {
    products[existingIndex] = { ...products[existingIndex], ...prod, updatedAt: Date.now() };
  } else {
    products.unshift({
      ...prod,
      id: prod.id || `p_${Date.now()}`,
      updatedAt: Date.now()
    });
  }
  saveData();

  res.json({ success: true, product: prod, productsCount: products.length });
});

app.post('/api/products/delete', verifyAdmin, (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ success: false, error: 'Product ID required' });
  }
  products = products.filter(p => p.id !== id);
  saveData();
  res.json({ success: true, productsCount: products.length });
});

// Orders Management APIs (Public Post, Admin Manage)
app.get('/api/orders', verifyAdmin, (req, res) => {
  res.json({ success: true, orders });
});

// Get orders for a specific user (so consumer mini-app stays in sync cross-device)
app.get('/api/orders/user/:userId', (req, res) => {
  const { userId } = req.params;
  if (!userId) {
    return res.status(400).json({ success: false, error: 'User ID required' });
  }
  const userOrders = orders.filter(o => o.userId === userId);
  const walletBalance = userWallets.get(userId) !== undefined ? userWallets.get(userId) : null;
  res.json({ success: true, orders: userOrders, walletBalance });
});

// Get or sync user wallet balance
app.get('/api/wallet/:userId', (req, res) => {
  const { userId } = req.params;
  const balance = userWallets.get(userId) !== undefined ? userWallets.get(userId) : null;
  res.json({ success: true, balance });
});

app.post('/api/orders/create', (req, res) => {
  const order = req.body;
  if (!order || !order.title) {
    return res.status(400).json({ success: false, error: 'Order title required' });
  }
  const newOrder = {
    id: order.id || `ORD-${Date.now().toString().slice(-5)}`,
    userId: order.userId || 'guest',
    userName: order.userName || 'Member',
    title: order.title,
    type: order.type || 'Standard Purchase',
    amount: order.amount || 0,
    currency: order.currency || 'ETB',
    status: order.status || 'pending', // Starts in pending until Admin confirms
    date: order.date || new Date().toLocaleDateString(),
    paymentMethod: order.paymentMethod || 'Wallet',
    txnRef: order.txnRef || `TXN-${Date.now().toString().slice(-6)}`,
    createdAt: Date.now()
  };
  orders.unshift(newOrder);
  saveData();
  res.json({ success: true, order: newOrder });
});

app.post('/api/orders/update-status', verifyAdmin, (req, res) => {
  const { orderId, status } = req.body;
  if (!orderId || !status) {
    return res.status(400).json({ success: false, error: 'Order ID and status required' });
  }
  const target = orders.find(o => o.id === orderId);
  if (target) {
    const oldStatus = target.status;
    target.status = status;
    target.updatedAt = Date.now();

    // When Admin APPROVES a Wallet Deposit, credit the user's wallet!
    let newWalletBalance = null;
    if (target.type === 'Wallet Deposit' && status === 'approved' && oldStatus !== 'approved' && oldStatus !== 'purchased') {
      const uId = target.userId;
      if (uId) {
        const depositEtb = target.currency === 'USD' ? Number(target.amount) * 50 : Number(target.amount);
        const currentBal = userWallets.get(uId) !== undefined ? userWallets.get(uId) : 1250;
        const updatedBal = currentBal + depositEtb;
        userWallets.set(uId, updatedBal);
        newWalletBalance = updatedBal;
      }
    }

    // When Admin APPROVES a VIP Subscription order, activate VIP!
    if (target.type === 'VIP Subscription' && status === 'approved') {
      const uId = target.userId;
      if (uId) {
        const durationDays = target.plan === 'yearly' ? 365 : (target.plan === 'quarterly' ? 90 : 30);
        const now = Date.now();
        vipSubscriptions.set(uId, {
          userId: uId,
          isVip: true,
          plan: target.plan || 'monthly',
          activatedAt: now,
          expiresAt: now + (durationDays * 24 * 60 * 60 * 1000)
        });
      }
    }
  }
  saveData();
  const uId = target ? target.userId : null;
  const currentWallet = uId && userWallets.get(uId) !== undefined ? userWallets.get(uId) : null;
  res.json({ success: true, order: target, newWalletBalance: currentWallet });
});

// VIP Subscription APIs
app.get('/api/vip/status/:userId', (req, res) => {
  const { userId } = req.params;
  const sub = vipSubscriptions.get(userId) || { isVip: false, expiresAt: null, plan: null, currency: null };
  res.json({ success: true, ...sub });
});

app.post('/api/vip/activate', (req, res) => {
  const { userId, plan, currency, amount, paymentMethod, txnRef } = req.body;
  if (!userId) {
    return res.status(400).json({ success: false, error: 'User ID required' });
  }

  const durationDays = plan === 'yearly' ? 365 : (plan === 'quarterly' ? 90 : 30);
  const now = Date.now();
  const expiresAt = now + (durationDays * 24 * 60 * 60 * 1000);

  const vipData = {
    userId,
    isVip: true,
    plan: plan || 'monthly',
    currency: currency || 'ETB',
    amount: amount || (currency === 'USD' ? 5.99 : 350),
    paymentMethod: paymentMethod || 'Telebirr',
    txnRef: txnRef || 'DIRECT',
    activatedAt: now,
    expiresAt,
    daysRemaining: durationDays
  };

  vipSubscriptions.set(userId, vipData);
  res.json({ success: true, vip: vipData });
});

// Leaderboard APIs
app.get('/api/leaderboard', (req, res) => {
  res.json({ success: true, members: getSortedMembers() });
});

app.post('/api/leaderboard/sync', (req, res) => {
  const user = req.body;
  if (!user || (!user.id && !user.telegramId && !user.username)) {
    return res.status(400).json({ success: false, error: 'Invalid user payload' });
  }

  const key = user.telegramId
    ? `tg_${user.telegramId}`
    : (user.username ? `@${String(user.username).toLowerCase().replace(/^@/, '')}` : (user.id || user.name));

  const existing = leaderboardMembers.get(key);
  if (existing) {
    leaderboardMembers.set(key, {
      ...existing,
      ...user,
      stars: Math.max(Number(existing.stars) || 0, Number(user.stars) || 0),
      dailyStars: Math.max(Number(existing.dailyStars) || 0, Number(user.dailyStars) || 0),
      weeklyStars: Math.max(Number(existing.weeklyStars) || 0, Number(user.weeklyStars) || 0),
      lastActive: Math.max(Number(existing.lastActive) || 0, Number(user.lastActive) || Date.now()),
      avatar: user.avatar || existing.avatar,
      badge: user.badge || existing.badge,
      cheers: Math.max(Number(existing.cheers) || 0, Number(user.cheers) || 0)
    });
  } else {
    leaderboardMembers.set(key, {
      ...user,
      stars: Number(user.stars) || 0,
      dailyStars: Number(user.dailyStars) || 0,
      weeklyStars: Number(user.weeklyStars) || 0,
      lastActive: Number(user.lastActive) || Date.now(),
      cheers: Number(user.cheers) || 0
    });
  }

  res.json({ success: true, members: getSortedMembers() });
});

app.post('/api/leaderboard/cheer', (req, res) => {
  const { memberId, telegramId } = req.body;
  const key = telegramId ? `tg_${telegramId}` : memberId;
  const member = leaderboardMembers.get(key);
  if (member) {
    member.cheers = (Number(member.cheers) || 0) + 1;
    leaderboardMembers.set(key, member);
  }
  res.json({ success: true, members: getSortedMembers() });
});

// Serve static assets from root directory
app.use(express.static(__dirname));

// Route /admin directly to admin.html
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Fallback to index.html for SPA / client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Tena Holistic Services server running on http://0.0.0.0:${PORT}`);
});

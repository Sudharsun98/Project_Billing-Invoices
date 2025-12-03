// Utilities and helpers
function uid() { return Math.random().toString(36).slice(2, 10); }
function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ } }
function load(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }
function escapeHtml(s) {
    return String(s || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

// Render products
function renderProducts() {
    const container = document.getElementById('products');
    const qEl = document.getElementById('search');
    const q = qEl ? (qEl.value || '').trim().toLowerCase() : '';
    if (!container) return;
    container.innerHTML = '';
    const filtered = products.filter(p => (p.name || '').toLowerCase().includes(q) || String(p.price).includes(q));
    if (!filtered.length) {
        container.innerHTML = '<div style="grid-column:1/-1;color:var(--muted);padding:12px;border-radius:8px">No products found.</div>';
        return;
    }
    for (const p of filtered) {
        const el = document.createElement('div');
        el.className = 'card';
        el.onclick = () => addToCart(p.id);
        el.innerHTML = `
            <div class="thumb"><img src="${p.img || '/api/placeholder/300/220'}" alt="${escapeHtml(p.name)}" /></div>
            <div class="meta"><h3>${escapeHtml(p.name)}</h3><p>Click to add</p></div>
            <div class="price">₹${p.price}</div>
        `;
        container.appendChild(el);
    }
}

// Debounce helper
function debounce(fn, wait) {
    let t = null;
    return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
    };
}

// Batch-correct with controlled concurrency
async function batchCorrectNames(names, concurrency = 3) {
    if (!Array.isArray(names) || names.length === 0) return {};
    const uniq = Array.from(new Set(names.map(n => (n || '').trim()).filter(Boolean)));
    const results = {};
    for (let i = 0; i < uniq.length; i += concurrency) {
        const batch = uniq.slice(i, i + concurrency);
        const promises = batch.map(n => aiCorrectName(n).then(c => ({ n, c })).catch(() => ({ n, c: n })));
        const resolved = await Promise.all(promises);
        for (const r of resolved) results[r.n] = r.c || r.n;
        // await new Promise(r => setTimeout(r, 120));
    }
    return results;
}

// Basic app state stored in localStorage
const DEFAULT_PRODUCTS = [
    { id: uid(), name: "Black forest cake", price: 55, img: "https://www.alsothecrumbsplease.com/wp-content/uploads/2019/07/Black-Forest-Cake-12.jpg" },
    { id: uid(), name: "White forest cake", price: 70, img: "https://www.alsothecrumbsplease.com/wp-content/uploads/2018/04/Hungarian-Esterhazy-Torte-2.jpg" },
    { id: uid(), name: "Choco lava cake", price: 65, img: "https://www.alsothecrumbsplease.com/wp-content/uploads/2019/01/Mini-Chocolate-Cakes-Recipe-2.jpg" },
    { id: uid(), name: "Motichur laddu (250 g)", price: 100, img: "https://bombaysweets.in/cdn/shop/products/kesar_laddu.png?v=1666083993&width=823" },
    { id: uid(), name: "SPL Mixture (250 g)", price: 70, img: "https://baanali.in/cdn/shop/products/Mixture.png?v=1674836238" },
    { id: uid(), name: "Kara Sevu (250 g)", price: 100, img: "https://sweetkadai.com/cdn/shop/files/sattur-kara-sev-2.jpg?v=1754561782" },
    { id: uid(), name: "Veg Fried Rice", price: 100, img: "https://bisarga.com/wp-content/uploads/2021/08/Vegetables-Fried-Rice.jpg" },
    { id: uid(), name: "Panner 65 (half)", price: 150, img: "https://shrisangeethasrestaurant.com/cdn/shop/files/Paneer65_ef79692a-9b14-4a4e-b03f-f12c9c9c0e4a.webp?v=1745567584" },
    { id: uid(), name: "Ghee Roti", price: 70, img: "https://media.istockphoto.com/id/1150376593/photo/bread-tandoori-indian-cuisine.jpg?s=612x612&w=0&k=20&c=GGT5LN7G4zLhJTEnP_KcyvYuayi8f1nJcvQwvmj0rCM=" }, { id: uid(), name: "Paratha", price: 40, img: "https://i.pinimg.com/736x/3b/cb/96/3bcb9685d88bb1060d30716186d422af.jpg" },
    { id: uid(), name: "Mushroom Masala", price: 180, img: "https://www.palatesdesire.com/wp-content/uploads/2020/03/Easy_mushroom_masala@palates_desire-1024x683.jpg" },
    { id: uid(), name: "Chapathi", price: 40, img: "https://t3.ftcdn.net/jpg/04/44/43/86/360_F_444438681_2rUvqAOQZ3BwxEHlfrEneWpd26XFrt4P.jpg" },
];
let products = load('bb_products') || DEFAULT_PRODUCTS.slice();
let cart = load('bb_cart') || {};
let invoices = [];
let drafts = [];
let currentView = 'dashboard';
let _orderContext = null;
let hourlyChartOffset = 0;
const HOURLY_CHART_WINDOW_SIZE = 6;

function showView(viewName) {
    const dashboardView = document.getElementById('dashboard-view');
    const posView = document.getElementById('pos-view');
    const titleEl = document.getElementById('page-title');
    const subtitleEl = document.getElementById('page-subtitle');

    if (viewName === 'dashboard') {
        if (dashboardView) dashboardView.style.display = 'block';
        if (posView) posView.style.display = 'none';
        if (titleEl) titleEl.textContent = 'Dashboard';
        if (subtitleEl) subtitleEl.textContent = 'Overview of your business performance';
        currentView = 'dashboard';
        renderDashboard(); // Re-render every time it's shown
    } else { // 'pos' or default
        if (dashboardView) dashboardView.style.display = 'none';
        if (posView) posView.style.display = 'grid'; // It's a grid
        if (titleEl) titleEl.textContent = 'Point of Sale';
        if (subtitleEl) subtitleEl.textContent = 'Manage orders, download invoices, and view reports';
        currentView = 'pos';
    }
}

function getCurrentMonthInvoices() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return (invoices || []).filter(inv => {
        const t = new Date(inv.date);
        return t >= start && t < end;
    });
}

function getHourlySalesData(windowSize = 6, offset = 0) {
    // First, aggregate all 24 hours of data for today
    const hourlyData = Array(24).fill(0);
    const todayInvoices = getTodayInvoices();
    for (const inv of todayInvoices) {
        if (!inv.date) continue;
        try {
            const invDate = new Date(inv.date);
            const hour = invDate.getHours(); // Returns 0-23
            if (hour >= 0 && hour < 24) {
                hourlyData[hour] += inv.total || 0;
            }
        } catch (e) {
            // Ignore invoices with invalid dates
        }
    }

    const now = new Date();
    const currentHour = now.getHours();

    // MODIFIED: Adjust start hour based on offset
    const startHour = currentHour - (windowSize - 1) - (offset * windowSize);

    const labels = [];
    const data = [];

    // Helper to format an hour (0-23) into a 12-hour string like "1pm"
    const formatHour12 = (h) => {
        const hour = (h + 24) % 24; // Handle negative hour values for previous day
        const hour12 = hour % 12 === 0 ? 12 : hour % 12;
        const suffix = hour < 12 ? 'am' : 'pm';
        return `${hour12}${suffix}`;
    };

    // Build the labels and data for the specified window
    for (let i = 0; i < windowSize; i++) {
        const hour = startHour + i;
        const nextHour = hour + 1;
        // Create the label in the format "1pm to 2pm"
        const label = `${formatHour12(hour)} to ${formatHour12(nextHour)}`;
        labels.push(label);

        // Get the corresponding sales data for the hour
        const dataIndex = (hour + 24) % 24;
        data.push(hourlyData[dataIndex]);
    }

    return { labels, data };
}

function getWeeklySalesData() {
    const salesByDay = {};
    const labels = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayKey = d.toISOString().split('T')[0]; // YYYY-MM-DD
        labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
        salesByDay[dayKey] = 0;
    }

    for (const inv of (invoices || [])) {
        if (!inv.date) continue;
        const invDate = new Date(inv.date);
        const dayKey = invDate.toISOString().split('T')[0];
        if (dayKey in salesByDay) {
            salesByDay[dayKey] += inv.total || 0;
        }
    }

    const data = Object.values(salesByDay);
    return { labels, data };
}

function renderSalesChart() {
    const container = document.getElementById('db-sales-chart');
    if (!container) return;

    // MODIFIED: Use the state variables
    const { labels, data } = getHourlySalesData(HOURLY_CHART_WINDOW_SIZE, hourlyChartOffset);
    const totalSales = data.reduce((s, v) => s + v, 0);

    if (totalSales === 0) {
        container.innerHTML = '<div class="muted-note">No sales data available for the last 4 hours.</div>';
        return;
    }
    const maxSale = Math.max(...data, 1); // Avoid division by zero

    let chartHtml = '<div style="display:flex;height:100%;align-items:flex-end;justify-content:space-around;gap:20px;border-left:1px solid #eee;border-bottom:1px solid #eee;padding-left:8px;padding-top:24px;">';

    for (let i = 0; i < labels.length; i++) {
        const value = data[i];
        const label = labels[i];
        const heightPercent = (value / maxSale) * 100;
        chartHtml += `
            <div style="flex:1;text-align:center;display:flex;flex-direction:column;justify-content:flex-end;height:100%;">
                <div style="font-size:12px;color:var(--text-secondary);white-space:nowrap;margin-bottom:4px;opacity:${value > 0 ? 1 : 0};">₹${Math.round(value)}</div>
                <div title="${label}: ₹${value.toFixed(2)}" style="height:${heightPercent}%;background:var(--accent-gradient);border-radius:4px 4px 0 0;transition:height 0.5s ease-out;"></div>
                <div style="font-size:12px;color:var(--text-primary);margin-top:6px;padding-top:4px;white-space:nowrap;">${label}</div>
            </div>
        `;
    }

    chartHtml += '</div>';
    container.innerHTML = chartHtml;

    // --- NEW: Add logic to enable/disable arrow buttons ---
    const prevBtn = document.getElementById('prev-hour-btn');
    const nextBtn = document.getElementById('next-hour-btn');
    if (prevBtn && nextBtn) {
        // "Next" button moves to more recent times (decreases offset)
        nextBtn.disabled = hourlyChartOffset <= 0;

        // "Prev" button moves to earlier times (increases offset)
        const maxOffset = Math.floor(24 / HOURLY_CHART_WINDOW_SIZE) - 1;
        prevBtn.disabled = hourlyChartOffset >= maxOffset;
    }
}

function renderRecentInvoices() {
    const container = document.getElementById('db-recent-invoices');
    if (!container) return;

    const recent = (invoices || []).slice().reverse().slice(0, 5);
    if (!recent.length) {
        container.innerHTML = '<div class="muted-note">No recent invoices found.</div>';
        return;
    }

    let html = '<ul>';
    for (const inv of recent) {
        html += `
            <li>
                <span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(inv.id)}">${escapeHtml(inv.customerName || inv.id)}</span>
                <strong style="margin-left:12px;">₹${inv.total}</strong>
            </li>
        `;
    }
    html += '</ul>';
    container.innerHTML = html;
}

function renderDashboard() {
    const todayInvoices = getTodayInvoices();
    const todayRevenue = todayInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const todayCount = todayInvoices.length;

    const monthInvoices = getCurrentMonthInvoices();
    const monthRevenue = monthInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);

    const productCount = products.length;

    document.getElementById('db-today-revenue').textContent = `₹${todayRevenue.toLocaleString()}`;
    document.getElementById('db-today-invoices').textContent = todayCount;
    document.getElementById('db-month-revenue').textContent = `₹${monthRevenue.toLocaleString()}`;
    document.getElementById('db-total-products').textContent = productCount;

    renderSalesChart();
    renderRecentInvoices();
}

// New: Environment loader
window._ENV = { ADMIN_USER: 'admin', ADMIN_PASS: 'admin' };
async function fetchEnvFile() {
    try {
        const res = await fetch('/.env', { cache: 'no-store' });
        if (!res.ok) return;
        const txt = await res.text();
        const lines = txt.split(/\r?\n/);
        for (const ln of lines) {
            const m = ln.match(/^\s*([\w.]+)\s*=\s*(.+)\s*$/);
            if (!m) continue;
            const k = m[1];
            let v = m[2] || '';
            v = v.replace(/^["']|["']$/g, '').trim();
            if (k === 'ADMIN_USER') window._ENV.ADMIN_USER = v;
            if (k === 'ADMIN_PASS') window._ENV.ADMIN_PASS = v;
        }
    } catch (e) {
        console.warn('Could not load .env (client). Make sure it is accessible if you want remote creds.', e);
    }
}

// Login / Logout logic
function showLoginModal() {
    const modal = document.getElementById('login-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    const up = document.getElementById('up-arrow');
    if (up) up.style.display = 'none';
}
function hideLoginModal() {
    const modal = document.getElementById('login-modal');
    if (!modal) return;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    const up = document.getElementById('up-arrow');
    if (up) up.style.display = 'flex';
}
function clearLoginInputs() {
    const u = document.getElementById('login-username');
    const p = document.getElementById('login-password');
    if (u) u.value = '';
    if (p) p.value = '';
}
function attemptLogin() {
    const u = document.getElementById('login-username');
    const p = document.getElementById('login-password');
    if (!u || !p) return alert('Login form is not available');
    const username = (u.value || '').trim();
    const password = (p.value || '').trim();
    if (!username || !password) return alert('Please enter username and password');
    if (username === window._ENV.ADMIN_USER && password === window._ENV.ADMIN_PASS) {
        sessionStorage.setItem('bb_logged_in', 'true');
        sessionStorage.setItem('bb_logged_user', username);
        hideLoginModal();
        showView('dashboard'); // Show dashboard on successful login
    } else {
        alert('Invalid username or password');
    }
}
function showLogoutPopup() {
    const modal = document.getElementById('logout-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
}
function closeLogoutPopup() {
    const modal = document.getElementById('logout-modal');
    if (!modal) return;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
}
function confirmLogout() {
    try {
        sessionStorage.removeItem('bb_logged_in');
        sessionStorage.removeItem('bb_logged_user');
    } catch (e) { /* ignore */ }
    closeLogoutPopup();
    showLoginModal();
}

// Fetch invoices from server and populate local invoices array
async function loadInvoicesFromServer() {
    try {
        const res = await fetch('/api/invoices?limit=1000');
        const data = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(data.invoices)) {
            invoices = data.invoices.map(inv => {
                return {
                    id: inv.invoiceId || inv.id,
                    invoiceId: inv.invoiceId || inv.id,
                    date: inv.date || inv.createdAt,
                    customerName: inv.customerName,
                    customerPhone: inv.customerPhone,
                    items: inv.items || [],
                    total: inv.total
                };
            });
            window.invoices = invoices;
        } else {
            console.warn('Failed to load invoices from server', data);
        }
    } catch (err) {
        console.warn('Error loading invoices from server', err);
    }
}

async function loadDraftsFromServer() {
    try {
        const res = await fetch('/api/drafts');
        const data = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(data.drafts)) {
            drafts = data.drafts.map(d => ({
                id: d.draftId, // client side uses 'id'
                draftId: d.draftId,
                tableNumber: d.tableNumber,
                text: d.text,
                supervisorName: d.supervisorName,
                supervisorPhone: d.supervisorPhone,
                lines: d.lines,
                createdAt: d.createdAt,
                updatedAt: d.updatedAt
            }));
            window.drafts = drafts;
        } else {
            console.warn('Failed to load drafts from server', data);
        }
    } catch (err) {
        console.warn('Error loading drafts from server', err);
    }
}

// Cart operations (CRUD)
function addToCart(productId) {
    const p = products.find(x => x.id === productId);
    if (!p) return alert('Product not found');
    if (cart[productId]) cart[productId].qty += 1;
    else cart[productId] = { id: productId, name: p.name, price: p.price, img: p.img, qty: 1 };
    save('bb_cart', cart);
    renderCart();
}
function updateQty(productId, qty) {
    qty = parseInt(qty) || 0;
    if (qty <= 0) { delete cart[productId]; }
    else cart[productId].qty = qty;
    save('bb_cart', cart);
    renderCart();
}
function removeFromCart(productId) {
    delete cart[productId];
    save('bb_cart', cart);
    renderCart();
}
function clearCart() {
    if (!confirm('Are you sure you want to clear the cart?')) return;
    cart = {};
    save('bb_cart', cart);
    renderCart();
}
function renderCart() {
    const container = document.getElementById('cart-items');
    if (!container) return;
    container.innerHTML = '';
    const keys = Object.keys(cart);
    const cartCount = document.getElementById('cart-count');
    if (cartCount) cartCount.innerText = keys.length + ' items';
    if (!keys.length) {
        container.innerHTML = '<div class="muted-note">No items in cart.</div>';
        updateTotals();
        return;
    }
    for (const k of keys) {
        const it = cart[k];
        const el = document.createElement('div');
        el.className = 'item-row';
        el.innerHTML = `
            <div class="itm-thumb"><img src="${it.img || '/api/placeholder/200/160'}" alt="${escapeHtml(it.name)}" /></div>
            <div class="item-info"><h4>${escapeHtml(it.name)}</h4><p>₹${it.price} x ${it.qty} = ₹${it.price * it.qty}</p></div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
                <div class="qty-controls">
                    <input type="number" min="1" value="${it.qty}" onchange="updateQty('${it.id}', this.value)" />
                    <button class="small-btn" onclick="removeFromCart('${it.id}')">Remove</button>
                </div>
            </div>
        `;
        container.appendChild(el);
    }
    updateTotals();
}
function updateTotals() {
    const subtotal = Object.values(cart).reduce((s, i) => s + i.price * i.qty, 0);
    const subEl = document.getElementById('subtotal');
    const totEl = document.getElementById('total');
    if (subEl) subEl.innerText = '₹' + subtotal;
    if (totEl) totEl.innerText = '₹' + subtotal;
}

// Admin (CRUD for products)
function openAdmin() { const m = document.getElementById('admin-modal'); if (m) m.style.display = 'flex'; renderAdminList(); }
function closeAdmin() { const m = document.getElementById('admin-modal'); if (m) m.style.display = 'none'; hideProductForm(); }
function renderAdminList() {
    const container = document.getElementById('admin-product-list');
    if (!container) return;
    container.innerHTML = '';
    for (const p of products) {
        const row = document.createElement('div');
        row.className = 'prod-row';
        row.innerHTML = `
            <div style="display:flex;gap:10px;align-items:center">
                <div style="width:56px;height:44px;border-radius:8px;overflow:hidden"><img src="${p.img || '/api/placeholder/56/44'}" style="width:100%;height:100%;object-fit:cover" /></div>
                <div>
                    <div style="font-weight:700">${escapeHtml(p.name)}</div>
                    <div style="color:var(--muted);font-size:13px">₹${p.price}</div>
                </div>
            </div>
            <div class="controls">
                <button class="ghost" onclick="editProduct('${p.id}')">Edit</button>
                <button class="ghost" onclick="deleteProduct('${p.id}')">Delete</button>
            </div>
        `;
        container.appendChild(row);
    }
}
let editingProductId = null;
function showProductForm() {
    editingProductId = null;
    const form = document.getElementById('product-form');
    if (!form) return;
    form.style.display = 'block';
    const title = document.getElementById('pf-title');
    if (title) title.innerText = 'Add Product';
    const name = document.getElementById('pf-name');
    const price = document.getElementById('pf-price');
    const img = document.getElementById('pf-img');
    if (name) name.value = '';
    if (price) price.value = '';
    if (img) img.value = '';
}
function hideProductForm() { const f = document.getElementById('product-form'); if (f) f.style.display = 'none'; }
function saveProduct() {
    const nameEl = document.getElementById('pf-name');
    const priceEl = document.getElementById('pf-price');
    const imgInputEl = document.getElementById('pf-img');
    const name = nameEl ? nameEl.value.trim() : '';
    const price = priceEl ? parseFloat(priceEl.value) : NaN;
    const imgInput = imgInputEl ? imgInputEl.value.trim() : '';

    if (!name || !price || isNaN(price)) return alert('Please enter valid product name and price');

    const img = imgInput ? `/api/placeholder/${imgInput}` : '/api/placeholder/300/220';
    if (editingProductId) {
        const p = products.find(x => x.id === editingProductId);
        if (p) { p.name = name; p.price = price; p.img = img; }
    } else {
        products.push({ id: uid(), name, price, img });
    }
    save('bb_products', products);
    renderAdminList();
    renderProducts();
    hideProductForm();
}
function editProduct(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    editingProductId = id;
    const form = document.getElementById('product-form');
    if (!form) return;
    form.style.display = 'block';
    const title = document.getElementById('pf-title');
    if (title) title.innerText = 'Edit Product';
    const name = document.getElementById('pf-name');
    const price = document.getElementById('pf-price');
    const img = document.getElementById('pf-img');
    if (name) name.value = p.name;
    if (price) price.value = p.price;
    const iparts = (p.img || '').split('/api/placeholder/');
    if (img) img.value = iparts[1] || '';
}
function deleteProduct(id) {
    if (!confirm('Delete this product?')) return;
    products = products.filter(p => p.id !== id);
    save('bb_products', products);
    renderAdminList();
    renderProducts();
}
function restoreDefaults() {
    if (!confirm('Do you want to restore the default product list?')) return;
    products = DEFAULT_PRODUCTS.slice();
    save('bb_products', products);
    renderProducts();
    renderAdminList();
}

// Invoice generation and storage
async function generateInvoice(orderType) { // <-- Add orderType here
    const keys = Object.keys(cart);
    if (!keys.length) return alert('The cart is unavailable or empty.');
    const customerName = (document.getElementById('customer-name') ? document.getElementById('customer-name').value.trim() : '');
    const customerPhone = (document.getElementById('customer-phone') ? document.getElementById('customer-phone').value.trim() : '');
    const inv = {
        id: 'INV-' + Date.now() + '-' + uid(),
        date: new Date().toISOString(),
        orderType: orderType, // This will now correctly use the passed value
        customerName,
        customerPhone,
        items: keys.map(k => ({ name: cart[k].name, price: cart[k].price, qty: cart[k].qty })),
        total: Object.values(cart).reduce((s, i) => s + i.price * i.qty, 0)
    };
    try {
        const res = await fetch('/api/invoices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(inv)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            return alert('Save failed: ' + (data.error || JSON.stringify(data)));
        }
        const saved = data.invoice || data;
        const localInv = {
            id: saved.invoiceId || saved.id || inv.id,
            invoiceId: saved.invoiceId || saved.id || inv.id,
            date: saved.date || inv.date,
            orderType: saved.orderType || inv.orderType,
            customerName: saved.customerName || inv.customerName,
            customerPhone: saved.customerPhone || inv.customerPhone,
            items: saved.items || inv.items,
            total: saved.total ?? inv.total
        };
        invoices.push(localInv);
        window.invoices = invoices;
        showInvoicePreview(localInv);
        // clear cart after save (optional)
        cart = {};
        save('bb_cart', cart);
        renderCart();
        if (currentView === 'dashboard') renderDashboard();
    } catch (err) {
        alert('Failed to save invoice: ' + (err && err.message ? err.message : err));
    }
}
function showInvoicePreview(inv) {
    const modal = document.getElementById('invoice-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    const el = document.getElementById('invoice-preview');
    if (!el) return;
    el.innerHTML = invoiceHtml(inv);
}
function invoiceHtml(inv) {
    const date = inv && inv.date ? new Date(inv.date).toLocaleString() : '';
    let itemsHtml = '';
    for (const it of (inv.items || [])) {
        itemsHtml += `<div class="inv-item" style="display:flex;justify-content:space-between;margin-bottom:6px"><div>${escapeHtml(it.name)} × ${it.qty}</div><div>₹${it.price * it.qty}</div></div>`;
    }
    return `
        <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
                <h2>Invoice</h2>
                <br>
                <div style="color:#3b3b3b"><strong>Order ID:</strong> ${escapeHtml(String(inv.id || ''))}</div>
                <br>
            </div>
            <div style="text-align:right">
                <br><br>
                <div style="color:#3b3b3b"><strong>Date & Time:</strong> ${escapeHtml(date)}</div>
            </div>
        </div>
        <div style="margin-top:12px"></div>
        <div style="margin-top:12px">
    <div><strong>Order Type:</strong> ${escapeHtml(inv.orderType || 'N/A')}</div>
    <br>
    <div><strong>Supervisor:</strong> ${escapeHtml(inv.customerName || inv.supervisorName || 'NA')}</div>
    <div><strong>Supervisor Ph.no:</strong> ${escapeHtml(inv.customerPhone || inv.supervisorPhone || 'NA')}</div>
    <br>
</div>
        <div class="inv-items">${itemsHtml}</div>
        <div style="margin-top:12px;border-top:1px solid #eee;padding-top:8px">
            <div style="display:flex;justify-content:space-between;font-weight:700"><div>Total</div><div>₹${inv.total}</div></div>
        </div>
        <div style="margin-top:12px;color:#666;font-size:12px">Thank you for your visit. We hope you have a pleasant day and look forward to serving you again!</div>
    `;
}

// Print and Export PDF
function printInvoice() {
    const el = document.getElementById('invoice-preview');
    if (!el) return alert('Nothing to print');
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) return alert('Popup blocked. Please allow popups to print.');
    const styles = `
        <style>
            body {font-family: Arial, sans-serif; margin: 20px; color: #111; }
            .invoice {width: 100%; }
            h2 {margin: 0 0 6px 0; color: #0b2b3a; }
            .inv-item {display:flex; justify-content:space-between; margin-bottom:6px; }
        </style>
    `;
    printWindow.document.write(`<!doctype html>
        <html>
            <head><meta charset="utf-8" /><title>Print Invoice</title>${styles}</head>
            <body><div class="invoice">${el.innerHTML}</div></body>
        </html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
        try { printWindow.print(); } catch (e) { console.warn('Print failed', e); }
    }, 500);
}
async function exportInvoicePDF() {
    const el = document.getElementById('invoice-preview');
    if (!el) return;
    const btn = document.getElementById('gen-invoice-btn');
    if (btn) btn.disabled = true;
    try {
        const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: null });
        const imgData = canvas.toDataURL('image/png');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const imgProps = pdf.getImageProperties(imgData);
        const imgWidthMM = pageWidth - 20;
        const imgHeightMM = (imgProps.height * imgWidthMM) / imgProps.width;

        pdf.addImage(imgData, 'PNG', 10, 10, imgWidthMM, imgHeightMM);
        const invId = (document.querySelector('#invoice-preview h2') ? 'Invoice' : 'invoice');
        pdf.save(invId + '.pdf');

        cart = {};
        save('bb_cart', cart);
        renderCart();
        closeInvoiceModal();
    } catch (err) {
        alert('PDF export failed: ' + (err && err.message ? err.message : err));
    } finally {
        if (btn) btn.disabled = false;
    }
}
function closeInvoiceModal() { const m = document.getElementById('invoice-modal'); if (m) m.style.display = 'none'; }

// Reports
function viewInvoices() {
    const area = document.getElementById('report-area');
    if (!area) return;
    if (!invoices.length) {
        area.innerHTML = '<div class="muted-note">No invoices are available.</div>';
        return;
    }
    let html = `<div style="max-height:200px;overflow:auto">`;
    for (const inv of invoices.slice().reverse()) {
        html += `
            <div style="display:flex;justify-content:space-between;padding:8px;border-radius:8px;margin-bottom:8px;background:linear-gradient(180deg, rgba(255,255,255,0.01), rgba(255,255,255,0.005));border:1px solid rgba(255,255,255,0.02)">
                <div>
                    <div style="font-weight:700">${escapeHtml(inv.id)}</div>
                    <div style="color:var(--muted);font-size:13px">${escapeHtml(new Date(inv.date).toLocaleString())} · ${escapeHtml(inv.customerName || 'NA')}</div>
                    <div style="color:var(--muted);font-size:13px">${escapeHtml((inv.items || []).map(it => it.name + '×' + it.qty).join(', '))}</div>
                </div>
                <div style="text-align:right">
                    <div style="font-weight:700">₹${inv.total}</div>
                    <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:6px">
                        <button class="ghost" onclick='previewStoredInvoice("${escapeHtml(inv.id)}")'>Preview</button><button class="ghost" onclick='deleteInvoice("${encodeURIComponent(inv.id)}")'>Delete</button>
                    </div>
                </div>
            </div>
        `;
    }
    html += `</div>`;
    area.innerHTML = html;
}
function previewStoredInvoice(id) {
    const decoded = decodeURIComponent(id);
    const inv = invoices.find(x => x.id === decoded);
    if (!inv) return alert('Invoice not found');
    showInvoicePreview(inv);
}
async function deleteInvoice(id) {
    const decoded = decodeURIComponent(id);
    if (!confirm('Delete invoice?')) return;
    try {
        const res = await fetch(`/api/invoices/${encodeURIComponent(decoded)}`, { method: 'DELETE' });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            return alert('Delete failed: ' + (data.error || res.statusText));
        }
        invoices = invoices.filter(x => x.id !== decoded);
        window.invoices = invoices;
        viewInvoices();
    } catch (err) {
        console.error('Failed to delete invoice', err);
        alert('Failed to delete invoice');
    }
}

// Daily & monthly reports
function showDailyReport() {
    const date = prompt("Enter date for daily report (YYYY-MM-DD):\n\n(OR)\n\nLeave blank for today's report:");
    let d;
    if (!date) d = new Date();
    else d = new Date(date);
    if (isNaN(d)) return alert('Invalid format');
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    const dayInv = invoices.filter(inv => {
        const t = new Date(inv.date);
        return t >= start && t < end;
    });
    showReport(dayInv, `Daily Report: ${start.toLocaleDateString()}`);
}
function showMonthlyReport() {
    const ym = prompt("Enter month for monthly report (YYYY-MM):\n\n(OR)\n\nLeave blank for current month's report:");
    let yyyy, mm;
    if (!ym) {
        const now = new Date();
        yyyy = now.getFullYear(); mm = now.getMonth();
    } else {
        const parts = ym.split('-');
        if (parts.length < 2) return alert('Invalid format');
        yyyy = parseInt(parts[0]); mm = parseInt(parts[1]) - 1;
    }
    const start = new Date(yyyy, mm, 1);
    const end = new Date(yyyy, mm + 1, 1);
    const monthInv = invoices.filter(inv => {
        const t = new Date(inv.date);
        return t >= start && t < end;
    });
    showReport(monthInv, `Monthly Report: ${start.toLocaleString('default', { month: 'long', year: 'numeric' })}`);
}
function showReport(invList, title) {
    const area = document.getElementById('report-area');
    if (!area) return;
    if (!invList.length) {
        area.innerHTML = `<div><strong>${escapeHtml(title)}</strong><div class="muted-note">No transactions found.</div></div>`;
        return;
    }
    const total = invList.reduce((s, i) => s + (Number(i.total) || 0), 0);
    // let html = `<div><strong>${escapeHtml(title)}</strong><div style="margin-top:8px">Total Sales: <strong>₹${total}</strong></div></div><div style="margin-top:8px;max-height:200px;overflow:auto">`;
    let html = `<div><strong>${escapeHtml(title)}</strong><div style="margin-top:8px"></div></div><div style="margin-top:8px;max-height:200px;overflow:auto">`;
    for (const inv of invList) {
        html += `
            <div style="padding:8px;border-radius:8px;margin-bottom:8px;background:linear-gradient(180deg, rgba(255,255,255,0.01), rgba(255,255,255,0.005));border:1px solid rgba(255,255,255,0.02)">
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div><div style="font-weight:700">${escapeHtml(inv.id)}</div><div style="color:var(--muted);font-size:13px">${escapeHtml(new Date(inv.date).toLocaleString())}</div></div>
                    <div style="text-align:right"><div style="font-weight:700">₹${inv.total}</div><div style="color:var(--muted);font-size:13px">${(inv.items || []).length} items</div></div>
                </div>
            </div>
        `;
    }
    html += '</div>';
    area.innerHTML = html;
}
function downloadAllReports() {
    if (!window.XLSX) {
        return alert('SheetJS (XLSX) library not found. Add the CDN script before calling this function.');
    }
    if (!invoices || invoices.length === 0) {
        return alert('No invoices are available.');
    }
    const aoa = [
        ['Invoice ID', 'Date & Time', 'Order Type', 'Supervisor', 'Supervisor Ph.no', 'Product Name & Quantity', 'Total Price']
    ];
    for (const inv of invoices) {
        const date = new Date(inv.date);
        const dateStr = isNaN(date.getTime()) ? '' : date.toLocaleString();
        const items = (inv.items || []).map(i => `${i.name} × ${i.qty}`).join(', ');
        const total = (typeof inv.total === 'number') ? inv.total : (inv.total ?? '');
        aoa.push([
            inv.id || '',
            dateStr,
            inv.orderType || 'N/A',
            inv.customerName || 'NA',
            inv.customerPhone || 'NA',
            items,
            total
        ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 20 }, { wch: 22 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 60 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Invoices');
    XLSX.writeFile(wb, 'Export_All_Invoices.xlsx');
}

// Input validators
function filterName(el) {
    if (!el) return;
    el.value = el.value.replace(/[^A-Za-z\s]/g, '');
}
function filterPhone(el) {
    if (!el) return;
    el.value = el.value.replace(/\D/g, '').slice(0, 10);
}

// WhatsApp modal controls
function openWAModal() {
    const custPhone = (document.getElementById('customer-phone') ? (document.getElementById('customer-phone').value || '') : '').replace(/\D/g, '').slice(0, 10);
    const input = document.getElementById('wa-phone-input');
    if (input) input.value = custPhone;
    const modal = document.getElementById('wa-modal');
    if (modal) modal.style.display = 'flex';
}
function closeWAModal() {
    const modal = document.getElementById('wa-modal');
    if (modal) modal.style.display = 'none';
}
async function sendPdfToWhatsapp() {
    // const phone = (document.getElementById('wa-phone-input') ? (document.getElementById('wa-phone-input').value || '') : '').replace(/\D/g, '').slice(0, 10);
    // if (!phone || phone.length !== 10) return alert('Please enter a valid 10-digit phone number');
    const el = document.getElementById('invoice-preview');
    if (!el) return alert('No invoice to send');
    const sendBtn = document.getElementById('wa-send-btn');
    if (sendBtn) { sendBtn.disabled = true; sendBtn.innerText = 'Preparing...'; }
    try {
        const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: null });
        const imgData = canvas.toDataURL('image/png');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const imgProps = pdf.getImageProperties(imgData);
        const imgWidthMM = pageWidth - 20;
        const imgHeightMM = (imgProps.height * imgWidthMM) / imgProps.width;
        pdf.addImage(imgData, 'PNG', 10, 10, imgWidthMM, imgHeightMM);

        const blob = await pdf.output('blob');
        const fileName = (document.querySelector('#invoice-preview h2') ? 'Invoice' : 'invoice') + '.pdf';
        const file = new File([blob], fileName, { type: 'application/pdf' });
        let shared = false;
        const shareText = 'Please find the attached invoice.';
        if (navigator.share) {
            try {
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({ files: [file], title: fileName, text: shareText });
                    shared = true;
                } else {
                    await navigator.share({ files: [file], title: fileName, text: shareText });
                    shared = true;
                }
            } catch (err) {
                shared = false;
            }
        }

        if (!shared) {
            const blobUrl = URL.createObjectURL(blob);
            const fullNumber = '91' + phone;
            const text = encodeURIComponent(`Please find the invoice attached:\n${blobUrl}`);
            const waLink = `https://wa.me/${fullNumber}?text=${text}`;
            window.open(waLink, '_blank');
            setTimeout(() => { try { URL.revokeObjectURL(blobUrl); } catch (e) { } }, 5 * 60 * 1000);
        }
        closeWAModal();
    } catch (err) {
        alert('Failed to prepare and share PDF: ' + (err && err.message ? err.message : err));
    } finally {
        if (sendBtn) { sendBtn.disabled = false; sendBtn.innerText = 'Send PDF'; }
    }
}

// Quick Reports
function openQuickReport() {
    const el = document.getElementById('quick-report-modal');
    if (!el) return;
    const res = document.getElementById('quick-report-result');
    if (res) res.innerHTML = '';
    el.style.display = 'flex';
}
function closeQuickReport() {
    const el = document.getElementById('quick-report-modal');
    if (!el) return;
    el.style.display = 'none';
}
function openFoodOrder() {
    const el = document.getElementById('food-order-modal');
    if (!el) return;
    const res = document.getElementById('food-order-result');
    if (res) res.innerHTML = '';
    el.style.display = 'flex';
}
function closeFoodOrder() {
    const el = document.getElementById('food-order-modal');
    if (!el) return;
    el.style.display = 'none';
}
function getTodayInvoices() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return (invoices || []).filter(inv => {
        if (!inv.date) return false;
        const t = new Date(inv.date);
        return t >= start && t < end;
    });
}
function getYesterdayInvoices() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return (invoices || []).filter(inv => {
        const t = new Date(inv.date);
        return t >= start && t < end;
    });
}
function copyToClipboard(text) {
    if (!text && text !== 0) { alert('Nothing to copy'); return; }
    const str = String(text);
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(str).then(() => { alert('Copied to clipboard'); }).catch(() => { fallbackCopy(str); });
    } else {
        fallbackCopy(str);
    }
    function fallbackCopy(s) {
        try {
            const ta = document.createElement('textarea');
            ta.value = s;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            alert('Copied to clipboard');
        } catch (e) {
            alert('Copy failed');
        }
    }
}
function showTodayCount() {
    const list = getTodayInvoices();
    const count = list.length;
    const resEl = document.getElementById('quick-report-result');
    if (!resEl) return;
    resEl.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;';
    wrapper.innerHTML = `<div>Today's invoice count: <strong>${count}</strong></div>`;
    const btn = document.createElement('button');
    btn.className = 'ghost';
    btn.innerText = 'Copy';
    btn.onclick = () => copyToClipboard(String(count));
    wrapper.appendChild(btn);
    resEl.appendChild(wrapper);
}
function showTodayInvoiceNumbers() {
    const list = getTodayInvoices();
    const ids = list.map(i => i.id).join(', ');
    const resEl = document.getElementById('quick-report-result');
    if (!resEl) return;
    resEl.innerHTML = '';
    const title = document.createElement('div');
    title.style.marginBottom = '8px';
    title.innerText = 'Invoice numbers:';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;';
    const idsDiv = document.createElement('div');
    idsDiv.style.cssText = 'flex:1;word-break:break-all;color:var(--muted);';
    idsDiv.textContent = ids || '—';
    const btn = document.createElement('button');
    btn.className = 'ghost';
    btn.innerText = 'Copy';
    btn.onclick = () => copyToClipboard(ids || '');
    row.appendChild(idsDiv);
    row.appendChild(btn);
    resEl.appendChild(title);
    resEl.appendChild(row);
}
function showTodayBusiness() {
    const list = getTodayInvoices();
    const total = list.reduce((s, inv) => s + (Number(inv.total) || 0), 0);
    const resEl = document.getElementById('quick-report-result');
    if (!resEl) return;
    resEl.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;';
    wrapper.innerHTML = `<div>Today's business (total): <strong>₹${total}</strong></div>`;
    const btn = document.createElement('button');
    btn.className = 'ghost';
    btn.innerText = 'Copy';
    btn.onclick = () => copyToClipboard(String(total));
    wrapper.appendChild(btn);
    resEl.appendChild(wrapper);
}
function showYesterdayBusiness() {
    const list = getYesterdayInvoices();
    const total = list.reduce((s, inv) => s + (Number(inv.total) || 0), 0);
    const resEl = document.getElementById('quick-report-result');
    if (!resEl) return;
    resEl.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;';
    wrapper.innerHTML = `<div>Yesterday's business (total): <strong>₹${total}</strong></div>`;
    const btn = document.createElement('button');
    btn.className = 'ghost';
    btn.innerText = 'Copy';
    btn.onclick = () => copyToClipboard(String(total));
    wrapper.appendChild(btn);
    resEl.appendChild(wrapper);
}

// Drafts Management UI
function openDraftsModal() {
    const modal = document.getElementById('drafts-modal');
    if (modal) {
        modal.style.display = 'flex';
        renderDrafts();
    }
}

function closeDraftsModal() {
    const modal = document.getElementById('drafts-modal');
    if (modal) modal.style.display = 'none';
}

function renderDrafts() {
    const container = document.getElementById('drafts-list-container');
    if (!container) return;

    const currentDrafts = (window.drafts || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (!currentDrafts.length) {
        container.innerHTML = '<div class="muted-note" style="padding: 20px; text-align: center;">No saved drafts found.</div>';
        return;
    }
    let html = '';
    for (const draft of currentDrafts) {
        const date = new Date(draft.createdAt).toLocaleString();
        html += `
            <div style="background: var(--bg); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; margin-bottom: 10px;">
                <div style="display:flex; justify-content: space-between; align-items: flex-start;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="color: var(--text-secondary); font-size: 12px;">Saved on: ${escapeHtml(date)}</div>
                        <div style="font-weight: 500; margin-top: 4px;">Table No: ${escapeHtml(draft.tableNumber || 'N/A')}</div>
                        <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">
                            ${draft.supervisorName ? `Supervisor: ${escapeHtml(draft.supervisorName)}` : ''}
                        </div>
                        <pre style="white-space: pre-wrap; word-break: break-all; font-family: inherit; font-size: 13px; margin-top: 8px; max-height: 80px; overflow-y: auto; background: var(--card); padding: 4px 6px; border-radius: 4px; border: 1px solid var(--border-color);">${escapeHtml(draft.text || '')}</pre>
                    </div>
                    <div style="display: flex; gap: 8px; margin-left: 12px; align-items: center;">
                        <button class="ghost" onclick="editDraft('${draft.id}')">Edit</button>
                        <button class="ghost" onclick="deleteDraft('${draft.id}')">Delete</button>
                    </div>
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
}

function editDraft(id) {
    closeDraftsModal();
    openTypeInvoiceModal();
    _typeInvoiceState.editingDraftId = id; // This line is crucial
    window.restoreDraft(id);
    // Trigger validation after restoring the draft
    const ta = document.getElementById('type-invoice-textarea');
    if (ta) {
        const event = new Event('input', { bubbles: true, cancelable: true });
        ta.dispatchEvent(event);
    }
}

async function deleteDraft(id) {
    if (!confirm('Are you sure you want to delete this draft?')) return;
    try {
        const res = await fetch(`/api/drafts/${encodeURIComponent(id)}`, {
            method: 'DELETE'
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            return alert('Delete failed: ' + (data.error || res.statusText));
        }

        // Remove from local array and re-render
        window.drafts = (window.drafts || []).filter(d => d.id !== id);
        renderDrafts(); // Refresh the list in the modal

    } catch (err) {
        console.error('Failed to delete draft', err);
        alert('Failed to delete draft: ' + err.message);
    }
}

/* Chat Bot Functionality */
(function () {
    'use strict';
    const STORAGE_KEY = 'business_assistant_conversation_v1';
    const MAX_MESSAGES = 400;
    const WELCOME = "Hi, I'm your Personal Business Assistant. Please use the buttons below to learn more about your today's & yesterday's business. Thank you.";
    const toggleBtn = document.getElementById('ba-toggle');
    const chatWindow = document.getElementById('ba-window');
    const closeBtn = document.getElementById('ba-close');
    const messagesWrap = document.getElementById('ba-messages');
    const inputEl = document.getElementById('ba-input');
    const sendBtn = document.getElementById('ba-send');
    let conversation = [];

    function now() { return new Date().toISOString(); }
    function saveConversation() {
        try {
            const copy = conversation.slice(-MAX_MESSAGES);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(copy));
        } catch (e) { console.warn('BusinessAssistant: failed to save conversation', e); }
    }
    function loadConversation() {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (e) { }
        conversation = [];
    }
    function escapeHtmlChat(s) {
        return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
    }
    function formatTime(iso) {
        const d = new Date(iso);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    function appendMessageEl(msg) {
        if (!messagesWrap) return;
        const div = document.createElement('div');
        div.className = 'ba-msg ' + (msg.from === 'user' ? 'user' : 'bot');
        const contentHtml = `<div style="margin-bottom:6px">${escapeHtmlChat(msg.text)}</div><div style="font-size:11px;color:#55696f;text-align:${msg.from === 'user' ? 'right' : 'left'}">${formatTime(msg.ts)}</div>`;
        div.innerHTML = contentHtml;
        messagesWrap.appendChild(div);
        messagesWrap.scrollTop = messagesWrap.scrollHeight;
    }
    function renderAll() {
        if (!messagesWrap) return;
        messagesWrap.innerHTML = '';
        conversation.forEach(appendMessageEl);
        messagesWrap.scrollTop = messagesWrap.scrollHeight;
    }
    function pushMessage(from, text) {
        const msg = { from, text: String(text || ''), ts: now() };
        conversation.push(msg);
        if (conversation.length > MAX_MESSAGES) conversation = conversation.slice(-MAX_MESSAGES);
        saveConversation();
        appendMessageEl(msg);
        return msg;
    }
    let typingIndicator = null;
    function showTyping() {
        if (!messagesWrap) return;
        typingIndicator = { from: 'bot', text: 'Typing…', ts: now(), _temp: true };
        conversation.push(typingIndicator);
        appendMessageEl(typingIndicator);
    }
    function hideTyping() {
        if (!typingIndicator) return;
        const idx = conversation.findIndex(m => m._temp);
        if (idx >= 0) {
            conversation.splice(idx, 1);
            saveConversation();
            renderAll();
        }
        typingIndicator = null;
    }
    function handleUserText(text) {
        const raw = String(text || '').trim();
        if (/^(?:\d{13}|INV-\d{13}(?:-[A-Za-z0-9_-]+)?)$/.test(raw)) {
            let dateStr = 'N/A', grandTotal = 'N/A', customerName = 'N/A', item = 'N/A', endResult;
            const list = Array.isArray(window.invoices) ? window.invoices : [];
            const inv = list.find(i => String(i.id).includes(raw));

            if (inv) {
                if (inv.date) {
                    const d = new Date(inv.date);
                    if (!isNaN(d)) dateStr = d.toLocaleString();
                }
                if (inv.customerName != null && inv.customerName !== '0') {
                    customerName = String(inv.customerName);
                } else {
                    customerName = "NA";
                }
                if (inv.items?.length) {
                    item = inv.items.map(it => `${it.name}×${it.qty}`).join(', ');
                }
                if (inv.total != null && !isNaN(inv.total)) {
                    grandTotal = inv.total.toLocaleString();
                }
                endResult = `Date and time of purchase: ${dateStr} Supervisor: ${customerName} Products: ${item} Total: ${grandTotal}`;
            } else {
                endResult = "We couldn't find an invoice with that number";
            }
            respondBot(endResult);
        } else {
            respondBot("Please enter a valid invoice number");
        }
    }
    function openChat() {
        if (!chatWindow) return;
        chatWindow.style.display = 'flex';
        chatWindow.setAttribute('aria-hidden', 'false');
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
        renderDefaultButtons();
        if (conversation.length === 0) pushMessage('bot', WELCOME);
        else renderAll();
        if (inputEl) setTimeout(() => inputEl.focus(), 120);
    }
    function closeChat() {
        if (!chatWindow) return;
        chatWindow.style.display = 'none';
        chatWindow.setAttribute('aria-hidden', 'true');
        if (toggleBtn) {
            toggleBtn.setAttribute('aria-expanded', 'false');
            toggleBtn.focus();
        }
    }
    function respondBot(text, thinkMs = 600) {
        showTyping();
        setTimeout(() => {
            hideTyping();
            pushMessage('bot', text);
        }, thinkMs);
    }
    let defaultActionsEl = null;
    function renderDefaultButtons() {
        if (!chatWindow || !messagesWrap || defaultActionsEl) return;

        defaultActionsEl = document.createElement('div');
        defaultActionsEl.className = 'ba-default-actions';
        defaultActionsEl.style.cssText = 'display:flex;gap:8px;padding:10px;flex-wrap:wrap;border-top:1px solid #eee;background:transparent;';

        const makeButton = (label, handler) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ba-action-btn';
            btn.textContent = label;
            btn.style.cssText = 'padding:6px 10px;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;';
            btn.addEventListener('click', handler);
            return btn;
        };

        const actions = [{
            label: 'Today\'s invoice count',
            handler: () => {
                pushMessage('user', 'The total number of invoices generated today.');
                const list = getTodayInvoices();
                respondBot(`Today's invoice count: ${list.length}`);
            }
        }, {
            label: 'Today\'s invoice numbers',
            handler: () => {
                pushMessage('user', 'Invoice information.');
                const list = getTodayInvoices();
                const ids = list.map(inv => inv.id).join(', ') || '—';
                respondBot(`Invoice information: ${ids}`);
            }
        }, {
            label: 'Today\'s business',
            handler: () => {
                pushMessage('user', "Today's business.");
                const list = getTodayInvoices();
                const total = list.reduce((s, inv) => s + (Number(inv.total) || 0), 0);
                respondBot(`Today's business (total): ₹${total}`);
            }
        }, {
            label: 'Yesterday\'s business',
            handler: () => {
                pushMessage('user', "Yesterday's business.");
                const list = getYesterdayInvoices();
                const total = list.reduce((s, inv) => s + (Number(inv.total) || 0), 0);
                respondBot(`Yesterday's business (total): ₹${total}`);
            }
        }];

        actions.forEach(action => defaultActionsEl.appendChild(makeButton(action.label, action.handler)));

        if (messagesWrap.parentNode) {
            messagesWrap.parentNode.insertBefore(defaultActionsEl, messagesWrap.nextSibling);
        }
    }

    if (toggleBtn) toggleBtn.addEventListener('click', () => {
        const isOpen = chatWindow && chatWindow.style.display !== 'none';
        if (isOpen) closeChat(); else openChat();
    });
    if (closeBtn) closeBtn.addEventListener('click', closeChat);
    if (sendBtn && inputEl) {
        const send = () => {
            const text = inputEl.value.trim();
            if (!text) return;
            pushMessage('user', text);
            inputEl.value = '';
            setTimeout(() => handleUserText(text), 120);
        };
        sendBtn.addEventListener('click', send);
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
            }
        });
    }

    loadConversation();
    renderAll();
    if (chatWindow) chatWindow.style.display = 'none';

    window.BusinessAssistant = {
        open: openChat, close: closeChat,
        send: (text) => { if (!text) return; pushMessage('user', text); setTimeout(() => handleUserText(text), 120); },
        clear: () => { conversation = []; saveConversation(); renderAll(); },
        getConversation: () => conversation.slice(),
        notifyBot: (text) => { pushMessage('bot', text); }
    };
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && chatWindow && chatWindow.style.display !== 'none') {
            closeChat();
        }
    });
})();

// New: Type-to-generate-invoice flow
let _typeInvoiceState = { rawLines: [], parsedLines: [], validItems: [], editingDraftId: null };
function openTypeInvoiceModal() {
    const modal = document.getElementById('type-invoice-modal');
    if (!modal) return;
    _typeInvoiceState = { rawLines: [], parsedLines: [], validItems: [], editingDraftId: null, selectedTable: null };
    window._typeInvoiceState = _typeInvoiceState;
    const ta = document.getElementById('type-invoice-textarea');
    if (ta) { ta.value = ''; const c = document.getElementById('type-lines-count'); if (c) c.innerText = '0'; }

    renderTableNumberGrid(); // Add this line

    const res = document.getElementById('type-validate-result'); if (res) res.innerHTML = '';
    const actionsArea = document.getElementById('type-actions-area'); if (actionsArea) actionsArea.style.display = 'none';
    modal.style.display = 'flex';
}
function renderTableNumberGrid() {
    const container = document.getElementById('table-number-grid');
    if (!container) return;
    container.innerHTML = '';
    const editingDraftId = _typeInvoiceState?.editingDraftId;

    for (let i = 1; i <= 12; i++) {
        const tableNum = String(i);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'table-box';
        btn.textContent = tableNum;

        const isOccupied = (window.drafts || []).some(
            d => d.tableNumber === tableNum && d.id !== editingDraftId
        );

        if (isOccupied) {
            btn.classList.add('occupied');
            btn.disabled = true;
            btn.title = 'This table has an open draft';
        } else {
            btn.onclick = () => selectTable(tableNum);
        }
        container.appendChild(btn);
    }
}
function selectTable(tableNumber) {
    _typeInvoiceState.selectedTable = tableNumber;
    const container = document.getElementById('table-number-grid');
    if (!container) return;

    container.querySelectorAll('.table-box').forEach(btn => {
        btn.classList.remove('selected');
    });

    const selectedBtn = Array.from(container.querySelectorAll('.table-box')).find(btn => btn.textContent === tableNumber);
    if (selectedBtn) {
        selectedBtn.classList.add('selected');
    }
}
function closeTypeInvoiceModal() {
    const modal = document.getElementById('type-invoice-modal');
    if (!modal) return;
    modal.style.display = 'none';
}
async function finalizeTypeInvoice(orderType) {
    const valid = (_typeInvoiceState && Array.isArray(_typeInvoiceState.validItems)) ? _typeInvoiceState.validItems.slice() : [];
    if (!valid.length) return alert('No valid products to generate invoice.');

    const tableNumber = _typeInvoiceState?.selectedTable;
    const supervisorName = (document.getElementById('type-supervisor-name')?.value.trim()) || '';
    const supervisorPhone = (document.getElementById('type-supervisor-phone')?.value.trim()) || '';

    if (!tableNumber) {
        return alert('A Table Number must be selected to generate an invoice.');
    }

    const editingDraftId = _typeInvoiceState?.editingDraftId;
    const isTableNumberInUse = (window.drafts || []).some(
        d => d.tableNumber === tableNumber && d.id !== editingDraftId
    );

    if (isTableNumberInUse) {
        return alert(`An open draft already exists for Table Number "${tableNumber}". Please finalize or delete the existing draft first.`);
    }

    const invLocal = {
        invoiceId: 'INV-' + Date.now() + '-' + uid(),
        date: new Date().toISOString(),
        orderType: orderType, // This part is correct
        tableNumber: tableNumber,
        supervisorName,
        supervisorPhone,
        items: valid.map(it => ({ name: it.name, price: it.price, qty: it.qty })),
        total: valid.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 0), 0)
    };

    try {
        const res = await fetch('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(invLocal) });
        const data = await res.json().catch(() => ({}));
        const saved = (res.ok && data?.invoice) ? data.invoice : invLocal;

        // --- Start of Correction ---
        const localInv = {
            id: saved.invoiceId || saved.id,
            invoiceId: saved.invoiceId || saved.id,
            date: saved.date || invLocal.date,
            orderType: saved.orderType || invLocal.orderType, // This line was missing
            supervisorName: saved.supervisorName || invLocal.supervisorName,
            supervisorPhone: saved.supervisorPhone || invLocal.supervisorPhone,
            items: saved.items || invLocal.items,
            total: saved.total ?? invLocal.total
        };
        // --- End of Correction ---

        invoices.unshift(localInv);
        window.invoices = invoices;
        showInvoicePreview(localInv);
    } catch (err) {
        // Fallback: show local invoice if server fails
        showInvoicePreview(invLocal);
        invoices.unshift(invLocal);
        window.invoices = invoices;
    } finally {
        if (_typeInvoiceState?.editingDraftId) {
            const draftIdToDelete = _typeInvoiceState.editingDraftId;
            try {
                await fetch(`/api/drafts/${encodeURIComponent(draftIdToDelete)}`, {
                    method: 'DELETE'
                });
                window.drafts = (window.drafts || []).filter(d => d.id !== draftIdToDelete);
            } catch (e) {
                console.warn('Could not auto-delete draft after generation', e);
            }
        }
        closeTypeInvoiceModal();
    }
}

// AI correction client helper
async function aiCorrectName(name) {
    if (!name || typeof name !== 'string') return name;
    const nowTs = Date.now();
    if (aiCorrectName._disabledUntil && nowTs < aiCorrectName._disabledUntil) {
        if (!aiCorrectName._loggedSkip) {
            console.debug('AI correction skipped due to previous failures until', new Date(aiCorrectName._disabledUntil).toISOString());
            aiCorrectName._loggedSkip = true;
        }
        return name;
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const res = await fetch('/api/ai/correct', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
            aiCorrectName._disabledUntil = Date.now() + (5 * 60 * 1000);
            aiCorrectName._loggedSkip = false;
            const txt = await res.text().catch(() => '');
            console.debug('AI correction failed (non-OK)', { status: res.status, message: txt || `status ${res.status}` });
            return name;
        }

        let data = null;
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('application/json')) {
            data = await res.json().catch(() => null);
        } else {
            const txt = await res.text().catch(() => '');
            if (txt) try { data = JSON.parse(txt); } catch (e) { data = txt; }
        }

        aiCorrectName._disabledUntil = 0;
        aiCorrectName._loggedSkip = false;

        if (data && typeof data.corrected === 'string' && data.corrected.trim()) return data.corrected.trim();
        if (typeof data === 'string' && data.trim()) return data.trim();
        return name;

    } catch (err) {
        if (err?.name === 'AbortError') {
            aiCorrectName._disabledUntil = Date.now() + (60 * 1000);
        } else {
            aiCorrectName._disabledUntil = Date.now() + (2 * 60 * 1000);
        }
        console.debug('AI correction failed', err);
        aiCorrectName._loggedSkip = false;
        return name;
    }
}

async function _validateTypeInvoiceLines(lines, showUi = true) {
    if (!Array.isArray(lines)) lines = [];
    const parsed = lines.map(line => {
        let name = '';
        let qty = 1;
        const csvParts = line.split(',');
        if (csvParts.length > 1) {
            name = csvParts[0].trim();
            qty = parseInt(csvParts[1].trim(), 10) || 1;
        } else {
            const spaceParts = line.trim().split(/\s+/);
            const lastPart = spaceParts[spaceParts.length - 1];
            if (/^\d+$/.test(lastPart) && spaceParts.length > 1) {
                qty = parseInt(lastPart, 10) || 1;
                name = spaceParts.slice(0, -1).join(' ');
            } else {
                name = line.trim();
                qty = 1;
            }
        }
        return { line, name: name.trim(), qty: Math.max(1, qty), matchedProduct: null, valid: false };
    });

    const unmatched = [];
    for (const p of parsed) {
        const match = DEFAULT_PRODUCTS.find(prod => prod.name?.toLowerCase() === p.name.toLowerCase());
        if (match) {
            p.matchedProduct = match;
            p.valid = true;
        } else {
            unmatched.push(p.name);
        }
    }

    const correctionMap = unmatched.length > 0 ? await batchCorrectNames(unmatched, 3) : {};

    for (const p of parsed) {
        if (p.valid) continue;
        const corrected = (correctionMap[p.name] || p.name).trim().toLowerCase();
        let match = DEFAULT_PRODUCTS.find(prod => prod.name?.toLowerCase() === corrected);
        if (!match) {
            match = DEFAULT_PRODUCTS.find(prod => {
                const pn = (prod.name || '').toLowerCase();
                return pn.includes(corrected) || corrected.includes(pn);
            });
        }
        if (match) {
            p.matchedProduct = match;
            p.name = match.name;
            p.valid = true;
        }
    }

    const validItems = parsed.filter(p => p.valid && p.matchedProduct).map(p => ({ name: p.matchedProduct.name, price: p.matchedProduct.price, qty: p.qty }));
    _typeInvoiceState.rawLines = lines;
    _typeInvoiceState.parsedLines = parsed;
    _typeInvoiceState.validItems = validItems;
    window._typeInvoiceState = _typeInvoiceState;

    if (showUi) {
        const res = document.getElementById('type-validate-result');
        if (res) {
            let html = `<div style="max-height:220px;overflow:auto;padding:6px;border-radius:8px;background:var(--bg-light);border:1px solid var(--border-color);">`;
            for (const p of parsed) {
                if (p.valid) {
                    html += `<div style="display:flex;justify-content:space-between;padding:6px;border-bottom:1px dashed #eee"><div style="color:var(--text-secondary)">${escapeHtml(p.name)} × ${p.qty}</div><div style="color:green">Available</div></div>`;
                } else {
                    html += `<div style="display:flex;justify-content:space-between;padding:6px;border-bottom:1px dashed #eee"><div style="color:red">${escapeHtml(p.line)}</div><div style="color:red">Not available</div></div>`;
                }
            }
            html += `</div>`;
            html += `<div style="margin-top:8px;color:var(--text-secondary)">Valid items: <strong>${validItems.length}</strong> / ${parsed.length}.</div>`;
            res.innerHTML = html;
        }
        const actionsArea = document.getElementById('type-actions-area');
        if (actionsArea) actionsArea.style.display = (validItems.length > 0) ? 'block' : 'none';
    }
    return { parsed, validItems, correctionMap };
}

(function bindAutoTypeValidate() {
    const ta = document.getElementById('type-invoice-textarea');
    if (!ta) return;
    const debounced = debounce(async () => {
        const lines = ta.value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const res = document.getElementById('type-validate-result');
        const actionsArea = document.getElementById('type-actions-area');

        if (!lines.length) {
            if (res) res.innerHTML = '';
            if (actionsArea) actionsArea.style.display = 'none';
            return;
        }
        await _validateTypeInvoiceLines(lines, true);
    }, 700);

    ta.addEventListener('input', debounced);
})();

// --- New Draft functions (server-based) ---

async function saveDraftFromTypeInvoice() {
    try {
        const text = document.getElementById('type-invoice-textarea')?.value || '';
        const tableNumber = _typeInvoiceState?.selectedTable;
        const supervisorName = document.getElementById('type-supervisor-name')?.value?.trim() || '';
        const supervisorPhone = document.getElementById('type-supervisor-phone')?.value?.trim() || '';
        const lines = text.split('\n').filter(l => l.trim() !== '').length;

        if (!tableNumber) {
            return alert('A Table Number must be selected to save a draft.');
        }
        if (!text && !supervisorName && !supervisorPhone) {
            return alert('Cannot save an empty draft.');
        }
        const editingId = window._typeInvoiceState?.editingDraftId;

        const isTableNumberInUse = (window.drafts || []).some(
            d => d.tableNumber === tableNumber && d.id !== editingId
        );

        if (isTableNumberInUse) {
            return alert(`An open draft already exists for Table Number "${tableNumber}". Please use a different table number.`);
        }

        const payload = {
            id: editingId, // This will be the draftId
            text,
            tableNumber,
            supervisorName,
            supervisorPhone,
            lines,
        };

        const res = await fetch('/api/drafts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            return alert('Failed to save draft: ' + (data.error || `Server error ${res.status}`));
        }

        await loadDraftsFromServer();
        closeTypeInvoiceModal();

    } catch (e) {
        alert('Failed to save draft: ' + e.message);
        console.error('Error saving draft:', e);
    }
}

function restoreDraft(id) {
    const draft = (window.drafts || []).find((d) => d.id === id);
    if (!draft) return;
    const ta = document.getElementById('type-invoice-textarea');
    if (ta) ta.value = draft.text;

    if (draft.tableNumber) {
        selectTable(draft.tableNumber);
    }

    const sn = document.getElementById('type-supervisor-name');
    if (sn) sn.value = draft.supervisorName;
    const sp = document.getElementById('type-supervisor-phone');
    if (sp) sp.value = draft.supervisorPhone;
    const linesEl = document.getElementById('type-lines-count');
    if (linesEl) linesEl.textContent = String(draft.lines || (draft.text || '').split('\n').filter(Boolean).length);
}

function openOrderTypeModal(context) {
    // First, perform checks to ensure an invoice can be generated
    if (context === 'cart') {
        const keys = Object.keys(cart);
        if (!keys.length) return alert('The cart is unavailable or empty.');
    } else if (context === 'typed') {
        const valid = (_typeInvoiceState && Array.isArray(_typeInvoiceState.validItems)) ? _typeInvoiceState.validItems : [];
        if (!valid.length) return alert('No valid products to generate invoice.');
        const tableNumber = _typeInvoiceState?.selectedTable;
        if (!tableNumber) {
            return alert('A Table Number must be selected to generate an invoice.');
        }
    }

    _orderContext = context;
    const modal = document.getElementById('order-type-modal');
    if (modal) modal.style.display = 'flex';
}

function closeOrderTypeModal() {
    _orderContext = null;
    const modal = document.getElementById('order-type-modal');
    if (modal) modal.style.display = 'none';
}

function confirmOrderType(orderType) {
    if (!_orderContext) return;

    if (_orderContext === 'cart') {
        generateInvoice(orderType);
    } else if (_orderContext === 'typed') {
        finalizeTypeInvoice(orderType);
    }

    closeOrderTypeModal();
}

function shiftHourlySales(direction) { // 1 for prev/left (earlier), -1 for next/right (later)
    const maxOffset = Math.floor(24 / HOURLY_CHART_WINDOW_SIZE) - 1;

    // The direction now directly corresponds to the change in offset.
    // A positive direction (1) increases the offset, moving back in time (previous).
    // A negative direction (-1) decreases the offset, moving forward in time (next).
    hourlyChartOffset += direction;

    // Clamp the values to stay within bounds
    hourlyChartOffset = Math.max(0, Math.min(hourlyChartOffset, maxOffset));

    // Re-render the chart with the new offset
    renderSalesChart();
}

// On load
(async function init() {
    await fetchEnvFile();

    await loadInvoicesFromServer();
    await loadDraftsFromServer();

    if (sessionStorage.getItem('bb_logged_in') !== 'true') {
        showLoginModal();
        showView('pos'); // Show POS view if not logged in
    } else {
        const up = document.getElementById('up-arrow');
        if (up) up.style.display = 'flex';
        showView('dashboard'); // Show dashboard by default for logged-in users
    }

    renderProducts();
    renderCart();
    renderAdminList();
    renderDashboard();

    const ta = document.getElementById('type-invoice-textarea');
    if (ta) {
        ta.addEventListener('input', () => {
            const lines = ta.value.split(/\r?\n/).filter(l => l.trim() !== '');
            const counter = document.getElementById('type-lines-count');
            if (counter) counter.innerText = lines.length;
        });
    }
    window.openZomato = () => window.open('https://www.zomato.com/restaurants', '_blank', 'noopener');
    window.openSwiggy = () => window.open('https://www.swiggy.com/restaurants', '_blank', 'noopener');
})();

// Global function assignments
Object.assign(window, {
    showView, renderDashboard,
    previewStoredInvoice, deleteInvoice, openAdmin, closeAdmin, showProductForm, hideProductForm,
    saveProduct, editProduct, deleteProduct, restoreDefaults, generateInvoice, exportInvoicePDF,
    closeInvoiceModal, viewInvoices, showDailyReport, showMonthlyReport, downloadAllReports,
    clearCart, addToCart, updateQty, removeFromCart, printInvoice, openWAModal, closeWAModal,
    sendPdfToWhatsapp, openQuickReport, openFoodOrder, closeFoodOrder, closeQuickReport,
    getTodayInvoices, getYesterdayInvoices, copyToClipboard, showTodayCount, showTodayInvoiceNumbers,
    showTodayBusiness, showYesterdayBusiness, openTypeInvoiceModal, closeTypeInvoiceModal,
    finalizeTypeInvoice, _typeInvoiceState, aiCorrectName, batchCorrectNames, _validateTypeInvoiceLines,
    openDraftsModal, closeDraftsModal, editDraft, deleteDraft, saveDraftFromTypeInvoice, restoreDraft,
    openOrderTypeModal, closeOrderTypeModal, confirmOrderType, shiftHourlySales
});

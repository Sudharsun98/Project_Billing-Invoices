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
    }
    return results;
}

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
                    total: inv.total,
                    orderType: inv.orderType || 'N/A',
                    paymentType: inv.paymentType || 'N/A'
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
                id: d.draftId,
                draftId: d.draftId,
                tableNumber: d.tableNumber,
                text: d.text,
                customerName: d.customerName,
                customerPhone: d.customerPhone,
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

// Basic app state stored in localStorage
const DEFAULT_PRODUCTS = [
    // { id: uid(), name: "Black forest cake", price: 55, img: "https://www.alsothecrumbsplease.com/wp-content/uploads/2019/07/Black-Forest-Cake-12.jpg" },
    // { id: uid(), name: "White forest cake", price: 70, img: "https://www.alsothecrumbsplease.com/wp-content/uploads/2018/04/Hungarian-Esterhazy-Torte-2.jpg" },
    // { id: uid(), name: "Choco lava cake", price: 65, img: "https://www.alsothecrumbsplease.com/wp-content/uploads/2019/01/Mini-Chocolate-Cakes-Recipe-2.jpg" },
    // { id: uid(), name: "Motichur laddu (250 g)", price: 100, img: "https://bombaysweets.in/cdn/shop/products/kesar_laddu.png?v=1666083993&width=823" },
    // { id: uid(), name: "SPL Mixture (250 g)", price: 70, img: "https://baanali.in/cdn/shop/products/Mixture.png?v=1674836238" },
    // { id: uid(), name: "Kara Sevu (250 g)", price: 100, img: "https://sweetkadai.com/cdn/shop/files/sattur-kara-sev-2.jpg?v=1754561782" },
    { id: uid(), name: "Veg Fried Rice", price: 100, img: "https://bisarga.com/wp-content/uploads/2021/08/Vegetables-Fried-Rice.jpg" },
    { id: uid(), name: "Panner 65 (half)", price: 150, img: "https://shrisangeethasrestaurant.com/cdn/shop/files/Paneer65_ef79692a-9b14-4a4e-b03f-f12c9c9c0e4a.webp?v=1745567584" },
    { id: uid(), name: "Ghee Roti", price: 70, img: "https://media.istockphoto.com/id/1150376593/photo/bread-tandoori-indian-cuisine.jpg?s=612x612&w=0&k=20&c=GGT5LN7G4zLhJTEnP_KcyvYuayi8f1nJcvQwvmj0rCM=" },
    { id: uid(), name: "Paratha", price: 40, img: "https://i.pinimg.com/736x/3b/cb/96/3bcb9685d88bb1060d30716186d422af.jpg" },
    { id: uid(), name: "Mushroom Masala", price: 180, img: "https://www.palatesdesire.com/wp-content/uploads/2020/03/Easy_mushroom_masala@palates_desire-1024x683.jpg" },
    { id: uid(), name: "Chapathi", price: 40, img: "https://t3.ftcdn.net/jpg/04/44/43/86/360_F_444438681_2rUvqAOQZ3BwxEHlfrEneWpd26XFrt4P.jpg" },
];
let products = load('bb_products') || DEFAULT_PRODUCTS.slice();
let cart = load('bb_cart') || {};
let invoices = [];
let drafts = [];
let currentView = 'dashboard';
let _orderContext = null;
let _selectedOrderType = null;
let hourlyChartOffset = 0;
let currentChartType = 'bar';
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
        renderDashboard();
    } else {
        if (dashboardView) dashboardView.style.display = 'none';
        if (posView) posView.style.display = 'grid';
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

function getHourlySalesData(windowSize = 6, offset = 0) {
    const hourlyData = Array(24).fill(0);
    const todayInvoices = getTodayInvoices();
    for (const inv of todayInvoices) {
        if (!inv.date) continue;
        try {
            const invDate = new Date(inv.date);
            const hour = invDate.getHours();
            if (hour >= 0 && hour < 24) {
                hourlyData[hour] += inv.total || 0;
            }
        } catch (e) {
            // Ignore invoices with invalid dates
        }
    }

    const now = new Date();
    const currentHour = now.getHours();
    const startHour = currentHour - (windowSize - 1) - (offset * windowSize);

    const labels = [];
    const data = [];

    const formatHour12 = (h) => {
        const hour = (h + 24) % 24;
        const hour12 = hour % 12 === 0 ? 12 : hour % 12;
        const suffix = hour < 12 ? 'am' : 'pm';
        return `${hour12}${suffix}`;
    };

    for (let i = 0; i < windowSize; i++) {
        const hour = startHour + i;
        const nextHour = hour + 1;
        const label = `${formatHour12(hour)} to ${formatHour12(nextHour)}`;
        labels.push(label);
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
        const dayKey = d.toISOString().split('T')[0];
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

// Change chart type function
function changeChartType(type) {
    currentChartType = type;

    // Update button states
    document.querySelectorAll('.chart-type-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.querySelector(`.chart-type-btn[data-chart-type="${type}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // Re-render chart
    renderSalesChart();
}

// Main chart rendering function
function renderSalesChart() {
    const container = document.getElementById('db-sales-chart');
    if (!container) return;

    const { labels, data } = getHourlySalesData(HOURLY_CHART_WINDOW_SIZE, hourlyChartOffset);
    const totalSales = data.reduce((s, v) => s + v, 0);

    if (totalSales === 0) {
        container.innerHTML = '<div class="muted-note">No sales data available for the selected time range.</div>';
        return;
    }

    // Render based on chart type
    if (currentChartType === 'bar') {
        renderBarChart(container, labels, data);
    } else if (currentChartType === 'line') {
        renderLineChart(container, labels, data);
    } else if (currentChartType === 'pie') {
        renderPieChart(container, labels, data);
    }

    // Update navigation buttons
    const prevBtn = document.getElementById('prev-hour-btn');
    const nextBtn = document.getElementById('next-hour-btn');
    if (prevBtn && nextBtn) {
        nextBtn.disabled = hourlyChartOffset <= 0;
        const maxOffset = Math.floor(24 / HOURLY_CHART_WINDOW_SIZE) - 1;
        prevBtn.disabled = hourlyChartOffset >= maxOffset;
    }
}

// Bar chart renderer with reduced bar width
function renderBarChart(container, labels, data) {
    const maxSale = Math.max(...data, 1);
    let chartHtml = '<div style="display:flex;height:300px;align-items:flex-end;justify-content:space-around;gap:30px;border-left:1px solid #eee;border-bottom:1px solid #eee;padding-left:8px;padding-top:24px;">';

    for (let i = 0; i < labels.length; i++) {
        const value = data[i];
        const label = labels[i];
        const heightPercent = (value / maxSale) * 100;
        chartHtml += `
            <div style="flex:1;text-align:center;display:flex;flex-direction:column;justify-content:flex-end;height:100%;align-items:center;">
                <div style="font-size:12px;color:var(--text-secondary);white-space:nowrap;margin-bottom:4px;opacity:${value > 0 ? 1 : 0};">₹${Math.round(value)}</div>
                <div title="${label}: ₹${value.toFixed(2)}" style="width:40px;height:${heightPercent}%;background:var(--accent-gradient);border-radius:4px 4px 0 0;transition:height 0.5s ease-out;"></div>
                <div style="font-size:11px;color:var(--text-primary);margin-top:6px;padding-top:4px;white-space:nowrap;">${label}</div>
            </div>
        `;
    }
    chartHtml += '</div>';
    container.innerHTML = chartHtml;
}

// Line chart renderer
// Line chart renderer
function renderLineChart(container, labels, data) {
    const maxSale = Math.max(...data, 1);
    const chartHeight = 300;
    const chartWidth = container.offsetWidth || 600;
    const padding = 40;
    const plotWidth = chartWidth - padding * 2;
    const plotHeight = chartHeight - padding * 2;

    let points = [];
    for (let i = 0; i < data.length; i++) {
        const x = padding + (plotWidth / (data.length - 1)) * i;
        const y = padding + plotHeight - (data[i] / maxSale) * plotHeight;
        points.push(`${x},${y}`);
    }
    const pathData = 'M ' + points.join(' L ');

    let chartHtml = `
        <svg width="100%" height="${chartHeight}" style="display:block;">
            <!-- Grid lines -->
            ${Array.from({ length: 5 }, (_, i) => {
        const y = padding + (plotHeight / 4) * i;
        return `<line x1="${padding}" y1="${y}" x2="${chartWidth - padding}" y2="${y}" stroke="#eee" stroke-width="1"/>`;
    }).join('')}
            
            <!-- Gradients -->
            <defs>
                <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" style="stop-color:#C81E3A;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#A01528;stop-opacity:1" />
                </linearGradient>
                <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style="stop-color:#C81E3A;stop-opacity:0.5" />
                    <stop offset="100%" style="stop-color:#C81E3A;stop-opacity:0" />
                </linearGradient>
            </defs>
            
            <!-- Area under line -->
            <polygon points="${padding},${padding + plotHeight} ${pathData.substring(2)} ${chartWidth - padding},${padding + plotHeight}" fill="url(#areaGradient)" opacity="0.2"/>
            
            <!-- Line -->
            <polyline points="${pathData.substring(2)}" fill="none" stroke="url(#lineGradient)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
            
            <!-- Data points -->
            ${points.map((point, i) => {
        const [x, y] = point.split(',');
        return `
                    <circle cx="${x}" cy="${y}" r="5" fill="white" stroke="#C81E3A" stroke-width="2">
                        <title>${labels[i]}: ₹${data[i].toFixed(2)}</title>
                    </circle>
                `;
    }).join('')}
            
            <!-- Labels -->
            ${labels.map((label, i) => {
        const x = padding + (plotWidth / (data.length - 1)) * i;
        return `<text x="${x}" y="${chartHeight - 10}" text-anchor="middle" font-size="11" fill="var(--text-primary)">${label}</text>`;
    }).join('')}
        </svg>
    `;
    container.innerHTML = chartHtml;
}

// Pie chart renderer
// Pie chart renderer
function renderPieChart(container, labels, data) {
    const total = data.reduce((s, v) => s + v, 0);
    if (total === 0) {
        container.innerHTML = '<div class="muted-note">No data to display</div>';
        return;
    }

    const chartSize = 300;
    const radius = 100;
    const centerX = chartSize / 2;
    const centerY = chartSize / 2;

    const colors = [
        '#C81E3A', '#E63946', '#F77F00', '#FCBF49', '#06A77D', '#118AB2'
    ];

    let currentAngle = -90;
    let slices = [];
    let legends = [];

    for (let i = 0; i < data.length; i++) {
        const value = data[i];
        if (value === 0) continue;

        const percentage = (value / total) * 100;
        const sliceAngle = (value / total) * 360;
        const endAngle = currentAngle + sliceAngle;

        const startX = centerX + radius * Math.cos((currentAngle * Math.PI) / 180);
        const startY = centerY + radius * Math.sin((currentAngle * Math.PI) / 180);
        const endX = centerX + radius * Math.cos((endAngle * Math.PI) / 180);
        const endY = centerY + radius * Math.sin((endAngle * Math.PI) / 180);

        const largeArc = sliceAngle > 180 ? 1 : 0;
        const pathData = `M ${centerX} ${centerY} L ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY} Z`;

        slices.push(`
            <path d="${pathData}" fill="${colors[i % colors.length]}" stroke="white" stroke-width="2" opacity="0.9">
                <title>${labels[i]}: ₹${value.toFixed(2)} (${percentage.toFixed(1)}%)</title>
            </path>
        `);

        legends.push(`
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <div style="width:16px;height:16px;border-radius:3px;background:${colors[i % colors.length]};"></div>
                <div style="flex:1;font-size:13px;">${labels[i]}</div>
                <div style="font-weight:600;">₹${Math.round(value)}</div>
                <div style="font-size:12px;color:var(--text-secondary);">${percentage.toFixed(1)}%</div>
            </div>
        `);

        currentAngle = endAngle;
    }

    const chartHtml = `
        <div style="display:flex;align-items:center;justify-content:space-around;gap:24px;padding:20px;">
            <svg width="${chartSize}" height="${chartSize}" style="filter:drop-shadow(0 4px 12px rgba(0,0,0,0.1));">
                ${slices.join('')}
            </svg>
            <div style="flex:1;max-width:250px;">
                <div style="font-weight:600;margin-bottom:12px;color:var(--text-primary);">Sales Breakdown</div>
                ${legends.join('')}
            </div>
        </div>
    `;
    container.innerHTML = chartHtml;
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
}

// Login / Logout logic
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
        showView('dashboard');
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

// Invoice generation and storage
async function generateInvoice(orderType, paymentType) {
    const keys = Object.keys(cart);
    if (!keys.length) return alert('The cart is unavailable or empty.');
    const customerName = (document.getElementById('customer-name') ? document.getElementById('customer-name').value.trim() : '');
    const customerPhone = (document.getElementById('customer-phone') ? document.getElementById('customer-phone').value.trim() : '');
    const inv = {
        id: 'INV-' + Date.now() + '-' + uid(),
        date: new Date().toISOString(),
        orderType: orderType,
        paymentType: paymentType,
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
            paymentType: saved.paymentType || inv.paymentType,
            customerName: saved.customerName || inv.customerName,
            customerPhone: saved.customerPhone || inv.customerPhone,
            items: saved.items || inv.items,
            total: saved.total ?? inv.total
        };
        invoices.push(localInv);
        window.invoices = invoices;
        showInvoicePreview(localInv);
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
            <div><strong>Payment Type:</strong> ${escapeHtml(inv.paymentType || 'N/A')}</div>
            <br>
            <div><strong>Customer:</strong> ${escapeHtml(inv.customerName || 'NA')}</div>
            <div><strong>Customer Ph.no:</strong> ${escapeHtml(inv.customerPhone || 'NA')}</div>
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
                    <div style="color:var(--muted);font-size:13px">${escapeHtml(new Date(inv.date).toLocaleString())}</div>
                </div>
                <div style="text-align:right">
                    <div style="font-weight:700">₹${inv.total}</div>
                    <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:6px">
                        <button class="ghost" onclick='previewStoredInvoice("${escapeHtml(inv.id)}")'>Preview</button>
                        <button class="ghost" onclick='deleteInvoice("${encodeURIComponent(inv.id)}")'>Delete</button>
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
        ['Invoice ID', 'Date & Time', 'Order Type', 'Payment Type', 'Customer', 'Customer Ph.no', 'Product Name & Quantity', 'Total Price']
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
            inv.paymentType || 'N/A',
            inv.customerName || 'NA',
            inv.customerPhone || 'NA',
            items,
            total
        ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 20 }, { wch: 22 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 60 }, { wch: 12 }];
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
            const phone = (document.getElementById('wa-phone-input') ? (document.getElementById('wa-phone-input').value || '') : '').replace(/\D/g, '').slice(0, 10);
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
        const customerInfo = draft.customerName ? `Customer: ${escapeHtml(draft.customerName)}` : '';

        html += `
            <div class="draft-card">
                <div class="draft-header">
                    <div class="draft-meta">
                        <div class="draft-date">Saved on: ${escapeHtml(date)}</div>
                        <div class="draft-table">
                            <div class="draft-table-icon">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                                    <path d="M20 6h-2.18c.11-.31.18-.65.18-1a2.996 2.996 0 0 0-5.5-1.65l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm11 15H4v-2h16v2zm0-5H4V8h5.08L7 10.83 8.62 12 11 8.76l1-1.36 1 1.36L15.38 12 17 10.83 14.92 8H20v6z" />
                                </svg>
                            </div>
                            <div class="draft-table-text">Table No: ${escapeHtml(draft.tableNumber || 'N/A')}</div>
                        </div>
                        ${customerInfo ? `<div class="draft-customer">${customerInfo}</div>` : ''}
                    </div>
                    <div class="draft-actions">
                        <button class="ghost ripple" onclick="editDraft('${draft.id}')">
                            <svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor" style="width:14px;height:14px;">
                                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                            </svg>
                            Edit
                        </button>
                        <button class="ghost ripple" onclick="deleteDraft('${draft.id}')">
                            <svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor" style="width:14px;height:14px;">
                                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                            </svg>
                            Delete
                        </button>
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
    _typeInvoiceState.editingDraftId = id;
    window.restoreDraft(id);
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

        window.drafts = (window.drafts || []).filter(d => d.id !== id);
        renderDrafts();

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
    const WELCOME = "Please use the buttons below to learn more about your today's & yesterday's revenue. Thank you.";
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
                endResult = `Date and time of purchase: ${dateStr} Customer: ${customerName} Products: ${item} Total: ₹${grandTotal}`;
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

        const actions = [
            //     {
            //     label: 'Today\'s invoice count',
            //     handler: () => {
            //         pushMessage('user', 'The total number of invoices generated today.');
            //         const list = getTodayInvoices();
            //         respondBot(`Today's invoice count: ${list.length}`);
            //     }
            // }, {
            //     label: 'Today\'s invoice numbers',
            //     handler: () => {
            //         pushMessage('user', 'Invoice information.');
            //         const list = getTodayInvoices();
            //         const ids = list.map(inv => inv.id).join(', ') || '—';
            //         respondBot(`Invoice information: ${ids}`);
            //     }
            // }, 
            {
                label: 'Today\'s revenue',
                handler: () => {
                    pushMessage('user', "Today's revenue.");
                    const list = getTodayInvoices();
                    const total = list.reduce((s, inv) => s + (Number(inv.total) || 0), 0);
                    respondBot(`Today's revenue (total): ₹${total}`);
                }
            }, {
                label: 'Yesterday\'s revenue',
                handler: () => {
                    pushMessage('user', "Yesterday's revenue.");
                    const list = getYesterdayInvoices();
                    const total = list.reduce((s, inv) => s + (Number(inv.total) || 0), 0);
                    respondBot(`Yesterday's revenue (total): ₹${total}`);
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

    const res = document.getElementById('type-validate-result'); if (res) res.innerHTML = '';
    const actionsArea = document.getElementById('type-actions-area'); if (actionsArea) actionsArea.style.display = 'none';
    modal.style.display = 'flex';
}

// function renderTableNumberGrid() {
//     const container = document.getElementById('table-number-grid');
//     if (!container) return;
//     container.innerHTML = '';
//     const editingDraftId = _typeInvoiceState?.editingDraftId;

//     for (let i = 1; i <= 12; i++) {
//         const tableNum = String(i);
//         const btn = document.createElement('button');
//         btn.type = 'button';
//         btn.className = 'table-box';
//         btn.textContent = tableNum;

//         const isOccupied = (window.drafts || []).some(
//             d => d.tableNumber === tableNum && d.id !== editingDraftId
//         );

//         if (isOccupied) {
//             btn.classList.add('occupied');
//             btn.disabled = true;
//             btn.title = 'This table has an open draft';
//         } else {
//             btn.onclick = () => selectTable(tableNum);
//         }
//         container.appendChild(btn);
//     }
// }

function renderTableNumberGrid() {
    const container = document.getElementById('table-number-grid');
    if (!container) return;
    container.innerHTML = '';
    const editingDraftId = _typeInvoiceState?.editingDraftId;

    for (let i = 1; i <= 15; i++) {  // Changed from 12 to 15
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
            btn.onclick = () => selectTable(tableNumber);
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

async function finalizeTypeInvoice(orderType, paymentType) {
    const valid = (_typeInvoiceState && Array.isArray(_typeInvoiceState.validItems)) ? _typeInvoiceState.validItems.slice() : [];
    if (!valid.length) return alert('No valid products to generate invoice.');

    const tableNumber = null; // or remove this variable entirely
    const customerName = (document.getElementById('type-customer-name')?.value.trim()) || '';
    const customerPhone = (document.getElementById('type-customer-phone')?.value.trim()) || '';

    const invLocal = {
        invoiceId: 'INV-' + Date.now() + '-' + uid(),
        date: new Date().toISOString(),
        orderType: orderType,
        paymentType: paymentType,
        tableNumber: tableNumber,
        customerName,
        customerPhone,
        items: valid.map(it => ({ name: it.name, price: it.price, qty: it.qty })),
        total: valid.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 0), 0)
    };

    try {
        const res = await fetch('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(invLocal) });
        const data = await res.json().catch(() => ({}));
        const saved = (res.ok && data?.invoice) ? data.invoice : invLocal;

        const localInv = {
            id: saved.invoiceId || saved.id,
            invoiceId: saved.invoiceId || saved.id,
            date: saved.date || invLocal.date,
            orderType: saved.orderType || invLocal.orderType,
            paymentType: saved.paymentType || invLocal.paymentType,
            customerName: saved.customerName || invLocal.customerName,
            customerPhone: saved.customerPhone || invLocal.customerPhone,
            items: saved.items || invLocal.items,
            total: saved.total ?? invLocal.total
        };
        invoices.unshift(localInv);
        window.invoices = invoices;
        showInvoicePreview(localInv);
    } catch (err) {
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
        const res = await fetch('/api/ai/correct-name', {
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

    // Update the UI rendering part in _validateTypeInvoiceLines
    if (showUi) {
        const res = document.getElementById('type-validate-result');
        if (res) {
            let html = `<div class="validation-result">`;
            for (const p of parsed) {
                const statusClass = p.valid ? 'valid' : 'invalid';
                const statusBadge = p.valid ?
                    '<span class="status-badge available">Available</span>' :
                    '<span class="status-badge unavailable">Not Available</span>';

                html += `
                <div class="validation-item ${statusClass}">
                    <div style="color:var(--text-primary);font-weight:500;">
                        ${escapeHtml(p.valid ? `${p.name} × ${p.qty}` : p.line)}
                    </div>
                    ${statusBadge}
                </div>
            `;
            }
            html += `</div>`;
            html += `<div style="margin-top:12px;color:var(--text-secondary);font-size:13px;text-align:center;">
            Valid items: <strong style="color:var(--accent);">${validItems.length}</strong> of ${parsed.length}
        </div>`;
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
        const customerName = document.getElementById('type-customer-name')?.value?.trim() || '';
        const customerPhone = document.getElementById('type-customer-phone')?.value?.trim() || '';
        const lines = text.split('\n').filter(l => l.trim() !== '').length;

        if (!tableNumber) {
            return alert('A Table Number must be selected to save a draft.');
        }
        if (!text && !customerName && !customerPhone) {
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
            id: editingId,
            text,
            tableNumber,
            customerName,
            customerPhone,
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

    const sn = document.getElementById('type-customer-name');
    if (sn) sn.value = draft.customerName;
    const sp = document.getElementById('type-customer-phone');
    if (sp) sp.value = draft.customerPhone;
    const linesEl = document.getElementById('type-lines-count');
    if (linesEl) linesEl.textContent = String(draft.lines || (draft.text || '').split('\n').filter(Boolean).length);
}

function openOrderTypeModal(context) {
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
    const modal = document.getElementById('order-type-modal');
    if (modal) modal.style.display = 'none';
}

function openPaymentTypeModal() {
    const modal = document.getElementById('payment-type-modal');
    if (modal) modal.style.display = 'flex';
}

function closePaymentTypeModal() {
    _orderContext = null;
    _selectedOrderType = null;
    const modal = document.getElementById('payment-type-modal');
    if (modal) modal.style.display = 'none';
}

function confirmOrderType(orderType) {
    if (!_orderContext) return;
    _selectedOrderType = orderType;
    closeOrderTypeModal();
    openPaymentTypeModal();
}

function confirmPaymentType(paymentType) {
    if (!_orderContext || !_selectedOrderType) return;

    if (_orderContext === 'cart') {
        generateInvoice(_selectedOrderType, paymentType);
    } else if (_orderContext === 'typed') {
        finalizeTypeInvoice(_selectedOrderType, paymentType);
    }

    closePaymentTypeModal();
}

function shiftHourlySales(direction) {
    const maxOffset = Math.floor(24 / HOURLY_CHART_WINDOW_SIZE) - 1;
    hourlyChartOffset += direction;
    hourlyChartOffset = Math.max(0, Math.min(hourlyChartOffset, maxOffset));
    renderSalesChart();
}

// Table Selection Modal Functions
function openTableSelectionModal() {
    const modal = document.getElementById('table-selection-modal');
    if (!modal) return;
    renderEnhancedTableSelectionGrid();
    modal.style.display = 'flex';
}

function renderEnhancedTableSelectionGrid() {
    const container = document.getElementById('table-selection-grid');
    if (!container) return;
    container.innerHTML = '';

    for (let i = 1; i <= 15; i++) {
        const tableNum = String(i);

        // Check if table has a draft
        const hasDraft = (window.drafts || []).some(d => d.tableNumber === tableNum);
        const status = hasDraft ? 'occupied' : 'available';

        const tableBox = document.createElement('div');
        tableBox.className = `table-box ${status}`;

        if (status === 'occupied') {
            tableBox.style.cursor = 'not-allowed';
        }

        tableBox.innerHTML = `
            <div class="table-status-badge ${status}"></div>
            <div class="table-number">Table ${tableNum}</div>
        `;

        if (status !== 'occupied') {
            tableBox.onclick = () => selectTableAndOpenOrder(tableNum);
        }

        container.appendChild(tableBox);
    }
}

function closeTableSelectionModal() {
    const modal = document.getElementById('table-selection-modal');
    if (modal) modal.style.display = 'none';
}

function renderTableSelectionGrid() {
    const container = document.getElementById('table-selection-grid');
    if (!container) return;
    container.innerHTML = '';

    for (let i = 1; i <= 15; i++) {
        const tableNum = String(i);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'table-box';
        btn.textContent = 'Table ' + tableNum;
        btn.style.padding = '20px 12px';
        btn.style.fontSize = '15px';

        const isOccupied = (window.drafts || []).some(d => d.tableNumber === tableNum);

        if (isOccupied) {
            btn.classList.add('occupied');
            btn.disabled = true;
            btn.title = 'This table has an open draft';
        } else {
            btn.onclick = () => selectTableAndOpenOrder(tableNum);
        }
        container.appendChild(btn);
    }
}

function selectTableAndOpenOrder(tableNumber) {
    closeTableSelectionModal();
    openTypeInvoiceModal();
    // Pre-select the table
    setTimeout(() => {
        selectTable(tableNumber);
    }, 100);
}

// Table Swap Modal Functions
function openTableSwapModal() {
    const modal = document.getElementById('table-selection-modal');
    if (!modal) return;
    renderEnhancedTableSelectionGrid();
    modal.style.display = 'flex';

    // Update header text
    const modalTitle = modal.querySelector('h3');
    if (modalTitle) {
        modalTitle.textContent = 'Swap Table';
    }
    const modalSubtitle = modal.querySelector('p');
    if (modalSubtitle) {
        modalSubtitle.textContent = 'Choose a new table for this order';
    }
}

// Update selectTableAndOpenOrder to handle both new orders and swaps
function selectTableAndOpenOrder(tableNumber) {
    const typeInvoiceModal = document.getElementById('type-invoice-modal');
    const isTypeInvoiceModalOpen = typeInvoiceModal && typeInvoiceModal.style.display === 'flex';

    closeTableSelectionModal();

    if (isTypeInvoiceModalOpen) {
        // This is a table swap
        selectTable(tableNumber);
        updateSelectedTableBanner();
    } else {
        // This is a new order
        openTypeInvoiceModal();
        setTimeout(() => {
            selectTable(tableNumber);
            updateSelectedTableBanner();
        }, 100);
    }
}

// Update selected table banner
function updateSelectedTableBanner() {
    const banner = document.getElementById('selected-table-banner');
    const tableNumberEl = document.getElementById('selected-table-number');

    if (_typeInvoiceState?.selectedTable) {
        if (banner) banner.style.display = 'flex';
        if (tableNumberEl) tableNumberEl.textContent = `Table ${_typeInvoiceState.selectedTable}`;
    } else {
        if (banner) banner.style.display = 'none';
    }
}

// Update selectTable function to call updateSelectedTableBanner
const originalSelectTable = window.selectTable;
window.selectTable = function (tableNumber) {
    originalSelectTable(tableNumber);
    updateSelectedTableBanner();
};

// Update openTypeInvoiceModal to show/hide banner
const originalOpenTypeInvoiceModal = window.openTypeInvoiceModal;
window.openTypeInvoiceModal = function () {
    originalOpenTypeInvoiceModal();
    updateSelectedTableBanner();
};

// Export functions
Object.assign(window, {
    openTableSwapModal,
    updateSelectedTableBanner
});

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
    openOrderTypeModal, closeOrderTypeModal, confirmOrderType, shiftHourlySales, openPaymentTypeModal,
    closePaymentTypeModal, confirmPaymentType, changeChartType, renderBarChart, renderLineChart,
    renderPieChart, openTableSelectionModal, closeTableSelectionModal, selectTableAndOpenOrder,
});

// On load
(async function init() {
    await loadInvoicesFromServer();
    await loadDraftsFromServer();
    if (sessionStorage.getItem('bb_logged_in') !== 'true') {
        showLoginModal();
        showView('pos');
    } else {
        const up = document.getElementById('up-arrow');
        if (up) up.style.display = 'flex';
        showView('dashboard');
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

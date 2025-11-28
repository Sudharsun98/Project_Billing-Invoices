// require('dotenv').config(); // optional, helpful in development if you use a .env file
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const bcrypt = require('bcrypt');

const app = express();

// Config
// const PORT = process.env.PORT || 3000;
const PORT = 3000;
// IMPORTANT: set MONGODB_URI in your environment. Example:
// export MONGODB_URI="mongodb+srv://<user>:<pass>@cluster.example.net/invoices?retryWrites=true&w=majority"
// const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/invoices';
const MONGODB_URI = 'mongodb+srv://Sudharsun_Jagatheesan:SudharJaga98@cluster0.fxjrxmq.mongodb.net/invoices?retryWrites=true&w=majority';

if (!MONGODB_URI) {
    console.error('Please set MONGODB_URI in your environment.');
    process.exit(1);
}

// Middleware
app.use(cors()); // allow all origins for now — restrict in production
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// optional request logger
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} -> ${req.method} ${req.originalUrl}`);
    next();
});

// Mongoose config & models
mongoose.set('debug', false);

const ItemSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    qty: { type: Number, required: true }
}, { _id: false });

const InvoiceSchema = new mongoose.Schema({
    invoiceId: { type: String, required: true, unique: true }, // e.g. INV-...
    orderType: { type: String, trim: true, default: 'N/A' },
    date: { type: Date, default: Date.now },
    supervisorName: { type: String, default: '' },
    supervisorPhone: { type: String, default: '' },
    items: { type: [ItemSchema], required: true },
    total: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now }
});

// NOTE: do not declare a duplicate index here — unique: true on the field above creates the index.
// InvoiceSchema.index({ invoiceId: 1 }, { unique: true });

const Invoice = mongoose.model('Invoice', InvoiceSchema);

// New: Draft Schema
const DraftSchema = new mongoose.Schema({
    draftId: { type: String, required: true, unique: true },
    tableNumber: { type: String, required: true, unique: true },
    text: { type: String, default: '' },
    supervisorName: { type: String, default: '' },
    supervisorPhone: { type: String, default: '' },
    lines: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});
const Draft = mongoose.model('Draft', DraftSchema);

// New: User Schema for DB-based login
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

// Hash password before saving the user model
UserSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        return next();
    }
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (err) {
        next(err);
    }
});

// Method to compare password for login
UserSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', UserSchema);

// Utility
function generateInvoiceId() {
    return 'INV-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

function generateDraftId() {
    return 'DRAFT-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

// Routes

// Health
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Create invoice
app.post('/api/invoices', async (req, res) => {
    try {
        const payload = req.body;
        console.log('POST /api/invoices payload:', JSON.stringify(payload));

        if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) {
            return res.status(400).json({ error: 'Invoice must contain items' });
        }

        const items = payload.items.map((i, idx) => {
            const price = Number(i.price);
            const qty = Number(i.qty);
            if (!i.name || typeof i.name !== 'string') {
                throw { status: 400, message: `Item[${idx}].name is required` };
            }
            if (!Number.isFinite(price) || price < 0) {
                throw { status: 400, message: `Item[${idx}].price is invalid` };
            }
            if (!Number.isFinite(qty) || qty <= 0) {
                throw { status: 400, message: `Item[${idx}].qty is invalid` };
            }
            return { name: i.name, price, qty };
        });

        const computedTotal = items.reduce((s, it) => s + it.price * it.qty, 0);
        let total = (payload.total !== undefined && payload.total !== null) ? Number(payload.total) : computedTotal;
        if (!Number.isFinite(total) || total < 0) {
            return res.status(400).json({ error: 'Invalid total' });
        }
        if (Math.abs(total - computedTotal) > 0.01) {
            console.warn(`Client total (${total}) differs from computed total (${computedTotal}). Using computed total.`);
            total = computedTotal;
        }

        const invoiceId = payload.id || payload.invoiceId || generateInvoiceId();

        // prevent duplicates
        const existing = await Invoice.findOne({ invoiceId }).lean();
        if (existing) {
            return res.status(409).json({ error: 'Invoice ID already exists', invoiceId });
        }

        const doc = new Invoice({
            invoiceId,
            orderType: payload.orderType,
            date: payload.date ? new Date(payload.date) : new Date(),
            supervisorName: payload.supervisorName || 'NA',
            supervisorPhone: payload.supervisorPhone || 'NA',
            items,
            total
        });

        await doc.save();

        console.log('Invoice saved:', doc.invoiceId);
        // Return saved invoice (lean representation)
        const ret = {
            invoiceId: doc.invoiceId,
            orderType: doc.orderType,
            date: doc.date,
            supervisorName: doc.supervisorName,
            supervisorPhone: doc.supervisorPhone,
            items: doc.items,
            total: doc.total,
            createdAt: doc.createdAt
        };
        return res.status(201).json({ success: true, invoice: ret });
    } catch (err) {
        if (err && err.status) {
            return res.status(err.status).json({ error: err.message });
        }
        if (err && err.code === 11000) {
            console.error('Duplicate invoiceId error:', err.keyValue);
            return res.status(409).json({ error: 'Invoice ID already exists', keyValue: err.keyValue });
        }
        console.error('POST /api/invoices error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
});

// List invoices (pagination)
app.get('/api/invoices', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 100, 1000);
        const skip = parseInt(req.query.skip, 10) || 0;
        const invoices = await Invoice.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
        return res.json({ success: true, invoices });
    } catch (err) {
        console.error('GET /api/invoices', err);
        return res.status(500).json({ error: 'Server error' });
    }
});

// Get single invoice by id
app.get('/api/invoices/:invoiceId', async (req, res) => {
    try {
        const invoice = await Invoice.findOne({ invoiceId: req.params.invoiceId }).lean();
        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
        return res.json({ success: true, invoice });
    } catch (err) {
        console.error('GET /api/invoices/:invoiceId', err);
        return res.status(500).json({ error: 'Server error' });
    }
});

// Delete invoice
app.delete('/api/invoices/:invoiceId', async (req, res) => {
    try {
        const result = await Invoice.deleteOne({ invoiceId: req.params.invoiceId });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'Invoice not found' });
        return res.json({ success: true });
    } catch (err) {
        console.error('DELETE /api/invoices/:invoiceId', err);
        return res.status(500).json({ error: 'Server error' });
    }
});

// List all drafts
app.get('/api/drafts', async (req, res) => {
    try {
        const drafts = await Draft.find().sort({ createdAt: -1 }).lean();
        res.json({ success: true, drafts });
    } catch (err) {
        console.error('GET /api/drafts error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Create or Update a draft
app.post('/api/drafts', async (req, res) => {
    try {
        const payload = req.body;
        if (!payload || !payload.tableNumber) {
            return res.status(400).json({ error: 'Table number is required' });
        }

        if (payload.id) { // This is an update of an existing draft
            const doc = await Draft.findOne({ draftId: payload.id });
            if (!doc) {
                return res.status(404).json({ error: 'Draft not found for update' });
            }

            // Check if another draft (not this one) already has the new table number
            const existingWithTableNum = await Draft.findOne({ tableNumber: payload.tableNumber, draftId: { $ne: payload.id } });
            if (existingWithTableNum) {
                return res.status(409).json({ error: `Table Number "${payload.tableNumber}" is already in use by another active order.` });
            }

            doc.text = payload.text;
            doc.tableNumber = payload.tableNumber;
            doc.supervisorName = payload.supervisorName;
            doc.supervisorPhone = payload.supervisorPhone;
            doc.lines = payload.lines;
            doc.updatedAt = new Date();
            await doc.save();
            return res.json({ success: true, draft: doc.toObject() });

        } else { // This is a new draft creation
            const draftId = generateDraftId();
            const doc = new Draft({
                draftId,
                text: payload.text || '',
                tableNumber: payload.tableNumber,
                supervisorName: payload.supervisorName || '',
                supervisorPhone: payload.supervisorPhone || '',
                lines: payload.lines || 0,
            });
            await doc.save();
            return res.status(201).json({ success: true, draft: doc.toObject() });
        }
    } catch (err) {
        if (err && err.code === 11000) { // E11000 duplicate key error (on tableNumber)
            return res.status(409).json({ error: `Table Number "${req.body.tableNumber}" is already in use by another active order.` });
        }
        console.error('POST /api/drafts error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
});

// Delete a draft
app.delete('/api/drafts/:draftId', async (req, res) => {
    try {
        const { draftId } = req.params;
        // The client might send a URL-encoded ID, so decode it.
        const decodedDraftId = decodeURIComponent(draftId);
        const result = await Draft.deleteOne({ draftId: decodedDraftId });

        if (result.deletedCount === 0) {
            // It might be that the ID was not encoded, try as is.
            const rawResult = await Draft.deleteOne({ draftId: draftId });
            if (rawResult.deletedCount === 0) {
                return res.status(404).json({ error: 'Draft not found' });
            }
        }
        return res.json({ success: true });
    } catch (err) {
        console.error(`DELETE /api/drafts/${req.params.draftId} error:`, err);
        return res.status(500).json({ error: 'Server error' });
    }
});

// -----------------------------
// New: Database-backed login
// -----------------------------
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body || {};
        if (!username || !password) {
            return res.status(400).json({ error: 'username and password are required' });
        }

        // Find user by username (case-insensitive)
        const user = await User.findOne({ username: username.toLowerCase().trim() });
        if (!user) {
            // Use a generic error message to prevent username enumeration
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Compare provided password with the stored hashed password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // For a real app you should create a session / JWT here.
        // For now we return success so frontend can mark sessionStorage.
        return res.json({ success: true, user: user.username });

    } catch (err) {
        console.error('POST /api/login error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
});

// Serve static frontend
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));
app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Server error' });
});

// Add this with your other routes (e.g., after the /api/login route)

// ---- START: AI correction endpoint ----
app.post('/api/ai/correct', async (req, res) => {
    try {
        const name = (req.body && (req.body.name ?? req.body.text)) || '';
        if (!name || typeof name !== 'string' || !name.trim()) {
            return res.status(400).json({ error: 'name is required' });
        }

        // const API_KEY = "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";
        if (!API_KEY) {
            return res.status(500).json({ error: 'GROQ_API_KEY not configured on server' });
        }

        // dynamic import so it works from CommonJS modules
        let groqModule;
        try {
            groqModule = await import('groq-sdk');
        } catch (e) {
            console.error('Failed to import groq-sdk', e);
            return res.status(500).json({ error: 'Groq SDK import failed' });
        }

        // SDK shape variations handled defensively
        const Groq = groqModule.Groq || groqModule.default?.Groq || groqModule.default || groqModule;
        if (!Groq) return res.status(500).json({ error: 'Could not initialize Groq SDK' });

        const client = new Groq({ apiKey: API_KEY });

        // Prompt
        const Default_Products = [
            "Veg Fried Rice",
            "Panner 65 (half)",
            "Ghee Roti",
            "Paratha",
            "Mushroom Masala",
            "Chapathi",
        ];
        const prompt = `Find all items in Default_Products that contain the string held in name (case-insensitive, allow partial matches). Return only a JSON array of the matched product names (e.g. ["Chapathi"]). If there are no matches, return an empty JSON array ([]). Do not include any explanation, code, or extra text—only the JSON array.`;

        const payload = {
            messages: [{ role: 'user', content: prompt }],
            model: "openai/gpt-oss-20b",
            temperature: 0.2,
            max_completion_tokens: 128,
            stream: false
        };

        let response;
        try {
            response = await client.chat.completions.create(payload);
        } catch (e) {
            console.error('Groq API call failed', e);
            return res.status(502).json({ error: 'AI provider call failed' });
        }

        // Extract text from common response shapes
        let corrected = '';
        try {
            corrected = response?.choices?.[0]?.message?.content
                || response?.choices?.[0]?.text
                || response?.choices?.[0]?.delta?.content
                || (typeof response === 'string' ? response : null)
                || JSON.stringify(response);
        } catch (e) {
            corrected = String(response || '');
        }

        if (typeof corrected === 'string') {
            // take first non-empty line and trim it
            corrected = corrected.split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0] || corrected.trim();
            // if still empty, fallback to original
            if (!corrected) corrected = name;
        } else {
            corrected = name;
        }

        return res.json({ success: true, corrected });
    } catch (err) {
        console.error('/api/ai/correct error:', err && err.stack ? err.stack : err);
        return res.status(500).json({ error: 'Server error' });
    }
});
// ---- END: AI correction endpoint ----

// Connect to Mongo then start server
async function start() {
    try {
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('Connected to MongoDB');

        // --- New: Create a default admin user if one doesn't exist ---
        const adminUsername = 'admin';
        const defaultAdminPassword = 'admin'; // For development only
        const existingAdmin = await User.findOne({ username: adminUsername });

        if (!existingAdmin) {
            console.log(`No admin user found. Creating default admin with username: '${adminUsername}' and password: '${defaultAdminPassword}'`);
            const adminUser = new User({
                username: adminUsername,
                password: defaultAdminPassword // The pre-save hook will hash this password
            });
            await adminUser.save();
            console.log('Default admin user created successfully.');
        }
        // --- End new section ---

        app.listen(PORT, () => {
            console.log(`Server listening on http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error('Startup error:', err);
        process.exit(1);
    }
}

start();

module.exports = app;
require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const compression = require('compression');
const { Server } = require('socket.io');

const User = require('./models/User');
const Order = require('./models/Order');
const Inventory = require('./models/Inventory');
const Product = require('./models/Product');
const auth = require('./middleware/auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Socket.IO Connection Handler
io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);
    socket.on('disconnect', () => {
        console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
});

console.log('>>> STITCH-OPT SERVER INITIALIZING <<<');

// Enable Gzip/Brotli compression for all responses
app.use(compression());

// --- Production Security Middleware ---

// Helmet: Sets secure HTTP headers (XSS protection, clickjack prevention, MIME sniff guard)
app.use(helmet({
    contentSecurityPolicy: false, // Disabled to allow inline scripts in PWA
    crossOriginEmbedderPolicy: false // Allow loading cross-origin images (product photos)
}));

// NoSQL Injection Prevention: Strips $ and . from request payloads
app.use(mongoSanitize());

// Global Rate Limiter: Max 300 requests per 15 minutes per IP
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests from this IP, please try again after 15 minutes.' }
});
app.use('/api/', globalLimiter);

// Strict Auth Rate Limiter: Max 20 login/register attempts per 15 minutes
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many authentication attempts. Please try again after 15 minutes.' }
});
app.use('/api/auth/', authLimiter);

// Core Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));

// Force no-cache for all requests to ensure PWA updates
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Emergency PWA Reset route
app.get('/reset-pwa', (req, res) => {
    res.send(`
        <script>
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(registrations => {
                    for(let registration of registrations) { registration.unregister(); }
                    caches.keys().then(names => { for (let name of names) caches.delete(name); });
                    alert('PWA Reset Complete. Redirecting to home...');
                    window.location.href = '/';
                });
            } else {
                window.location.href = '/';
            }
        </script>
    `);
});

// Default route: Serve index.html from public
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

console.log('>>> MIDDLEWARE INITIALIZED <<<');

app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    next();
});

// MongoDB Connection
const fs = require('fs');
function logErr(msg) { fs.appendFileSync('server_log.txt', new Date().toISOString() + ' ' + msg + '\n'); }

mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        const msg = 'Connected to Database: ' + process.env.MONGODB_URI;
        console.log(msg);
        logErr(msg);
    })
    .catch(err => {
        console.error('CRITICAL: Could not connect to MongoDB...', err);
        logErr('CRITICAL: Could not connect to MongoDB... ' + err.message);
    });

// --- Auth Routes ---

app.post('/api/auth/register', async (req, res) => {
    try {
        logErr('Register attempt: ' + JSON.stringify(req.body));
        const { username, email, password, role } = req.body;
        let user = await User.findOne({ $or: [{ email }, { username }] });
        if (user) {
            logErr('User already exists: ' + email);
            return res.status(400).json({ message: 'User already exists' });
        }

        user = new User({ username, email, password, role: 'customer' });
        await user.save();
        logErr('User registered successfully');

        const token = jwt.sign({ id: user._id, role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.json({ token, user: { id: user._id, username, role: 'customer' } });
    } catch (err) {
        logErr('Register Server error: ' + err.message);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ $or: [{ email: email }, { username: email }] });
        if (!user) return res.status(400).json({ message: 'Invalid credentials' });

        const isMatch = await user.comparePassword(password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.json({ token, user: { id: user._id, username: user.username, role: user.role } });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.put('/api/auth/profile', auth(), async (req, res) => {
    try {
        const { username, email } = req.body;
        console.log(`Updating profile for user ${req.user.id}:`, { username, email });
        const userId = req.user.id;

        // Check if username/email already taken by someone ELSE
        const existingUser = await User.findOne({ 
            $or: [{ username }, { email }],
            _id: { $ne: userId }
        });

        if (existingUser) {
            return res.status(400).json({ message: 'Username or Email already in use' });
        }

        const user = await User.findByIdAndUpdate(
            userId,
            { username, email },
            { new: true }
        ).select('-password');

        // Re-sign token if needed, or just return updated user
        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.json({ token, user: { id: user._id, username: user.username, role: user.role, email: user.email } });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// --- Production API Routes ---

app.get('/api/orders', auth(), async (req, res) => {
    try {
        // Optimization: Customers only see their own orders. Admins/Employees see all.
        const query = (req.user.role === 'customer') ? { userId: req.user.id } : {};
        const orders = await Order.find(query).sort({ date: -1 }).limit(100);
        res.json(orders);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/orders', auth(['customer', 'admin']), async (req, res) => {
    try {
        const newOrder = new Order({ ...req.body, userId: req.user.id });
        await newOrder.save();
        io.emit('dataChanged', { type: 'orders' });
        res.json(newOrder);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.put('/api/orders/:id', auth(['admin', 'employee']), async (req, res) => {
    try {
        const updateData = {};
        if (req.body.client !== undefined) updateData.client = req.body.client;
        if (req.body.design !== undefined) updateData.design = req.body.design;
        if (req.body.status !== undefined) updateData.status = req.body.status;
        if (req.body.progress !== undefined) updateData.progress = req.body.progress;

        const order = await Order.findByIdAndUpdate(
            req.params.id,
            { $set: updateData },
            { new: true }
        );
        if (!order) return res.status(404).json({ message: 'Order not found' });
        io.emit('dataChanged', { type: 'orders' });
        res.json(order);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.delete('/api/orders/:id', auth(['admin', 'employee']), async (req, res) => {
    try {
        const order = await Order.findByIdAndDelete(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });
        io.emit('dataChanged', { type: 'orders' });
        res.json({ message: 'Order cancelled successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});


app.get('/api/inventory', auth(), async (req, res) => {
    try {
        const inventory = await Inventory.find();
        res.json(inventory);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.patch('/api/inventory/:item', auth(['admin', 'employee']), async (req, res) => {
    try {
        const { count } = req.body;
        const inventory = await Inventory.findOneAndUpdate(
            { item: req.params.item },
            { count, lastUpdated: Date.now() },
            { new: true, upsert: true }
        );
        io.emit('dataChanged', { type: 'inventory' });
        res.json(inventory);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// --- Admin User Management ---

app.get('/api/admin/users', auth(['admin']), async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/admin/users', auth(['admin']), async (req, res) => {
    try {
        const { username, email, password, role } = req.body;
        let user = await User.findOne({ $or: [{ email }, { username }] });
        if (user) return res.status(400).json({ message: 'User already exists' });

        user = new User({ username, email, password, role });
        await user.save();

        res.json({ message: 'User created successfully', user: { id: user._id, username, role } });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.put('/api/admin/users/:id', auth(['admin']), async (req, res) => {
    try {
        const { username, email, role, password } = req.body;
        
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (username) user.username = username;
        if (email) user.email = email;
        if (role) user.role = role;
        
        // If password is provided, trigger pre-save hook to hash it securely
        if (password && password.trim() !== '') {
            user.password = password;
        }

        await user.save();
        
        // Strip password before returning
        const safeUser = user.toObject();
        delete safeUser.password;
        
        res.json(safeUser);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.delete('/api/admin/users/:id', auth(['admin']), async (req, res) => {
    try {
        // Prevent deleting self (optional but safer)
        if (req.params.id === req.user.id) {
            return res.status(400).json({ message: 'Cannot delete your own account' });
        }

        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});


// --- Favorites Management ---

app.get('/api/favorites', auth(), async (req, res) => {
    try {
        // Optimization: Lean projection to only fetch favorites field
        const user = await User.findById(req.user.id)
            .select('favorites')
            .populate('favorites');
        res.json(user.favorites || []);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/favorites/:id', auth(), async (req, res) => {
    try {
        // Optimization: Atomic $addToSet prevents duplicates and is much faster
        await User.findByIdAndUpdate(req.user.id, {
            $addToSet: { favorites: req.params.id }
        });
        res.json({ message: 'Added to favorites' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.delete('/api/favorites/:id', auth(), async (req, res) => {
    try {
        // Optimization: Atomic $pull is much faster than filter + save
        await User.findByIdAndUpdate(req.user.id, {
            $pull: { favorites: req.params.id }
        });
        res.json({ message: 'Removed from favorites' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// --- Performance: Batch Dashboard State ---
app.get('/api/dashboard-state', auth(), async (req, res) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;

        // Run all queries in parallel for maximum speed
        const [orders, inventory, products, userWithFavorites, totalUsers, totalRevenue, adminUsers] = await Promise.all([
            Order.find(role === 'customer' ? { userId } : {}).sort({ date: -1 }).limit(50),
            Inventory.find(),
            Product.find().sort({ createdAt: -1 }).limit(100),
            User.findById(userId).select('favorites').populate('favorites'),
            // Analytics (Admin/Employee only)
            (role !== 'customer') ? User.countDocuments() : Promise.resolve(0),
            (role !== 'customer') ? Order.aggregate([{ $group: { _id: null, total: { $sum: { $convert: { input: "$price", to: "double", onError: 0, onNull: 0 } } } } }]) : Promise.resolve([{ total: 0 }]),
            (role === 'admin') ? User.find().select('-password').sort({ createdAt: -1 }) : Promise.resolve([])
        ]);

        const analytics = (role !== 'customer') ? {
            userCount: totalUsers,
            revenue: totalRevenue[0]?.total || 0,
            activeOrders: orders.filter(o => o.status !== 'Completed' && o.status !== 'Order Canceled').length,
            lowStock: inventory.filter(i => i.count < 10).length
        } : null;

        res.json({
            orders,
            inventory,
            products,
            favorites: userWithFavorites ? userWithFavorites.favorites : [],
            analytics,
            users: adminUsers
        });
    } catch (err) {
        console.error('Dashboard state error:', err);
        res.status(500).json({ message: 'Server error fetching batch state' });
    }
});

// --- Batch Operations (Admin/Employee) ---
app.post('/api/orders/batch-status', auth(['admin', 'employee']), async (req, res) => {
    try {
        const { orderIds, status } = req.body;
        if (!Array.isArray(orderIds) || !status) {
            return res.status(400).json({ message: 'Invalid batch data' });
        }

        await Order.updateMany(
            { _id: { $in: orderIds } },
            { $set: { status, progress: status === 'Completed' ? 100 : undefined } }
        );

        io.emit('dataChanged', { type: 'orders' });
        res.json({ message: `Successfully updated ${orderIds.length} orders` });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// --- Product Management ---

app.get('/api/products', auth(), async (req, res) => {
    try {
        const products = await Product.find().sort({ createdAt: -1 });
        res.json(products);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/products', auth(['admin', 'employee']), async (req, res) => {
    try {
        const { name, price, tag, description, imageUrl } = req.body;
        const newProduct = new Product({ name, price, tag, description, imageUrl });
        await newProduct.save();
        io.emit('dataChanged', { type: 'products' });
        res.json(newProduct);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.put('/api/products/:id', auth(['admin', 'employee']), async (req, res) => {
    try {
        const { name, price, tag, description, imageUrl } = req.body;
        const product = await Product.findByIdAndUpdate(
            req.params.id,
            { name, price, tag, description, imageUrl },
            { new: true }
        );
        if (!product) return res.status(404).json({ message: 'Product not found' });
        io.emit('dataChanged', { type: 'products' });
        res.json(product);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.delete('/api/products/:id', auth(['admin', 'employee']), async (req, res) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);
        if (!product) return res.status(404).json({ message: 'Product not found' });
        io.emit('dataChanged', { type: 'products' });
        res.json({ message: 'Product removed' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[OK] Server listening on port ${PORT}`);
    console.log(`[OK] Socket.IO real-time engine active`);
    console.log(`[OK] Routes ready: /api/auth/profile (PUT), /api/products (GET), etc.`);
});

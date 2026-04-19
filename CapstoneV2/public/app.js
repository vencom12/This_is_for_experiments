const API_URL = window.location.origin + '/api';
const SOCKET_URL = window.location.origin;

// --- Global Sync Indicator ---
let _syncCount = 0;
const updateSyncIndicator = (isStarting) => {
    _syncCount += isStarting ? 1 : -1;
    if (_syncCount < 0) _syncCount = 0;
    const el = document.getElementById('global-sync-indicator');
    if (el) {
        if (_syncCount > 0) el.classList.add('is-syncing');
        else el.classList.remove('is-syncing');
    }
};

// --- Global Error Handling & Notifications ---
window.onerror = (msg, url, lineNo, columnNo, error) => {
    console.error('Global Error caught:', { msg, url, lineNo, columnNo, error });
    // Throttled toast to avoid spamming
    if (!window._lastToastTime || Date.now() - window._lastToastTime > 5000) {
        showToast('System encounter: Recovering connectivity...');
        window._lastToastTime = Date.now();
    }
    return false;
};

// Helper: Format order design field to show all items
function formatOrderDesign(order) {
    if (order.items && order.items.length > 0) {
        return order.items.map(i => `${i.name}${i.quantity > 1 ? ' ×' + i.quantity : ''}`).join(', ');
    }
    return order.design || 'Custom Design';
}

const AuthManager = {
    SESSION_KEY: 'stitch_opt_session',

    async login(email, password) {
        try {
            const response = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                return { success: false, message: errData.message || 'Login failed' };
            }
            const data = await response.json();
            localStorage.setItem(this.SESSION_KEY, JSON.stringify(data));
            return { success: true };
        } catch (err) {
            console.error('Login error:', err);
            return { success: false, message: 'Could not connect to server. Is the backend running?' };
        }
    },

    async register(username, email, password, role = 'customer') {
        try {
            const response = await fetch(`${API_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password, role })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                return { success: false, message: errData.message || 'Registration failed' };
            }
            const data = await response.json();
            localStorage.setItem(this.SESSION_KEY, JSON.stringify(data));
            return { success: true };
        } catch (err) {
            console.error('Registration error:', err);
            return { success: false, message: 'Could not connect to server. Is the backend running?' };
        }
    },

    logout() {
        localStorage.removeItem(this.SESSION_KEY);
        window.location.href = 'index.html';
    },

    getSession() {
        try {
            const session = localStorage.getItem(this.SESSION_KEY);
            if (!session) return null;
            const parsed = JSON.parse(session);
            // Ensure essential properties exist
            if (!parsed || !parsed.user || !parsed.token) return null;
            return parsed;
        } catch (e) {
            console.error('Session parse error:', e);
            return null;
        }
    },

    isAuthenticated() {
        return !!this.getSession();
    },

    getUserRole() {
        const session = this.getSession();
        return session ? session.user.role : null;
    },

    getToken() {
        const session = this.getSession();
        return session ? session.token : null;
    },

    async updateProfile(userData) {
        try {
            console.log('Sending profile update:', userData);
            const response = await fetch(`${API_URL}/auth/profile`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.getToken()}`
                },
                body: JSON.stringify(userData)
            });

            const contentType = response.headers.get("content-type");
            if (!response.ok) {
                if (contentType && contentType.indexOf("application/json") !== -1) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'Update failed');
                } else {
                    const text = await response.text();
                    console.error('Server returned non-JSON error:', text);
                    // If it's a 404, the server might not have the route registered
                    if (response.status === 404) {
                        throw new Error('Update feature not active on server. Please restart the backend.');
                    }
                    throw new Error(`Server Error (${response.status}): Check console for details`);
                }
            }

            if (contentType && contentType.indexOf("application/json") !== -1) {
                const data = await response.json();
                // Update local session data
                const currentSession = this.getSession();
                if (currentSession) {
                    currentSession.token = data.token;
                    currentSession.user.username = data.user.username;
                    localStorage.setItem(this.SESSION_KEY, JSON.stringify(currentSession));
                }
                return true;
            } else {
                throw new Error('Server returned non-JSON success response');
            }
        } catch (err) {
            console.error('Update profile error:', err);
            throw err;
        }
    },

    checkAccess(requiredRole) {
        const session = this.getSession();
        if (!session || !session.user || !session.user.role) {
            console.warn('Access denied: No valid session');
            window.location.href = 'index.html';
            return false;
        }
        if (session.user.role !== requiredRole) {
            const routes = {
                'admin': 'admin.html',
                'employee': 'employee.html',
                'customer': 'user.html'
            };
            window.location.href = routes[session.user.role] || 'index.html';
            return false;
        }
        return true;
    }
};

// Expose to window for global access
window.AuthManager = AuthManager;

/**
 * StitchMaster AI - Interactive Assistant Logic
 */
const StitchAI = {
    responses: {
        'default': 'I am analyzing your production data. How can I assist with your embroidery projects today?',
        'thread': 'Our current inventory shows Midnight Blue and Gold Metallic are in high demand. Would you like me to check other colors?',
        'order': 'I see your active orders. Simulated production shows an average completion time of 45 minutes per design.',
        'machine': 'Machine #4 is showing optimal tension. No maintenance required for the next 12000 stitches.',
        'help': 'I can help with inventory tracking, production scheduling, and machine diagnostics. What do you need?',
        'hello': 'Hello! StitchMaster AI at your service. Ready to optimize your workflow.'
    },

    async sendMessage(message) {
        if (!message.trim()) return;
        
        this.appendMessage('user', message);
        
        // Simulated AI thinking delay
        setTimeout(async () => {
            const response = await this.generateResponse(message);
            this.appendMessage('ai', response);
        }, 800);
    },

    async generateResponse(input) {
        const text = input.toLowerCase();
        if (text.includes('optimize') || text.includes('productivity') || text.includes('flow') || text.includes('queue')) {
            return await this.getQueueAnalysis();
        }
        if (text.includes('thread') || text.includes('color')) return this.responses['thread'];
        if (text.includes('order') || text.includes('status')) return this.responses['order'];
        if (text.includes('machine') || text.includes('tension')) return this.responses['machine'];
        if (text.includes('help')) return this.responses['help'];
        if (text.includes('hello') || text.includes('hi')) return this.responses['hello'];
        return this.responses['default'];
    },

    async getQueueAnalysis() {
        const orders = await State.getOrders();
        const activeOrders = orders.filter(o => o.status !== 'Completed');
        if (activeOrders.length === 0) return "The production queue is currently empty. We are ready for new designs!";
        
        const groups = {};
        activeOrders.forEach(o => {
            if (!groups[o.design]) groups[o.design] = 0;
            groups[o.design]++;
        });

        const designKeys = Object.keys(groups);
        let advice = `I've analyzed the ${activeOrders.length} active orders. `;
        
        if (designKeys.length < activeOrders.length) {
            const bestBatch = designKeys.sort((a,b) => groups[b] - groups[a])[0];
            advice += `To maximize productivity, I recommend **batching the ${groups[bestBatch]} orders for "${bestBatch}"**. This reduces machine setup time by 15%. `;
        } else {
            advice += "Current orders are diverse. Ensure all thread colors are staged for quick changeovers. ";
        }

        const inv = await State.getInventory();
        const gold = inv.find(i => i.item === 'Gold Metallic');
        if (gold && gold.count < 5) advice += " **ALERT:** Gold thread is low, which might stall the Tesla batch soon.";

        return advice;
    },

    async updateAdviceWidget() {
        const adviceContainer = document.getElementById('ai-production-advice');
        if (!adviceContainer) return;
        
        const advice = await this.getQueueAnalysis();
        adviceContainer.innerHTML = `
            <div style="display:flex; gap:12px; align-items:center;">
                <div style="width:10px; height:10px; border-radius:50%; background:var(--primary); box-shadow:0 0 10px var(--primary);"></div>
                <p style="font-size:0.9rem; color:var(--text-main); font-weight:500;">StitchMaster Optimization Tip:</p>
            </div>
            <p style="font-size:0.85rem; color:var(--text-dim); margin-top:8px; line-height:1.4;">${advice}</p>
        `;
    },

    appendMessage(type, text) {
        const container = document.getElementById('ai-chat-messages');
        if (!container) return;

        const msgDiv = document.createElement('div');
        msgDiv.style.padding = '10px';
        msgDiv.style.borderRadius = '12px';
        msgDiv.style.marginBottom = '12px';
        msgDiv.style.fontSize = '0.9rem';
        msgDiv.style.maxWidth = '85%';
        
        if (type === 'user') {
            msgDiv.style.background = 'var(--primary)';
            msgDiv.style.color = 'white';
            msgDiv.style.marginLeft = 'auto';
            msgDiv.innerHTML = `<strong>You:</strong> ${text}`;
        } else {
            msgDiv.style.background = 'rgba(255, 255, 255, 0.05)';
            msgDiv.style.border = '1px solid var(--border-glass)';
            msgDiv.style.color = 'var(--text-main)';
            msgDiv.innerHTML = `<strong>AI:</strong> ${text}`;
        }

        container.appendChild(msgDiv);
        container.scrollTop = container.scrollHeight;
    },

    init() {
        const input = document.getElementById('ai-chat-input');
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.sendMessage(input.value);
                    input.value = '';
                }
            });
        }
    }
};

window.StitchAI = StitchAI;

// --- State Management ---
const State = {
    _isInitialLoad: true,
    _cache: {
        orders: [],
        products: [],
        inventory: [],
        favorites: [],
        users: [],
        analytics: null
    },
    getBasket: () => JSON.parse(localStorage.getItem('stitch_basket') || '[]'),
    setBasket: (basket) => {
        localStorage.setItem('stitch_basket', JSON.stringify(basket));
        window.dispatchEvent(new Event('basketUpdated'));
    },
    async getOrders() {
        const response = await fetch(`${API_URL}/orders`, {
            headers: { 'Authorization': `Bearer ${AuthManager.getToken()}` }
        });
        return await response.json();
    },
    async getInventory() {
        const response = await fetch(`${API_URL}/inventory`, {
            headers: { 'Authorization': `Bearer ${AuthManager.getToken()}` }
        });
        return await response.json();
    },
    async getProducts() {
        try {
            const response = await fetch(`${API_URL}/products`, {
                headers: { 'Authorization': `Bearer ${AuthManager.getToken()}` }
            });
            return await response.json();
        } catch (err) {
            console.error('Fetch products error:', err);
            return [];
        }
    },
    async getDashboardState() {
        try {
            const response = await fetch(`${API_URL}/dashboard-state`, {
                headers: { 'Authorization': `Bearer ${AuthManager.getToken()}` }
            });
            if (!response.ok) throw new Error('Failed to fetch batch state');
            const data = await response.json();
            this._cache = { ...this._cache, ...data };
            return data;
        } catch (err) {
            console.error('Batch fetch error:', err);
            return null;
        }
    },
    async getFavorites() {
        try {
            const response = await fetch(`${API_URL}/favorites`, {
                headers: { 'Authorization': `Bearer ${AuthManager.getToken()}` }
            });
            return await response.json();
        } catch (err) {
            console.error('Fetch favorites error:', err);
            return [];
        }
    },
    getMachineState: () => JSON.parse(localStorage.getItem('stitch_machine') || JSON.stringify({
        status: 'running',
        progress: 65,
        job: 'Corporate Polos - Nike Team'
    })),
    setMachineState: (state) => {
        localStorage.setItem('stitch_machine', JSON.stringify(state));
        window.dispatchEvent(new Event('machineUpdated'));
    }
};

// --- Actions ---
const Actions = {
    addToBasket: (item, quantity = 1) => {
        const basket = State.getBasket();
        const existingItem = basket.find(b => b.name === item.name);
        if (existingItem) {
            existingItem.quantity += parseInt(quantity);
        } else {
            basket.push({ ...item, quantity: parseInt(quantity), id: Date.now() });
        }
        State.setBasket(basket);
        showToast(`Added ${quantity} of ${item.name} to basket`);
    },
    updateBasketQuantity: (id, change) => {
        let basket = State.getBasket();
        const itemIndex = basket.findIndex(b => b.id.toString() === id.toString());
        if (itemIndex > -1) {
            basket[itemIndex].quantity += change;
            if (basket[itemIndex].quantity <= 0) {
                basket = basket.filter(b => b.id.toString() !== id.toString());
            }
            State.setBasket(basket);
        }
    },
    removeFromBasket: (id) => {
        const basket = State.getBasket();
        State.setBasket(basket.filter(item => item.id.toString() !== id.toString()));
    },
    async checkout() {
        const basket = State.getBasket();
        if (basket.length === 0) return;

        // --- Optimistic UI Update ---
        const originalOrders = [...State._cache.orders];
        const tempOrder = {
            _id: `temp-${Date.now()}`,
            orderId: `ORD-${Math.floor(Math.random() * 9000) + 1000}`,
            client: AuthManager.getSession()?.user.username || 'Client',
            design: basket.map(i => `${i.name}${i.quantity > 1 ? ' ×' + i.quantity : ''}`).join(', '),
            items: basket,
            status: 'In Queue',
            progress: 0,
            createdAt: new Date().toISOString()
        };

        State._cache.orders.unshift(tempOrder);
        State.setBasket([]); // Triggers basketUpdated -> updateUI
        updateSyncIndicator(true);

        try {
            const response = await fetch(`${API_URL}/orders`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${AuthManager.getToken()}`
                },
                body: JSON.stringify(tempOrder)
            });

            if (response.ok) {
                showToast('Order placed successfully!');
                // Silently sync cache to get real order ID
                silentCacheSync();
            } else {
                throw new Error('Server rejected order');
            }
        } catch (err) {
            console.error('Checkout error:', err);
            // Rollback
            State._cache.orders = originalOrders;
            State.setBasket(basket);
            showToast('Checkout failed. Restoring basket.');
            updateUI();
        } finally {
            updateSyncIndicator(false);
        }
    },
    async toggleFavorite(productId, isFavorite) {
        const originalFavorites = JSON.parse(JSON.stringify(State._cache.favorites || []));
        const willBeFav = !isFavorite;
        
        // --- Optimistic UI Update ---
        if (!State._cache.favorites) State._cache.favorites = [];
        
        if (willBeFav) {
            const prod = State._cache.products?.find(p => p._id === productId);
            if (prod) State._cache.favorites.push(prod);
        } else {
            State._cache.favorites = State._cache.favorites.filter(f => f._id !== productId);
        }
        
        // Toggle ALL matching heart buttons across the entire page
        // (covers both product grid and favorites tab)
        document.querySelectorAll(`.fav-toggle-btn[data-id="${productId}"]`).forEach(btn => {
            btn.dataset.fav = String(willBeFav);
            btn.style.color = willBeFav ? '#ef4444' : 'white';
            const svg = btn.querySelector('svg');
            if (svg) svg.setAttribute('fill', willBeFav ? 'currentColor' : 'none');
        });

        // Rebuild the favorites tab so cards appear/disappear
        updateFavoritesSection();
        updateSyncIndicator(true);

        try {
            const method = isFavorite ? 'DELETE' : 'POST';
            const response = await fetch(`${API_URL}/favorites/${productId}`, {
                method: method,
                headers: { 'Authorization': `Bearer ${AuthManager.getToken()}` }
            });
            if (response.ok) {
                // Silently sync cache — optimistic UI is already correct
                silentCacheSync();
            } else {
                throw new Error('Failed to sync favorite');
            }
        } catch (err) {
            console.error('Toggle favorite error:', err);
            // Rollback on failure
            State._cache.favorites = originalFavorites;
            // Revert ALL matching buttons
            document.querySelectorAll(`.fav-toggle-btn[data-id="${productId}"]`).forEach(btn => {
                btn.dataset.fav = String(isFavorite);
                btn.style.color = isFavorite ? '#ef4444' : 'white';
                const svg = btn.querySelector('svg');
                if (svg) svg.setAttribute('fill', isFavorite ? 'currentColor' : 'none');
            });
            updateFavoritesSection();
            showToast('Sync failed: Action reverted');
        } finally {
            updateSyncIndicator(false);
        }
    },
    toggleEmergencyStop: () => {
        const state = State.getMachineState();
        state.status = state.status === 'STOPPED' ? 'running' : 'STOPPED';
        State.setMachineState(state);
        showToast(`Machine ${state.status}`);
    },
    async updateOrder(id, orderData) {
        const originalOrders = JSON.parse(JSON.stringify(State._cache.orders || []));
        
        // --- Optimistic Update ---
        const order = State._cache.orders.find(o => o._id === id);
        if (order) {
            Object.assign(order, orderData);
            updateUI();
        }
        updateSyncIndicator(true);

        try {
            const response = await fetch(`${API_URL}/orders/${id}`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${AuthManager.getToken()}`
                },
                body: JSON.stringify(orderData)
            });
            
            if (response.ok) {
                // Silently sync cache — optimistic UI is already correct
                silentCacheSync();
                return true;
            } else {
                throw new Error('Sync failed');
            }
        } catch (err) {
            console.error('Update order error:', err);
            State._cache.orders = originalOrders;
            updateUI();
            showToast('Sync failed: Order reverted');
            return false;
        } finally {
            updateSyncIndicator(false);
        }
    },
    async batchUpdateStatus(orderIds, status) {
        const originalOrders = JSON.parse(JSON.stringify(State._cache.orders));
        
        // --- Optimistic Update ---
        orderIds.forEach(id => {
            const order = State._cache.orders.find(o => o._id === id);
            if (order) order.status = status;
        });
        updateUI();
        updateSyncIndicator(true);

        try {
            const response = await fetch(`${API_URL}/orders/batch-status`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${AuthManager.getToken()}`
                },
                body: JSON.stringify({ orderIds, status })
            });

            if (response.ok) {
                showToast(`Updated ${orderIds.length} orders to ${status}`);
                // Silently sync cache — optimistic UI is already correct
                silentCacheSync();
                return true;
            } else {
                throw new Error('Batch sync failed');
            }
        } catch (err) {
            console.error('Batch update error:', err);
            State._cache.orders = originalOrders;
            updateUI();
            showToast('Sync failed: Reverting status changes');
            return false;
        } finally {
            updateSyncIndicator(false);
        }
    },
    async deleteOrder(id) {
        const originalOrders = JSON.parse(JSON.stringify(State._cache.orders || []));
        const statusData = { status: 'Order Canceled', progress: 100 };

        // --- Optimistic Update ---
        const order = State._cache.orders.find(o => o._id === id);
        if (order) {
            Object.assign(order, statusData);
            updateUI();
        }
        updateSyncIndicator(true);

        try {
            const response = await fetch(`${API_URL}/orders/${id}`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${AuthManager.getToken()}`
                },
                body: JSON.stringify(statusData)
            });
            
            if (response.ok) {
                silentCacheSync();
                return true;
            } else {
                throw new Error('Sync failed');
            }
        } catch (err) {
            console.error('Delete order error:', err);
            State._cache.orders = originalOrders;
            updateUI();
            showToast('Sync failed: Order state restored');
            return false;
        } finally {
            updateSyncIndicator(false);
        }
    }
};

const AdminActions = {

    async createUser(userData) {
        const originalUsers = JSON.parse(JSON.stringify(State._cache.users || []));
        
        // --- Optimistic Update ---
        const tempUser = {
            _id: `temp-${Date.now()}`,
            ...userData,
            createdAt: new Date().toISOString()
        };
        if (!State._cache.users) State._cache.users = [];
        State._cache.users.unshift(tempUser);
        updateUI();
        updateSyncIndicator(true);

        try {
            const response = await fetch(`${API_URL}/admin/users`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${AuthManager.getToken()}`
                },
                body: JSON.stringify(userData)
            });
            
            if (response.ok) {
                // Silently sync cache to get real DB ID
                silentCacheSync();
                return true;
            } else {
                throw new Error('Create user sync failed');
            }
        } catch (err) {
            console.error('Create user error:', err);
            State._cache.users = originalUsers;
            updateUI();
            showToast('Sync failed: User creation reverted');
            return false;
        } finally {
            updateSyncIndicator(false);
        }
    },

    async updateUser(id, userData) {
        const originalUsers = JSON.parse(JSON.stringify(State._cache.users || []));
        
        // --- Optimistic Update ---
        const userToEdit = State._cache.users?.find(u => u._id === id);
        if (userToEdit) {
            if (userData.username) userToEdit.username = userData.username;
            if (userData.email) userToEdit.email = userData.email;
            if (userData.role) userToEdit.role = userData.role;
            updateUI();
        }
        updateSyncIndicator(true);

        try {
            const response = await fetch(`${API_URL}/admin/users/${id}`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${AuthManager.getToken()}`
                },
                body: JSON.stringify(userData)
            });
            if (response.ok) {
                // Confirm consistency quietly
                return true;
            } else {
                throw new Error('Update user sync failed');
            }
        } catch (err) {
            console.error('Update user error:', err);
            State._cache.users = originalUsers;
            updateUI();
            showToast('Sync failed: User updates reverted');
            return false;
        } finally {
            updateSyncIndicator(false);
        }
    },

    async deleteUser(id) {
        const originalUsers = JSON.parse(JSON.stringify(State._cache.users || []));
        
        // --- Optimistic Update ---
        if (State._cache.users) {
            State._cache.users = State._cache.users.filter(u => u._id !== id);
            updateUI();
        }
        updateSyncIndicator(true);

        try {
            const response = await fetch(`${API_URL}/admin/users/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${AuthManager.getToken()}` }
            });
            if (response.ok) {
                return true;
            } else {
                throw new Error('Delete user sync failed');
            }
        } catch (err) {
            console.error('Delete user error:', err);
            State._cache.users = originalUsers;
            updateUI();
            showToast('Sync failed: User state restored');
            return false;
        } finally {
            updateSyncIndicator(false);
        }
    }
};

const EmployeeActions = {
    async createProduct(productData) {
        const originalProducts = JSON.parse(JSON.stringify(State._cache.products || []));
        
        // --- Optimistic Update ---
        const tempProduct = {
            _id: `temp-${Date.now()}`,
            ...productData,
            createdAt: new Date().toISOString()
        };
        if (!State._cache.products) State._cache.products = [];
        State._cache.products.unshift(tempProduct);
        updateUI();
        updateSyncIndicator(true);

        try {
            const response = await fetch(`${API_URL}/products`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${AuthManager.getToken()}`
                },
                body: JSON.stringify(productData)
            });
            
            if (response.ok) {
                // Silently sync cache to get real DB ID
                silentCacheSync();
                return true;
            } else {
                throw new Error('Create product sync failed');
            }
        } catch (err) {
            console.error('Create product error:', err);
            State._cache.products = originalProducts;
            updateUI();
            showToast('Sync failed: Product creation reverted');
            return false;
        } finally {
            updateSyncIndicator(false);
        }
    },

    async updateProduct(id, productData) {
        const originalProducts = JSON.parse(JSON.stringify(State._cache.products || []));
        
        // --- Optimistic Update ---
        const prod = State._cache.products?.find(p => p._id === id);
        if (prod) {
            Object.assign(prod, productData);
            updateUI();
        }
        updateSyncIndicator(true);

        try {
            const response = await fetch(`${API_URL}/products/${id}`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${AuthManager.getToken()}`
                },
                body: JSON.stringify(productData)
            });
            if (response.ok) {
                return true;
            } else {
                throw new Error('Update product sync failed');
            }
        } catch (err) {
            console.error('Update product error:', err);
            State._cache.products = originalProducts;
            updateUI();
            showToast('Sync failed: Product updates reverted');
            return false;
        } finally {
            updateSyncIndicator(false);
        }
    },

    async deleteProduct(id) {
        const originalProducts = JSON.parse(JSON.stringify(State._cache.products || []));
        
        // --- Optimistic Update ---
        if (State._cache.products) {
            State._cache.products = State._cache.products.filter(p => p._id !== id);
            updateUI();
        }
        updateSyncIndicator(true);

        try {
            const response = await fetch(`${API_URL}/products/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${AuthManager.getToken()}` }
            });
            if (response.ok) {
                return true;
            } else {
                throw new Error('Delete product sync failed');
            }
        } catch (err) {
            console.error('Delete product error:', err);
            State._cache.products = originalProducts;
            updateUI();
            showToast('Sync failed: Product state restored');
            return false;
        } finally {
            updateSyncIndicator(false);
        }
    }
};

const UI = {
    toggleModal(id) {
        const modal = document.getElementById(id);
        if (modal) {
            modal.style.display = (modal.style.display === 'none' || modal.style.display === '') ? 'flex' : 'none';
        }
    },

    readImageAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
            reader.readAsDataURL(file);
        });
    }
};

// Ensure global accessibility for HTML event handlers
window.AuthManager = AuthManager;
window.AdminActions = AdminActions;
window.EmployeeActions = EmployeeActions;
window.UI = UI;
window.updateUI = updateUI;

// --- Helpers ---
function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'glass animate-fade';
    toast.style = `
        position: fixed; bottom: 20px; right: 20px; 
        padding: 16px 24px; background: var(--primary); 
        color: white; border-radius: 12px; z-index: 1000;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    `;
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// --- UI Syncing ---
async function refreshDashboardState() {
    if (!AuthManager.isAuthenticated()) return;
    try {
        updateSyncIndicator(true);
        const batch = await State.getDashboardState();
        if (batch) {
            State._isInitialLoad = false;
            updateUI();
        }
    } catch (err) {
        console.error('State Fetch failed:', err);
        showToast('System synchronization delay. Retrying...');
    } finally {
        updateSyncIndicator(false);
    }
}

// Silent cache sync: refreshes backend data without re-rendering UI.
// Used after optimistic updates where the UI already reflects the correct state.
async function silentCacheSync() {
    if (!AuthManager.isAuthenticated()) return;
    try {
        await State.getDashboardState();
    } catch (err) {
        console.error('Silent cache sync failed:', err);
    }
}

// Dedicated favorites section re-render — avoids rebuilding the product grid.
function updateFavoritesSection() {
    const favorites = State._cache.favorites || [];
    const favoritesSection = document.getElementById('section-favs');
    if (!favoritesSection) return;

    if (favorites.length === 0) {
        favoritesSection.innerHTML = `
            <h1 style="font-size: 2.2rem; margin-bottom: 24px;">My Favorites</h1>
            <div style="height: 300px; border: 2px dashed var(--border-glass); border-radius: 24px; display: flex; align-items: center; justify-content: center; color: var(--text-dim); text-align: center; padding: 20px;">
                <div>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 12px; color: var(--accent);"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                    <p>You haven't favorited any designs yet.</p>
                </div>
            </div>
        `;
    } else {
        favoritesSection.innerHTML = `
            <h1 style="font-size: 2.2rem; margin-bottom: 24px;">My Favorites</h1>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 24px;">
                ${favorites.map(p => `
                    <div class="product-card glass animate-fade">
                        <div class="product-image" style="background-image: url('${p.imageUrl}'); background-size: cover; background-position: center;">
                            <button class="fav-toggle-btn" data-id="${p._id}" data-fav="true" style="position: absolute; top: 12px; right: 12px; background: rgba(0,0,0,0.3); border: none; padding: 8px; border-radius: 50%; color: #ef4444; cursor: pointer; backdrop-filter: blur(4px);">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                            </button>
                        </div>
                        <div class="product-details">
                            <span class="product-tag">${p.tag}</span>
                            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px;">
                                <h3 style="font-weight: 600;">${p.name}</h3>
                                <span style="color: var(--primary); font-weight: 700; font-size: 1.1rem;">$${p.price.toFixed(2)}</span>
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <button class="btn btn-primary add-to-basket" style="flex: 1; padding: 12px; font-size: 0.9rem; border-radius: 10px;" 
                                    data-name="${p.name}" data-price="${p.price}">Add to Basket</button>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }
}

// Dedicated basket-only re-render — avoids rebuilding the product grid.
function updateBasketUI() {
    const basket = State.getBasket();

    const basketCount = document.getElementById('basket-count');
    const mobileBasketCount = document.getElementById('mobile-basket-count');
    if (basketCount) basketCount.innerText = `${basket.length} Items`;
    if (mobileBasketCount) mobileBasketCount.innerText = basket.length;

    const basketItems = document.getElementById('basket-items-list');
    if (basketItems) {
        let newHtml = '';
        if (basket.length === 0) {
            newHtml = '<div style="text-align:center;color:var(--text-dim)"><p>Basket is empty</p></div>';
        } else {
            newHtml = basket.map(item => `
                <div class="basket-item" style="display: flex; flex-direction: column; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 12px; margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; text-align: left;">
                        <span style="font-weight: 500; font-size: 0.95rem;">${item.name}</span>
                        <span style="color: var(--primary); font-weight: 600;">$${(parseFloat(item.price) * (item.quantity || 1)).toFixed(2)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; gap: 4px; align-items: center;">
                            <button class="btn qty-btn minus" data-id="${item.id}" style="padding: 4px 8px; background: rgba(255,255,255,0.1); border-radius: 4px; border: 1px solid var(--border-glass); color: white;">-</button>
                            <span style="min-width: 20px; text-align: center;">${item.quantity || 1}</span>
                            <button class="btn qty-btn plus" data-id="${item.id}" style="padding: 4px 8px; background: rgba(255,255,255,0.1); border-radius: 4px; border: 1px solid var(--border-glass); color: white;">+</button>
                        </div>
                        <button class="btn remove-btn" data-id="${item.id}" style="color: #ef4444; font-size: 0.85rem; padding: 4px; background: none; border: none; cursor: pointer; text-decoration: underline;">Remove</button>
                    </div>
                </div>
            `).join('');
        }
        if (basketItems.innerHTML !== newHtml) basketItems.innerHTML = newHtml;
    }

    const basketTotal = document.getElementById('basket-total');
    if (basketTotal) {
        const total = basket.reduce((sum, item) => sum + (parseFloat(item.price) * (item.quantity || 1)), 0);
        basketTotal.innerText = `$${total.toFixed(2)}`;
    }

    const checkoutBtn = document.getElementById('checkout-btn');
    if (checkoutBtn) {
        checkoutBtn.style.opacity = basket.length > 0 ? '1' : '0.5';
        checkoutBtn.style.pointerEvents = basket.length > 0 ? 'all' : 'none';
    }
}

function updateUI() {
    const basket = State.getBasket();
    const machine = State.getMachineState();
    
    // Auth Check
    if (!AuthManager.isAuthenticated()) return;

    // Show Skeletons on Initial Load
    if (State._isInitialLoad) {
        renderSkeletons();
        refreshDashboardState(); // Trigger network load
        return;
    }

    // Auth-guarded data (Local Memory Fetch)
    const orders = State._cache.orders || [];
    const inventory = State._cache.inventory || [];
    const products = State._cache.products || [];
    const favorites = State._cache.favorites || [];
    const analytics = State._cache.analytics || null;

    const favIds = favorites.map(f => f._id);

    // Update Analytics (Admin/Employee Only)
    if (analytics) {
        const revEl = document.querySelector('.stat-value:has(+.stat-label[innerText*="Revenue"])') || 
                      ([...document.querySelectorAll('.stat-label')].find(el => el.innerText.includes('Revenue'))?.previousElementSibling);
        
        if (revEl) revEl.innerText = `$${(analytics.revenue / 1000).toFixed(1)}k`;
        
        const activeOrdersEl = [...document.querySelectorAll('.stat-label')].find(el => el.innerText.includes('Active Orders'))?.previousElementSibling;
        if (activeOrdersEl) activeOrdersEl.innerText = analytics.activeOrders;

        const userCountEl = [...document.querySelectorAll('.stat-label')].find(el => el.innerText.includes('Personnel'))?.previousElementSibling;
        if (userCountEl) userCountEl.innerText = analytics.userCount;
    }



    // Catalog UI Updates
    const productGrid = document.querySelector('.product-grid');
    if (productGrid) {
        let newHtml = '';
        if (products.length > 0) {
            newHtml = products.map(p => {
                const isFav = favIds.includes(p._id);
                return `
                <div class="product-card glass animate-fade">
                    <div class="product-image" style="background-image: url('${p.imageUrl}'); background-size: cover; background-position: center;">
                        <button class="fav-toggle-btn" data-id="${p._id}" data-fav="${isFav}" style="position: absolute; top: 12px; right: 12px; background: rgba(0,0,0,0.3); border: none; padding: 8px; border-radius: 50%; color: ${isFav ? '#ef4444' : 'white'}; cursor: pointer; backdrop-filter: blur(4px); transition: transform 0.2s;">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                        </button>
                    </div>
                    <div class="product-details">
                        <span class="product-tag">${p.tag}</span>
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px;">
                            <h3 style="font-weight: 600;">${p.name}</h3>
                            <span style="color: var(--primary); font-weight: 700; font-size: 1.1rem;">$${p.price.toFixed(2)}</span>
                        </div>
                        <p style="color: var(--text-dim); font-size: 0.85rem; line-height: 1.5; margin-bottom: 20px;">${p.description || 'Professional embroidery design.'}</p>
                        <div style="display: flex; gap: 8px;">
                            <input type="number" class="qty-input" min="1" value="1" style="width: 60px; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border-glass); padding: 8px; border-radius: 8px; color: white; text-align: center;">
                            <button class="btn btn-primary add-to-basket" style="flex: 1; padding: 12px; font-size: 0.9rem; border-radius: 10px;" 
                                data-name="${p.name}" data-price="${p.price}">Add to Basket</button>
                        </div>
                    </div>
                </div>
            `;}).join('');
        } else {
            newHtml = `
                <div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--text-dim);">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 16px; opacity: 0.3;"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7l-3 5H5l-3-5"/></svg>
                    <p>No designs published in the database yet.</p>
                </div>
            `;
        }
        if (productGrid.innerHTML !== newHtml) productGrid.innerHTML = newHtml;
    }

    // Employee Design List updates
    const employeeProductList = document.getElementById('product-list-container');
    if (employeeProductList) {
        let newHtml = '';
        if (products.length > 0) {
            newHtml = products.map(p => `
                <div class="stat-card glass animate-fade" style="display: flex; align-items: center; gap: 20px; padding: 15px;">
                    <div style="width: 80px; height: 80px; border-radius: 12px; background-image: url('${p.imageUrl}'); background-size: cover; background-position: center; flex-shrink: 0;"></div>
                    <div style="flex: 1;">
                        <h4 style="margin: 0; font-size: 1.1rem;">${p.name}</h4>
                        <p style="margin: 4px 0; color: var(--text-dim); font-size: 0.85rem;">${p.tag} • $${p.price.toFixed(2)}</p>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn edit-product-btn" style="background: rgba(99, 102, 241, 0.1); color: var(--primary); padding: 8px; border-radius: 8px;" 
                            data-id="${p._id}" data-name="${p.name}" data-price="${p.price}" data-tag="${p.tag}" data-desc="${p.description || ''}" data-image="${p.imageUrl}">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="btn delete-product-btn" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; padding: 8px; border-radius: 8px;" data-id="${p._id}">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                </div>
            `).join('');
        } else {
            newHtml = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-dim); padding: 20px;">No designs in catalog. Click button to create one.</div>';
        }
        if (employeeProductList.innerHTML !== newHtml) employeeProductList.innerHTML = newHtml;
    }

    // Basket UI Updates (delegated to standalone function)
    updateBasketUI();

    // Orders UI Updates
    const orderQueue = document.getElementById('order-queue-list');
    if (orderQueue) {
        let newHtml = '';
        if (orders.length === 0) {
            newHtml = '<div style="text-align:center;color:var(--text-dim)"><p>No active orders</p></div>';
        } else {
            newHtml = orders.map(order => `
                <div class="order-item">
                    <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                        <strong>${order.orderId}</strong>
                        <span style="font-size:0.8rem;color:var(--primary)">${order.status}</span>
                    </div>
                    <div style="height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden">
                        <div style="width:${order.progress}%;height:100%;background:var(--primary)"></div>
                    </div>
                </div>
            `).join('');
        }
        if (orderQueue.innerHTML !== newHtml) orderQueue.innerHTML = newHtml;
    }

    const trackingSection = document.getElementById('section-tracking');
    if (trackingSection) {
        const trackingList = trackingSection.querySelector('div[style*="padding: 32px"]')?.parentElement;
        if (trackingList) {
            let newHtml = '';
            if (orders.length === 0) {
                newHtml = `
                    <h1 style="font-size: 2.2rem; margin-bottom: 24px;">Order Tracking</h1>
                    <div style="text-align: center; padding: 60px; color: var(--text-dim);">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 16px; opacity: 0.3;"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                        <p>No orders found. Start shopping to track your designs!</p>
                    </div>
                `;
            } else {
                newHtml = `
                    <h1 style="font-size: 2.2rem; margin-bottom: 24px;">Order Tracking</h1>
                    <div class="tracking-container" style="display: flex; flex-direction: column; gap: 20px;">
                        ${orders.map(order => `
                            <div class="glass animate-fade" style="padding: 32px;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
                                    <div>
                                        <h3 style="margin-bottom: 4px;">Order #${order.orderId}</h3>
                                        <p style="color: var(--text-dim); font-size: 0.9rem;">${formatOrderDesign(order)}</p>
                                    </div>
                                    <span class="status-pill" style="background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border-glass); padding: 6px 16px; border-radius: 20px; font-size: 0.85rem;">${order.status}</span>
                                </div>
                                <div style="height: 8px; background: rgba(255, 255, 255, 0.05); border-radius: 4px; overflow: hidden; margin-bottom: 12px;">
                                    <div class="progress-inner" style="width: ${order.progress}%; height: 100%; background: var(--primary); box-shadow: 0 0 10px var(--primary-glow);"></div>
                                </div>
                                <p style="text-align: right; color: var(--text-dim); font-size: 0.85rem;">${order.progress}% Processed</p>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
            if (trackingSection.innerHTML !== newHtml) trackingSection.innerHTML = newHtml;
        }
    }

    // Favorites Section Update
    // Favorites Section (delegated to standalone function)
    updateFavoritesSection();

    // Machine UI Updates (Employee Portal)
    const workbenchStatus = document.getElementById('workbench-status');
    if (workbenchStatus) {
        workbenchStatus.innerText = machine.status.toUpperCase();
        workbenchStatus.style.background = machine.status === 'STOPPED' ? 'var(--accent)' : 'var(--primary)';
    }

    const workbenchProgress = document.getElementById('workbench-progress');
    if (workbenchProgress) {
        workbenchProgress.style.width = `${machine.progress}%`;
    }

    // Split orders into active and history
    const terminalStatuses = ['Order Delivered', 'Order Canceled'];
    const activeOrders = orders.filter(o => !terminalStatuses.includes(o.status));
    const historyOrders = orders.filter(o => terminalStatuses.includes(o.status));

    // Employee Order Management UI
    const employeeOrderTable = document.getElementById('employee-order-table-body');
    if (employeeOrderTable) {
        let newHtml = '';
        if (activeOrders.length === 0) {
            newHtml = '<tr><td colspan="6" style="text-align:center;color:var(--text-dim)">No active orders</td></tr>';
        } else {
            newHtml = activeOrders.map(order => `
                <tr>
                    <td><input type="checkbox" class="order-select-checkbox" data-id="${order._id}"></td>
                    <td>${order.orderId}</td>
                    <td>${order.client}</td>
                    <td>${formatOrderDesign(order)}</td>
                    <td><span class="status-pill">${order.status}</span></td>
                    <td>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn edit-order-btn" style="background: rgba(99, 102, 241, 0.1); color: var(--primary); padding: 8px; border-radius: 8px;" 
                                data-id="${order._id}" data-orderid="${order.orderId}" data-client="${order.client}" data-design="${order.design}" data-status="${order.status}" data-progress="${order.progress}">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            <button class="btn cancel-order-btn" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; padding: 8px; border-radius: 8px;" data-id="${order._id}">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `).join('');
        }
        if (employeeOrderTable.innerHTML !== newHtml) employeeOrderTable.innerHTML = newHtml;
    }

    const employeeHistoryTable = document.getElementById('employee-history-table-body');
    if (employeeHistoryTable) {
        let newHtml = '';
        if (historyOrders.length === 0) {
            newHtml = '<tr><td colspan="5" style="text-align:center;color:var(--text-dim)">No historical orders found.</td></tr>';
        } else {
            newHtml = historyOrders.map(order => `
                <tr>
                    <td>${order.orderId}</td>
                    <td>${order.client}</td>
                    <td>${formatOrderDesign(order)}</td>
                    <td><span class="status-pill" style="border-color:${order.status === 'Order Canceled' ? '#ef4444' : 'var(--primary)'}; color:${order.status === 'Order Canceled' ? '#ef4444' : 'var(--primary)'}">${order.status}</span></td>
                    <td>${new Date(order.date).toLocaleDateString()}</td>
                </tr>
            `).join('');
        }
        if (employeeHistoryTable.innerHTML !== newHtml) employeeHistoryTable.innerHTML = newHtml;
    }

    // Admin UI Updates (Active queue)
    const adminOrderTable = document.getElementById('admin-order-table-body');
    if (adminOrderTable) {
        let newHtml = '';
        if (activeOrders.length === 0) {
            newHtml = '<tr><td colspan="6" style="text-align:center;color:var(--text-dim)">No active orders</td></tr>';
        } else {
            newHtml = activeOrders.map(order => `
                <tr>
                    <td><input type="checkbox" class="order-select-checkbox" data-id="${order._id}"></td>
                    <td>${order.orderId}</td>
                    <td>${order.client}</td>
                    <td>${formatOrderDesign(order)}</td>
                    <td><span class="status-pill">${order.status}</span></td>
                    <td>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn edit-order-btn" style="background: rgba(99, 102, 241, 0.1); color: var(--primary); padding: 8px; border-radius: 8px;" 
                                data-id="${order._id}" data-orderid="${order.orderId}" data-client="${order.client}" data-design="${order.design}" data-status="${order.status}" data-progress="${order.progress}">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            <button class="btn cancel-order-btn" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; padding: 8px; border-radius: 8px;" data-id="${order._id}">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `).join('');
        }
        if (adminOrderTable.innerHTML !== newHtml) adminOrderTable.innerHTML = newHtml;
    }

    // Admin UI Updates (History queue)
    const adminHistoryTable = document.getElementById('admin-history-table-body');
    if (adminHistoryTable) {
        let newHtml = '';
        if (historyOrders.length === 0) {
            newHtml = '<tr><td colspan="5" style="text-align:center;color:var(--text-dim)">No historical orders found.</td></tr>';
        } else {
            newHtml = historyOrders.map(order => `
                <tr>
                    <td>${order.orderId}</td>
                    <td>${order.client}</td>
                    <td>${formatOrderDesign(order)}</td>
                    <td><span class="status-pill" style="border-color:${order.status === 'Order Canceled' ? '#ef4444' : 'var(--primary)'}; color:${order.status === 'Order Canceled' ? '#ef4444' : 'var(--primary)'}">${order.status}</span></td>
                    <td>${new Date(order.date).toLocaleDateString()}</td>
                </tr>
            `).join('');
        }
        if (adminHistoryTable.innerHTML !== newHtml) adminHistoryTable.innerHTML = newHtml;
    }

    // Inventory UI Updates (Admin)
    const inventoryMidnight = document.getElementById('inv-midnight');
    const midItem = inventory.find(i => i.item === 'Midnight Blue');
    if (inventoryMidnight && midItem) inventoryMidnight.innerText = `${midItem.count} Cones`;
    
    const inventoryGold = document.getElementById('inv-gold');
    const goldItem = inventory.find(i => i.item === 'Gold Metallic');
    if (inventoryGold && goldItem) inventoryGold.innerText = `${goldItem.count} Cones`;
    
    const emergencyBtn = document.getElementById('emergency-stop-btn');
    if (emergencyBtn) {
        emergencyBtn.innerText = machine.status === 'STOPPED' ? 'Resume Machine' : 'Emergency Stop';
        emergencyBtn.style.background = machine.status === 'STOPPED' ? 'var(--primary)' : 'var(--accent)';
    }

    // Admin Staffing UI
    const staffTableBody = document.getElementById('staff-table-body');
    if (staffTableBody) {
        let newHtml = '';
        const users = State._cache.users || [];
        newHtml = users.length ? users.map(u => `
            <tr>
                <td>${u.username}</td>
                <td>${u.email}</td>
                <td><span class="status-pill" style="border-color:${u.role === 'admin' ? 'var(--primary)' : 'var(--secondary)'}">${u.role}</span></td>
                <td>${new Date(u.createdAt).toLocaleDateString()}</td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn edit-user-btn" style="background: rgba(99, 102, 241, 0.1); color: var(--primary); padding: 8px; border-radius: 8px;" 
                            data-id="${u._id}" data-username="${u.username}" data-email="${u.email}" data-role="${u.role}">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="btn delete-user-btn" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; padding: 8px; border-radius: 8px;" data-id="${u._id}" ${u._id === AuthManager.getSession()?.user.id ? 'disabled style="opacity:0.3"' : ''}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('') : `<tr><td colspan="5" style="text-align: center; color: var(--text-dim); padding: 40px;">No staff accounts found</td></tr>`;
        if (staffTableBody.innerHTML !== newHtml) staffTableBody.innerHTML = newHtml;
    }

    // Settings UI Updates
    const settingsName = document.getElementById('settings-username');
    const settingsEmail = document.getElementById('settings-email');
    if (settingsName && settingsEmail && AuthManager.isAuthenticated()) {
        const session = AuthManager.getSession();
        settingsName.value = session.user.username;
        settingsEmail.value = session.user.email || ''; 
    }

    // Profile Sidebar Updates
    const profileName = document.querySelector('.profile-name');
    const profileAvatar = document.querySelector('.profile-avatar');
    if (profileName && AuthManager.isAuthenticated()) {
        const session = AuthManager.getSession();
        profileName.innerText = session.user.username;
        profileAvatar.innerText = session.user.username.substring(0, 2).toUpperCase();
    }

    // AI Production Advice
    if (window.StitchAI) {
        window.StitchAI.updateAdviceWidget().catch(console.error);
    }
}

// --- Skeleton Rendering Helper ---
function renderSkeletons() {
    const productGrid = document.querySelector('.product-grid');
    if (productGrid) {
        productGrid.innerHTML = Array(4).fill(0).map(() => `
            <div class="product-card glass">
                <div class="skeleton skeleton-img"></div>
                <div class="product-details">
                    <div class="skeleton skeleton-text" style="width: 40%"></div>
                    <div class="skeleton skeleton-text"></div>
                    <div class="skeleton skeleton-text" style="width: 70%"></div>
                </div>
            </div>
        `).join('');
    }

    const orderTable = document.getElementById('admin-order-table-body') || document.getElementById('employee-order-table-body');
    if (orderTable) {
        orderTable.innerHTML = Array(3).fill(0).map(() => `
            <tr>
                <td><div class="skeleton skeleton-text"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>
            </tr>
        `).join('');
    }
}

function formatOrderDesign(order) {
    if (typeof order.design === 'string') return order.design;
    if (Array.isArray(order.items)) {
        return order.items.map(i => `${i.name} (${i.quantity})`).join(', ');
    }
    return order.design || 'Custom Design';
}

// --- Skeleton Rendering Helper ---
function renderSkeletons() {
    const productGrid = document.querySelector('.product-grid');
    if (productGrid) {
        productGrid.innerHTML = Array(4).fill(0).map(() => `
            <div class="product-card glass">
                <div class="skeleton skeleton-img"></div>
                <div class="product-details">
                    <div class="skeleton skeleton-text" style="width: 40%"></div>
                    <div class="skeleton skeleton-text"></div>
                    <div class="skeleton skeleton-text" style="width: 70%"></div>
                </div>
            </div>
        `).join('');
    }

    const orderTable = document.getElementById('admin-order-table-body') || document.getElementById('employee-order-table-body');
    if (orderTable) {
        orderTable.innerHTML = Array(3).fill(0).map(() => `
            <tr>
                <td><div class="skeleton skeleton-text"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>
            </tr>
        `).join('');
    }
}

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    await updateUI();
    StitchAI.init();
    
    // --- Socket.IO Real-Time Client ---
    const socketScript = document.createElement('script');
    socketScript.src = '/socket.io/socket.io.js';
    socketScript.onload = () => {
        const socket = io(SOCKET_URL);
        socket.on('connect', () => console.log('[Socket.IO] Connected to server'));
        socket.on('dataChanged', (data) => {
            console.log('[Socket.IO] Real-time update received:', data.type);
            refreshDashboardState();
        });
        socket.on('disconnect', () => console.log('[Socket.IO] Disconnected'));
    };
    document.head.appendChild(socketScript);

    // Core Event Listeners
    window.addEventListener('basketUpdated', updateBasketUI);
    window.addEventListener('ordersUpdated', refreshDashboardState);
    window.addEventListener('machineUpdated', updateUI);
    window.addEventListener('productsUpdated', refreshDashboardState);
    window.addEventListener('favoritesUpdated', refreshDashboardState);

    document.addEventListener('click', async (e) => {
        if (e.target.closest('.fav-toggle-btn')) {
            const btn = e.target.closest('.fav-toggle-btn');
            const id = btn.dataset.id;
            const isFav = btn.dataset.fav === 'true';
            Actions.toggleFavorite(id, isFav);
        }
        
        if (e.target.classList.contains('add-to-basket')) {
            const btn = e.target;
            const item = {
                name: btn.dataset.name,
                price: parseFloat(btn.dataset.price)
            };
            const qtyInput = btn.previousElementSibling;
            const qty = qtyInput && qtyInput.classList.contains('qty-input') ? qtyInput.value : 1;
            Actions.addToBasket(item, qty);
        }
        
        if (e.target.classList.contains('qty-btn')) {
            const btn = e.target;
            const id = btn.dataset.id;
            const change = btn.classList.contains('plus') ? 1 : -1;
            Actions.updateBasketQuantity(id, change);
        }
        
        if (e.target.classList.contains('remove-btn')) {
            Actions.removeFromBasket(e.target.dataset.id);
        }
    });
    
    // Form Listeners
    const staffForm = document.getElementById('create-staff-form');
    if (staffForm) {
        staffForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const isEdit = staffForm.dataset.mode === 'edit';
            const userId = staffForm.dataset.id;
            
            const userData = {
                username: document.getElementById('staff-username').value,
                email: document.getElementById('staff-email').value,
                role: document.getElementById('staff-role').value
            };
            
            // Allow password to be explicitly included if user typed something in
            const passVal = document.getElementById('staff-password').value;
            if (!isEdit || passVal.trim() !== '') {
                userData.password = passVal;
            }

            const success = isEdit 
                ? await AdminActions.updateUser(userId, userData)
                : await AdminActions.createUser(userData);

            if (success) {
                showToast(isEdit ? 'Account updated.' : 'Staff account established.');
                UI.toggleModal('staff-modal');
                updateUI();
                e.target.reset();
                delete staffForm.dataset.mode;
                delete staffForm.dataset.id;
            } else {
                showToast('Action failed.');
            }
        });
    }

    const productForm = document.getElementById('create-product-form');
    if (productForm) {
        productForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const imageFile = document.getElementById('product-image-file').files[0];
            let imageUrl = productForm.dataset.mode === 'edit' ? productForm.dataset.image : 'https://via.placeholder.com/200';
            
            if (imageFile) {
                try {
                    imageUrl = await UI.readImageAsBase64(imageFile);
                } catch (err) {
                    console.error('Image processing failed:', err);
                }
            }

            const productData = {
                name: document.getElementById('product-name').value,
                price: parseFloat(document.getElementById('product-price').value),
                tag: document.getElementById('product-tag').value,
                description: document.getElementById('product-desc').value,
                imageUrl: imageUrl
            };

            const isEdit = productForm.dataset.mode === 'edit';
            const productId = productForm.dataset.id;
            
            const success = isEdit 
                ? await EmployeeActions.updateProduct(productId, productData)
                : await EmployeeActions.createProduct(productData);

            if (success) {
                showToast(isEdit ? 'Design updated successfully!' : 'New design published successfully!');
                UI.toggleModal('create-product-modal');
                window.dispatchEvent(new Event('productsUpdated'));
                e.target.reset();
                delete productForm.dataset.mode;
                delete productForm.dataset.id;
                delete productForm.dataset.image;
            } else {
                showToast('Action failed.');
            }
        });
    }

    // Interactive Element Handlers
    document.body.addEventListener('click', (e) => {
        // NOTE: add-to-basket, qty-btn, remove-btn are handled by the delegated
        // click listener above (line ~1447). Do NOT duplicate them here.

        if (e.target.id === 'checkout-btn') Actions.checkout();
        if (e.target.id === 'emergency-stop-btn') Actions.toggleEmergencyStop();
        
        // Admin Staff Create Button Reset
        if (e.target.innerText === '+ Create Staff Account') {
            const form = document.getElementById('create-staff-form');
            if (form) {
                form.reset();
                delete form.dataset.mode;
                delete form.dataset.id;
                const passInput = document.getElementById('staff-password');
                passInput.placeholder = '••••••••';
                const passField = passInput.closest('.input-group');
                if (passField) passField.style.display = 'block';
                document.querySelector('#staff-modal h3').innerText = 'Create Staff Account';
            }
        }
        
        // Product Create Button Reset
        if (e.target.innerText === '+ Create New Design') {
            const form = document.getElementById('create-product-form');
            if (form) {
                form.reset();
                delete form.dataset.mode;
                delete form.dataset.id;
                delete form.dataset.image;
                document.querySelector('#create-product-modal h2').innerText = 'Create New Design';
            }
        }

        // Order Edit Handler
        const editOrderBtn = e.target.closest('.edit-order-btn');
        if (editOrderBtn) {
            const data = editOrderBtn.dataset;
            const form = document.getElementById('edit-order-form');
            form.dataset.id = data.id;
            
            document.getElementById('edit-order-client').value = data.client;
            document.getElementById('edit-order-design').value = data.design;
            document.getElementById('edit-order-status').value = data.status;
            document.getElementById('edit-order-progress').value = data.progress;
            
            // Re-style status buttons to show active status
            document.querySelectorAll('.status-btn').forEach(btn => {
                if (btn.dataset.value === data.status) {
                    btn.style.background = 'var(--primary)';
                    btn.style.color = 'white';
                    btn.style.borderColor = 'var(--primary)';
                } else {
                    btn.style.background = 'rgba(255,255,255,0.05)';
                    btn.style.color = 'var(--text-dim)';
                    btn.style.borderColor = 'var(--border-glass)';
                }
            });
            
            document.querySelector('#edit-order-modal h3').innerText = `Edit Order #${data.orderid}`;
            UI.toggleModal('edit-order-modal');
        }

        // Order Cancel Handler
        const cancelOrderBtn = e.target.closest('.cancel-order-btn');
        if (cancelOrderBtn) {
            const id = cancelOrderBtn.dataset.id;
            if (confirm('Are you sure you want to CANCEL and remove this order?')) {
                Actions.deleteOrder(id).then(success => {
                    if (success) {
                        showToast('Order cancelled');
                    } else {
                        showToast('Failed to cancel order');
                    }
                });
            }
        }

        // Finish Order (Mark as Completed) from Edit Modal shortcut
        // (Handled by form submission below)

        // Order Status to Progress Mapping Array
        const statusProgressMap = {
            'In Queue': 0,
            'Preparing Order': 25,
            'In Transit': 75,
            'Ready For Pick Up': 90,
            'Order Delivered': 100,
            'Order Canceled': 100
        };

        // Handle Status Button Clicks in Edit Order Modal
        const statusBtn = e.target.closest('.status-btn');
        if (statusBtn) {
            const statusInput = document.getElementById('edit-order-status');
            const progressInput = document.getElementById('edit-order-progress');
            
            statusInput.value = statusBtn.dataset.value;
            
            // Map progress
            if (statusProgressMap[statusInput.value] !== undefined) {
                progressInput.value = statusProgressMap[statusInput.value];
            }
            
            // Visually update buttons
            document.querySelectorAll('.status-btn').forEach(btn => {
                if (btn === statusBtn) {
                    btn.style.background = 'var(--primary)';
                    btn.style.color = 'white';
                    btn.style.borderColor = 'var(--primary)';
                } else {
                    btn.style.background = 'rgba(255,255,255,0.05)';
                    btn.style.color = 'var(--text-dim)';
                    btn.style.borderColor = 'var(--border-glass)';
                }
            });
        }

        // Product Edit Handler
        const editBtn = e.target.closest('.edit-product-btn');
        if (editBtn) {
            const data = editBtn.dataset;
            const form = document.getElementById('create-product-form');
            form.dataset.mode = 'edit';
            form.dataset.id = data.id;
            form.dataset.image = data.image;
            
            document.getElementById('product-name').value = data.name;
            document.getElementById('product-price').value = data.price;
            document.getElementById('product-tag').value = data.tag;
            document.getElementById('product-desc').value = data.desc;
            
            document.querySelector('#create-product-modal h2').innerText = 'Edit Design';
            UI.toggleModal('create-product-modal');
        }

        // Product Delete Handler
        const deleteBtn = e.target.closest('.delete-product-btn');
        if (deleteBtn) {
            if (confirm('Are you sure you want to remove this design?')) {
                EmployeeActions.deleteProduct(deleteBtn.dataset.id).then(success => {
                    if (success) {
                        showToast('Design removed');
                        window.dispatchEvent(new Event('productsUpdated'));
                    } else {
                        showToast('Failed to remove design');
                    }
                });
            }
        }

        if (e.target.id === 'settings-save-btn') {
            const username = document.getElementById('settings-username').value;
            const email = document.getElementById('settings-email').value;
            
            AuthManager.updateProfile({ username, email })
                .then(() => {
                    showToast('Profile updated successfully');
                    updateUI();
                })
                .catch(err => {
                    showToast(err.message);
                });
        }

        // Admin User Edit Handler
        const editUserBtn = e.target.closest('.edit-user-btn');
        if (editUserBtn) {
            const data = editUserBtn.dataset;
            const form = document.getElementById('create-staff-form');
            form.dataset.mode = 'edit';
            form.dataset.id = data.id;
            
            document.getElementById('staff-username').value = data.username;
            document.getElementById('staff-email').value = data.email;
            document.getElementById('staff-role').value = data.role;
            
            // Clear password field and show it so admin can supply a new one.
            const passInput = document.getElementById('staff-password');
            passInput.value = '';
            passInput.placeholder = 'Leave blank to retain original';
            
            const passField = passInput.closest('.input-group');
            if (passField) passField.style.display = 'block';
            
            document.querySelector('#staff-modal h3').innerText = 'Edit User Account';
            UI.toggleModal('staff-modal');
        }
    });

    // --- Batch Select All Logic ---
    document.addEventListener('change', (e) => {
        if (e.target.id === 'admin-select-all-orders' || e.target.id === 'employee-select-all-orders') {
            const isChecked = e.target.checked;
            document.querySelectorAll('.order-select-checkbox').forEach(cb => cb.checked = isChecked);
        }
    });

    // --- Batch Update Execute Logic ---
    document.addEventListener('click', async (e) => {
        const batchBtn = e.target.id === 'admin-batch-update-btn' ? e.target : (e.target.id === 'employee-batch-update-btn' ? e.target : null);
        if (batchBtn) {
            const role = batchBtn.id.startsWith('admin') ? 'admin' : 'employee';
            const statusSelect = document.getElementById(`${role}-batch-status`);
            const status = statusSelect.value;
            
            if (!status) return showToast('Please select a status first');
            
            const selectedIds = Array.from(document.querySelectorAll('.order-select-checkbox:checked')).map(cb => cb.dataset.id);
            if (selectedIds.length === 0) return showToast('No orders selected');
            
            if (confirm(`Update ${selectedIds.length} orders to "${status}"?`)) {
                const success = await Actions.batchUpdateStatus(selectedIds, status);
                if (success) {
                    statusSelect.value = '';
                    const selectAllEl = document.getElementById(`${role}-select-all-orders`);
                    if (selectAllEl) selectAllEl.checked = false;
                    updateUI();
                }
            }
        }
    });

    // Order Edit Form Listener (Added globally to handle submissions correctly)
    const orderEditForm = document.getElementById('edit-order-form');
    if (orderEditForm && !orderEditForm.dataset.listener) {
        orderEditForm.dataset.listener = 'true';
        orderEditForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = orderEditForm.dataset.id;
            const orderData = {
                client: document.getElementById('edit-order-client').value,
                design: document.getElementById('edit-order-design').value,
                status: document.getElementById('edit-order-status').value,
                progress: parseInt(document.getElementById('edit-order-progress').value)
            };
            
            const success = await Actions.updateOrder(id, orderData);
            if (success) {
                showToast('Order updated successfully');
                UI.toggleModal('edit-order-modal');
            } else {
                showToast('Update failed');
            }
        });
    }
});

// --- Service Worker Registration for PWA ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('[PWA] Service Worker Registered', reg.scope))
            .catch(err => console.log('[PWA] Service Worker Registration Failed', err));
    });
}

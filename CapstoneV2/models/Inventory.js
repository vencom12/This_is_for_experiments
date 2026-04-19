const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
    item: { type: String, required: true, unique: true },
    count: { type: Number, default: 0 },
    unit: { type: String, default: 'Cones' },
    lastUpdated: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Inventory', inventorySchema);

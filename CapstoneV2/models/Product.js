const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    tag: { type: String, default: 'General' },
    description: { type: String },
    imageUrl: { type: String, default: 'https://via.placeholder.com/200' },
    createdAt: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model('Product', productSchema);

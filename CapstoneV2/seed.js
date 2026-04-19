const mongoose = require('mongoose');
const Product = require('./models/Product');
require('dotenv').config();

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/Ryven';

async function seed() {
    try {
        await mongoose.connect(uri);
        console.log('Connected to MongoDB for seeding.');

        await Product.deleteMany({});
        
        const products = [
            {
                name: 'Golden Fleur',
                price: 24.99,
                tag: 'Premium Floral',
                description: 'Intricate floral pattern with high-density metallic thread finish.',
                imageUrl: 'https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=500'
            },
            {
                name: 'Cyber Shield',
                price: 18.50,
                tag: 'Tech & Geometric',
                description: 'Modern minimalist geometric crest optimized for tech apparel.',
                imageUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=500'
            },
            {
                name: 'Vintage Rose',
                price: 22.00,
                tag: 'Vintage Style',
                description: 'Classic hand-stitch embroidery look for denim and jackets.',
                imageUrl: 'https://images.unsplash.com/photo-1591123120675-6f7f1aae0e5b?w=500'
            },
            {
                name: 'Neon Pulse',
                price: 29.00,
                tag: 'Neon Effects',
                description: 'Vibrant neon-style threads for high-contrast headwear designs.',
                imageUrl: 'https://images.unsplash.com/photo-1557683316-973673baf926?w=500'
            }
        ];

        await Product.insertMany(products);
        console.log('Seeding complete. Added 4 designs.');
        process.exit(0);
    } catch (err) {
        console.error('Seeding failed:', err);
        process.exit(1);
    }
}

seed();

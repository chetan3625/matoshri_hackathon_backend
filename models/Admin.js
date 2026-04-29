const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, enum: ['admin', 'super_admin'], default: 'admin' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Admin', adminSchema);

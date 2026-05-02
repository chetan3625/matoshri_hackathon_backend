const mongoose = require('mongoose');

const systemLogSchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now },
    level: { type: String, enum: ['INFO', 'WARN', 'ERROR'], default: 'INFO' },
    module: { type: String, required: true },
    message: { type: String, required: true },
    details: { type: mongoose.Schema.Types.Mixed },
    admin: { type: String }, 
    ip: { type: String },
    method: { type: String },
    path: { type: String }
});

module.exports = mongoose.model('SystemLog', systemLogSchema);

const mongoose = require('mongoose');

const certificateLogSchema = new mongoose.Schema({
    teamName: String,
    memberName: String,
    email: String,
    rank: String,
    status: { type: String, enum: ['Sent', 'Failed'] },
    error: String,
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('CertificateLog', certificateLogSchema);

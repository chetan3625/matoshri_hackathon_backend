const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true }
});

const teamSchema = new mongoose.Schema({
    teamId: { type: String, required: true, unique: true },
    teamName: { type: String, required: true, unique: true },
    members: [memberSchema],
    projectTitle: { type: String, required: true },
    problemStatement: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Team', teamSchema);

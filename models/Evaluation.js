const mongoose = require('mongoose');

const scoreSchema = new mongoose.Schema({
    originality: { type: Number, default: 0, min: 0, max: 10 },
    technical: { type: Number, default: 0, min: 0, max: 20 },
    presentation: { type: Number, default: 0, min: 0, max: 10 },
    impact: { type: Number, default: 0, min: 0, max: 10 },
    total: { type: Number, default: 0 }
}, { _id: false });

const evaluationSchema = new mongoose.Schema({
    teamId: { type: String, required: true, unique: true },
    supervisorEvaluations: {
        type: Map,
        of: scoreSchema,
        default: {}
    },

    totalScore: { type: Number, required: true, default: 0 }, // Average out of 50
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Evaluation', evaluationSchema);

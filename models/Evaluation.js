const mongoose = require('mongoose');

const scoreSchema = new mongoose.Schema({
    idea: { type: Number, default: 0, min: 0, max: 20 },
    speech: { type: Number, default: 0, min: 0, max: 20 },
    problemSolution: { type: Number, default: 0, min: 0, max: 20 },
    presentation: { type: Number, default: 0, min: 0, max: 20 },
    futureScope: { type: Number, default: 0, min: 0, max: 20 },
    total: { type: Number, default: 0 }
}, { _id: false });

const evaluationSchema = new mongoose.Schema({
    teamId: { type: String, required: true, unique: true },
    supervisorEvaluations: {
        admin1: scoreSchema,
        admin2: scoreSchema,
        admin3: scoreSchema,
        admin: scoreSchema
    },
    totalScore: { type: Number, required: true, default: 0 }, // Normalized out of 100
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Evaluation', evaluationSchema);

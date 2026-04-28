const mongoose = require('mongoose');

const evaluationSchema = new mongoose.Schema({
    teamId: { type: String, required: true, unique: true },
    scores: {
        idea: { type: Number, required: true, min: 0, max: 10 },
        speech: { type: Number, required: true, min: 0, max: 10 },
        problemSolution: { type: Number, required: true, min: 0, max: 10 },
        presentation: { type: Number, required: true, min: 0, max: 10 },
        futureScope: { type: Number, required: true, min: 0, max: 10 }
    },
    totalScore: { type: Number, required: true, default: 0 },
    evaluatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Evaluation', evaluationSchema);

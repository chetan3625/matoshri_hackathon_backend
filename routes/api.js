const express = require('express');
const router = express.Router();
const axios = require('axios');
const Team = require('../models/Team');
const Evaluation = require('../models/Evaluation');

// Generate unique Team ID function
const generateTeamId = () => {
    return 'TEAM-' + Math.random().toString(36).substring(2, 8).toUpperCase();
};

// POST /register-team
router.post('/register-team', async (req, res) => {
    try {
        const { teamName, members, projectTitle, problemStatement } = req.body;
        
        // Check for duplicate team name
        const existingTeam = await Team.findOne({ teamName });
        if (existingTeam) {
            return res.status(400).json({ error: 'Team name already exists' });
        }

        const teamId = generateTeamId();
        
        const newTeam = new Team({
            teamId,
            teamName,
            members,
            projectTitle,
            problemStatement
        });

        await newTeam.save();

        // Dummy n8n webhook call (non-blocking)
        if (process.env.N8N_WEBHOOK_URL) {
            axios.post(process.env.N8N_WEBHOOK_URL, {
                event: 'team_registered',
                teamId: newTeam.teamId,
                teamName: newTeam.teamName,
                emails: members.map(m => m.email)
            }).catch(err => console.error('n8n webhook error:', err.message));
        }

        res.status(201).json({ message: 'Team registered successfully', team: newTeam });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /team/:id
router.get('/team/:id', async (req, res) => {
    try {
        const teamId = req.params.id;
        const team = await Team.findOne({ teamId });
        
        if (!team) {
            return res.status(404).json({ error: 'Team not found' });
        }

        const evaluation = await Evaluation.findOne({ teamId });

        res.json({
            team,
            evaluation: evaluation || null
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /evaluate-team
router.post('/evaluate-team', async (req, res) => {
    try {
        const { teamId, scores } = req.body;
        
        // Validate team exists
        const team = await Team.findOne({ teamId });
        if (!team) {
            return res.status(404).json({ error: 'Team not found' });
        }

        // Calculate total score
        const { idea, speech, problemSolution, presentation, futureScope } = scores;
        const totalScore = idea + speech + problemSolution + presentation + futureScope;

        // Upsert evaluation
        const evaluation = await Evaluation.findOneAndUpdate(
            { teamId },
            { scores, totalScore, evaluatedAt: new Date() },
            { new: true, upsert: true }
        );

        res.json({ message: 'Evaluation saved successfully', evaluation });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /top-teams
router.get('/top-teams', async (req, res) => {
    try {
        // Find top 3 evaluations by total score
        const topEvaluations = await Evaluation.find()
            .sort({ totalScore: -1 })
            .limit(3);

        if (topEvaluations.length === 0) {
            return res.json({ topTeams: [] });
        }

        // Fetch team details for these evaluations
        const teamIds = topEvaluations.map(e => e.teamId);
        const teams = await Team.find({ teamId: { $in: teamIds } });

        // Map evaluations to team names and combine
        const topTeams = topEvaluations.map(eval => {
            const team = teams.find(t => t.teamId === eval.teamId);
            return {
                teamId: eval.teamId,
                teamName: team ? team.teamName : 'Unknown',
                totalScore: eval.totalScore,
                scores: eval.scores
            };
        });

        // Trigger n8n for winners if needed (this could be a separate route, but we'll do it here for the sake of example if requested, 
        // though the prompt says "trigger only once", so typically it might be a separate action. We'll just provide the data here)

        res.json({ topTeams });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /all-teams
router.get('/all-teams', async (req, res) => {
    try {
        const teams = await Team.find().lean();
        const evaluations = await Evaluation.find().lean();
        
        // Merge evaluations into teams
        const merged = teams.map(team => {
            const eval = evaluations.find(e => e.teamId === team.teamId);
            return {
                ...team,
                evaluation: eval || null
            };
        });

        res.json({ teams: merged });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;

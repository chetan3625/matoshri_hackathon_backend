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

        // n8n Registration webhook call (non-blocking)
        if (process.env.N8N_REGISTRATION_WEBHOOK) {
            axios.post(process.env.N8N_REGISTRATION_WEBHOOK, {
                event: 'team_registered',
                teamId: newTeam.teamId,
                teamName: newTeam.teamName,
                members: members.map(m => ({
                    name: m.name,
                    email: m.email
                }))
            }).catch(err => console.error('n8n registration webhook error:', err.message));
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
        const { teamId, scores, supervisorId } = req.body;
        console.log(`Evaluating team ${teamId} for supervisor ${supervisorId}`);
        
        if (!['admin1', 'admin2', 'admin3', 'admin'].includes(supervisorId)) {
            return res.status(400).json({ error: 'Invalid supervisor ID' });
        }

        const team = await Team.findOne({ teamId });
        if (!team) {
            return res.status(404).json({ error: 'Team not found' });
        }

        const { idea, speech, problemSolution, presentation, futureScope } = scores;
        const supervisorTotal = Number(idea) + Number(speech) + Number(problemSolution) + Number(presentation) + Number(futureScope);

        let evaluation = await Evaluation.findOne({ teamId });
        if (!evaluation) {
            evaluation = new Evaluation({ teamId });
        }

        // Initialize if empty
        if (!evaluation.supervisorEvaluations) {
            evaluation.supervisorEvaluations = {};
        }

        evaluation.supervisorEvaluations[supervisorId] = {
            idea, speech, problemSolution, presentation, futureScope,
            total: supervisorTotal
        };

        // Mark as modified for dynamic keys
        evaluation.markModified('supervisorEvaluations');

        const evals = evaluation.supervisorEvaluations;
        const totalRaw = (evals.admin1?.total || 0) + 
                         (evals.admin2?.total || 0) + 
                         (evals.admin3?.total || 0) + 
                         (evals.admin?.total || 0);
        
        // Use divisor 300 since each supervisor is 100 max
        evaluation.totalScore = Math.round((totalRaw / 300) * 100);
        evaluation.updatedAt = new Date();

        await evaluation.save();
        res.json({ message: 'Evaluation saved successfully', evaluation });
    } catch (error) {
        console.error('Evaluation Error Details:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
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
        const topTeams = topEvaluations.map(teamEval => {
            const team = teams.find(t => t.teamId === teamEval.teamId);
            return {
                teamId: teamEval.teamId,
                teamName: team ? team.teamName : 'Unknown',
                totalScore: teamEval.totalScore,
                scores: teamEval.scores
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
            const teamEval = evaluations.find(e => e.teamId === team.teamId);
            return {
                ...team,
                evaluation: teamEval || null
            };
        });

        res.json({ teams: merged });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /distribute-certificates
router.post('/distribute-certificates', async (req, res) => {
    try {
        if (!process.env.N8N_CERTIFICATE_WEBHOOK) {
            return res.status(400).json({ error: 'Certificate webhook URL not configured' });
        }

        const teams = await Team.find().lean();
        const evaluations = await Evaluation.find().lean();

        // Sort evaluations by score descending
        const sortedEvaluations = [...evaluations].sort((a, b) => b.totalScore - a.totalScore);
        
        // Map teamId -> Rank
        const rankMap = {};
        for (let i = 0; i < sortedEvaluations.length; i++) {
            const tId = sortedEvaluations[i].teamId;
            if (i === 0) rankMap[tId] = '1st';
            else if (i === 1) rankMap[tId] = '2nd';
            else if (i === 2) rankMap[tId] = '3rd';
            else rankMap[tId] = 'Participated';
        }

        let emailCount = 0;

        // Iterate all teams and members
        teams.forEach(team => {
            // Teams that never got evaluated will just get 'Participated'
            const rank = rankMap[team.teamId] || 'Participated';
            
            team.members.forEach(member => {
                const payload = {
                    memberName: member.name,
                    email: member.email,
                    teamName: team.teamName,
                    teamId: team.teamId,
                    rank: rank
                };

                // Fire off an individual webhook POST per member
                axios.post(process.env.N8N_CERTIFICATE_WEBHOOK, payload)
                    .catch(err => console.error(`n8n certificate webhook error for ${member.email}:`, err.message));
                
                emailCount++;
            });
        });

        res.json({ message: 'Certificate distribution triggered successfully', emailsQueued: emailCount });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;

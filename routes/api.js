const express = require('express');
const router = express.Router();
const axios = require('axios');
const Team = require('../models/Team');
const Evaluation = require('../models/Evaluation');
const Admin = require('../models/Admin');
const Settings = require('../models/Settings');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Auth Middleware
const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) throw new Error();
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
        const admin = await Admin.findById(decoded.id);
        if (!admin) throw new Error();
        req.admin = admin;
        next();
    } catch (e) {
        res.status(401).json({ error: 'Please authenticate' });
    }
};

// Super Admin Middleware
const superAdminAuth = (req, res, next) => {
    if (req.admin.role !== 'super_admin') {
        return res.status(403).json({ error: 'Access denied. Super Admin only.' });
    }
    next();
};

// Generate unique Team ID function
const generateTeamId = () => {
    return 'TEAM-' + Math.random().toString(36).substring(2, 8).toUpperCase();
};

// POST /admin/login
router.post('/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const admin = await Admin.findOne({ username });
        if (!admin || !(await bcrypt.compare(password, admin.password))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const token = jwt.sign({ id: admin._id, role: admin.role }, process.env.JWT_SECRET || 'your_jwt_secret', { expiresIn: '24h' });
        res.json({ admin: { id: admin._id, username: admin.username, name: admin.name, role: admin.role }, token });
    } catch (error) {
        res.status(500).json({ error: 'Login failed' });
    }
});

// POST /register-team
router.post('/register-team', async (req, res) => {
    try {
        const { teamName, members, projectTitle, problemStatement } = req.body;
        
        if (members && members.length > 4) {
            return res.status(400).json({ error: 'Maximum 4 team members allowed' });
        }
        
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

        // Check if results are published
        const settings = await Settings.findOne();
        const isPublished = settings ? settings.isResultPublished : false;

        // Allow admins to see evaluation even if not published
        const authHeader = req.header('Authorization');
        let isAdmin = false;
        if (authHeader) {
            try {
                const token = authHeader.replace('Bearer ', '');
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
                const admin = await Admin.findById(decoded.id);
                if (admin) isAdmin = true;
            } catch (e) {}
        }

        // Calculate average scores if not an admin (public view)
        let publicScores = null;
        if (evaluation && evaluation.supervisorEvaluations) {
            const evals = Array.from(evaluation.supervisorEvaluations.values());
            if (evals.length > 0) {
                publicScores = {
                    originality: Math.round(evals.reduce((sum, e) => sum + (e.originality || 0), 0) / evals.length),
                    technical: Math.round(evals.reduce((sum, e) => sum + (e.technical || 0), 0) / evals.length),
                    presentation: Math.round(evals.reduce((sum, e) => sum + (e.presentation || 0), 0) / evals.length),
                    impact: Math.round(evals.reduce((sum, e) => sum + (e.impact || 0), 0) / evals.length),
                };
            }
        }

        res.json({
            team,
            evaluation: (evaluation && (isPublished || isAdmin)) ? {
                ...evaluation.toObject(),
                scores: publicScores
            } : null,
            isPublished
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
        
        if (!supervisorId) {
            return res.status(400).json({ error: 'Supervisor ID is required' });
        }

        const team = await Team.findOne({ teamId });
        if (!team) {
            return res.status(404).json({ error: 'Team not found' });
        }

        const { originality, technical, presentation, impact } = scores;
        const supervisorTotal = Number(originality) + Number(technical) + Number(presentation) + Number(impact);

        let evaluation = await Evaluation.findOne({ teamId });
        if (!evaluation) {
            evaluation = new Evaluation({ teamId });
        }

        // Set evaluation using Map.set()
        evaluation.supervisorEvaluations.set(supervisorId, {
            originality, technical, presentation, impact,
            total: supervisorTotal
        });

        // Calculate total score based on the total number of registered admins
        const totalRaw = Array.from(evaluation.supervisorEvaluations.values())
            .reduce((sum, evalData) => sum + (evalData.total || 0), 0);
        
        // Count all admins who can evaluate (role: 'admin')
        const totalAdminsCount = await Admin.countDocuments({ role: 'admin' });
        
        // Check if the superadmin has also evaluated this team
        const superAdminEvaluated = evaluation.supervisorEvaluations.has('superadmin');
        
        // The total number of judges for this specific team
        const totalJudges = totalAdminsCount + (superAdminEvaluated ? 1 : 0);
        
        // Final score is the sum of points divided by the total potential judges (N admins + superadmin if they voted)
        evaluation.totalScore = totalJudges > 0 ? Math.round(totalRaw / totalJudges) : 0;


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
        // Check if results are published
        const settings = await Settings.findOne();
        const isPublished = settings ? settings.isResultPublished : false;

        // Allow super admin and admins to see results even if not published
        const authHeader = req.header('Authorization');
        let isAdmin = false;
        if (authHeader) {
            try {
                const token = authHeader.replace('Bearer ', '');
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
                const admin = await Admin.findById(decoded.id);
                if (admin) isAdmin = true;
            } catch (e) {
                // Not an admin or invalid token
            }
        }

        if (!isPublished && !isAdmin) {
            return res.json({ topTeams: [], message: 'Results are not published yet.' });
        }

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
            
            // Calculate average scores for top teams display
            const evals = Array.from(teamEval.supervisorEvaluations.values());
            const avgScores = evals.length > 0 ? {
                originality: Math.round(evals.reduce((sum, e) => sum + (e.originality || 0), 0) / evals.length),
                technical: Math.round(evals.reduce((sum, e) => sum + (e.technical || 0), 0) / evals.length),
                presentation: Math.round(evals.reduce((sum, e) => sum + (e.presentation || 0), 0) / evals.length),
                impact: Math.round(evals.reduce((sum, e) => sum + (e.impact || 0), 0) / evals.length),
            } : null;

            return {
                teamId: teamEval.teamId,
                teamName: team ? team.teamName : 'Unknown',
                totalScore: teamEval.totalScore,
                scores: avgScores
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

// --- Super Admin Admin Management ---

// GET /admins (Super Admin only)
router.get('/admins', auth, superAdminAuth, async (req, res) => {
    try {
        const admins = await Admin.find({}, '-password');
        res.json(admins);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /admins (Super Admin only)
router.post('/admins', auth, superAdminAuth, async (req, res) => {
    try {
        const { username, password, name, role } = req.body;
        
        if (!username || !password || !name) {
            return res.status(400).json({ error: 'Username, password, and name are required' });
        }

        const existingAdmin = await Admin.findOne({ username });
        if (existingAdmin) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newAdmin = new Admin({ username, password: hashedPassword, name, role: role || 'admin' });
        await newAdmin.save();
        res.status(201).json({ message: 'Admin created successfully', admin: { username, name, role } });
    } catch (error) {
        res.status(400).json({ error: 'Error creating admin', details: error.message });
    }
});

// PUT /admins/:id (Super Admin only)
router.put('/admins/:id', auth, superAdminAuth, async (req, res) => {
    try {
        const { username, name, role, password } = req.body;
        const updateData = { username, name, role };
        if (password) {
            updateData.password = await bcrypt.hash(password, 10);
        }
        const updatedAdmin = await Admin.findByIdAndUpdate(req.params.id, updateData, { new: true }).select('-password');
        if (!updatedAdmin) return res.status(404).json({ error: 'Admin not found' });
        res.json({ message: 'Admin updated successfully', admin: updatedAdmin });
    } catch (error) {
        res.status(400).json({ error: 'Error updating admin' });
    }
});

// DELETE /admins/:id (Super Admin only)
router.delete('/admins/:id', auth, superAdminAuth, async (req, res) => {
    try {
        const deletedAdmin = await Admin.findByIdAndDelete(req.params.id);
        if (!deletedAdmin) return res.status(404).json({ error: 'Admin not found' });
        res.json({ message: 'Admin deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Error deleting admin' });
    }
});

// --- Super Admin Team Management ---

// POST /admin/add-team (Super Admin only)
router.post('/admin/add-team', auth, superAdminAuth, async (req, res) => {
    try {
        const { teamName, members, projectTitle, problemStatement } = req.body;
        
        // Check for duplicate team name
        const existingTeam = await Team.findOne({ teamName });
        if (existingTeam) {
            return res.status(400).json({ error: 'Team name already exists' });
        }

        const teamId = generateTeamId();
        const newTeam = new Team({ teamId, teamName, members, projectTitle, problemStatement });
        await newTeam.save();

        res.status(201).json({ message: 'Team added successfully by Super Admin', team: newTeam });
    } catch (error) {
        res.status(500).json({ error: 'Error adding team' });
    }
});

// DELETE /team/:id (Super Admin only)

router.delete('/team/:id', auth, superAdminAuth, async (req, res) => {
    try {
        const teamId = req.params.id;
        const team = await Team.findOneAndDelete({ teamId });
        if (!team) return res.status(404).json({ error: 'Team not found' });
        
        // Also delete evaluation if exists
        await Evaluation.findOneAndDelete({ teamId });
        
        res.json({ message: 'Team and its evaluations deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Error deleting team' });
    }
});

// --- Settings Management ---

// GET /settings (Public)
router.get('/settings', async (req, res) => {
    try {
        let settings = await Settings.findOne();
        if (!settings) {
            settings = new Settings({ isResultPublished: false });
            await settings.save();
        }
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching settings' });
    }
});

// POST /settings (Super Admin only)
router.post('/settings', auth, superAdminAuth, async (req, res) => {
    try {
        const { isResultPublished } = req.body;
        let settings = await Settings.findOne();
        if (!settings) {
            settings = new Settings({ isResultPublished });
        } else {
            settings.isResultPublished = isResultPublished;
            settings.updatedAt = new Date();
        }
        await settings.save();
        res.json({ message: 'Settings updated successfully', settings });
    } catch (error) {
        res.status(500).json({ error: 'Error updating settings' });
    }
});

module.exports = router;

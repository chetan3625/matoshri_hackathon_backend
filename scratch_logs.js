const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Team = require('./models/Team');
const Evaluation = require('./models/Evaluation');

dotenv.config();

async function generateLogs() {
    await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    
    const teams = await Team.find().lean();
    const evaluations = await Evaluation.find().lean();

    const sortedEvaluations = [...evaluations].sort((a, b) => b.totalScore - a.totalScore);
    
    const rankMap = {};
    for (let i = 0; i < sortedEvaluations.length; i++) {
        const tId = sortedEvaluations[i].teamId;
        if (i === 0) rankMap[tId] = '1st';
        else if (i === 1) rankMap[tId] = '2nd';
        else if (i === 2) rankMap[tId] = '3rd';
        else rankMap[tId] = 'Participated';
    }

    let markdown = '# Certificate Distribution Logs\n\n';
    markdown += '| Team Name | Member Name | Email ID | Certificate Rank |\n';
    markdown += '|-----------|-------------|----------|------------------|\n';

    for (const team of teams) {
        const rank = rankMap[team.teamId] || 'Participated';
        for (const member of team.members) {
            markdown += `| ${team.teamName} | ${member.name} | ${member.email} | ${rank} |\n`;
        }
    }

    console.log(markdown);
    process.exit(0);
}

generateLogs().catch(err => {
    console.error(err);
    process.exit(1);
});


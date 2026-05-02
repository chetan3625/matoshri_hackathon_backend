const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const apiRoutes = require('./routes/api');
const Admin = require('./models/Admin');
const bcrypt = require('bcryptjs');
const logger = require('./utils/logger');


dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Request Logging Middleware
app.use((req, res, next) => {
    if (req.path !== '/ping') {
        const admin = req.header('Authorization') ? 'Authenticated User' : 'Guest';
        logger.info('API_REQUEST', `${req.method} ${req.path}`, null, admin, req.ip, req.method, req.path);
    }
    next();
});

// Database connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => {
    console.log('Connected to MongoDB');
    logger.info('SYSTEM', 'Database connected successfully');
    seedSuperAdmin();
}).catch(err => {
    console.error('MongoDB connection error:', err);
    logger.error('SYSTEM', 'Database connection failed', err.message);
});

// Seed Super Admin
async function seedSuperAdmin() {
    try {
        const superAdminExists = await Admin.findOne({ username: 'superadmin' });
        if (!superAdminExists) {
            const hashedPassword = await bcrypt.hash('pass@123', 10);
            const superAdmin = new Admin({
                username: 'superadmin',
                password: hashedPassword,
                name: 'Super Admin',
                role: 'super_admin'
            });
            await superAdmin.save();
            console.log('Super Admin seeded successfully');
        }
    } catch (error) {
        console.error('Error seeding Super Admin:', error);
    }
}


// Routes
app.get('/ping', (req, res) => {
    res.status(200).send('Server alive');
});

app.use('/api', apiRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

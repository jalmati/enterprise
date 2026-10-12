const express = require('express');
const axios = require('axios');
const session = require('express-session');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware configuration
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'jalmatifpc_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true if deployed on HTTPS
}));

// Admin whitelist (GitHub handles permitted to access Admin ERP Control Panel)
const ADMIN_WHITELIST = ['someswar-ghosh-admin']; 

// In-memory data store (Replace with PostgreSQL/MySQL/MongoDB in production)
const fpcDatabase = {
    producers: [],
    admins: ADMIN_WHITELIST
};

// 1. Initiate GitHub Login Route
app.get('/auth/github', (req, res) => {
    const roleTarget = req.query.role || 'producer'; // 'admin' or 'producer'
    req.session.targetRole = roleTarget;
    
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&redirect_uri=http://localhost:${PORT}/auth/github/callback&scope=user:email`;
    res.redirect(githubAuthUrl);
});

// 2. GitHub OAuth Callback Route
app.get('/auth/github/callback', async (req, res) => {
    const { code } = req.query;

    if (!code) {
        return res.status(400).send('Authorization code missing from GitHub.');
    }

    try {
        // Exchange auth code for GitHub access token
        const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
            client_id: process.env.GITHUB_CLIENT_ID,
            client_secret: process.env.GITHUB_CLIENT_SECRET,
            code: code
        }, {
            headers: { Accept: 'application/json' }
        });

        const accessToken = tokenResponse.data.access_token;
        if (!accessToken) {
            return res.status(401).send('Failed to retrieve access token from GitHub.');
        }

        // Fetch user profile from GitHub API
        const userResponse = await axios.get('https://api.github.com/user', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        const gitHubUser = userResponse.data;

        // RBAC Verification
        let assignedRole = 'producer';
        
        if (fpcDatabase.admins.includes(gitHubUser.login)) {
            assignedRole = 'admin';
        } else {
            // Auto-register producer if not already present
            let existingProducer = fpcDatabase.producers.find(p => p.githubId === gitHubUser.id);
            if (!existingProducer) {
                fpcDatabase.producers.push({
                    id: Date.now().toString(36),
                    githubId: gitHubUser.id,
                    username: gitHubUser.login,
                    name: gitHubUser.name || gitHubUser.login,
                    joinedDate: new Date().toISOString().split('T')[0],
                    status: 'active_member'
                });
            }
        }

        // Save session details
        req.session.user = {
            githubId: gitHubUser.id,
            username: gitHubUser.login,
            name: gitHubUser.name || gitHubUser.login,
            avatar: gitHubUser.avatar_url,
            role: assignedRole
        };

        // Redirect based on assigned role
        if (assignedRole === 'admin') {
            res.redirect('/admin/dashboard');
        } else {
            res.redirect('/producer/portal');
        }

    } catch (error) {
        console.error('GitHub OAuth Error:', error.response?.data || error.message);
        res.status(500).send('Authentication failed during GitHub token exchange.');
    }
});

// 3. Protected Admin ERP Dashboard
app.get('/admin/dashboard', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).send('Access Denied: Administrator privileges required. <a href="/auth/github?role=admin">Login as Admin</a>');
    }
    res.send(`
        <div style="font-family: Arial; padding: 40px; background: #f3f7f4; color: #10452f;">
            <h1>Jalmati Farmers Producer Company Limited</h1>
            <h2>Admin ERP Control Panel</h2>
            <p>Welcome, <strong>${req.session.user.name}</strong> (@${req.session.user.username})</p>
            <hr/>
            <p><strong>Registered Producers Count:</strong> ${fpcDatabase.producers.length}</p>
            <p><a href="/api/producers">View Producers JSON Data</a> | <a href="/auth/logout">Sign Out</a></p>
        </div>
    `);
});

// 4. Protected Producer Member Portal
app.get('/producer/portal', (req, res) => {
    if (!req.session.user) {
        return res.status(401).send('Please authenticate first. <a href="/auth/github?role=producer">Login with GitHub</a>');
    }
    res.send(`
        <div style="font-family: Arial; padding: 40px; background: #f3f7f4; color: #176b45;">
            <h1>Jalmati Farmers Producer Company Limited</h1>
            <h2>Producer Member Portal</h2>
            <p>Welcome, <strong>${req.session.user.name}</strong> (@${req.session.user.username})</p>
            <p>Murshidabad Hub Member Dashboard (CIN: U01611WR2026PTC293091)</p>
            <hr/>
            <p><a href="/auth/logout">Sign Out</a></p>
        </div>
    `);
});

// 5. API endpoint to list registered producers (Admin only)
app.get('/api/producers', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    res.json(fpcDatabase.producers);
});

// 6. Logout Route
app.get('/auth/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// Home Page Gateway
app.get('/', (req, res) => {
    res.send(`
        <div style="font-family: Arial; text-align: center; padding: 60px;">
            <h2>Jalmati Farmers Producer Company Limited</h2>
            <p>CIN: U01611WR2026PTC293091 | Murshidabad, West Bengal</p>
            <div style="margin-top: 30px;">
                <a href="/auth/github?role=producer" style="background: #176b45; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-right: 15px; font-weight: bold;">Login as Producer (GitHub)</a>
                <a href="/auth/github?role=admin" style="background: #10452f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Login as Admin (GitHub)</a>
            </div>
        </div>
    `);
});

app.listen(PORT, () => {
    console.log(`Jalmati FPC Backend server running on http://localhost:${PORT}`);
});

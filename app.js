// Force Node.js to accept self-signed certificates
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.PGSSLMODE = 'no-verify';

const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Session configuration for login
app.use(session({
    secret: 'event-registration-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Clean DATABASE_URL
const cleanDatabaseUrl = (process.env.DATABASE_URL || '')
  .replace(/([?&])sslmode=[^&]*/gi, '$1')
  .replace(/[?&]$/, '')
  .replace(/\?&/, '?');

const pool = new Pool({
  connectionString: cleanDatabaseUrl,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
  } else {
    console.log('✅ Connected to PostgreSQL successfully!');
    release();
  }
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Authentication middleware
function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
}

// ============ SETUP ROUTE ============
app.get('/setup', async (req, res) => {
    try {
        const createTablesSQL = `
            -- Drop existing tables if they exist (clean setup)
            DROP TABLE IF EXISTS Registration CASCADE;
            DROP TABLE IF EXISTS Event CASCADE;
            DROP TABLE IF EXISTS Category CASCADE;
            DROP TABLE IF EXISTS Venue CASCADE;
            DROP TABLE IF EXISTS "User" CASCADE;
            
            -- Create User table
            CREATE TABLE "User" (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(20) DEFAULT 'user',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            -- Create Category table
            CREATE TABLE Category (
                id SERIAL PRIMARY KEY,
                name VARCHAR(50) UNIQUE NOT NULL,
                description TEXT
            );
            
            -- Create Venue table
            CREATE TABLE Venue (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                address TEXT NOT NULL,
                capacity INT NOT NULL,
                contact_person VARCHAR(100)
            );
            
            -- Create Event table
            CREATE TABLE Event (
                id SERIAL PRIMARY KEY,
                name VARCHAR(200) NOT NULL,
                description TEXT,
                event_date DATE NOT NULL,
                event_time TIME NOT NULL,
                capacity INT NOT NULL,
                current_registrations INT DEFAULT 0,
                status VARCHAR(20) DEFAULT 'open',
                venue_id INT REFERENCES Venue(id) ON DELETE SET NULL,
                category_id INT REFERENCES Category(id) ON DELETE SET NULL,
                organizer_id INT REFERENCES "User"(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            -- Create Registration table
            CREATE TABLE Registration (
                id SERIAL PRIMARY KEY,
                user_id INT REFERENCES "User"(id) ON DELETE CASCADE,
                event_id INT REFERENCES Event(id) ON DELETE CASCADE,
                status VARCHAR(20) DEFAULT 'registered',
                registration_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, event_id)
            );
            
            -- Insert Categories
            INSERT INTO Category (name, description) VALUES
                ('Conference', 'Professional conferences and seminars with industry experts'),
                ('Workshop', 'Hands-on training sessions and practical learning'),
                ('Social', 'Networking events and social gatherings'),
                ('Webinar', 'Online virtual events accessible from anywhere'),
                ('Seminar', 'Educational seminars and presentations');
            
            -- Insert Venues
            INSERT INTO Venue (name, address, capacity, contact_person) VALUES
                ('Convention Center Hall A', '123 Main Street, Toronto, ON M5V 1K3', 500, 'John Smith'),
                ('Tech Hub Meeting Room', '456 Queen Street West, Toronto, ON M5V 2B4', 50, 'Sarah Johnson'),
                ('University Auditorium', '789 College Street, Toronto, ON M5T 1P9', 300, 'Mike Brown'),
                ('Downtown Conference Center', '100 King Street West, Toronto, ON M5X 1C9', 200, 'Lisa Anderson'),
                ('Virtual Platform', 'Online - Zoom Meeting', 1000, 'Tech Support');
            
            -- Insert Demo Users (password is 'password123' for all demo users)
            INSERT INTO "User" (name, email, password, role) VALUES
                ('John Doe', 'john@example.com', 'password123', 'user'),
                ('Jane Smith', 'jane@example.com', 'password123', 'user'),
                ('Mike Johnson', 'mike@example.com', 'password123', 'user'),
                ('Sarah Williams', 'sarah@example.com', 'password123', 'user'),
                ('Admin User', 'admin@events.com', 'admin123', 'admin');
            
            -- Insert Demo Events
            INSERT INTO Event (name, description, event_date, event_time, capacity, current_registrations, venue_id, category_id, organizer_id, status) VALUES
                ('Tech Conference 2026', 'Annual technology conference featuring AI, Cloud, and Cybersecurity experts. Network with industry leaders and attend workshops.', '2026-05-15', '09:00:00', 500, 45, 1, 1, 1, 'open'),
                ('React Workshop', 'Learn React from scratch - hands-on session. Build your first React application with experienced instructors.', '2026-04-20', '14:00:00', 50, 28, 2, 2, 1, 'open'),
                ('Networking Night', 'Meet industry professionals and expand your network. Great opportunity for career growth.', '2026-04-25', '18:30:00', 300, 67, 3, 3, 1, 'open'),
                ('Cloud Computing Webinar', 'Introduction to AWS and cloud concepts. Perfect for beginners.', '2026-05-05', '11:00:00', 100, 89, 5, 4, 1, 'open'),
                ('Data Science Seminar', 'Learn about data analytics, machine learning, and AI applications in business.', '2026-05-10', '10:00:00', 150, 34, 4, 5, 1, 'open'),
                ('UX Design Workshop', 'Hands-on workshop on user experience design principles and prototyping.', '2026-05-12', '13:00:00', 40, 12, 2, 2, 1, 'open'),
                ('Startup Pitch Night', 'Watch startup founders pitch their ideas to investors. Networking after the event.', '2026-05-18', '17:00:00', 200, 56, 3, 3, 1, 'closed'),
                ('Cybersecurity Conference', 'Latest trends in cybersecurity, ethical hacking, and data protection.', '2026-05-22', '09:30:00', 300, 78, 1, 1, 1, 'open');
            
            -- Insert Sample Registrations
            INSERT INTO Registration (user_id, event_id, status) VALUES
                (1, 1, 'registered'), (1, 2, 'registered'), (1, 4, 'registered'),
                (2, 1, 'registered'), (2, 3, 'registered'), (2, 5, 'registered'),
                (3, 2, 'registered'), (3, 4, 'registered'), (3, 6, 'registered'),
                (4, 1, 'registered'), (4, 3, 'registered'), (4, 7, 'registered');
        `;
        
        await pool.query(createTablesSQL);
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Setup Complete</title>
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
                    .container { background: white; padding: 40px; border-radius: 10px; max-width: 500px; margin: 0 auto; }
                    h1 { color: #28a745; }
                    .btn { display: inline-block; padding: 12px 24px; margin-top: 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>✅ Setup Complete!</h1>
                    <p>All tables have been created successfully!</p>
                    <p>📊 Demo data has been inserted.</p>
                    <p>👥 Demo Users:<br>
                    john@example.com / password123<br>
                    jane@example.com / password123<br>
                    admin@events.com / admin123</p>
                    <a href="/login" class="btn">Go to Login Page →</a>
                </div>
            </body>
            </html>
        `);
    } catch (err) {
        console.error('Setup error:', err);
        res.status(500).send('Setup error: ' + err.message);
    }
});

// ============ AUTHENTICATION ROUTES ============

app.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query(
            'SELECT * FROM "User" WHERE email = $1 AND password = $2',
            [email, password]
        );
        
        if (result.rows.length > 0) {
            req.session.user = {
                id: result.rows[0].id,
                name: result.rows[0].name,
                email: result.rows[0].email,
                role: result.rows[0].role
            };
            res.redirect('/');
        } else {
            res.render('login', { error: 'Invalid email or password. Try: john@example.com / password123' });
        }
    } catch (err) {
        console.error('Login error:', err);
        res.render('login', { error: 'Database error. Please try again.' });
    }
});

app.get('/register', (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.render('register', { error: null });
});

app.post('/register', async (req, res) => {
    const { name, email, password, confirm_password } = req.body;
    
    if (password !== confirm_password) {
        return res.render('register', { error: 'Passwords do not match' });
    }
    
    if (password.length < 6) {
        return res.render('register', { error: 'Password must be at least 6 characters' });
    }
    
    try {
        const existingUser = await pool.query('SELECT * FROM "User" WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) {
            return res.render('register', { error: 'Email already registered' });
        }
        
        const result = await pool.query(
            'INSERT INTO "User" (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
            [name, email, password, 'user']
        );
        
        req.session.user = result.rows[0];
        res.redirect('/');
    } catch (err) {
        console.error('Registration error:', err);
        res.render('register', { error: 'Registration failed. Please try again.' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// ============ PROTECTED ROUTES (require login) ============

// Home page - List all events
app.get('/', requireLogin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT e.*, c.name as category_name, v.name as venue_name 
            FROM Event e
            LEFT JOIN Category c ON e.category_id = c.id
            LEFT JOIN Venue v ON e.venue_id = v.id
            ORDER BY e.event_date ASC
        `);
        res.render('index', { events: result.rows, user: req.session.user });
    } catch (err) {
        console.error('Error fetching events:', err);
        res.status(500).send('Database Error: ' + err.message);
    }
});

// Show create event form
app.get('/events/create', requireLogin, (req, res) => {
    res.render('create-event', { user: req.session.user });
});

// Create event
app.post('/events', requireLogin, async (req, res) => {
    const { name, description, event_date, event_time, capacity, venue_id, category_id } = req.body;
    try {
        await pool.query(
            `INSERT INTO Event (name, description, event_date, event_time, capacity, venue_id, category_id, organizer_id) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [name, description, event_date, event_time, capacity, venue_id || null, category_id || null, req.session.user.id]
        );
        res.redirect('/');
    } catch (err) {
        console.error('Error creating event:', err);
        res.status(500).send('Error creating event: ' + err.message);
    }
});

// Show edit event form
app.get('/events/:id/edit', requireLogin, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT * FROM Event WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).send('Event not found');
        }
        res.render('edit-event', { event: result.rows[0], user: req.session.user });
    } catch (err) {
        console.error('Error fetching event:', err);
        res.status(500).send('Server Error: ' + err.message);
    }
});

// Update event
app.post('/events/:id/update', requireLogin, async (req, res) => {
    const { id } = req.params;
    const { name, description, event_date, event_time, capacity, status } = req.body;
    try {
        await pool.query(
            `UPDATE Event SET 
                name = $1, 
                description = $2, 
                event_date = $3, 
                event_time = $4, 
                capacity = $5, 
                status = $6 
             WHERE id = $7`,
            [name, description, event_date, event_time, capacity, status, id]
        );
        res.redirect('/events/' + id);
    } catch (err) {
        console.error('Error updating event:', err);
        res.status(500).send('Error updating event: ' + err.message);
    }
});

// Delete event
app.post('/events/:id/delete', requireLogin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM Registration WHERE event_id = $1', [id]);
        await pool.query('DELETE FROM Event WHERE id = $1', [id]);
        res.redirect('/');
    } catch (err) {
        console.error('Error deleting event:', err);
        res.status(500).send('Error deleting event: ' + err.message);
    }
});

// Event details with attendees (JOIN operation)
app.get('/events/:id', requireLogin, async (req, res) => {
    const { id } = req.params;
    try {
        const eventResult = await pool.query(
            `SELECT e.*, c.name as category_name, v.name as venue_name, v.address as venue_address
             FROM Event e
             LEFT JOIN Category c ON e.category_id = c.id
             LEFT JOIN Venue v ON e.venue_id = v.id
             WHERE e.id = $1`,
            [id]
        );
        
        if (eventResult.rows.length === 0) {
            return res.status(404).send('Event not found');
        }
        
        // JOIN operation - Get attendees with user details
        const attendeesResult = await pool.query(`
            SELECT 
                r.id as registration_id,
                u.name, 
                u.email, 
                r.status, 
                r.registration_timestamp
            FROM Registration r
            INNER JOIN "User" u ON r.user_id = u.id
            WHERE r.event_id = $1
            ORDER BY r.registration_timestamp DESC
        `, [id]);
        
        // Check if current user is registered
        const userRegistered = await pool.query(
            'SELECT id FROM Registration WHERE event_id = $1 AND user_id = $2',
            [id, req.session.user.id]
        );
        
        res.render('event-details', { 
            event: eventResult.rows[0],
            attendees: attendeesResult.rows,
            user: req.session.user,
            isRegistered: userRegistered.rows.length > 0
        });
    } catch (err) {
        console.error('Error fetching event details:', err);
        res.status(500).send('Server Error: ' + err.message);
    }
});

// Register for event
app.post('/events/:id/register', requireLogin, async (req, res) => {
    const { id } = req.params;
    
    try {
        // Check if already registered
        const existingReg = await pool.query(
            'SELECT id FROM Registration WHERE user_id = $1 AND event_id = $2',
            [req.session.user.id, id]
        );
        
        if (existingReg.rows.length > 0) {
            return res.send(`<h3>You are already registered!</h3><a href="/events/${id}">Go Back</a>`);
        }
        
        // Check event capacity and status
        const eventResult = await pool.query(
            'SELECT capacity, current_registrations, status FROM Event WHERE id = $1',
            [id]
        );
        
        if (eventResult.rows.length === 0) {
            return res.status(404).send('Event not found');
        }
        
        const event = eventResult.rows[0];
        
        if (event.status === 'closed') {
            return res.send(`<h3>Registrations are closed for this event!</h3><a href="/events/${id}">Go Back</a>`);
        }
        
        if (event.current_registrations >= event.capacity) {
            return res.send(`<h3>Sorry, this event is full!</h3><a href="/events/${id}">Go Back</a>`);
        }
        
        // Register user
        await pool.query(
            `INSERT INTO Registration (user_id, event_id, status) VALUES ($1, $2, 'registered')`,
            [req.session.user.id, id]
        );
        
        // Update registration count
        await pool.query(
            `UPDATE Event SET current_registrations = current_registrations + 1 WHERE id = $1`,
            [id]
        );
        
        res.redirect('/events/' + id);
    } catch (err) {
        console.error('Error registering:', err);
        res.status(500).send('Error registering: ' + err.message);
    }
});

// Cancel registration
app.post('/registrations/:registration_id/cancel', requireLogin, async (req, res) => {
    const { registration_id } = req.params;
    try {
        const regResult = await pool.query(
            'SELECT event_id FROM Registration WHERE id = $1 AND user_id = $2',
            [registration_id, req.session.user.id]
        );
        
        if (regResult.rows.length === 0) {
            return res.status(404).send('Registration not found');
        }
        
        const event_id = regResult.rows[0].event_id;
        
        await pool.query('DELETE FROM Registration WHERE id = $1', [registration_id]);
        
        await pool.query(
            `UPDATE Event SET current_registrations = current_registrations - 1 
             WHERE id = $1 AND current_registrations > 0`,
            [event_id]
        );
        
        res.redirect('/events/' + event_id);
    } catch (err) {
        console.error('Error canceling:', err);
        res.status(500).send('Error canceling registration: ' + err.message);
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📱 Visit: https://db-project-7elr.onrender.com`);
    console.log(`🔧 First time? Visit /setup to create tables`);
});

const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Clean DATABASE_URL so sslmode does not override ssl config
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

// Test DB connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
    console.error('Full error:', err);
  } else {
    console.log('✅ Connected to PostgreSQL successfully!');
    release();
  }
});

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// TEMP ROUTE: check what tables exist in Render DB
app.get('/check-tables', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error checking tables:', err);
    res.status(500).send(err.message);
  }
});

// GET: Home page
app.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT e.*, c.name AS category_name, v.name AS venue_name
      FROM "Event" e
      LEFT JOIN "Category" c ON e.category_id = c.id
      LEFT JOIN "Venue" v ON e.venue_id = v.id
      ORDER BY e.event_date ASC
    `);
    res.render('index', { events: result.rows });
  } catch (err) {
    console.error('Error fetching events:', err);
    res.status(500).send('Database Error: ' + err.message);
  }
});

// GET: Show create event form
app.get('/events/create', (req, res) => {
  res.render('create-event');
});

// POST: Create new event
app.post('/events', async (req, res) => {
  const { name, description, event_date, event_time, capacity, venue_id, category_id } = req.body;

  try {
    await pool.query(
      `INSERT INTO "Event" (name, description, event_date, event_time, capacity, venue_id, category_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [name, description, event_date, event_time, capacity, venue_id || null, category_id || null]
    );
    res.redirect('/');
  } catch (err) {
    console.error('Error creating event:', err);
    res.status(500).send('Error creating event: ' + err.message);
  }
});

// GET: Show edit event form
app.get('/events/:id/edit', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM "Event" WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).send('Event not found');
    }

    res.render('edit-event', { event: result.rows[0] });
  } catch (err) {
    console.error('Error fetching event:', err);
    res.status(500).send('Server Error: ' + err.message);
  }
});

// POST: Update event
app.post('/events/:id/update', async (req, res) => {
  const { id } = req.params;
  const { name, description, event_date, event_time, capacity, status } = req.body;

  try {
    await pool.query(
      `UPDATE "Event"
       SET name = $1,
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

// POST: Delete event
app.post('/events/:id/delete', async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query('DELETE FROM "Registration" WHERE event_id = $1', [id]);
    await pool.query('DELETE FROM "Event" WHERE id = $1', [id]);
    res.redirect('/');
  } catch (err) {
    console.error('Error deleting event:', err);
    res.status(500).send('Error deleting event: ' + err.message);
  }
});

// GET: Event details
app.get('/events/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const eventResult = await pool.query(
      `SELECT e.*, c.name AS category_name, v.name AS venue_name, v.address AS venue_address
       FROM "Event" e
       LEFT JOIN "Category" c ON e.category_id = c.id
       LEFT JOIN "Venue" v ON e.venue_id = v.id
       WHERE e.id = $1`,
      [id]
    );

    if (eventResult.rows.length === 0) {
      return res.status(404).send('Event not found');
    }

    const attendeesResult = await pool.query(
      `SELECT
          r.id AS registration_id,
          u.name,
          u.email,
          r.status,
          r.registration_timestamp
       FROM "Registration" r
       INNER JOIN "User" u ON r.user_id = u.id
       WHERE r.event_id = $1
       ORDER BY r.registration_timestamp DESC`,
      [id]
    );

    res.render('event-details', {
      event: eventResult.rows[0],
      attendees: attendeesResult.rows
    });
  } catch (err) {
    console.error('Error fetching event details:', err);
    res.status(500).send('Server Error: ' + err.message);
  }
});

// POST: Register user for event
app.post('/events/:id/register', async (req, res) => {
  const { id } = req.params;
  const { user_name, user_email } = req.body;

  try {
    let userResult = await pool.query(
      'SELECT id FROM "User" WHERE email = $1',
      [user_email]
    );

    let user_id;

    if (userResult.rows.length === 0) {
      const newUser = await pool.query(
        'INSERT INTO "User" (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id',
        [user_name, user_email, 'default123', 'user']
      );
      user_id = newUser.rows[0].id;
    } else {
      user_id = userResult.rows[0].id;
    }

    const existingReg = await pool.query(
      'SELECT id FROM "Registration" WHERE user_id = $1 AND event_id = $2',
      [user_id, id]
    );

    if (existingReg.rows.length > 0) {
      return res.send(`<h3>You are already registered!</h3><a href="/events/${id}">Go Back</a>`);
    }

    const eventResult = await pool.query(
      'SELECT capacity, current_registrations, status FROM "Event" WHERE id = $1',
      [id]
    );

    if (eventResult.rows.length === 0) {
      return res.status(404).send('Event not found');
    }

    const event = eventResult.rows[0];

    if (event.status === 'closed') {
      return res.send(`<h3>Registrations are closed!</h3><a href="/events/${id}">Go Back</a>`);
    }

    if (event.current_registrations >= event.capacity) {
      return res.send(`<h3>Event is full!</h3><a href="/events/${id}">Go Back</a>`);
    }

    await pool.query(
      `INSERT INTO "Registration" (user_id, event_id, status)
       VALUES ($1, $2, 'registered')`,
      [user_id, id]
    );

    await pool.query(
      `UPDATE "Event"
       SET current_registrations = current_registrations + 1
       WHERE id = $1`,
      [id]
    );

    res.redirect('/events/' + id);
  } catch (err) {
    console.error('Error registering:', err);
    res.status(500).send('Error registering: ' + err.message);
  }
});

// POST: Cancel registration
app.post('/registrations/:registration_id/cancel', async (req, res) => {
  const { registration_id } = req.params;

  try {
    const regResult = await pool.query(
      'SELECT event_id FROM "Registration" WHERE id = $1',
      [registration_id]
    );

    if (regResult.rows.length === 0) {
      return res.status(404).send('Registration not found');
    }

    const event_id = regResult.rows[0].event_id;

    await pool.query(
      'DELETE FROM "Registration" WHERE id = $1',
      [registration_id]
    );

    await pool.query(
      `UPDATE "Event"
       SET current_registrations = current_registrations - 1
       WHERE id = $1 AND current_registrations > 0`,
      [event_id]
    );

    res.redirect('/events/' + event_id);
  } catch (err) {
    console.error('Error canceling:', err);
    res.status(500).send('Error canceling registration: ' + err.message);
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

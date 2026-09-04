const express = require('express');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// DB connection settings come from environment variables
// (these are injected by Kubernetes from a Secret + plain env vars)
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// simple health endpoint (used manually / by curl in the demo,
// NOT wired to a k8s readiness/liveness probe on purpose)
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// hits the database so we can prove the DB dependency actually works
app.get('/items', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as server_time');
    res.status(200).json({
      message: 'Connected to database successfully',
      server_time: result.rows[0].server_time,
    });
  } catch (err) {
    console.error('DB query failed:', err.message);
    res.status(500).json({ error: 'Database connection failed', detail: err.message });
  }
});

app.get('/', (req, res) => {
  res.send('Backend is running. Try /healthz or /items');
});

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
  console.log(`Connecting to DB host: ${process.env.DB_HOST}`);
});

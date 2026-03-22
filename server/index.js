// server/index.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { testPgConnection } = require('./pg');

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/patients', require('./routes/patients'));
app.use('/api/exercises', require('./routes/exercises'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/therapist', require('./routes/therapist'));
app.use('/api/share', require('./routes/share'));
app.use('/api/treatments', require('./routes/treatments'));

// events route + optional scheduler function
const eventsModule = require('./routes/events');
const eventsRouter = eventsModule.router || eventsModule;
app.use('/api/events', eventsRouter);

// Clinical event notification scheduler
const checkAndSendNotifications = eventsModule.checkAndSendNotifications;
if (typeof checkAndSendNotifications === 'function') {
  function runNotificationScheduler() {
    checkAndSendNotifications().catch(err => {
      console.error('[Notifications]', err);
    });
  }

  runNotificationScheduler();
  setInterval(runNotificationScheduler, 60 * 60 * 1000);
} else {
  console.log('ℹ️ checkAndSendNotifications not exported from routes/events, scheduler skipped');
}

// Short public URL for patient programs: /s/:token
app.get('/s/:token', (req, res) => {
  res.redirect(302, `/api/share/p/${encodeURIComponent(req.params.token)}`);
});

// Serve React build in production
const clientDist = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

testPgConnection().catch(err => {
  console.error('❌ Postgres connection failed:', err.message);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`💪 StrongFlow server running on port ${PORT}`);
});
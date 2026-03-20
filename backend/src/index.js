import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDB } from './db/schema.js';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import projectsRouter from './routes/projects.js';
import forecastRouter from './routes/forecast.js';
import messagesRouter from './routes/messages.js';
import exportRouter from './routes/export.js';
import settingsRouter from './routes/settings.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/projects/:projectId/messages', messagesRouter);
app.use('/api/forecast', forecastRouter);
app.use('/api/export', exportRouter);
app.use('/api/settings', settingsRouter);

app.get('/api/health', (_, res) => res.json({ status: 'ok', version: '2.0.0' }));

// Serve frontend
const publicPath = path.join(__dirname, '../../public');
app.use(express.static(publicPath));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) res.sendFile(path.join(publicPath, 'index.html'));
});

async function start() {
  try {
    await initDB();
    app.listen(PORT, () => console.log(`🚀 CTG Forecast v2 — porta ${PORT}`));
  } catch (err) {
    console.error('Falha ao iniciar:', err);
    process.exit(1);
  }
}
start();

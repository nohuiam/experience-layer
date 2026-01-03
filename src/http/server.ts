/**
 * HTTP REST API Server for Experience Layer
 * Port 8031
 */

import express, { Request, Response, NextFunction } from 'express';
import { getDatabase } from '../database/schema.js';
import {
  recordExperience,
  recallByType,
  recallByOutcome,
  getLessons,
  applyLesson,
  learnFromPattern
} from '../tools/index.js';

const app = express();
app.use(express.json());

// CORS middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

// Server start time for uptime calculation
const startTime = Date.now();

// ==========================================================================
// Health & Stats
// ==========================================================================

app.get('/health', (req: Request, res: Response) => {
  const db = getDatabase();
  const stats = db.getStats();

  res.json({
    status: 'healthy',
    uptime: Date.now() - startTime,
    version: '1.0.0',
    stats: {
      episodes: stats.episodes,
      patterns: stats.patterns,
      lessons: stats.lessons
    }
  });
});

app.get('/api/stats', (req: Request, res: Response) => {
  const db = getDatabase();
  const stats = db.getStats();

  res.json({
    episodes: stats.episodes,
    patterns: stats.patterns,
    lessons: stats.lessons,
    avgUtility: stats.avgUtility,
    highConfidenceLessons: stats.highConfidenceLessons
  });
});

// ==========================================================================
// Episodes
// ==========================================================================

app.get('/api/episodes', (req: Request, res: Response) => {
  const db = getDatabase();
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;

  const episodes = db.getRecentEpisodes(limit + offset).slice(offset);

  res.json({
    episodes,
    count: episodes.length,
    total: db.getEpisodeCount()
  });
});

app.get('/api/episodes/type/:type', (req: Request, res: Response) => {
  const result = recallByType({
    operation_type: req.params.type,
    outcome_filter: req.query.outcome as 'success' | 'failure' | 'partial' | undefined,
    limit: parseInt(req.query.limit as string) || 50
  });

  res.json(result);
});

app.get('/api/episodes/outcome/:outcome', (req: Request, res: Response) => {
  const outcome = req.params.outcome as 'success' | 'failure' | 'partial';

  if (!['success', 'failure', 'partial'].includes(outcome)) {
    res.status(400).json({ error: 'Invalid outcome. Must be success, failure, or partial.' });
    return;
  }

  const result = recallByOutcome({
    outcome,
    operation_type: req.query.type as string | undefined,
    limit: parseInt(req.query.limit as string) || 50
  });

  res.json(result);
});

app.get('/api/episodes/:id', (req: Request, res: Response) => {
  const db = getDatabase();
  const id = parseInt(req.params.id);

  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid episode ID' });
    return;
  }

  const episode = db.getEpisode(id);

  if (!episode) {
    res.status(404).json({ error: 'Episode not found' });
    return;
  }

  res.json(episode);
});

app.post('/api/experience', (req: Request, res: Response) => {
  try {
    const result = recordExperience(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ==========================================================================
// Patterns
// ==========================================================================

app.get('/api/patterns', (req: Request, res: Response) => {
  const db = getDatabase();
  const patterns = db.getAllPatterns();

  res.json({
    patterns,
    count: patterns.length
  });
});

app.get('/api/patterns/type/:type', (req: Request, res: Response) => {
  const db = getDatabase();
  const patternType = req.params.type as 'success' | 'failure' | 'correlation';

  if (!['success', 'failure', 'correlation'].includes(patternType)) {
    res.status(400).json({
      error: 'Invalid pattern type. Must be success, failure, or correlation.'
    });
    return;
  }

  const patterns = db.getPatternsByType(patternType);

  res.json({
    patterns,
    count: patterns.length
  });
});

app.get('/api/patterns/:id', (req: Request, res: Response) => {
  const db = getDatabase();
  const id = parseInt(req.params.id);

  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid pattern ID' });
    return;
  }

  const pattern = db.getPattern(id);

  if (!pattern) {
    res.status(404).json({ error: 'Pattern not found' });
    return;
  }

  res.json(pattern);
});

// ==========================================================================
// Lessons
// ==========================================================================

app.get('/api/lessons', (req: Request, res: Response) => {
  const result = getLessons({
    min_confidence: parseFloat(req.query.min_confidence as string) || 0
  });

  res.json(result);
});

app.get('/api/lessons/applicable', (req: Request, res: Response) => {
  const result = getLessons({
    operation_type: req.query.operation_type as string | undefined,
    min_confidence: parseFloat(req.query.min_confidence as string) || 0
  });

  res.json(result);
});

app.post('/api/lessons/applicable', (req: Request, res: Response) => {
  const result = getLessons({
    context: req.body.context,
    operation_type: req.body.operation_type,
    min_confidence: req.body.min_confidence || 0
  });

  res.json(result);
});

app.get('/api/lessons/:id', (req: Request, res: Response) => {
  const db = getDatabase();
  const id = parseInt(req.params.id);

  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid lesson ID' });
    return;
  }

  const lesson = db.getLesson(id);

  if (!lesson) {
    res.status(404).json({ error: 'Lesson not found' });
    return;
  }

  res.json(lesson);
});

app.post('/api/lessons/:id/apply', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid lesson ID' });
      return;
    }

    const result = applyLesson({
      lesson_id: id,
      outcome: req.body.outcome,
      notes: req.body.notes
    });

    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.post('/api/lessons/learn', (req: Request, res: Response) => {
  try {
    const result = learnFromPattern({
      pattern_description: req.body.pattern_description,
      episode_ids: req.body.episode_ids,
      lesson_statement: req.body.lesson_statement
    });

    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ==========================================================================
// Server Export
// ==========================================================================

export function startHttpServer(port: number = 8031): void {
  app.listen(port, () => {
    console.log(`Experience Layer HTTP API listening on port ${port}`);
  });
}

export { app };

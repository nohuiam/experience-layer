/**
 * Tool Registry for Experience Layer
 * Exports all 6 MCP tools
 */

export { recordExperience, recordExperienceTool } from './record-experience.js';
export { recallByType, recallByTypeTool } from './recall-by-type.js';
export { recallByOutcome, recallByOutcomeTool } from './recall-by-outcome.js';
export { getLessons, getLessonsTool } from './get-lessons.js';
export { applyLesson, applyLessonTool } from './apply-lesson.js';
export { learnFromPattern, learnFromPatternTool } from './learn-from-pattern.js';

// Tool definitions for MCP registration
export const tools = [
  {
    name: 'record_experience',
    description: 'Store an episode with full context and outcome. Calculates utility score and detects patterns.',
    inputSchema: {
      type: 'object',
      properties: {
        operation_type: {
          type: 'string',
          description: 'Type of operation (build, search, verify, etc.)'
        },
        server_name: {
          type: 'string',
          description: 'Name of the server that performed the operation'
        },
        problem: {
          type: 'object',
          description: 'Problem context (query, constraints, context)'
        },
        solution: {
          type: 'object',
          description: 'Solution applied (tool, params, approach)'
        },
        outcome: {
          type: 'string',
          enum: ['success', 'failure', 'partial'],
          description: 'Result of the operation'
        },
        metadata: {
          type: 'object',
          description: 'Additional metadata (environment, dependencies, triggers)'
        },
        quality_score: {
          type: 'number',
          description: 'Quality score from 0 to 1'
        },
        duration_ms: {
          type: 'number',
          description: 'Duration of operation in milliseconds'
        },
        notes: {
          type: 'string',
          description: 'Additional notes about the experience'
        }
      },
      required: ['operation_type', 'outcome']
    }
  },
  {
    name: 'recall_by_type',
    description: 'Get past experiences for a specific operation type. Returns episodes with patterns and utility metrics.',
    inputSchema: {
      type: 'object',
      properties: {
        operation_type: {
          type: 'string',
          description: 'Type of operation to recall (build, search, verify, etc.)'
        },
        outcome_filter: {
          type: 'string',
          enum: ['success', 'failure', 'partial'],
          description: 'Filter by outcome type'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of episodes to return (default: 50)'
        }
      },
      required: ['operation_type']
    }
  },
  {
    name: 'recall_by_outcome',
    description: 'Get experiences by outcome type (success, failure, partial). Useful for analyzing what works and what doesn\'t.',
    inputSchema: {
      type: 'object',
      properties: {
        outcome: {
          type: 'string',
          enum: ['success', 'failure', 'partial'],
          description: 'Outcome type to recall'
        },
        operation_type: {
          type: 'string',
          description: 'Optional filter by operation type'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of episodes to return (default: 50)'
        }
      },
      required: ['outcome']
    }
  },
  {
    name: 'get_lessons',
    description: 'Retrieve applicable lessons for current context. Returns lessons with current confidence (after temporal decay) and confidence summary.',
    inputSchema: {
      type: 'object',
      properties: {
        context: {
          type: 'object',
          description: 'Current context to match against lesson contexts'
        },
        operation_type: {
          type: 'string',
          description: 'Filter by operation type'
        },
        min_confidence: {
          type: 'number',
          description: 'Minimum confidence threshold (default: 0)'
        }
      },
      required: []
    }
  },
  {
    name: 'apply_lesson',
    description: 'Mark a lesson as being used and track if it helped. Updates confidence using Bayesian-style weighted update.',
    inputSchema: {
      type: 'object',
      properties: {
        lesson_id: {
          type: 'number',
          description: 'ID of the lesson being applied'
        },
        outcome: {
          type: 'string',
          enum: ['success', 'failure', 'partial'],
          description: 'Result of applying the lesson'
        },
        notes: {
          type: 'string',
          description: 'Optional notes about the application'
        }
      },
      required: ['lesson_id', 'outcome']
    }
  },
  {
    name: 'learn_from_pattern',
    description: 'Extract a lesson from a recurring pattern. Requires at least 3 episodes. Calculates initial confidence based on success rate and episode quality.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern_description: {
          type: 'string',
          description: 'Description of the pattern observed'
        },
        episode_ids: {
          type: 'array',
          items: { type: 'number' },
          description: 'IDs of episodes that form this pattern'
        },
        lesson_statement: {
          type: 'string',
          description: 'The lesson to extract (e.g., "Run npm install before build")'
        }
      },
      required: ['pattern_description', 'episode_ids', 'lesson_statement']
    }
  }
];

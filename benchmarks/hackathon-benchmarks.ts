import type { HackathonBenchmarkDefinition } from './benchmark-types.js';

const SHARED_RUBRIC_BASE = {
  max_total: 50,
  passing_threshold: 70,
  items: [
    {
      category: 'Functionality',
      max_score: 10,
      description: 'Core features work as expected',
      scoring_guide: '10=All features work, 7=Most work, 4=Partial, 0=Broken',
    },
    {
      category: 'Code Quality',
      max_score: 10,
      description: 'Clean, well-structured code',
      scoring_guide: '10=Production quality, 7=Good structure, 4=Messy, 0=Unusable',
    },
    {
      category: 'Completeness',
      max_score: 10,
      description: 'All required files and features present',
      scoring_guide: '10=Complete, 7=Minor gaps, 4=Missing major parts, 0=Incomplete',
    },
    {
      category: 'Innovation',
      max_score: 10,
      description: 'Creative approach to the problem',
      scoring_guide: '10=Novel solution, 7=Good approach, 4=Standard, 0=Minimal effort',
    },
    {
      category: 'Polish',
      max_score: 10,
      description: 'UI/UX, documentation, error handling',
      scoring_guide: '10=Polished, 7=Good, 4=Rough edges, 0=Unfinished',
    },
  ],
};

export const AI_HACKATHON: HackathonBenchmarkDefinition = {
  id: 'bench-ai-001',
  name: 'AI Hackathon — Smart Assistant',
  category: 'ai',
  devpost_url: 'https://devpost.com/software/ai-smart-assistant',
  description:
    'Build an AI-powered smart assistant that can answer questions, manage tasks, and integrate with external APIs.',
  hackathon_description:
    'AI Hackathon focused on building intelligent assistants using LLMs and retrieval-augmented generation. Participants must create a web-based assistant with natural language understanding, task management capabilities, and external API integration. The assistant should maintain conversation context, support multiple interaction modes (text/voice), and provide actionable responses.',
  expected_deliverables: [
    { path: 'src/frontend/', description: 'React frontend with chat UI', required: true, type: 'directory' },
    {
      path: 'src/backend/',
      description: 'Express/Python backend with AI endpoints',
      required: true,
      type: 'directory',
    },
    {
      path: 'src/backend/services/ai-service.ts',
      description: 'AI service layer for LLM integration',
      required: true,
      type: 'code',
    },
    {
      path: 'src/backend/services/task-manager.ts',
      description: 'Task management service',
      required: true,
      type: 'code',
    },
    { path: 'README.md', description: 'Project documentation', required: true, type: 'docs' },
    { path: 'docker-compose.yml', description: 'Docker compose setup', required: false, type: 'config' },
  ],
  success_criteria: [
    { id: 'sc-ai-1', description: 'Frontend renders chat interface', weight: 1, verification_method: 'build_check' },
    { id: 'sc-ai-2', description: 'Backend serves AI endpoint', weight: 1, verification_method: 'build_check' },
    { id: 'sc-ai-3', description: 'Task manager CRUD operations', weight: 0.8, verification_method: 'judge_check' },
    { id: 'sc-ai-4', description: 'Conversation context management', weight: 0.8, verification_method: 'judge_check' },
    { id: 'sc-ai-5', description: 'API integration pattern', weight: 0.6, verification_method: 'judge_check' },
    { id: 'sc-ai-6', description: 'Docker setup works', weight: 0.4, verification_method: 'manual' },
  ],
  rubric: SHARED_RUBRIC_BASE,
  difficulty: 'hard',
  estimated_hours: 36,
};

export const SAAS_HACKATHON: HackathonBenchmarkDefinition = {
  id: 'bench-saas-001',
  name: 'SaaS Hackathon — Subscription Manager',
  category: 'saas',
  devpost_url: 'https://devpost.com/software/saas-subscription-manager',
  description: 'Build a SaaS subscription management platform with billing, user management, and analytics.',
  hackathon_description:
    'SaaS Hackathon challenging teams to build a subscription management platform. The application must handle user authentication, subscription tiers, payment processing integration, usage analytics, and an admin dashboard. Include Stripe-like payment flow, webhook handling, and a customer portal.',
  expected_deliverables: [
    { path: 'src/frontend/', description: 'React dashboard with subscription UI', required: true, type: 'directory' },
    { path: 'src/backend/', description: 'Express/Node backend with billing APIs', required: true, type: 'directory' },
    { path: 'database/', description: 'Database schema and migrations', required: true, type: 'directory' },
    {
      path: 'src/backend/services/billing.ts',
      description: 'Billing service with payment integration',
      required: true,
      type: 'code',
    },
    {
      path: 'src/backend/services/user-service.ts',
      description: 'User management service',
      required: true,
      type: 'code',
    },
    { path: 'README.md', description: 'Project documentation', required: true, type: 'docs' },
    { path: '.env.example', description: 'Environment configuration', required: true, type: 'config' },
  ],
  success_criteria: [
    { id: 'sc-saas-1', description: 'User registration and auth', weight: 1, verification_method: 'build_check' },
    { id: 'sc-saas-2', description: 'Subscription tier management', weight: 1, verification_method: 'judge_check' },
    { id: 'sc-saas-3', description: 'Billing/payment flow', weight: 0.9, verification_method: 'judge_check' },
    { id: 'sc-saas-4', description: 'Admin dashboard', weight: 0.8, verification_method: 'judge_check' },
    {
      id: 'sc-saas-5',
      description: 'Database schema with migrations',
      weight: 0.8,
      verification_method: 'build_check',
    },
    { id: 'sc-saas-6', description: 'Usage analytics', weight: 0.6, verification_method: 'judge_check' },
  ],
  rubric: SHARED_RUBRIC_BASE,
  difficulty: 'hard',
  estimated_hours: 48,
};

export const WEBAPP_HACKATHON: HackathonBenchmarkDefinition = {
  id: 'bench-web-001',
  name: 'Web App Hackathon — Team Collaboration',
  category: 'webapp',
  devpost_url: 'https://devpost.com/software/team-collab-app',
  description: 'Build a real-time team collaboration app with kanban boards, chat, and file sharing.',
  hackathon_description:
    'Web App Hackathon to build a team collaboration platform. Features include real-time kanban boards with drag-and-drop, team chat with message history, file sharing with preview, user presence indicators, and notification system. Must support multiple teams and workspaces.',
  expected_deliverables: [
    { path: 'src/frontend/', description: 'React frontend with kanban and chat', required: true, type: 'directory' },
    {
      path: 'src/backend/',
      description: 'Backend with real-time WebSocket support',
      required: true,
      type: 'directory',
    },
    { path: 'src/frontend/components/Board.tsx', description: 'Kanban board component', required: true, type: 'code' },
    { path: 'src/frontend/components/Chat.tsx', description: 'Chat component', required: true, type: 'code' },
    {
      path: 'src/backend/services/board-service.ts',
      description: 'Board management service',
      required: true,
      type: 'code',
    },
    { path: 'src/backend/services/chat-service.ts', description: 'Chat service', required: true, type: 'code' },
    { path: 'README.md', description: 'Project documentation', required: true, type: 'docs' },
  ],
  success_criteria: [
    { id: 'sc-web-1', description: 'Frontend renders kanban board', weight: 1, verification_method: 'build_check' },
    { id: 'sc-web-2', description: 'Backend serves API endpoints', weight: 1, verification_method: 'build_check' },
    { id: 'sc-web-3', description: 'Kanban CRUD operations', weight: 0.9, verification_method: 'judge_check' },
    { id: 'sc-web-4', description: 'Real-time chat functionality', weight: 0.8, verification_method: 'judge_check' },
    { id: 'sc-web-5', description: 'File sharing support', weight: 0.6, verification_method: 'judge_check' },
    { id: 'sc-web-6', description: 'Team/workspace management', weight: 0.7, verification_method: 'judge_check' },
  ],
  rubric: SHARED_RUBRIC_BASE,
  difficulty: 'hard',
  estimated_hours: 48,
};

export const HEALTHCARE_HACKATHON: HackathonBenchmarkDefinition = {
  id: 'bench-health-001',
  name: 'Healthcare Hackathon — Patient Portal',
  category: 'healthcare',
  devpost_url: 'https://devpost.com/software/patient-portal',
  description: 'Build a patient portal with appointment scheduling, medical records, and telehealth features.',
  hackathon_description:
    'Healthcare Hackathon to create a patient portal application. Features include patient registration, appointment scheduling with calendar integration, medical record management (HIPAA-aware patterns), telehealth video consultation scheduling, prescription management, and secure messaging with providers. Must demonstrate healthcare compliance awareness.',
  expected_deliverables: [
    { path: 'src/frontend/', description: 'React frontend with patient dashboard', required: true, type: 'directory' },
    { path: 'src/backend/', description: 'Backend with healthcare APIs', required: true, type: 'directory' },
    { path: 'database/', description: 'Database schema with healthcare models', required: true, type: 'directory' },
    {
      path: 'src/frontend/components/AppointmentScheduler.tsx',
      description: 'Appointment scheduling component',
      required: true,
      type: 'code',
    },
    {
      path: 'src/backend/services/appointment-service.ts',
      description: 'Appointment management service',
      required: true,
      type: 'code',
    },
    {
      path: 'src/backend/services/records-service.ts',
      description: 'Medical records service',
      required: true,
      type: 'code',
    },
    { path: 'README.md', description: 'Project documentation', required: true, type: 'docs' },
  ],
  success_criteria: [
    { id: 'sc-health-1', description: 'Patient registration flow', weight: 1, verification_method: 'build_check' },
    { id: 'sc-health-2', description: 'Appointment scheduling API', weight: 1, verification_method: 'build_check' },
    { id: 'sc-health-3', description: 'Medical records management', weight: 0.9, verification_method: 'judge_check' },
    { id: 'sc-health-4', description: 'Telehealth pattern', weight: 0.7, verification_method: 'judge_check' },
    { id: 'sc-health-5', description: 'Secure messaging', weight: 0.6, verification_method: 'judge_check' },
    {
      id: 'sc-health-6',
      description: 'Database schema with relationships',
      weight: 0.8,
      verification_method: 'build_check',
    },
  ],
  rubric: SHARED_RUBRIC_BASE,
  difficulty: 'hard',
  estimated_hours: 48,
};

export const EDUCATION_HACKATHON: HackathonBenchmarkDefinition = {
  id: 'bench-edu-001',
  name: 'Education Hackathon — Learning Platform',
  category: 'education',
  devpost_url: 'https://devpost.com/software/learning-platform',
  description: 'Build an online learning platform with courses, quizzes, progress tracking, and student analytics.',
  hackathon_description:
    'Education Hackathon to build a learning management platform. Features include course creation with multimedia content, interactive quizzes with auto-grading, student progress tracking, achievement/badge system, discussion forums, and instructor analytics dashboard. Must support multiple courses with modular lesson structures.',
  expected_deliverables: [
    { path: 'src/frontend/', description: 'React frontend with learning dashboard', required: true, type: 'directory' },
    { path: 'src/backend/', description: 'Backend with LMS APIs', required: true, type: 'directory' },
    { path: 'database/', description: 'Database schema for courses and users', required: true, type: 'directory' },
    {
      path: 'src/frontend/components/CourseViewer.tsx',
      description: 'Course content viewer component',
      required: true,
      type: 'code',
    },
    {
      path: 'src/frontend/components/Quiz.tsx',
      description: 'Interactive quiz component',
      required: true,
      type: 'code',
    },
    {
      path: 'src/backend/services/course-service.ts',
      description: 'Course management service',
      required: true,
      type: 'code',
    },
    {
      path: 'src/backend/services/quiz-service.ts',
      description: 'Quiz and grading service',
      required: true,
      type: 'code',
    },
    { path: 'README.md', description: 'Project documentation', required: true, type: 'docs' },
  ],
  success_criteria: [
    { id: 'sc-edu-1', description: 'Course listing and viewing', weight: 1, verification_method: 'build_check' },
    { id: 'sc-edu-2', description: 'Quiz creation and grading', weight: 1, verification_method: 'judge_check' },
    { id: 'sc-edu-3', description: 'Student progress tracking', weight: 0.8, verification_method: 'judge_check' },
    { id: 'sc-edu-4', description: 'Discussion forum', weight: 0.6, verification_method: 'judge_check' },
    { id: 'sc-edu-5', description: 'Instructor analytics', weight: 0.7, verification_method: 'judge_check' },
    { id: 'sc-edu-6', description: 'Achievement/badge system', weight: 0.5, verification_method: 'judge_check' },
  ],
  rubric: SHARED_RUBRIC_BASE,
  difficulty: 'hard',
  estimated_hours: 48,
};

export const ALL_BENCHMARKS: HackathonBenchmarkDefinition[] = [
  AI_HACKATHON,
  SAAS_HACKATHON,
  WEBAPP_HACKATHON,
  HEALTHCARE_HACKATHON,
  EDUCATION_HACKATHON,
];

export function getBenchmarkById(id: string): HackathonBenchmarkDefinition | undefined {
  return ALL_BENCHMARKS.find((b) => b.id === id);
}

export function getBenchmarksByCategory(category: string): HackathonBenchmarkDefinition[] {
  return ALL_BENCHMARKS.filter((b) => b.category === category);
}

/**
 * Capability Registry — Defines what Hack-A-Gent can and cannot build.
 *
 * Used by the Qualification Engine to determine whether a hackathon
 * is compatible with the tool's current capabilities.
 */

export type CapabilityCategory =
  | 'framework'
  | 'language'
  | 'database'
  | 'deployment'
  | 'api'
  | 'platform'
  | 'tool'
  | 'ui';

export interface Capability {
  id: string;
  name: string;
  category: CapabilityCategory;
  version?: string;
  description: string;
  alternatives?: string[];
}

export interface UnsupportedPattern {
  pattern: RegExp;
  category: string;
  reason: string;
}

/**
 * The definitive list of what Hack-A-Gent can build.
 */
export const SUPPORTED_CAPABILITIES: Capability[] = [
  // Frameworks
  { id: 'nextjs', name: 'Next.js', category: 'framework', version: '14+', description: 'React framework with App Router' },
  { id: 'react', name: 'React', category: 'framework', version: '18+', description: 'UI library' },
  { id: 'vue', name: 'Vue', category: 'framework', version: '3+', description: 'Progressive JavaScript framework' },
  { id: 'svelte', name: 'Svelte', category: 'framework', version: '4+', description: 'Compile-time framework' },
  { id: 'express', name: 'Express', category: 'framework', version: '4+', description: 'Node.js web framework' },
  { id: 'fastify', name: 'Fastify', category: 'framework', version: '4+', description: 'Fast Node.js web framework' },
  { id: 'fastapi', name: 'FastAPI', category: 'framework', version: '0.100+', description: 'Python web framework' },
  { id: 'flask', name: 'Flask', category: 'framework', version: '3+', description: 'Python micro web framework' },

  // Languages
  { id: 'typescript', name: 'TypeScript', category: 'language', version: '5+', description: 'Typed JavaScript' },
  { id: 'javascript', name: 'JavaScript', category: 'language', version: 'ES2022+', description: 'Dynamic scripting language' },
  { id: 'python', name: 'Python', category: 'language', version: '3.10+', description: 'General-purpose language' },

  // Databases
  { id: 'sqlite', name: 'SQLite', category: 'database', version: '3+', description: 'Embedded database' },
  { id: 'postgresql', name: 'PostgreSQL', category: 'database', version: '14+', description: 'Relational database' },
  { id: 'mongodb', name: 'MongoDB', category: 'database', version: '6+', description: 'Document database' },
  { id: 'supabase', name: 'Supabase', category: 'database', version: '2+', description: 'Firebase alternative with Postgres' },
  { id: 'prisma', name: 'Prisma', category: 'database', version: '5+', description: 'ORM for Node.js' },
  { id: 'drizzle', name: 'Drizzle ORM', category: 'database', version: '0.28+', description: 'TypeScript ORM' },

  // Deployment
  { id: 'vercel', name: 'Vercel', category: 'deployment', description: 'Next.js deployment platform' },
  { id: 'netlify', name: 'Netlify', category: 'deployment', description: 'Web deployment platform' },
  { id: 'docker', name: 'Docker', category: 'deployment', version: '24+', description: 'Container platform' },
  { id: 'github-pages', name: 'GitHub Pages', category: 'deployment', description: 'Static site hosting' },

  // APIs (free tier available)
  { id: 'openai-api', name: 'OpenAI API', category: 'api', description: 'GPT models for AI features' },
  { id: 'anthropic-api', name: 'Anthropic API', category: 'api', description: 'Claude models for AI features' },
  { id: 'twilio', name: 'Twilio', category: 'api', description: 'SMS and communication APIs' },
  { id: 'stripe', name: 'Stripe', category: 'api', description: 'Payment processing' },
  { id: 'firebase', name: 'Firebase', category: 'api', description: 'Google backend services' },
  { id: 'huggingface', name: 'Hugging Face', category: 'api', description: 'ML models and APIs' },

  // Local AI
  { id: 'ollama', name: 'Ollama', category: 'tool', description: 'Local LLM runtime' },

  // UI
  { id: 'tailwind', name: 'Tailwind CSS', category: 'ui', version: '3+', description: 'Utility-first CSS framework' },
  { id: 'shadcn', name: 'shadcn/ui', category: 'ui', description: 'Component library' },
];

/**
 * Patterns that indicate the hackathon requires capabilities we don't have.
 */
export const UNSUPPORTED_PATTERNS: UnsupportedPattern[] = [
  // Cloud-only requirements
  { pattern: /\b(aws[- ]only|amazon[- ]web[- ]services[- ]only)\b/i, category: 'cloud', reason: 'Requires AWS-only infrastructure' },
  { pattern: /\b(azure[- ]only|microsoft[- ]azure[- ]only)\b/i, category: 'cloud', reason: 'Requires Azure-only infrastructure' },
  { pattern: /\b(gcp[- ]only|google[- ]cloud[- ]only)\b/i, category: 'cloud', reason: 'Requires GCP-only infrastructure' },

  // Hardware requirements
  { pattern: /\b(arduino|raspberry[- ]pi|iot[- ]device|hardware[- ]hack)\b/i, category: 'hardware', reason: 'Requires physical hardware' },
  { pattern: /\b(apple[- ]vision|meta[- ]quest|oculus|vr[- ]headset|ar[- ]glasses)\b/i, category: 'hardware', reason: 'Requires VR/AR hardware' },

  // Mobile-only
  { pattern: /\b(native[- ]ios[- ]only|swift[- ]only|ios[- ]app[- ]only)\b/i, category: 'mobile', reason: 'Requires native iOS development' },
  { pattern: /\b(native[- ]android[- ]only|kotlin[- ]only|android[- ]app[- ]only)\b/i, category: 'mobile', reason: 'Requires native Android development' },

  // Robotics
  { pattern: /\b(robotics[- ]hack|robot[- ]hack|drone[- ]hack)\b/i, category: 'robotics', reason: 'Requires robotics/hardware integration' },

  // Paid API requirements
  { pattern: /\b(mandatory[- ]paid[- ]api|required[- ]paid[- ]subscription)\b/i, category: 'api', reason: 'Requires mandatory paid API access' },
];

/**
 * Check if a specific technology is supported.
 */
export function isCapabilitySupported(tech: string): boolean {
  const lower = tech.toLowerCase();
  return SUPPORTED_CAPABILITIES.some(
    cap => cap.id === lower || cap.name.toLowerCase() === lower
  );
}

/**
 * Find matching capabilities for a technology string.
 */
export function findCapabilities(tech: string): Capability[] {
  const lower = tech.toLowerCase();
  return SUPPORTED_CAPABILITIES.filter(
    cap => cap.id === lower || cap.name.toLowerCase() === lower || cap.description.toLowerCase().includes(lower)
  );
}

/**
 * Get all capabilities in a category.
 */
export function getCapabilitiesByCategory(category: CapabilityCategory): Capability[] {
  return SUPPORTED_CAPABILITIES.filter(cap => cap.category === category);
}

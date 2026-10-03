/**
 * Production template for the two shared data-contract modules.
 *
 * These strings are the canonical, self-consistent contract that the scaffold
 * generator emits and that the cross-file contract repair sources definitions
 * from when a generated module is missing an export that a consumer imports.
 * Keeping them here (rather than inline in the scaffold generator) lets the
 * repair path use them without importing the whole orchestrator.
 *
 * Both templates are supersets of anything a generated module can declare:
 * every name and every member a consumer can reference is present, so a
 * generated module that only ever adds to this contract can be replaced by it
 * wholesale without removing anything a consumer imports or reads.
 *
 * Inside the backtick strings: no backticks, no `${`, and every backslash is
 * doubled, or the generated source silently changes meaning.
 */
export const TEMPLATE_LIB_TYPES = `export interface WorkItem {
  id: string;
  title?: string;
  status: string;
  type?: string;
  outputSnapshot?: any;
  confidenceScore?: number | undefined;
  createdAt: number;
  updatedAt: number;
  userId?: string;
  aiContextId?: string;
  inputs?: any;
}

export interface ContextItem {
  id?: string;
  label?: string;
  userId?: string;
  inputs?: any;
}

export interface WorkHistoryItem {
  id: string;
  title: string;
  status: string;
  type?: string;
  outputSnapshot?: {
    title?: string;
    url?: string;
    confidence?: number;
    source?: string;
  };
  createdAt?: string;
}

export interface HistoryResponse {
  items: WorkHistoryItem[];
}

export interface AiRunRequest {
  description: string;
  mediaType: 'video' | 'article' | 'song';
  timeframe?: string;
  keywords?: string[];
  userId?: string;
  inputs?: {
    description: string;
    mediaType?: 'video' | 'article' | 'song';
    timeframe?: string;
    timePeriod?: string;
    keywords?: string[];
  };
}

/**
 * Generic over the payload a caller stages through it: a run's work item, or
 * whatever the UI keeps in flight. Both readings stay assignable.
 */
export interface AiRunResponse<T = WorkItem> {
  workItem?: WorkItem;
  status?: string;
  data?: T;
  error?: {
    message: string;
    code: string;
  };
}

export interface AiHistoryResponse {
  history: WorkItem[];
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: {
    id: string;
    email: string;
    name: string;
  };
  token: string;
}

export interface Session {
  id: string;
  userId: string;
  expiresAt: Date;
}

export interface AuthResponse {
  sessionId?: unknown;
  session?: {
    id: string;
    userId: string;
    expiresAt: Date;
  };
  user: {
    id: string;
    email: string;
    name: string;
    createdAt?: number | string;
  };
}

export interface User {
  id: string;
  email: string;
  name: string;
  // A credential a consumer constructing a public user shape never has; only
  // the repository that stores it fills this in.
  password?: string;
  passwordHash: string;
  createdAt?: number | string;
  // password field for auth routes that need to access stored credentials
  // passwordHash field for repository operations
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface FeedbackRequest {
  type: string;
  rating: number;
  comment?: string;
  workItemId?: string;
  adjustment?: {
    description?: string;
    mediaType?: 'video' | 'article' | 'song';
    timeframe?: string;
    timePeriod?: string;
    keywords?: string[];
  };
}

export interface FeedbackResponse {
  success: boolean;
  message?: string;
  workItem?: WorkItem;
}

export interface AiContext {
  id?: string;
  label?: string;
  type?: string;
  data?: any;
  userId?: string;
  inputs: {
    description: string;
    mediaType?: 'video' | 'article' | 'song';
    timeframe?: string;
    keywords?: string[];
  };
  timestamp?: number;
  timestamps?: {
    createdAt: string;
    updatedAt: string;
  };
}

export interface UserPrefs {
  theme: string;
  maxResults?: number;
  safeSearch?: boolean;
  notifications?: boolean;
  userId?: string;
  preferredMediaType?: 'video' | 'article' | 'song';
}

export interface ApiResponse<T> {
  data?: T;
  error?: {
    message: string;
    code: string;
  };
  status?: 'pending' | 'processing' | 'completed' | 'failed';
}
`;

export const TEMPLATE_LIB_DB = `import type {
  AiContext,
  ContextItem,
  FeedbackRequest,
  Session,
  User,
  UserPrefs,
  WorkHistoryItem,
  WorkItem,
} from './types';

type Where = Record<string, unknown>;

function matchesWhere(row: unknown, where: Where): boolean {
  const source = row as Record<string, unknown>;
  return Object.keys(where).every((key) => {
    const expected = where[key];
    const actual = source[key];
    if (expected === undefined) return true;
    if (expected instanceof Date || actual instanceof Date) {
      return String(expected) === String(actual);
    }
    return actual === expected;
  });
}

function filterRows<T>(rows: T[], where?: Where): T[] {
  return where ? rows.filter((row) => matchesWhere(row, where)) : [...rows];
}

function findRow<T>(rows: T[], where: Where): T | undefined {
  return rows.find((row) => matchesWhere(row, where));
}

function removeRow<T>(rows: T[], where: Where): boolean {
  const index = rows.findIndex((row) => matchesWhere(row, where));
  if (index === -1) return false;
  rows.splice(index, 1);
  return true;
}

let sequence = 0;

function nextId(prefix: string): string {
  sequence += 1;
  return prefix + '-' + sequence + '-' + Date.now().toString(36);
}

export const workItems: WorkItem[] = [];
export const contexts: ContextItem[] = [];
export const workHistory: WorkHistoryItem[] = [];
export const users: User[] = [];
export const sessions: Session[] = [];
export const feedbacks: FeedbackRequest[] = [];
export const aiContexts: AiContext[] = [];

interface UserPrefsRow extends UserPrefs {
  userId: string;
}

interface RefreshToken {
  token: string;
  userId?: string;
}

const userPrefsRows: UserPrefsRow[] = [];
const refreshTokens: RefreshToken[] = [];

export function seedDemoData(): void {
  if (users.length === 0) {
    users.push(
      { id: 'user-1', email: 'demo@example.com', name: 'Demo User', password: 'password123', passwordHash: '$2a$10$l0G4NKhnLXTdCkT3y.sR3el2ZlIoh.eYUggwBsCA.0OvHzUgdGRYe', createdAt: Date.now() },
      { id: 'user-alice', email: 'alice@example.com', name: 'Alice', password: 'password123', passwordHash: '$2a$10$l0G4NKhnLXTdCkT3y.sR3el2ZlIoh.eYUggwBsCA.0OvHzUgdGRYe', createdAt: Date.now() },
    );
  }
  if (workItems.length === 0) {
    const stamp = Date.now();
    workItems.push(
      { id: 'work-1', userId: 'demo-user-1', type: 'search', status: 'completed', outputSnapshot: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', confidenceScore: 0.95, createdAt: stamp - 3600000, updatedAt: stamp - 3600000 },
      { id: 'work-2', userId: 'demo-user-1', type: 'search', status: 'completed', outputSnapshot: 'https://en.wikipedia.org/wiki/Quantum_mechanics', confidenceScore: 0.87, createdAt: stamp - 7200000, updatedAt: stamp - 7200000 },
      { id: 'work-3', userId: 'demo-user-1', type: 'search', status: 'completed', outputSnapshot: 'https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6', confidenceScore: 0.92, createdAt: stamp - 10800000, updatedAt: stamp - 10800000 },
    );
  }
  if (contexts.length === 0) {
    contexts.push({ id: 'context-1', label: 'Demo context' });
  }
  if (workHistory.length === 0) {
    workHistory.push({
      id: 'history-1',
      title: 'Demo history',
      status: 'completed',
      createdAt: new Date().toISOString(),
    });
  }
  if (aiContexts.length === 0) {
    aiContexts.push({
      id: 'ai-1',
      label: 'Demo context',
      type: 'search',
      data: {},
      userId: 'user-1',
      inputs: { description: 'Quantum computing breakthroughs' },
      timestamp: Date.now(),
    });
  }
  if (findRow(userPrefsRows, { userId: 'user-1' }) === undefined) {
    userPrefsRows.push({ userId: 'user-1', theme: 'system', maxResults: 10, safeSearch: true, notifications: true });
  }
}

seedDemoData();

export function findUserByEmail(email: string): User | undefined {
  return findRow(users, { email });
}

export function resetDatabase(): void {
  workItems.length = 0;
  contexts.length = 0;
  workHistory.length = 0;
  users.length = 0;
  sessions.length = 0;
  feedbacks.length = 0;
  aiContexts.length = 0;
  userPrefsRows.length = 0;
  refreshTokens.length = 0;
  sequence = 0;
  seedDemoData();
}

export function validateRefreshToken(token: string): boolean {
  return findRow(refreshTokens, { token }) !== undefined;
}

export function addRefreshToken(token: string, userId?: string): void {
  if (findRow(refreshTokens, { token })) return;
  refreshTokens.push(userId === undefined ? { token } : { token, userId });
}

export function removeRefreshToken(token: string): void {
  removeRow(refreshTokens, { token });
}

export function issueRefreshToken(userId: string): string {
  const token = nextId('refresh');
  refreshTokens.push({ token, userId });
  return token;
}

export function findUserByRefreshToken(token: string): User | undefined {
  const entry = findRow(refreshTokens, { token });
  return entry && entry.userId ? findRow(users, { id: entry.userId }) : undefined;
}

export function getWorkItems(userId: string): WorkItem[] {
  return workItems.filter((row) => row.userId === userId);
}

export function getWorkItemsByUserId(userId: string): WorkItem[] {
  return getWorkItems(userId);
}

export function getWorkItemById(id: string): WorkItem | undefined {
  return findRow(workItems, { id });
}

/**
 * Two call shapes are in circulation: an item alone (the item carries its own
 * userId) and the older userId-then-item form. Both are accepted; both return
 * the stored row so a caller can read the id it was given.
 */
export function addWorkItem(
  userIdOrItem: string | Partial<WorkItem>,
  item?: Partial<WorkItem>,
): WorkItem {
  const source = (item === undefined ? userIdOrItem : item) as Partial<WorkItem>;
  const userId = item === undefined ? undefined : (userIdOrItem as string);
  const stamp = Date.now();
  const created = { ...source, id: nextId('work'), createdAt: stamp, updatedAt: stamp } as WorkItem;
  if (userId !== undefined) created.userId = userId;
  workItems.push(created);
  return created;
}

/**
 * updateWorkItem(id, updates) and updateWorkItem(userId, id, updates) are
 * both in circulation; the three-argument form keeps the original
 * per-user scoping.
 */
export function updateWorkItem(
  userIdOrId: string,
  idOrUpdates: string | Partial<WorkItem>,
  updates?: Partial<WorkItem>,
): WorkItem | null {
  const scoped = updates !== undefined;
  const id = scoped ? (idOrUpdates as string) : userIdOrId;
  const delta = (scoped ? updates : idOrUpdates) as Partial<WorkItem>;
  const userId = scoped ? userIdOrId : undefined;
  const index = workItems.findIndex(
    (row) => row.id === id && (userId === undefined || row.userId === userId),
  );
  const existing = workItems[index];
  if (index === -1 || !existing) return null;
  const updated: WorkItem = { ...existing, ...delta, updatedAt: Date.now() };
  workItems[index] = updated;
  return updated;
}

export function getAiContexts(userId: string): AiContext[] {
  return aiContexts.filter((row) => row.userId === userId);
}

export function addAiContext(userId: string, context: AiContext): void {
  aiContexts.push({ ...context, userId });
}

export function getUserPrefs(userId: string): UserPrefs {
  const existing = findRow(userPrefsRows, { userId });
  if (existing) return existing;
  const created: UserPrefsRow = { userId, theme: 'system', maxResults: 10, safeSearch: true, notifications: true };
  userPrefsRows.push(created);
  return created;
}

export function setUserPrefs(prefs: UserPrefs): void {
  const userId = prefs.userId ?? nextId('prefs');
  const existing = findRow(userPrefsRows, { userId });
  const target = existing ?? { userId, theme: 'system', maxResults: 10, safeSearch: true, notifications: true };
  Object.assign(target, prefs, { userId });
  if (!existing) userPrefsRows.push(target);
}

const workItemRepository = {
  findMany: (where?: Where | string): WorkItem[] =>
    typeof where === 'string'
      ? filterRows(workItems, { userId: where })
      : filterRows(workItems, where),
  findUnique: (where: Where): WorkItem | undefined => findRow(workItems, where),
  getAll: (userId?: string): WorkItem[] =>
    userId === undefined
      ? [...workItems]
      : workItems.filter((row) => row.userId === undefined || row.userId === userId),
  get: (id: string): WorkItem | undefined => findRow(workItems, { id }),
  getById: (id: string): WorkItem | undefined => findRow(workItems, { id }),
  findById: (id: string): WorkItem | undefined => findRow(workItems, { id }),
  create: (data: Omit<WorkItem, 'id' | 'createdAt' | 'updatedAt'>): WorkItem => {
    const stamp = Date.now();
    const created: WorkItem = { ...data, id: nextId('work'), createdAt: stamp, updatedAt: stamp };
    workItems.push(created);
    return created;
  },
  update: (id: string | { id: string }, updates: Partial<WorkItem>): WorkItem | null => {
    const key = typeof id === 'string' ? id : id.id;
    const index = workItems.findIndex((row) => row.id === key);
    const existing = workItems[index];
    if (index === -1 || !existing) return null;
    const updated: WorkItem = { ...existing, ...updates, updatedAt: Date.now() };
    workItems[index] = updated;
    return updated;
  },
  delete: (id: string): boolean => removeRow(workItems, { id }),
  clear: (): void => {
    workItems.length = 0;
  },
  get size(): number {
    return workItems.length;
  },
};

const userPrefsRepository = {
  findMany: (where?: Where): UserPrefsRow[] => filterRows(userPrefsRows, where),
  findUnique: (where: Where): UserPrefsRow | undefined => findRow(userPrefsRows, where),
  get: (userId: string): UserPrefs | undefined => findRow(userPrefsRows, { userId }),
  findByUserId: (userId: string): UserPrefs | undefined => findRow(userPrefsRows, { userId }),
  create: (data: UserPrefsRow): UserPrefsRow => {
    userPrefsRows.push(data);
    return data;
  },
  update: (userId: string, updates: Partial<UserPrefs>): UserPrefs => {
    const existing = findRow(userPrefsRows, { userId });
    if (existing) {
      Object.assign(existing, updates);
      return existing;
    }
    const created: UserPrefsRow = {
      userId,
      theme: 'system',
      maxResults: 10,
      safeSearch: true,
      notifications: true,
      ...updates,
    };
    userPrefsRows.push(created);
    return created;
  },
  delete: (where: Where): boolean => removeRow(userPrefsRows, where),
  clear: (): void => {
    userPrefsRows.length = 0;
  },
  get size(): number {
    return userPrefsRows.length;
  },
};

export const aiContextRepository = {
  findMany: (where?: Where): AiContext[] => filterRows(aiContexts, where),
  findUnique: (where: Where): AiContext | undefined => findRow(aiContexts, where),
  create: (data: AiContext): AiContext => {
    aiContexts.push(data);
    return data;
  },
  update: (where: Where, updates: Partial<AiContext>): AiContext | null => {
    const index = aiContexts.findIndex((row) => matchesWhere(row, where));
    const existing = aiContexts[index];
    if (index === -1 || !existing) return null;
    const updated: AiContext = { ...existing, ...updates };
    aiContexts[index] = updated;
    return updated;
  },
  delete: (where: Where): boolean => removeRow(aiContexts, where),
  clear: (): void => {
    aiContexts.length = 0;
  },
  get size(): number {
    return aiContexts.length;
  },
};

export const userRepository = {
  findMany: (where?: Where): User[] => filterRows(users, where),
  findUnique: (where: Where): User | undefined => findRow(users, where),
  findByEmail: (email: string): User | undefined => findRow(users, { email }),
  create: (data: Omit<User, 'id' | 'createdAt' | 'password' | 'passwordHash'> & { password?: string; passwordHash?: string }): User => {
    const created: User = {
      ...data,
      id: nextId('user'),
      createdAt: Date.now(),
      password: data.password ?? data.passwordHash ?? '',
      passwordHash: data.passwordHash ?? data.password ?? '',
    };
    users.push(created);
    return created;
  },
  update: (where: Where, updates: Partial<User>): User | null => {
    const index = users.findIndex((row) => matchesWhere(row, where));
    const existing = users[index];
    if (index === -1 || !existing) return null;
    const updated: User = { ...existing, ...updates };
    users[index] = updated;
    return updated;
  },
  delete: (where: Where): boolean => removeRow(users, where),
  clear: (): void => {
    users.length = 0;
  },
  get size(): number {
    return users.length;
  },
};

/**
 * Registration entry point: the caller hashes out-of-band and passes the
 * stored credential alongside the public fields.
 */
export function createUser(
  data: { email: string; name: string; password?: string; passwordHash?: string },
  passwordHash?: string,
): User {
  return userRepository.create({ ...data, passwordHash: passwordHash ?? data.passwordHash });
}

const sessionRepository = {
  findMany: (where?: Where): Session[] => filterRows(sessions, where),
  findUnique: (where: Where): Session | undefined => findRow(sessions, where),
  findById: (id: string): Session | undefined => findRow(sessions, { id }),
  create: (data: { userId: string; expiresAt: Date } | string): Session => {
    const input = typeof data === 'string'
      ? { userId: data, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }
      : data;
    const created: Session = { id: nextId('session'), userId: input.userId, expiresAt: input.expiresAt };
    sessions.push(created);
    return created;
  },
  delete: (where: Where | string): boolean => removeRow(sessions, typeof where === 'string' ? { id: where } : where),
  deleteById: (id: string): boolean => removeRow(sessions, { id }),
  clear: (): void => {
    sessions.length = 0;
  },
  get size(): number {
    return sessions.length;
  },
};

const contextRepository = {
  findMany: (where?: Where): ContextItem[] => filterRows(contexts, where),
  findUnique: (where: Where): ContextItem | undefined => findRow(contexts, where),
  create: (data: ContextItem): ContextItem => {
    contexts.push(data);
    return data;
  },
  delete: (where: Where): boolean => removeRow(contexts, where),
  clear: (): void => {
    contexts.length = 0;
  },
  get size(): number {
    return contexts.length;
  },
};

const workHistoryRepository = {
  findMany: (where?: Where): WorkHistoryItem[] => filterRows(workHistory, where),
  findUnique: (where: Where): WorkHistoryItem | undefined => findRow(workHistory, where),
  create: (data: WorkHistoryItem): WorkHistoryItem => {
    workHistory.push(data);
    return data;
  },
  delete: (where: Where): boolean => removeRow(workHistory, where),
  clear: (): void => {
    workHistory.length = 0;
  },
  get size(): number {
    return workHistory.length;
  },
};

const feedbackRepository = {
  findMany: (where?: Where): FeedbackRequest[] => filterRows(feedbacks, where),
  findUnique: (where: Where): FeedbackRequest | undefined => findRow(feedbacks, where),
  create: (data: FeedbackRequest): FeedbackRequest => {
    feedbacks.push(data);
    return data;
  },
  delete: (where: Where): boolean => removeRow(feedbacks, where),
  clear: (): void => {
    feedbacks.length = 0;
  },
  get size(): number {
    return feedbacks.length;
  },
};

interface PreparedStatement {
  all: () => unknown[];
}

const TABLES: Record<string, () => unknown[]> = {
  AiContext: () => aiContexts,
  Context: () => contexts,
  ContextItem: () => contexts,
  Feedback: () => feedbacks,
  Session: () => sessions,
  User: () => users,
  UserPrefs: () => userPrefsRows,
  WorkHistory: () => workHistory,
  WorkItem: () => workItems,
};

function prepare(sql: string): PreparedStatement {
  const match = /^\\s*select\\s+\\*\\s+from\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*;?\\s*$/i.exec(sql);
  if (!match) throw new Error('Unsupported SQL statement: ' + sql.trim());
  const table = TABLES[match[1]];
  if (!table) throw new Error('Unknown table: ' + match[1]);
  return { all: () => table() };
}

export const db = {
  workItem: workItemRepository,
  workItems: workItemRepository,
  userPrefs: userPrefsRepository,
  aiContext: aiContextRepository,
  user: userRepository,
  users: userRepository,
  session: sessionRepository,
  sessions: sessionRepository,
  context: contextRepository,
  contexts: contextRepository,
  workHistory: workHistoryRepository,
  feedbacks: feedbackRepository,
  prepare,
  findUserByEmail,
  createUser,
  validateRefreshToken,
  addRefreshToken,
  removeRefreshToken,
  issueRefreshToken,
  findUserByRefreshToken,
  resetDatabase,
  seedDemoData,
};
`;

// ============================================================================
// CANONICAL CORE (domain-agnostic, immutable)
// ============================================================================

/**
 * Canonical core types - domain-agnostic contracts that MUST NOT be modified
 * by LLM phases. These are written once during scaffold and then protected.
 * All domain-specific additions are layered on top as validated overlays.
 */
export const CANONICAL_LIB_TYPES = `// ============================================================================
// CANONICAL CORE - DOMAIN-AGNOSTIC TYPES (IMMUTABLE)
// ============================================================================
// This file contains the immutable canonical core of shared types.
// Domain-specific additions are appended as validated overlays below.
// DO NOT MODIFY THE CANONICAL CORE DIRECTLY.
//
// Generated by: generateScaffoldFiles()
// Protected by: writeAndVerifyPhase() canonical immutability guard
// ============================================================================

export interface WorkItem {
  id: string;
  title?: string;
  status: string;
  type?: string;
  outputSnapshot?: any;
  confidenceScore?: number | undefined;
  createdAt: number;
  updatedAt: number;
  userId?: string;
  aiContextId?: string;
  inputs?: any;
}

export interface ContextItem {
  id?: string;
  label?: string;
  userId?: string;
  inputs?: any;
}

export interface WorkHistoryItem {
  id: string;
  title: string;
  status: string;
  type?: string;
  outputSnapshot?: {
    title?: string;
    url?: string;
    confidence?: number;
    source?: string;
  };
  createdAt?: string;
}

export interface HistoryResponse {
  items: WorkHistoryItem[];
}

export interface AiRunRequest {
  description: string;
  mediaType: string;
  timeframe?: string;
  keywords?: string[];
  userId?: string;
  inputs?: {
    description: string;
    mediaType?: string;
    timeframe?: string;
    timePeriod?: string;
    keywords?: string[];
  };
}

/**
 * Generic over the payload a caller stages through it: a run's work item, or
 * whatever the UI keeps in flight. Both readings stay assignable.
 */
export interface AiRunResponse<T = WorkItem> {
  workItem?: WorkItem;
  status?: string;
  data?: T;
  error?: {
    message: string;
    code: string;
  };
}

export interface AiHistoryResponse {
  history: WorkItem[];
}

export interface LoginResponse {
  user: {
    id: string;
    email: string;
    name: string;
  };
  token: string;
}

export interface Session {
  id: string;
  userId: string;
  expiresAt: Date;
}

export interface AuthResponse {
  sessionId?: unknown;
  session?: {
    id: string;
    userId: string;
    expiresAt: Date;
  };
  user: {
    id: string;
    email: string;
    name: string;
    createdAt?: number | string;
  };
}

export interface User {
  id: string;
  email: string;
  name: string;
  // A credential a consumer constructing a public user shape never has; only
  // the repository that stores it fills this in.
  password?: string;
  passwordHash: string;
  createdAt?: number | string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface FeedbackRequest {
  type: string;
  rating: number;
  comment?: string;
  workItemId?: string;
  adjustment?: {
    description?: string;
    mediaType?: string;
    timeframe?: string;
    timePeriod?: string;
    keywords?: string[];
  };
}

export interface FeedbackResponse {
  success: boolean;
  message?: string;
  workItem?: WorkItem;
}

export interface AiContext {
  id?: string;
  label?: string;
  type?: string;
  data?: any;
  userId?: string;
  inputs: {
    description: string;
    mediaType?: string;
    timeframe?: string;
    keywords?: string[];
  };
  timestamp?: number;
  timestamps?: {
    createdAt: string;
    updatedAt: string;
  };
}

export interface UserPrefs {
  theme: string;
  maxResults?: number;
  safeSearch?: boolean;
  notifications?: boolean;
  userId?: string;
  preferredMediaType?: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: {
    message: string;
    code: string;
  };
  status?: 'pending' | 'processing' | 'completed' | 'failed';
}

// ============================================================================
// END OF CANONICAL CORE
// DOMAIN-SPECIFIC OVERLAY APPENDED BELOW (validated, non-conflicting)
// ============================================================================
`;

export const CANONICAL_LIB_DB = `import type {
  AiContext,
  ContextItem,
  FeedbackRequest,
  Session,
  User,
  UserPrefs,
  WorkHistoryItem,
  WorkItem,
} from './types';

// ============================================================================
// CANONICAL CORE - DOMAIN-AGNOSTIC DATABASE UTILITIES (IMMUTABLE)
// ============================================================================
// This file contains the immutable canonical core of database utilities.
// Domain-specific additions are appended as validated overlays below.
// DO NOT MODIFY THE CANONICAL CORE DIRECTLY.
//
// Generated by: generateScaffoldFiles()
// Protected by: writeAndVerifyPhase() canonical immutability guard
// ============================================================================

type Where = Record<string, unknown>;

function matchesWhere(row: unknown, where: Where): boolean {
  const source = row as Record<string, unknown>;
  return Object.keys(where).every((key) => {
    const expected = where[key];
    const actual = source[key];
    if (expected === undefined) return true;
    if (expected instanceof Date || actual instanceof Date) {
      return String(expected) === String(actual);
    }
    return actual === expected;
  });
}

function filterRows<T>(rows: T[], where?: Where): T[] {
  return where ? rows.filter((row) => matchesWhere(row, where)) : [...rows];
}

function findRow<T>(rows: T[], where: Where): T | undefined {
  return rows.find((row) => matchesWhere(row, where));
}

function removeRow<T>(rows: T[], where: Where): boolean {
  const index = rows.findIndex((row) => matchesWhere(row, where));
  if (index === -1) return false;
  rows.splice(index, 1);
  return true;
}

let sequence = 0;

function nextId(prefix: string): string {
  sequence += 1;
  return prefix + '-' + sequence + '-' + Date.now().toString(36);
}

export const workItems: WorkItem[] = [];
export const contexts: ContextItem[] = [];
export const workHistory: WorkHistoryItem[] = [];
export const users: User[] = [];
export const sessions: Session[] = [];
export const feedbacks: FeedbackRequest[] = [];
export const aiContexts: AiContext[] = [];

interface UserPrefsRow extends UserPrefs {
  userId: string;
}

interface RefreshToken {
  token: string;
  userId?: string;
}

const userPrefsRows: UserPrefsRow[] = [];
const refreshTokens: RefreshToken[] = [];

// NOTE: seedDemoData is intentionally OMITTED from canonical core.
// Domain-specific seed data is provided by the validated overlay.

export function findUserByEmail(email: string): User | undefined {
  return findRow(users, { email });
}

export function resetDatabase(): void {
  workItems.length = 0;
  contexts.length = 0;
  workHistory.length = 0;
  users.length = 0;
  sessions.length = 0;
  feedbacks.length = 0;
  aiContexts.length = 0;
  userPrefsRows.length = 0;
  refreshTokens.length = 0;
  sequence = 0;
  // seedDemoData is called by domain overlay if needed
}

export function validateRefreshToken(token: string): boolean {
  return findRow(refreshTokens, { token }) !== undefined;
}

export function addRefreshToken(token: string, userId?: string): void {
  if (findRow(refreshTokens, { token })) return;
  refreshTokens.push(userId === undefined ? { token } : { token, userId });
}

export function removeRefreshToken(token: string): void {
  removeRow(refreshTokens, { token });
}

export function issueRefreshToken(userId: string): string {
  const token = nextId('refresh');
  refreshTokens.push({ token, userId });
  return token;
}

export function findUserByRefreshToken(token: string): User | undefined {
  const entry = findRow(refreshTokens, { token });
  return entry && entry.userId ? findRow(users, { id: entry.userId }) : undefined;
}

export function getWorkItems(userId: string): WorkItem[] {
  return workItems.filter((row) => row.userId === userId);
}

export function getWorkItemsByUserId(userId: string): WorkItem[] {
  return getWorkItems(userId);
}

export function getWorkItemById(id: string): WorkItem | undefined {
  return findRow(workItems, { id });
}

/**
 * Two call shapes are in circulation: an item alone (the item carries its own
 * userId) and the older userId-then-item form. Both are accepted; both return
 * the stored row so a caller can read the id it was given.
 */
export function addWorkItem(
  userIdOrItem: string | Partial<WorkItem>,
  item?: Partial<WorkItem>,
): WorkItem {
  const source = (item === undefined ? userIdOrItem : item) as Partial<WorkItem>;
  const userId = item === undefined ? undefined : (userIdOrItem as string);
  const stamp = Date.now();
  const created = { ...source, id: nextId('work'), createdAt: stamp, updatedAt: stamp } as WorkItem;
  if (userId !== undefined) created.userId = userId;
  workItems.push(created);
  return created;
}

/**
 * updateWorkItem(id, updates) and updateWorkItem(userId, id, updates) are
 * both in circulation; the three-argument form keeps the original
 * per-user scoping.
 */
export function updateWorkItem(
  userIdOrId: string,
  idOrUpdates: string | Partial<WorkItem>,
  updates?: Partial<WorkItem>,
): WorkItem | null {
  const scoped = updates !== undefined;
  const id = scoped ? (idOrUpdates as string) : userIdOrId;
  const delta = (scoped ? updates : idOrUpdates) as Partial<WorkItem>;
  const userId = scoped ? userIdOrId : undefined;
  const index = workItems.findIndex(
    (row) => row.id === id && (userId === undefined || row.userId === userId),
  );
  const existing = workItems[index];
  if (index === -1 || !existing) return null;
  const updated: WorkItem = { ...existing, ...delta, updatedAt: Date.now() };
  workItems[index] = updated;
  return updated;
}

export function getAiContexts(userId: string): AiContext[] {
  return aiContexts.filter((row) => row.userId === userId);
}

export function addAiContext(userId: string, context: AiContext): void {
  aiContexts.push({ ...context, userId });
}

export function getUserPrefs(userId: string): UserPrefs {
  const existing = findRow(userPrefsRows, { userId });
  if (existing) return existing;
  const created: UserPrefsRow = { userId, theme: 'system', maxResults: 10, safeSearch: true, notifications: true };
  userPrefsRows.push(created);
  return created;
}

export function setUserPrefs(prefs: UserPrefs): void {
  const userId = prefs.userId ?? nextId('prefs');
  const existing = findRow(userPrefsRows, { userId });
  const target = existing ?? { userId, theme: 'system', maxResults: 10, safeSearch: true, notifications: true };
  Object.assign(target, prefs, { userId });
  if (!existing) userPrefsRows.push(target);
}

const workItemRepository = {
  findMany: (where?: Where | string): WorkItem[] =>
    typeof where === 'string'
      ? filterRows(workItems, { userId: where })
      : filterRows(workItems, where),
  findUnique: (where: Where): WorkItem | undefined => findRow(workItems, where),
  getAll: (userId?: string): WorkItem[] =>
    userId === undefined
      ? [...workItems]
      : workItems.filter((row) => row.userId === undefined || row.userId === userId),
  get: (id: string): WorkItem | undefined => findRow(workItems, { id }),
  getById: (id: string): WorkItem | undefined => findRow(workItems, { id }),
  findById: (id: string): WorkItem | undefined => findRow(workItems, { id }),
  create: (data: Omit<WorkItem, 'id' | 'createdAt' | 'updatedAt'>): WorkItem => {
    const stamp = Date.now();
    const created: WorkItem = { ...data, id: nextId('work'), createdAt: stamp, updatedAt: stamp };
    workItems.push(created);
    return created;
  },
  update: (id: string | { id: string }, updates: Partial<WorkItem>): WorkItem | null => {
    const key = typeof id === 'string' ? id : id.id;
    const index = workItems.findIndex((row) => row.id === key);
    const existing = workItems[index];
    if (index === -1 || !existing) return null;
    const updated: WorkItem = { ...existing, ...updates, updatedAt: Date.now() };
    workItems[index] = updated;
    return updated;
  },
  delete: (id: string): boolean => removeRow(workItems, { id }),
  clear: (): void => {
    workItems.length = 0;
  },
  get size(): number {
    return workItems.length;
  },
};

const userPrefsRepository = {
  findMany: (where?: Where): UserPrefsRow[] => filterRows(userPrefsRows, where),
  findUnique: (where: Where): UserPrefsRow | undefined => findRow(userPrefsRows, where),
  get: (userId: string): UserPrefs | undefined => findRow(userPrefsRows, { userId }),
  findByUserId: (userId: string): UserPrefs | undefined => findRow(userPrefsRows, { userId }),
  create: (data: UserPrefsRow): UserPrefsRow => {
    userPrefsRows.push(data);
    return data;
  },
  update: (userId: string, updates: Partial<UserPrefs>): UserPrefs => {
    const existing = findRow(userPrefsRows, { userId });
    if (existing) {
      Object.assign(existing, updates);
      return existing;
    }
    const created: UserPrefsRow = {
      userId,
      theme: 'system',
      maxResults: 10,
      safeSearch: true,
      notifications: true,
      ...updates,
    };
    userPrefsRows.push(created);
    return created;
  },
  delete: (where: Where): boolean => removeRow(userPrefsRows, where),
  clear: (): void => {
    userPrefsRows.length = 0;
  },
  get size(): number {
    return userPrefsRows.length;
  },
};

export const aiContextRepository = {
  findMany: (where?: Where): AiContext[] => filterRows(aiContexts, where),
  findUnique: (where: Where): AiContext | undefined => findRow(aiContexts, where),
  create: (data: AiContext): AiContext => {
    aiContexts.push(data);
    return data;
  },
  update: (where: Where, updates: Partial<AiContext>): AiContext | null => {
    const index = aiContexts.findIndex((row) => matchesWhere(row, where));
    const existing = aiContexts[index];
    if (index === -1 || !existing) return null;
    const updated: AiContext = { ...existing, ...updates };
    aiContexts[index] = updated;
    return updated;
  },
  delete: (where: Where): boolean => removeRow(aiContexts, where),
  clear: (): void => {
    aiContexts.length = 0;
  },
  get size(): number {
    return aiContexts.length;
  },
};

export const userRepository = {
  findMany: (where?: Where): User[] => filterRows(users, where),
  findUnique: (where: Where): User | undefined => findRow(users, where),
  findByEmail: (email: string): User | undefined => findRow(users, { email }),
  create: (data: Omit<User, 'id' | 'createdAt' | 'password' | 'passwordHash'> & { password?: string; passwordHash?: string }): User => {
    const created: User = {
      ...data,
      id: nextId('user'),
      createdAt: Date.now(),
      password: data.password ?? data.passwordHash ?? '',
      passwordHash: data.passwordHash ?? data.password ?? '',
    };
    users.push(created);
    return created;
  },
  update: (where: Where, updates: Partial<User>): User | null => {
    const index = users.findIndex((row) => matchesWhere(row, where));
    const existing = users[index];
    if (index === -1 || !existing) return null;
    const updated: User = { ...existing, ...updates };
    users[index] = updated;
    return updated;
  },
  delete: (where: Where): boolean => removeRow(users, where),
  clear: (): void => {
    users.length = 0;
  },
  get size(): number {
    return users.length;
  },
};

/**
 * Registration entry point: the caller hashes out-of-band and passes the
 * stored credential alongside the public fields.
 */
export function createUser(
  data: { email: string; name: string; password?: string; passwordHash?: string },
  passwordHash?: string,
): User {
  return userRepository.create({ ...data, passwordHash: passwordHash ?? data.passwordHash });
}

const sessionRepository = {
  findMany: (where?: Where): Session[] => filterRows(sessions, where),
  findUnique: (where: Where): Session | undefined => findRow(sessions, where),
  findById: (id: string): Session | undefined => findRow(sessions, { id }),
  create: (data: { userId: string; expiresAt: Date } | string): Session => {
    const input = typeof data === 'string'
      ? { userId: data, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }
      : data;
    const created: Session = { id: nextId('session'), userId: input.userId, expiresAt: input.expiresAt };
    sessions.push(created);
    return created;
  },
  delete: (where: Where | string): boolean => removeRow(sessions, typeof where === 'string' ? { id: where } : where),
  deleteById: (id: string): boolean => removeRow(sessions, { id }),
  clear: (): void => {
    sessions.length = 0;
  },
  get size(): number {
    return sessions.length;
  },
};

const contextRepository = {
  findMany: (where?: Where): ContextItem[] => filterRows(contexts, where),
  findUnique: (where: Where): ContextItem | undefined => findRow(contexts, where),
  create: (data: ContextItem): ContextItem => {
    contexts.push(data);
    return data;
  },
  delete: (where: Where): boolean => removeRow(contexts, where),
  clear: (): void => {
    contexts.length = 0;
  },
  get size(): number {
    return contexts.length;
  },
};

const workHistoryRepository = {
  findMany: (where?: Where): WorkHistoryItem[] => filterRows(workHistory, where),
  findUnique: (where: Where): WorkHistoryItem | undefined => findRow(workHistory, where),
  create: (data: WorkHistoryItem): WorkHistoryItem => {
    workHistory.push(data);
    return data;
  },
  delete: (where: Where): boolean => removeRow(workHistory, where),
  clear: (): void => {
    workHistory.length = 0;
  },
  get size(): number {
    return workHistory.length;
  },
};

const feedbackRepository = {
  findMany: (where?: Where): FeedbackRequest[] => filterRows(feedbacks, where),
  findUnique: (where: Where): FeedbackRequest | undefined => findRow(feedbacks, where),
  create: (data: FeedbackRequest): FeedbackRequest => {
    feedbacks.push(data);
    return data;
  },
  delete: (where: Where): boolean => removeRow(feedbacks, where),
  clear: (): void => {
    feedbacks.length = 0;
  },
  get size(): number {
    return feedbacks.length;
  },
};

interface PreparedStatement {
  all: () => unknown[];
}

const TABLES: Record<string, () => unknown[]> = {
  AiContext: () => aiContexts,
  Context: () => contexts,
  ContextItem: () => contexts,
  Feedback: () => feedbacks,
  Session: () => sessions,
  User: () => users,
  UserPrefs: () => userPrefsRows,
  WorkHistory: () => workHistory,
  WorkItem: () => workItems,
};

function prepare(sql: string): PreparedStatement {
  const match = /^\\s*select\\s+\\*\\s+from\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*;?\\s*$/i.exec(sql);
  if (!match) throw new Error('Unsupported SQL statement: ' + sql.trim());
  const table = TABLES[match[1]];
  if (!table) throw new Error('Unknown table: ' + match[1]);
  return { all: () => table() };
}

export const db = {
  workItem: workItemRepository,
  workItems: workItemRepository,
  userPrefs: userPrefsRepository,
  aiContext: aiContextRepository,
  user: userRepository,
  users: userRepository,
  session: sessionRepository,
  sessions: sessionRepository,
  context: contextRepository,
  contexts: contextRepository,
  workHistory: workHistoryRepository,
  feedbacks: feedbackRepository,
  prepare,
  findUserByEmail,
  createUser,
  validateRefreshToken,
  addRefreshToken,
  removeRefreshToken,
  issueRefreshToken,
  findUserByRefreshToken,
  resetDatabase,
  // seedDemoData is provided by domain overlay
};

// ============================================================================
// END OF CANONICAL CORE
// DOMAIN-SPECIFIC OVERLAY APPENDED BELOW (validated, non-conflicting)
// ============================================================================
`;

// ============================================================================
// DOMAIN OVERLAY CONSTRUCTION / VALIDATION
// ============================================================================

import * as ts from 'typescript';

export interface StrategyInput {
  apiSurfaces: Array<{ name: string; request: string; response: string }>;
  dataModel: Record<string, any>;
  keyPages: string[];
}

export interface OverlayResult {
  typesOverlay: string;
  dbOverlay: string;
}

/**
 * Extracts all exported symbol names from TypeScript source text.
 */
export function extractExportedNames(sourceText: string): Set<string> {
  const exports = new Set<string>();
  const sourceFile = ts.createSourceFile(
    'temp.ts',
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  function visit(node: ts.Node) {
    if (ts.isExportDeclaration(node)) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          exports.add(element.name.text);
        }
      }
    } else if (
      (node as ts.Node & { modifiers?: ts.NodeArray<ts.ModifierLike> }).modifiers && Array.isArray((node as ts.Node & { modifiers?: ts.NodeArray<ts.ModifierLike> }).modifiers) && (node as ts.Node & { modifiers?: ts.NodeArray<ts.ModifierLike> }).modifiers!.some((m: ts.ModifierLike) => (m as ts.Modifier).kind === ts.SyntaxKind.ExportKeyword) &&
      (ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isVariableStatement(node) ||
        ts.isEnumDeclaration(node) ||
        ts.isClassDeclaration(node))
    ) {
      if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isEnumDeclaration(node)) {
        if (node.name) exports.add(node.name.text);
      } else if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            exports.add(decl.name.text);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return exports;
}

/**
 * Validates that an overlay doesn't redefine any canonical symbols.
 * Returns error message if conflict found, undefined if valid.
 */
export function validateOverlay(
  canonicalSource: string,
  overlaySource: string,
  fileName: string
): string | undefined {
  const canonicalExports = extractExportedNames(canonicalSource);
  const overlayExports = extractExportedNames(overlaySource);

  for (const name of overlayExports) {
    if (canonicalExports.has(name)) {
      return `Overlay for ${fileName} attempts to redefine canonical symbol: ${name}`;
    }
  }
  return undefined;
}

/**
 * Builds domain-specific overlay from STRATEGY block.
 * Returns TypeScript fragments to append to canonical core.
 */
export function buildDomainOverlay(strategy: StrategyInput): OverlayResult {
  const typesOverlayParts: string[] = [];
  const dbOverlayParts: string[] = [];
  // Entity types declared by the overlay (non-canonical data-model entities).
  // The db overlay's repositories reference them, so it must import them.
  const overlayEntityNames: string[] = [];

  // Build API request/response types from strategy
  if (strategy.apiSurfaces && strategy.apiSurfaces.length > 0) {
    typesOverlayParts.push('\n// ============================================================================');
    typesOverlayParts.push('// DOMAIN-SPECIFIC API TYPES (from STRATEGY)');
    typesOverlayParts.push('// ============================================================================\n');

    const canonicalNames = new Set(['LoginResponse','Session','WorkItem','ContextItem','User','AuthResponse']);
    for (const surface of strategy.apiSurfaces) {
      const derivedReq = (surface.name || 'Unknown') + 'Request';
      const derivedResp = (surface.name || 'Unknown') + 'Response';
      if (canonicalNames.has(derivedReq) || canonicalNames.has(derivedResp)) continue;
      // The STRATEGY block provides request/response as TYPE SHAPES (inline
      // type literals). Use the shape as the interface body when present;
      // otherwise fall back to a TODO placeholder for the LLM to flesh out.
      const requestName = `${surface.name}Request`;
      const responseName = `${surface.name}Response`;

      const requestBody = surface.request && surface.request.trim().startsWith('{')
        ? surface.request.trim()
        : `{ // TODO: Define request shape for ${surface.name} }`;
      const responseBody = surface.response && surface.response.trim().startsWith('{')
        ? surface.response.trim()
        : `{ // TODO: Define response shape for ${surface.name} }`;

      typesOverlayParts.push(`export interface ${requestName} ${requestBody}`);
      typesOverlayParts.push(``);
      typesOverlayParts.push(`export interface ${responseName} ${responseBody}`);
      typesOverlayParts.push(``);
    }
  }

  // Build domain entity types from data model
  // (Single block — duplicate removed)
  if (strategy.dataModel && Object.keys(strategy.dataModel).length > 0) {
    typesOverlayParts.push('\n// ============================================================================');
    typesOverlayParts.push('// DOMAIN-SPECIFIC ENTITY TYPES (from STRATEGY data model)');
    typesOverlayParts.push('// ============================================================================\n');

    const canonicalNames = new Set(['LoginRequest', 'LoginResponse', 'Session', 'AuthResponse', 'User', 'RegisterRequest', 'FeedbackRequest', 'FeedbackResponse', 'AiContext', 'UserPrefs', 'ApiResponse', 'WorkItem', 'ContextItem', 'WorkHistoryItem', 'HistoryResponse', 'AiRunRequest', 'AiRunResponse', 'AiHistoryResponse']);
    for (const [entityName, entityDef] of Object.entries(strategy.dataModel)) {
      if (canonicalNames.has(entityName)) continue; // skip canonical symbols to prevent overlay collision
      overlayEntityNames.push(entityName);
      typesOverlayParts.push(`export interface ${entityName} {`);
      if (entityDef && typeof entityDef === 'object' && entityDef.fields) {
        for (const [fieldName, fieldType] of Object.entries(entityDef.fields)) {
          // Input may use 'string?' to mean optional; convert to proper TS
          // optional property syntax ('fieldName?: string').
          let tsFieldType = String(fieldType).trim();
          const optionalMarker = tsFieldType.endsWith('?') ? '?' : '';
          if (optionalMarker) {
            tsFieldType = tsFieldType.slice(0, -1).trim();
          }
          typesOverlayParts.push(`  ${fieldName}${optionalMarker}: ${tsFieldType};`);
        }
      } else {
        typesOverlayParts.push(`  // TODO: Define fields for ${entityName}`);
      }
      typesOverlayParts.push(`}`);
      typesOverlayParts.push(``);
    }
  }

  // Build domain-specific db utilities
  if (strategy.dataModel && Object.keys(strategy.dataModel).length > 0) {
    dbOverlayParts.push('\n// ============================================================================');
    dbOverlayParts.push('// DOMAIN-SPECIFIC DATABASE SEED/UTILITIES (from STRATEGY)');
    dbOverlayParts.push('// ============================================================================\n');

    // The overlay's repositories reference entity types declared in types.ts.
    if (overlayEntityNames.length > 0) {
      dbOverlayParts.push(`import type { ${overlayEntityNames.join(', ')} } from './types';`);
      dbOverlayParts.push(``);
    }

    dbOverlayParts.push(`export function seedDemoData(): void {`);
    dbOverlayParts.push(`  // Domain-specific seed data generated from STRATEGY`);
    dbOverlayParts.push(`  // This extends the canonical resetDatabase()`);
    dbOverlayParts.push(`}`);

    for (const entityName of Object.keys(strategy.dataModel)) {
      const entityDef = (strategy.dataModel as Record<string, any>)[entityName];
      const varName = entityName.toLowerCase();
      // The stamp expression must match the entity's declared timestamp field
      // types: a string-typed createdAt/updatedAt requires an ISO string;
      // Date.now()'s number only fits number-typed fields.
      const stampFor = (field: string): string => {
        const declared = entityDef?.fields?.[field];
        return String(declared ?? '').includes('string')
          ? 'new Date().toISOString()'
          : 'Date.now()';
      };
      const createdStamp = stampFor('createdAt');
      const updatedStamp = stampFor('updatedAt');
      dbOverlayParts.push(``);
      dbOverlayParts.push(`export const ${varName}Repository = {`);
      dbOverlayParts.push(`  findMany: (where?: Where): ${entityName}[] => filterRows(${varName}s, where),`);
      dbOverlayParts.push(`  findUnique: (where: Where): ${entityName} | undefined => findRow(${varName}s, where),`);
      dbOverlayParts.push(`  create: (data: Omit<${entityName}, 'id' | 'createdAt' | 'updatedAt'>): ${entityName} => {`);
      dbOverlayParts.push(`    const createdStamp = ${createdStamp};`);
      dbOverlayParts.push(`    const updatedStamp = ${updatedStamp};`);
      dbOverlayParts.push(`    const created: ${entityName} = { ...data, id: nextId('${varName}'), createdAt: createdStamp, updatedAt: updatedStamp };`);
      dbOverlayParts.push(`    ${varName}s.push(created);`);
      dbOverlayParts.push(`    return created;`);
      dbOverlayParts.push(`  },`);
      dbOverlayParts.push(`};`);
      dbOverlayParts.push(`export const ${varName}s: ${entityName}[] = [];`);
    }
  }

  // Build media-type specific types if present in strategy
  const hasMediaType = strategy.apiSurfaces.some(s =>
    s.request.includes('mediaType') || s.response.includes('mediaType')
  ) || strategy.keyPages.some(p => p.toLowerCase().includes('media'));

  if (hasMediaType) {
    typesOverlayParts.push('\n// ============================================================================');
    typesOverlayParts.push('// MEDIA-TYPE SPECIFIC TYPES');
    typesOverlayParts.push('// ============================================================================\n');
    typesOverlayParts.push(`export type MediaType = 'video' | 'article' | 'song';`);
    typesOverlayParts.push(``);
  }

  return {
    typesOverlay: typesOverlayParts.join('\n'),
    dbOverlay: dbOverlayParts.join('\n'),
  };
}

/**
 * Canonical exports for use by validation and repair.
 * These are the exact symbol names that must never be redefined.
 */
export const CANONICAL_TYPES_EXPORTS = extractExportedNames(CANONICAL_LIB_TYPES);
export const CANONICAL_DB_EXPORTS = extractExportedNames(CANONICAL_LIB_DB);

/**
 * Validates and merges canonical core with domain overlay.
 * Throws if overlay conflicts with canonical symbols.
 */
export function mergeCanonicalWithOverlay(
  canonicalTypes: string,
  canonicalDb: string,
  typesOverlay: string,
  dbOverlay: string
): { types: string; db: string } {
  // Validate types overlay
  const typesError = validateOverlay(canonicalTypes, typesOverlay, 'src/lib/types.ts');
  if (typesError) {
    throw new Error(typesError);
  }

  // Validate db overlay
  const dbError = validateOverlay(canonicalDb, dbOverlay, 'src/lib/db.ts');
  if (dbError) {
    throw new Error(dbError);
  }

  const mergedTypes = canonicalTypes.trimEnd() + '\n\n' + typesOverlay.trimStart() + '\n';
  const mergedDb = canonicalDb.trimEnd() + '\n\n' + dbOverlay.trimStart() + '\n';

  return { types: mergedTypes, db: mergedDb };
}

/**
 * Checks if a file's first line is exactly the canonical core's first line.
 * Used by canonical immutability guard. Matching on the full first line (not a
 * substring) keeps the guard scoped to genuinely canonical-prefixed files: a
 * file whose first line merely contains the canonical first line as a substring
 * (e.g. `import type { UserPrefs } ...` vs canonical `import type {`) is a
 * distinct module, not the canonical core, and must stay repairable.
 */
export function hasCanonicalPrefix(fileContent: string, canonicalCore: string): boolean {
  const normalizedContent = fileContent.replace(/\r\n/g, '\n');
  const normalizedCanonical = canonicalCore.replace(/\r\n/g, '\n');
  const firstLine = normalizedCanonical.split('\n')[0] || '';
  return normalizedContent.split('\n')[0] === firstLine;
}

/**
 * Extracts just the canonical core portion from a potentially extended file.
 * Returns the canonical core if present, otherwise throws.
 */
export function extractCanonicalCore(fileContent: string, canonicalCore: string): string {
  const normalizedContent = fileContent.replace(/\r\n/g, '\n');
  const normalizedCanonical = canonicalCore.replace(/\r\n/g, '\n');

  if (!normalizedContent.startsWith(normalizedCanonical)) {
    throw new Error('File does not start with expected canonical core');
  }

  return normalizedCanonical;
}
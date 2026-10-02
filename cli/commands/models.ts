import { getConfig, setLLMConfig } from '../config-manager.js';
import { color, logRaw, header, error, info, success, warn } from '../output.js';
import { initializeProviders } from '../provider-init.js';
import type { CLIContext, CLIArgs, CLIResult } from '../types.js';

export async function modelsCommand(ctx: CLIContext, args: CLIArgs): Promise<CLIResult> {
  const config = getConfig();
  if (!config?.llm.provider) {
    error('No provider configured. Run: hag setup');
    return { success: false, message: 'No provider configured' };
  }

  const activeProvider = config.llm.provider;
  
  // If model name provided as argument, set it as session default
  if (args.positional.length > 0) {
    const modelName = args.positional[0];
    setLLMConfig({ ...config!.llm, model: modelName });
    success(`Session default model set to: ${modelName}`);
    return { success: true, message: `Session model: ${modelName}` };
  }

  // Initialize providers to get models from active provider
  let active: { providers: Array<{ getModels: () => Array<{ model_id: string; context_window?: number; capabilities?: string[] }>; providerId: string; prepare?: () => Promise<void> }> } | null = null;
  try {
    active = initializeProviders();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`Provider initialization failed: ${msg}`);
  }

  // Find the active provider
  let activeProviderInstance = active?.providers.find(p => p.providerId === activeProvider);
  
  // If active provider is custom:<name>, find it in the providers list
  if (activeProvider.startsWith('custom:')) {
    const customName = activeProvider.slice(7);
    activeProviderInstance = active?.providers.find(p => p.providerId === `custom:${customName}`);
  }

  if (!activeProviderInstance) {
    error(`Active provider "${activeProvider}" not initialized.`);
    return { success: false, message: `Provider "${activeProvider}" not available` };
  }

  // Await prepare() for custom providers to discover models
  if (activeProviderInstance.prepare) {
    await activeProviderInstance.prepare();
  }

  const models = activeProviderInstance.getModels();

  header(`Models — ${activeProvider}`);

  if (models.length === 0) {
    logRaw(`  ${color('No models available from this provider', 'gray')}`);
    logRaw('');
    return { success: true, message: 'No models', data: { models: [] } };
  }

  const maxModelLen = Math.max(...models.map(m => m.model_id.length));
  const ctxLabel = 'Context';
  const streamLabel = 'Streaming';
  const colWidth = 12;

  logRaw(`  ${color('Model'.padEnd(maxModelLen), 'gray')}   ${color(ctxLabel.padEnd(colWidth), 'gray')}   ${color(streamLabel, 'gray')}`);
  logRaw(`  ${color('─'.repeat(maxModelLen + 4 + colWidth + 4 + streamLabel.length), 'gray')}`);

  for (const model of models) {
    const ctx = model.context_window ? `${(model.context_window / 1000).toFixed(0)}k` : '-';
    const streaming = (model.capabilities ?? []).includes('streaming') ? '✓' : '';
    logRaw(`  ${color(model.model_id.padEnd(maxModelLen), 'white')}   ${color(ctx.padEnd(colWidth), 'gray')}   ${color(streaming, 'green')}`);
  }

  logRaw('');
  info(`Active provider: ${activeProvider} | Use 'hag model <name>' to set session default`);

  return {
    success: true,
    message: `${models.length} models`,
    data: { models: models.map(m => ({ id: m.model_id, contextWindow: m.context_window })) },
  };
}

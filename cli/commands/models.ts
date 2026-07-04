import type { CLIContext, CLIArgs, CLIResult } from '../types.js';
import { getConfig } from '../config-manager.js';
import { initializeProviders } from '../provider-init.js';
import { color, logRaw, header, error } from '../output.js';

export async function modelsCommand(_ctx: CLIContext, _args: CLIArgs): Promise<CLIResult> {
  const config = getConfig();
  if (!config?.llm.apiKey) {
    error('No API key configured. Run: hag setup');
    return { success: false, message: 'No API key configured' };
  }

  const { providers } = initializeProviders();
  const provider = providers[0]!;
  const models = provider.getModels();

  header(`Models — ${config.llm.provider}`);

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

  return {
    success: true,
    message: `${models.length} models`,
    data: { models: models.map(m => ({ id: m.model_id, contextWindow: m.context_window })) },
  };
}

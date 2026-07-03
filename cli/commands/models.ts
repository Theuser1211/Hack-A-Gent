import type { CLIContext, CLIArgs, CLIResult } from '../types.js';
import { getConfig } from '../config-manager.js';
import { initializeProviders } from '../provider-init.js';
import { header, error, info } from '../output.js';

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
    info('No models available from this provider');
    return { success: true, message: 'No models', data: { models: [] } };
  }

  for (const model of models) {
    const context = model.context_window ? `${model.context_window.toLocaleString()} ctx` : '';
    const caps = model.capabilities ?? [];
    const supports = [
      caps.includes('json_output') ? 'JSON' : null,
      caps.includes('streaming') ? 'stream' : null,
      caps.includes('function_calling') ? 'functions' : null,
    ].filter(Boolean).join(', ');
    const costParts: string[] = [];
    if (model.cost_per_1k_input) costParts.push(`$${model.cost_per_1k_input}/1k in`);
    if (model.cost_per_1k_output) costParts.push(`$${model.cost_per_1k_output}/1k out`);
    const cost = costParts.join(', ');

    let line = `  ${model.model_id}`;
    if (context) line += `  (${context})`;
    if (supports) line += `  [${supports}]`;
    if (cost) line += `  ${cost}`;
    console.log(line);
  }

  console.log();
  info(`${models.length} model(s) available`);

  return {
    success: true,
    message: `${models.length} model(s)`,
    data: { models: models.map(m => ({ id: m.model_id, contextWindow: m.context_window })) },
  };
}

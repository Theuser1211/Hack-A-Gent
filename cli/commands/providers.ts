import { getConfig, setLLMConfig, type LLMConfig } from '../config-manager.js';
import { header, success, warn, logRaw, color, error } from '../output.js';
import { initializeProviders, type ProviderInitializationResult } from '../provider-init.js';
import type { CLIContext, CLIArgs, CLIResult } from '../types.js';

const ALL_PROVIDERS = ['anthropic', 'openai', 'gemini', 'openrouter', 'nvidia', 'nebius', 'custom'] as const;

export async function providersCommand(ctx: CLIContext, args: CLIArgs): Promise<CLIResult> {
  const config = getConfig();
  const configuredProvider = config?.llm.provider;

  // If a provider name is provided as argument, set it as active
  if (args.positional.length > 0) {
    const rawTargetProvider = args.positional[0];
    if (!rawTargetProvider) {
      return { success: false, message: 'Provider argument is required' };
    }

    const targetProvider = rawTargetProvider;
    const validProviders = ['anthropic', 'openai', 'gemini', 'openrouter', 'nvidia', 'nebius'];

    // Check if it's a custom provider
    if (targetProvider.startsWith('custom:')) {
      const customName = targetProvider.slice(7);
      const customProviders = config?.llm.customProviders ?? [];
      const cp = customProviders.find(p => p.name === customName);
      if (!cp) {
        error(`Custom provider "${customName}" not found. Run: hag provider to list available.`);
        return { success: false, message: `Custom provider "${customName}" not found` };
      }
    } else if (!validProviders.includes(targetProvider)) {
      error(`Unknown provider: ${targetProvider}`);
      return { success: false, message: `Unknown provider: ${targetProvider}` };
    }

    setLLMConfig({ ...config!.llm, provider: targetProvider as LLMConfig['provider'] });
    success(`Active provider set to: ${targetProvider}`);
    return { success: true, message: `Active provider: ${targetProvider}` };
  }

  const customProviders = config?.llm.customProviders ?? [];
  const customProviderIds = customProviders.map(cp => `custom:${cp.name}`);
  const allProviderIds = [...ALL_PROVIDERS, ...customProviderIds];

  header('Provider Status');

  let active: ProviderInitializationResult | null = null;
  try {
    active = initializeProviders();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`Provider initialization failed: ${msg}`);
  }

  const healthyProviders: string[] = [];
  const unhealthyProviders: string[] = [];
  const dataRows: { provider: string; status: string; configured: string }[] = [];

  for (const providerId of allProviderIds) {
    const isConfigured = configuredProvider === providerId;
    const isActive = active?.providers.some(p => p.providerId === providerId);

    let status: string;
    if (isActive) {
      const provider = active!.providers.find(p => p.providerId === providerId)!;
      const health = provider.getHealth();
      if (health.status === 'healthy') {
        status = 'healthy';
        healthyProviders.push(providerId);
      } else {
        status = health.status;
        unhealthyProviders.push(providerId);
      }
    } else {
      status = 'not initialized';
    }

    const configured = isConfigured ? 'yes' : 'no';
    const statusIcon = status === 'healthy' ? '✔' : status === 'not initialized' ? '○' : '⚠';
    const statusColor = status === 'healthy' ? 'green' : status === 'not initialized' ? 'gray' : 'yellow';

    const activeMarker = isConfigured ? ' *' : '';
    logRaw(`  ${color(statusIcon, statusColor)} ${color(providerId.padEnd(22), 'white')} ${color(status.padEnd(18), statusColor)} ${color(`configured: ${configured}${activeMarker}`, 'gray')}`);
    dataRows.push({ provider: providerId, status, configured });
  }

  logRaw('');
  if (healthyProviders.length > 0) {
    success(`${healthyProviders.length} provider(s) healthy`);
  }
  if (unhealthyProviders.length > 0) {
    warn(`${unhealthyProviders.length} provider(s) degraded`);
  }
  if (!configuredProvider) {
    warn('No provider configured. Run: hag setup');
  }

  return {
    success: true,
    message: `${healthyProviders.length} healthy, ${unhealthyProviders.length} degraded`,
    data: { providers: dataRows, configuredProvider },
  };
}

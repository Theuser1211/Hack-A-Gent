import type { CLIContext, CLIArgs, CLIResult } from '../types.js';
import { getConfig } from '../config-manager.js';
import { initializeProviders, type ProviderInitializationResult } from '../provider-init.js';
import { header, success, warn, logRaw, color } from '../output.js';

const ALL_PROVIDERS = ['anthropic', 'openai', 'gemini', 'openrouter', 'nvidia', 'custom'] as const;

export async function providersCommand(_ctx: CLIContext, _args: CLIArgs): Promise<CLIResult> {
  const config = getConfig();
  const configuredProvider = config?.llm.provider;

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

  for (const providerId of ALL_PROVIDERS) {
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

    logRaw(`  ${color(statusIcon, statusColor)} ${color(providerId.padEnd(14), 'white')} ${color(status.padEnd(18), statusColor)} ${color(`configured: ${configured}`, 'gray')}`);
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

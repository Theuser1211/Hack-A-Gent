import type { CLIContext, CLIArgs, CLIResult } from '../types.js';
import {
  getConfig,
  setLLMConfig,
  setDeployConfig,
  clearConfig,
  showConfig,
  CONFIG_HELP,
  type LLMConfig,
  type DeployConfig,
} from '../config-manager.js';

export async function configCommand(ctx: CLIContext, args: CLIArgs): Promise<CLIResult> {
  const show = args.flags.show === true;
  const clear = args.flags.clear === true;
  const help = args.flags.help === true;

  if (show) {
    const config = showConfig();
    if (!config) {
      return { success: true, message: 'No configuration found. Use: hackagent config --help' };
    }
    const safeConfig = {
      ...config,
      llm: {
        ...config.llm,
        apiKey: config.llm.apiKey ? '***' + config.llm.apiKey.slice(-4) : undefined,
      },
      deploy: config.deploy ? {
        githubToken: config.deploy.githubToken ? '***' + (config.deploy.githubToken.slice(-4) ?? '') : undefined,
        vercelToken: config.deploy.vercelToken ? '***' + (config.deploy.vercelToken.slice(-4) ?? '') : undefined,
        netlifyToken: config.deploy.netlifyToken ? '***' + (config.deploy.netlifyToken.slice(-4) ?? '') : undefined,
      } : undefined,
    };
    return {
      success: true,
      message: 'Current configuration:\n' + JSON.stringify(safeConfig, null, 2),
    };
  }

  if (clear) {
    clearConfig();
    return { success: true, message: 'Configuration cleared.' };
  }

  if (help) {
    return { success: true, message: CONFIG_HELP };
  }

  const provider = args.flags.provider as LLMConfig['provider'] | undefined;
  const apiKey = args.flags['api-key'] as string | undefined;
  const baseUrl = args.flags['base-url'] as string | undefined;
  const model = args.flags.model as string | undefined;
  const githubToken = args.flags['github-token'] as string | undefined;
  const vercelToken = args.flags['vercel-token'] as string | undefined;
  const netlifyToken = args.flags['netlify-token'] as string | undefined;

  if (!provider && !apiKey && !baseUrl && !model && !githubToken && !vercelToken && !netlifyToken) {
    return { success: true, message: CONFIG_HELP };
  }

  if (provider || apiKey || baseUrl || model) {
    const current = getConfig()?.llm ?? { provider: 'openai' };
    const llmConfig: LLMConfig = {
      provider: provider ?? current.provider,
      apiKey: apiKey ?? current.apiKey,
      baseUrl: baseUrl ?? current.baseUrl,
      model: model ?? current.model,
    };
    setLLMConfig(llmConfig);
  }

  if (githubToken || vercelToken || netlifyToken) {
    const current = getConfig()?.deploy ?? {};
    const deployConfig: DeployConfig = {
      githubToken: githubToken ?? current.githubToken,
      vercelToken: vercelToken ?? current.vercelToken,
      netlifyToken: netlifyToken ?? current.netlifyToken,
    };
    setDeployConfig(deployConfig);
  }

  const config = getConfig();
  return {
    success: true,
    message: 'Configuration updated.',
    data: config ? {
      provider: config.llm.provider,
      baseUrl: config.llm.baseUrl,
      hasApiKey: !!config.llm.apiKey,
      hasGithubToken: !!config.deploy?.githubToken,
      hasVercelToken: !!config.deploy?.vercelToken,
    } : undefined,
  };
}
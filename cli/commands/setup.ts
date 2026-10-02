import { getConfig, setLLMConfig, setDeployConfig, addCustomProvider, type LLMConfig, type DeployConfig, type CustomProvider } from '../config-manager.js';
import { header, success, warn, info, ask } from '../output.js';
import { initializeProviders } from '../provider-init.js';
import type { CLIContext, CLIArgs, CLIResult } from '../types.js';

const PROVIDER_CHOICES = [
  { name: 'NVIDIA NIMs', value: 'nvidia' },
  { name: 'OpenAI', value: 'openai' },
  { name: 'Anthropic (Claude)', value: 'anthropic' },
  { name: 'Gemini', value: 'gemini' },
  { name: 'OpenRouter', value: 'openrouter' },
  { name: 'Custom (Ollama, LM Studio, etc.)', value: 'custom' },
];



export async function setupCommand(ctx: CLIContext, args: CLIArgs): Promise<CLIResult> {
  const existing = getConfig();
  if (existing?.llm.apiKey) {
    warn('Configuration already exists. Use `hackagent config --show` to view.');
    warn('Use `hackagent config --clear` to reset, or continue to overwrite.');
    console.log();
  }

  const rl = null; // Removed in favor of global ask

  try {
    console.log();
    console.log('  ╔══════════════════════════════════════════╗');
    console.log('  ║      Hack-A-Gent Setup Wizard            ║');
    console.log('  ╚══════════════════════════════════════════╝');
    console.log();

    console.log('  Choose an LLM provider:\n');
    for (let i = 0; i < PROVIDER_CHOICES.length; i++) {
      console.log(`    ${i + 1}. ${PROVIDER_CHOICES[i]!.name}`);
    }
    console.log();

    let providerIndex = -1;
    while (isNaN(providerIndex) || providerIndex < 0 || providerIndex >= PROVIDER_CHOICES.length) {
      const raw = await ask('Enter number (1-' + PROVIDER_CHOICES.length + '): ');
      if (raw === null) {
        return { success: false, message: 'Setup cancelled: no interactive input available.' };
      }
      providerIndex = parseInt(raw, 10) - 1;
      if (isNaN(providerIndex) || providerIndex < 0 || providerIndex >= PROVIDER_CHOICES.length) {
        console.log('  Invalid choice. Try again.\n');
      }
    }

    const chosenProvider = PROVIDER_CHOICES[providerIndex]!;
    console.log(`  Selected: ${chosenProvider.name}\n`);

    let llmConfig: LLMConfig;

    if (chosenProvider.value === 'custom') {
      // Multi-custom-provider flow
      const customProviders: CustomProvider[] = [];
      let addMore = true;

      console.log('  Add custom providers (Ollama, LM Studio, etc.):\n');

      while (addMore) {
        const name = await ask('  Provider name (e.g., my-ollama): ');
        if (name === null) {
          return { success: false, message: 'Setup cancelled: no interactive input available.' };
        }
        if (!name.trim()) {
          console.log('  Name is required.\n');
          continue;
        }

        const baseUrl = await ask('  Base URL (e.g., http://localhost:11434/v1): ');
        if (baseUrl === null) {
          return { success: false, message: 'Setup cancelled: no interactive input available.' };
        }
        if (!baseUrl.trim()) {
          console.log('  Base URL is required.\n');
          continue;
        }

        const apiKey = await ask('  API key (optional, press Enter to skip): ');
        if (apiKey === null) {
          return { success: false, message: 'Setup cancelled: no interactive input available.' };
        }

        const defaultModel = await ask('  Default model (optional, press Enter to skip): ');
        if (defaultModel === null) {
          return { success: false, message: 'Setup cancelled: no interactive input available.' };
        }

        customProviders.push({
          name: name.trim(),
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim() || undefined,
          defaultModel: defaultModel.trim() || undefined,
        });

        success(`  Added "${name.trim()}"\n`);

        const more = await ask('  Add another custom provider? (Y/n): ');
        if (more === null) {
          return { success: false, message: 'Setup cancelled: no interactive input available.' };
        }
        addMore = more.toLowerCase() !== 'n';
        console.log();
      }

      // Set primary provider to first custom provider if no other provider was selected
      llmConfig = {
        provider: 'custom',
        customProviders,
        model: undefined,
      };
    } else {
      // Standard provider flow
      const apiKey = await ask('Enter API key: ');
      if (apiKey === null) {
        return { success: false, message: 'Setup cancelled: no interactive input available.' };
      }
      if (!apiKey) {
        return { success: false, message: 'API key is required.' };
      }

      let baseUrl = '';
      if (providerIndex === 0) {
        const endpoint = await ask('Enter endpoint URL (press Enter for default NVIDIA NIMs endpoint): ');
        if (endpoint === null) {
          return { success: false, message: 'Setup cancelled: no interactive input available.' };
        }
        baseUrl = endpoint;
      }

      const model = await ask('Enter model name (press Enter for default): ');
      if (model === null) {
        return { success: false, message: 'Setup cancelled: no interactive input available.' };
      }

      llmConfig = {
        provider: chosenProvider.value as LLMConfig['provider'],
        apiKey,
        baseUrl: baseUrl || undefined,
        model: model || undefined,
      };
    }

    setLLMConfig(llmConfig);

    success('Configuration saved.\n');

    // GitHub token (optional)
    info('GitHub token is used for:');
    console.log('  • Creating and managing GitHub repositories');
    console.log('  • Deploying generated projects via Vercel/Netlify');
    console.log('  • Submission assistant (creating pull requests)');
    console.log('  This is optional — you can skip and configure later.\n');

    const ghAnswer = await ask('Configure GitHub Personal Access Token? (Y/n): ');
    if (ghAnswer === null) {
      return { success: false, message: 'Setup cancelled: no interactive input available.' };
    }
    if (ghAnswer.toLowerCase() !== 'n') {
      const ghToken = await ask('Enter GitHub token (classic or fine-grained with repo scope): ');
      if (ghToken === null) {
        return { success: false, message: 'Setup cancelled: no interactive input available.' };
      }
      if (ghToken) {
        const currentDeploy = getConfig()?.deploy ?? {};
        const deployConfig: DeployConfig = {
          ...currentDeploy,
          githubToken: ghToken,
        };
        setDeployConfig(deployConfig);
        success('GitHub token saved.\n');
      }
    }

    const verifyAnswer = await ask('Verify connection with this provider? (Y/n): ');
    if (verifyAnswer === null) {
      return { success: false, message: 'Setup cancelled: no interactive input available.' };
    }
    if (verifyAnswer.toLowerCase() !== 'n') {
      info('Verifying...\n');
      try {
        const result = initializeProviders();
        const provider = result.providers[0];
        if (provider) {
          const health = await provider.checkHealth();
          if (health.status === 'healthy') {
            success('Connection verified! Provider is healthy.\n');
          } else {
            warn(`Provider configured but status: ${health.status}\n`);
          }
        }
      } catch (err) {
        warn(`Verification: ${err instanceof Error ? err.message : String(err)}`);
        info('Configuration is saved. You can retry with: hackagent config --verify\n');
      }
    }

    success('Setup complete! Run: hag run <devpost-url>\n');
    return { success: true, message: 'Setup complete.' };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
}

import * as readline from 'node:readline';

import { getConfig, setLLMConfig, type LLMConfig } from '../config-manager.js';
import { header, success, warn, info } from '../output.js';
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

function ask(rl: readline.ReadLine, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

export async function setupCommand(ctx: CLIContext, args: CLIArgs): Promise<CLIResult> {
  const existing = getConfig();
  if (existing?.llm.apiKey) {
    warn('Configuration already exists. Use `hackagent config --show` to view.');
    warn('Use `hackagent config --clear` to reset, or continue to overwrite.');
    console.log();
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

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
    while (providerIndex < 0 || providerIndex >= PROVIDER_CHOICES.length) {
      const raw = await ask(rl, '  Enter number (1-' + PROVIDER_CHOICES.length + '): ');
      providerIndex = parseInt(raw, 10) - 1;
      if (isNaN(providerIndex) || providerIndex < 0 || providerIndex >= PROVIDER_CHOICES.length) {
        console.log('  Invalid choice. Try again.\n');
      }
    }

    const chosenProvider = PROVIDER_CHOICES[providerIndex]!;
    console.log(`  Selected: ${chosenProvider.name}\n`);

    const apiKey = await ask(rl, '  Enter API key: ');
    if (!apiKey) {
      return { success: false, message: 'API key is required.' };
    }

    let baseUrl = '';
    if (providerIndex === 0) {
      baseUrl = await ask(rl, '  Enter endpoint URL (press Enter for default NVIDIA NIMs endpoint): ');
    }

    const model = await ask(rl, '  Enter model name (press Enter for default): ');

    const llmConfig: LLMConfig = {
      provider: chosenProvider.value as LLMConfig['provider'],
      apiKey,
      baseUrl: baseUrl || undefined,
      model: model || undefined,
    };

    setLLMConfig(llmConfig);

    success('Configuration saved.\n');

    const verifyAnswer = await ask(rl, '  Verify connection with this provider? (Y/n): ');
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
  } finally {
    rl.close();
  }
}

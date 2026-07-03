import * as readline from 'node:readline';
import type { CLIContext, CLIArgs, CLIResult } from '../types.js';
import { getConfig, setLLMConfig, setDeployConfig, type LLMConfig } from '../config-manager.js';
import { initializeProviders } from '../provider-init.js';

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
    console.log('\n  Configuration already exists. Run `hackagent config --show` to view.');
    console.log('  Use `hackagent config --clear` to reset, or continue to overwrite.\n');
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log('\n  ╔══════════════════════════════════════════╗');
    console.log('  ║      Hack-A-Gent Setup Wizard            ║');
    console.log('  ╚══════════════════════════════════════════╝\n');

    console.log('  Choose an LLM provider:\n');
    for (let i = 0; i < PROVIDER_CHOICES.length; i++) {
      const choice = PROVIDER_CHOICES[i]!;
      console.log(`    ${i + 1}. ${choice.name}`);
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
    const provider = chosenProvider.value;
    console.log(`  Selected: ${chosenProvider.name}\n`);

    const apiKey = await ask(rl, '  Enter API key: ');
    if (!apiKey) {
      return { success: false, message: 'API key is required.' };
    }

    let baseUrl = '';
    if (provider === 'custom') {
      baseUrl = await ask(rl, '  Enter endpoint URL (e.g. http://localhost:11434/v1): ');
    } else if (provider === 'nvidia') {
      baseUrl = await ask(rl, '  Enter endpoint URL (press Enter for default NVIDIA NIMs endpoint): ');
    }

    const model = await ask(rl, '  Enter model name (press Enter for default): ');

    const llmConfig: LLMConfig = {
      provider: provider as LLMConfig['provider'],
      apiKey,
      baseUrl: baseUrl || undefined,
      model: model || undefined,
    };

    setLLMConfig(llmConfig);

    console.log('\n  ✓ Configuration saved.\n');

    const verifyAnswer = await ask(rl, '  Verify connection with this provider? (Y/n): ');
    if (verifyAnswer.toLowerCase() !== 'n') {
      console.log('  Verifying...\n');
      try {
        const result = initializeProviders();
        const health = result.providers[0]?.getHealth();
        if (health && health.status === 'healthy') {
          console.log('  ✓ Connection verified! Provider is healthy.\n');
        } else {
          console.log(`  ⚠ Provider configured but status: ${health?.status ?? 'unknown'}\n`);
        }
      } catch (err) {
        console.log(`  ⚠ Verification warning: ${err instanceof Error ? err.message : String(err)}`);
        console.log('  Configuration is saved. You can retry with: hackagent config --verify\n');
      }
    }

    console.log('  Setup complete! Run: hackagent run <devpost-url>\n');
    return { success: true, message: 'Setup complete.' };
  } finally {
    rl.close();
  }
}

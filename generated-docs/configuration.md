# Configuration Reference

## Providers

`anthropic`, `openai`, `gemini`, `openrouter`, `nvidia` (alias `nvidia-nims`), `custom`.

## Environment Variables

| Variable | Purpose |
| --- | --- |
| `HACKAGENT_PROVIDER` / `LLM_PROVIDER` | Provider selection |
| `HACKAGENT_API_KEY` / `LLM_API_KEY` | API key |
| `HACKAGENT_BASE_URL` / `HACKAGENT_ENDPOINT` | Custom endpoint (NVIDIA NIMs, local models) |
| `HACKAGENT_MODEL` / `LLM_MODEL` | Model name |
| `GITHUB_TOKEN` / `VERCEL_TOKEN` / `NETLIFY_AUTH_TOKEN` | Deploy tokens |

## Reference

```

Configuration Settings:

  LLM Provider Settings:
    --provider <name>     Provider: anthropic, openai, gemini, openrouter, nvidia, custom
                          Aliases: nvidia-nims → nvidia
    --api-key <key>       API key for the provider
    --endpoint <url>      Same as --base-url (custom endpoint for NVIDIA NIMs, local models, etc.)
    --base-url <url>      Custom endpoint URL
    --model <name>        Model name (optional, uses provider default)
    --verify              Test the provider connection with current settings

  Deployment Settings:
    --github-token <token>   GitHub personal access token
    --vercel-token <token>   Vercel deployment token
    --netlify-token <token>  Netlify deployment token

  .env File Support:
    Alternative to CLI config. Create a .env file in your project root:
      HACKAGENT_PROVIDER=nvidia
      HACKAGENT_API_KEY=nvapi-xxx
      HACKAGENT_BASE_URL=https://integrate.api.nvidia.com/v1

Examples:
  hackagent config --provider nvidia --api-key nvapi-xxx
  hackagent config --provider nvidia-nims --api-key nvapi-xxx --endpoint https://integrate.api.nvidia.com/v1
  hackagent config --provider openai --api-key sk-xxx
  hackagent config --provider custom --api-key sk-xxx --endpoint http://localhost:11434/v1
  hackagent config --provider nvidia --verify
  hackagent config --show
  hackagent config --clear

```

# Examples

## Generate a project from Devpost
```bash
hag run https://devpost.com/software/example
```

## Analyze a hackathon (offline, 20 dimensions)
```bash
hag analyze https://devpost.com/software/example --json --out analysis.json
```

## Benchmark a generated project
```bash
hag benchmark real run real-chatbot-frontend ./my-project
```

## Run the 16-category benchmark suite
```bash
hag categories run-all
hag categories compare <runA> <runB>
```

## Regenerate docs
```bash
npm run gen-docs
```

## Diagnostics
```bash
hag doctor
hag health
hag providers
hag models
```

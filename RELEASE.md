# Release Process

## Versioning

This project follows [Semantic Versioning](https://semver.org/):

- **MAJOR** — breaking changes
- **MINOR** — new features, backward compatible
- **PATCH** — bug fixes, backward compatible

## Release Checklist

### Preparation

- [ ] All tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] Typecheck passes: `npm run typecheck`
- [ ] Lint passes: `npm run lint`
- [ ] CLI commands work: `node dist/cli/index.js help`
- [ ] README is up to date
- [ ] CHANGELOG is updated

### Publishing

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Commit: `git commit -m "chore: release vX.Y.Z"`
4. Tag: `git tag vX.Y.Z`
5. Push: `git push && git push --tags`
6. Publish: `npm publish`

### Post-Release

- [ ] Verify npm package installs: `npm install -g hag-cli`
- [ ] Verify `hag setup` works from fresh install
- [ ] Verify `hag run` with a test Devpost URL
- [ ] Update GitHub Release with release notes

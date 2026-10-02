import type { ArchitectureBlueprint } from '../planning/architect-types.js';

import type { GeneratedModule } from './builder-types.js';

export interface BuilderProvider {
  generateFrontend(blueprint: ArchitectureBlueprint): Promise<GeneratedModule>;
  generateBackend(blueprint: ArchitectureBlueprint): Promise<GeneratedModule>;
  generateDatabase(blueprint: ArchitectureBlueprint): Promise<GeneratedModule>;
  generateConfig(blueprint: ArchitectureBlueprint): Promise<GeneratedModule>;
  generateDocumentation(blueprint: ArchitectureBlueprint): Promise<GeneratedModule>;
  generateTests(blueprint: ArchitectureBlueprint): Promise<GeneratedModule>;
}

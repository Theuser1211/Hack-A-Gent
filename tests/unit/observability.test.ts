import { describe, it, expect } from 'vitest';
import { formatStageProgress, formatScoreProgress } from '../../cli/output.js';

describe('observability helpers', () => {
  it('formats stage progress', () => {
    const result = formatStageProgress('Project Generation', 1, 3, 'Building components');
    expect(result).toContain('Project Generation');
    expect(result).toContain('1/3');
    expect(result).toContain('Building components');
  });

  it('formats score progress', () => {
    const result = formatScoreProgress(80, 85);
    expect(result).toContain('80');
    expect(result).toContain('85');
    expect(result).toContain('+5');
  });

  it('formats negative score progress', () => {
    const result = formatScoreProgress(85, 80);
    expect(result).toContain('85');
    expect(result).toContain('80');
    expect(result).toContain('-5');
  });
});
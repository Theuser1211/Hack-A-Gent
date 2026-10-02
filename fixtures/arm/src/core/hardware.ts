import * as os from 'node:os';

export interface HardwareInfo {
  arch: string;
  platform: string;
  cpuModel: string;
  logicalCpus: number;
  isArm: boolean;
  hasNeon: boolean;
  speedMhz: number;
}

/**
 * Detect the host CPU and OS. Only context for a measurement — the actual
 * numbers always come from the bench harness, never from here.
 */
export function detectHardware(): HardwareInfo {
  const arch = os.arch();
  const firstCpu = os.cpus()[0];
  const cpuModel = firstCpu ? firstCpu.model.trim() : 'unknown';
  const speedMhz = firstCpu ? Math.round(firstCpu.speed) : 0;
  return {
    arch,
    platform: os.platform(),
    cpuModel,
    logicalCpus: os.cpus().length,
    isArm: /^(arm64|arm|aarch64)/i.test(arch) || /aarch64|arm/i.test(os.type()),
    hasNeon: detectNeon(),
    speedMhz,
  };
}

function detectNeon(): boolean {
  if (os.platform() !== 'linux') return false;
  try {
    const info = os.cpus()
      .map((c) => c.model.toLowerCase())
      .join(' ');
    return info.includes('asimd') || info.includes('neon');
  } catch {
    return false;
  }
}

export function describeHardware(hw: HardwareInfo): string[] {
  return [
    `Architecture : ${hw.arch} (${hw.cpuModel})`,
    `Logical CPUs : ${hw.logicalCpus} @ ~${hw.speedMhz} MHz`,
    `Platform     : ${hw.platform} ${hw.isArm ? '· Arm target detected' : '· non-Arm host (x86/other)'}`,
    `Vector unit  : ${hw.hasNeon ? 'NEON / ASIMD reported by the OS' : 'not exposed (host reports none)'}`,
  ];
}

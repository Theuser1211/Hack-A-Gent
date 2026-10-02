/**
 * Representative Arm platforms for context. These are reference figures for the
 * optimization guide — they are NOT measured on this host and must never be
 * presented as live results. Every measured number in the report comes from the
 * bench harness only.
 */
export interface ReferenceDevice {
  device: string;
  cores: string;
  clockGhz: string;
  vectorUnit: string;
  notes: string;
}

export const REFERENCE_DEVICES: ReferenceDevice[] = [
  {
    device: 'Raspberry Pi 5 (BCM2712)',
    cores: '4× Cortex-A76',
    clockGhz: '2.4',
    vectorUnit: 'NEON (128-bit)',
    notes: 'A common single-board target for on-device inference.',
  },
  {
    device: 'Raspberry Pi 4 (BCM2711)',
    cores: '4× Cortex-A72',
    clockGhz: '1.8',
    vectorUnit: 'NEON (128-bit)',
    notes: 'Tight L2; tiled matmul and INT8 matter most here.',
  },
  {
    device: 'Apple M-series',
    cores: 'P + E clusters',
    clockGhz: '3.0+',
    vectorUnit: 'ASIMD (NEON) + AMX',
    notes: 'arm64 host with the widest NEON/ASIMD path of the set.',
  },
  {
    device: 'Neoverse N1 / Graviton 2',
    cores: '64× Neoverse N1',
    clockGhz: '2.5',
    vectorUnit: 'NEON (128-bit)',
    notes: 'Server-class Arm; large-scale inference is cache-bound.',
  },
  {
    device: 'Cortex-A53 (older mobile)',
    cores: '4× in-order',
    clockGhz: '1.4',
    vectorUnit: 'NEON (64/128-bit)',
    notes: 'In-order core — loop tiling and memory layout dominate.',
  },
];

export function referenceNote(): string {
  return 'Reference table is context only: the speedups reported above were measured on THIS host and are not comparable across boards.';
}

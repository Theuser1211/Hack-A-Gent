import { getSeededRandom, deterministicNow, createDeterministicUuid } from './determinism-kernel.js';

export type CommunicationChannel = 'HIGH_BANDWIDTH' | 'STANDARD' | 'RELIABLE' | 'BASIC';

export interface CompanyGenome { companyId: string;
  hierarchyDepth: number;
  departmentCount: number;
  centralization: number;
  specializationRatio: number;
  communicationDensity: number;
  coordinationComplexity: number;
  autonomyLevel: number;
  repairStrategy: string;
  innovationPolicy: string;
  hiringPhilosophy: string;
  culture: Record<string, number>;
  lastEvolutionTimestamp: string; }

export interface OrganizationalChange { changeId: string;
  companyId: string;
  changeType: OrganizationalChangeType;
  targetStructure: CompanyGenome;
  rationale: string;
  cost: number;
  impactScore: number;
  success: boolean;
  timestamp: string;
  implementingAgents: string[]; }

export interface EvolutionaryContext { companyId: string;
  pressure: number;
  marketPressure?: number;
  competitionLevel?: number;
  resourceAvailability?: number;
  failureRate?: number; }

export interface RestructureStrategy { type: 'CONSOLIDATION' | 'SPECIALIZATION' | 'OPTIMIZATION' | 'DECENTRALIZATION' | 'CONSERVATIVE' | 'EXPERIMENTAL'; }

export interface TaskForceConfig { name: string;
  budget: number;
  teamSize: number;
  autonomyLevel: number;
  latency: number;
  redundancy: number;
  complexity: number;
  objective: string; }

export interface WorkflowOptimizer { optimizeLink(link: CommunicationLink): CommunicationLink; }

export enum OrganizationalChangeType { DEPARTMENT_SPLIT = 'department_split',
  DEPARTMENT_MERGE = 'department_merge',
  HIERARCHY_OPTIMIZATION = 'hierarchy_optimization',
  COMMUNICATION_RESTRUCTURE = 'communication_restructure',
  WORKFLOW_OPTIMIZATION = 'workflow_optimization',
  CULTURE_SHIFT = 'culture_shift',
  STRATEGY_AND_POLICY_REFINEMENT = 'strategy_and_policy_refinement',
  RESOURCE_REALLOCEMENT = 'resource_reallocation',
  TEMPORARY_TASK_FORCE = 'temporary_task_force',
  PERMANENT_DEPARTMENT = 'permanent_department',
  DEPARTMENT_RETIREMENT = 'department_retirement' }

export enum DepartmentType { ENGINEERING = 'engineering',
  RESEARCH = 'research',
  PRODUCT = 'product',
  OPERATIONS = 'operations',
  SECURITY = 'security',
  COMMUNICATION = 'communication',
  INFRASTRUCTURE = 'infrastructure',
  SERVICES = 'services',
  ADMIN = 'admin',
  UX_UI = 'ux_ui',
  INNOVATION = 'innovation' }

export enum ChannelType { EMAIL = 'email',
  MESSENGER = 'messenger',
  VIDEO_CALL = 'video_call',
  SLACK = 'slack',
  PROJECT_MANAGEMENT = 'project_management',
  WIKI = 'wiki',
  DOCUMENT_SHARE = 'document_share' }

export enum RepairStrategy { INCREMENTAL = 'incremental',
  HIERARCHICAL = 'hierarchical',
  NETWORKED = ' networked',
  DECENTRALIZED = 'decentralized',
  AI_DIRECTED = 'ai_directed',
  SHALLOW = 'shallow',
  DEEP = 'deep' }

export enum InnovationPolicy { CONSERVATIVE = 'conservative',
  BALANCED = 'balanced',
  EXPERIMENTAL = 'experimental',
  RADICAL = 'radical' }

export enum HiringPhilosophy { PERFORMANCE_BASED = 'performance_based',
  SKILL_SPECIALIZED = 'skill_specialized',
  CULTURAL_FIT = 'cultural_fit',
  GROWTH_ORIENTED = 'growth_oriented' }

export interface Department { departmentId: string;
  name: string;
  type: DepartmentType;
  level: number;
  parentDepartmentId?: string;
  subDepartments: string[];
  budget: number;
  teamSize: number;
  autonomyLevel: number;
  efficiency: number;
  effectiveness: number;
  latency: number;
  redundancy: number;
  complexity: number; }

export interface CommunicationLink { linkId: string;
  sourceAgentId: string;
  targetAgentId: string;
  latency: number;
  redundancy: number;
  cost: number;
  quality: number;
  channel: CommunicationChannel; }

export interface InformationFlow { flowId: string;
  sourceDepartmentId: string;
  targetDepartmentId: string;
  primaryPath: CommunicationLink[];
  backupPaths: CommunicationLink[];
  efficiency: number;
  redundancy: number; }

export class OrganizationEvolutionEngine { private readonly seed: number;
  private readonly rng: ReturnType<typeof getSeededRandom>;
  private companyGenomes: Map<string, CompanyGenome> = new Map();
  private organizationalChanges: OrganizationalChange[] = [];
  private communicationNetworks: Map<string, Map<string, CommunicationLink>> = new Map();
  private departmentHierarchies: Map<string, Department[]> = new Map();
  private informationFlows: Map<string, InformationFlow> = new Map();
  private _counter = 0;

  constructor(seed = 42) { this.seed = seed;
    this.rng = getSeededRandom(seed + 54000); }

  // Core evolution methods
  evolveCompany(companyId: string, context: EvolutionaryContext): OrganizationalChange { const currentGenome = this.companyGenomes.get(companyId);
    if (!currentGenome) { throw new Error(`Company not found: ${ companyId }`); }

    const newGenome = this.calculateOptimalGenome(currentGenome, context);
    const change: OrganizationalChange = { changeId: `change-${ createDeterministicUuid(this.seed, ++this._counter) }`,
      companyId,
      changeType: this.determineChangeType(currentGenome, newGenome),
      targetStructure: newGenome,
      rationale: this.generateChangeRationale(currentGenome, newGenome),
      cost: this.calculateEvolutionCost(currentGenome, newGenome),
      impactScore: this.calculateImpactScore(currentGenome, newGenome),
      success: true,
      timestamp: deterministicNow(this.seed + this._counter),
      implementingAgents: [companyId] };

    this.companyGenomes.set(companyId, newGenome);
    this.organizationalChanges.push(change);
    this.updateCommunicationNetworks(companyId, newGenome);
    this.updateDepartmentHierarchies(companyId);
    this.updateInformationFlows(companyId);

    return change; }

  optimizeCommunication(companyId: string, efficiencyTarget: number): void { const currentLinks = this.communicationNetworks.get(companyId) || new Map();
    const optimizedLinks: Map<string, CommunicationLink> = new Map();
    for (const [pathKey, link] of currentLinks.entries()) { const potentialEfficiency = this.calculateLinkEfficiency(link);
      if (potentialEfficiency < efficiencyTarget) { const optimized = this.optimizeCommunicationLink(link);
        optimizedLinks.set(pathKey, optimized); } else { optimizedLinks.set(pathKey, link); }
    }

    this.communicationNetworks.set(companyId, optimizedLinks); }

  restructureDepartments(companyId: string, strategy: RestructureStrategy): OrganizationalChange { const currentDepartments = this.departmentHierarchies.get(companyId) || [];
    const newDepartments = this.applyRestructureStrategy(currentDepartments, strategy);
    const newGenome = this.updateGenomeFromDepartments(currentDepartments, newDepartments);

    const change: OrganizationalChange = { changeId: `restructure-${ createDeterministicUuid(this.seed, ++this._counter) }`,
      companyId,
      changeType: OrganizationalChangeType.DEPARTMENT_SPLIT,
      targetStructure: newGenome,
      rationale: `Applied ${ strategy.type } restructure strategy`,
      cost: this.calculateRestructuringCost(currentDepartments, newDepartments),
      impactScore: this.calculateRestructureImpact(currentDepartments, newDepartments),
      success: true,
      timestamp: deterministicNow(this.seed + this._counter),
      implementingAgents: [companyId] };

    this.departmentHierarchies.set(companyId, newDepartments);
    this.companyGenomes.set(companyId, newGenome);
    this.organizationalChanges.push(change);

    return change; }

  createTemporaryTaskForce(companyId: string, taskForceConfig: TaskForceConfig): OrganizationalChange { const taskForceId = `taskforce-${ createDeterministicUuid(this.seed, ++this._counter) }`;
    const taskForceDepartment: Department = { departmentId: taskForceId,
      name: taskForceConfig.name,
      type: DepartmentType.ENGINEERING,
      level: 1,
      parentDepartmentId: companyId,
      subDepartments: [],
      budget: taskForceConfig.budget,
      teamSize: taskForceConfig.teamSize,
      autonomyLevel: taskForceConfig.autonomyLevel,
      efficiency: 0.7,
      effectiveness: 0.8,
      latency: taskForceConfig.latency,
      redundancy: taskForceConfig.redundancy,
      complexity: taskForceConfig.complexity };

    const currentDepartments = this.departmentHierarchies.get(companyId) || [];
    currentDepartments.push(taskForceDepartment);
    this.departmentHierarchies.set(companyId, currentDepartments);

    const change: OrganizationalChange = { changeId: taskForceId,
      companyId,
      changeType: OrganizationalChangeType.TEMPORARY_TASK_FORCE,
      targetStructure: this.updateGenomeFromDepartments(currentDepartments, currentDepartments),
      rationale: `Created temporary task force: ${ taskForceConfig.name }`,
      cost: taskForceConfig.budget,
      impactScore: 0.6,
      success: true,
      timestamp: deterministicNow(this.seed + this._counter),
      implementingAgents: [companyId] };

    this.organizationalChanges.push(change);

    return change; }

  // Utility methods for optimization
  calculateHierarchicalDepth(complexityMap: Map<string, number>): number { return Array.from(complexityMap.values()).reduce((sum, complexity) => sum + complexity, 0) / complexityMap.size; }

  calculateSpecializationRatio(complexityMap: Map<string, number>): number { const engineeringCount = Array.from(complexityMap.entries())
      .filter(([key]) => key.includes('engineering'))
      .length;
    return engineeringCount / complexityMap.size; }

  optimizeWorkflow(companyId: string, workflowOptimizer: WorkflowOptimizer): void { const currentLinks = this.communicationNetworks.get(companyId) || new Map();
    const optimizedLinks: Map<string, CommunicationLink> = new Map();

    for (const [pathKey, link] of currentLinks.entries()) { const optimized = workflowOptimizer.optimizeLink(link);
      optimizedLinks.set(pathKey, optimized); }

    this.communicationNetworks.set(companyId, optimizedLinks); }

  calculateOrganizationFitness(companyId: string): number { const genome = this.companyGenomes.get(companyId);
    if (!genome) return 0;

    const departmentFitness = this.calculateDepartmentFitness(companyId);
    const communicationFitness = this.calculateCommunicationFitness(companyId);
    const cultureFitness = this.calculateCultureFitness(genome);
    const economicFitness = this.calculateEconomicFitness(companyId);

    return (
      departmentFitness * 0.25 +
      communicationFitness * 0.25 +
      cultureFitness * 0.25 +
      economicFitness * 0.25
    ); }

  getCompanyGenome(companyId: string): CompanyGenome | undefined { return this.companyGenomes.get(companyId); }

  getOrganizationalHistory(companyId: string): OrganizationalChange[] { return this.organizationalChanges.filter(c => c.companyId === companyId); }

  getCommunicationNetwork(companyId: string): Map<string, CommunicationLink> { return this.communicationNetworks.get(companyId) || new Map(); }

  toJSON(): Record<string, unknown> { return { companyGenomes: Object.fromEntries(this.companyGenomes.entries()),
      organizationalChanges: this.organizationalChanges,
      departmentHierarchies: Object.fromEntries(this.departmentHierarchies.entries()),
      informationFlows: Object.fromEntries(this.informationFlows.entries()) }; }

  private calculateOptimalGenome(current: CompanyGenome, context: EvolutionaryContext): CompanyGenome { let optimalStrategy: 'split' | 'merge' | 'optimize' | 'maintain';
    const fitness = this.calculateOrganizationFitness(context.companyId);

    if (fitness < 0.3) optimalStrategy = 'split';
    else if (fitness > 0.8) optimalStrategy = 'merge';
    else if (fitness < 0.5 || context.pressure > 0.7) optimalStrategy = 'optimize';
    else optimalStrategy = 'maintain';

    switch (optimalStrategy) { case 'split':
        return this.generateSplitGenome(current);
      case 'merge':
        return this.generateMergeGenome(current);
      case 'optimize':
        return this.optimizeCurrentGenome(current);
      case 'maintain':
      default:
        return { ...current }; }
  }

  private determineChangeType(current: CompanyGenome, target: CompanyGenome): OrganizationalChangeType { const hierarchyDiff = target.hierarchyDepth - current.hierarchyDepth;
    const departmentDiff = target.departmentCount - current.departmentCount;

    if (Math.abs(hierarchyDiff) > 2) return OrganizationalChangeType.HIERARCHY_OPTIMIZATION;
    if (Math.abs(departmentDiff) > 3) return OrganizationalChangeType.DEPARTMENT_SPLIT;
    if (target.coordinationComplexity < current.coordinationComplexity * 0.7) return OrganizationalChangeType.RESOURCE_REALLOCEMENT;

    return OrganizationalChangeType.STRATEGY_AND_POLICY_REFINEMENT; }

  private generateChangeRationale(current: CompanyGenome, target: CompanyGenome): string { const changes: string[] = [];

    if (target.hierarchyDepth !== current.hierarchyDepth) { changes.push(`Hierarchy depth adjusted from ${ current.hierarchyDepth } to ${ target.hierarchyDepth }`); }
    if (target.departmentCount !== current.departmentCount) { changes.push(`Department count adjusted from ${ current.departmentCount } to ${ target.departmentCount }`); }
    if (target.coordinationComplexity !== current.coordinationComplexity) { changes.push(`Coordination complexity adjusted from ${ current.coordinationComplexity } to ${ target.coordinationComplexity }`); }
    if (target.autonomyLevel !== current.autonomyLevel) { changes.push(`Autonomy level adjusted from ${ current.autonomyLevel } to ${ target.autonomyLevel }`); }

    return changes.join('; ') || 'Organizational structure maintained'; }

  private calculateEvolutionCost(current: CompanyGenome, target: CompanyGenome): number { let cost = 0;

    cost += Math.abs(target.hierarchyDepth - current.hierarchyDepth) * 50;
    cost += Math.abs(target.departmentCount - current.departmentCount) * 100;
    cost += Math.abs(target.coordinationComplexity - current.coordinationComplexity) * 75;
    cost += Math.abs(target.autonomyLevel - current.autonomyLevel) * 40;

    return cost; }

  private calculateImpactScore(current: CompanyGenome, target: CompanyGenome): number { const fitnessImprovement = this.calculateOrganizationFitness(current.companyId);
    return Math.min(1, fitnessImprovement * 0.5 + 0.5); }

  private updateCommunicationNetworks(companyId: string, genome: CompanyGenome): void { const networks: Map<string, CommunicationLink> = new Map();
    const agentIds = Array.from({ length: 10 }, (_, i) => `agent-${ i }`);

    for (let i = 0; i < agentIds.length; i++) { for (let j = i + 1; j < agentIds.length; j++) { const latency = Math.max(1, Math.min(100, genome.hierarchyDepth * 5 + this.rng.next() * 20));
        const reliability = Math.min(1, 1 - latency / 100 + this.rng.next() * 0.2);

        const link: CommunicationLink = { linkId: `${ agentIds[i] }-to-${ agentIds[j] }-${ createDeterministicUuid(this.seed, this._counter++) }`,
          sourceAgentId: agentIds[i]!,
          targetAgentId: agentIds[j]!,
          latency,
          redundancy: Math.round((1 - reliability) * 100) / 100,
          cost: latency * 10,
          quality: reliability,
          channel: this.determineOptimalChannel(latency, reliability) };

        networks.set(`${ agentIds[i] }-${ agentIds[j] }`, link);
        networks.set(`${ agentIds[j] }-${ agentIds[i] }`, { ...link,
          sourceAgentId: agentIds[j]!,
          targetAgentId: agentIds[i]! }); }
    }

    this.communicationNetworks.set(companyId, networks); }

  private updateDepartmentHierarchies(companyId: string): void { const departments: Department[] = [];
    const numDepartments = Math.max(3, Math.min(10, Math.round(7 + (this.rng.next() - 0.5) * 4)));

    for (let i = 0; i < numDepartments; i++) { const deptType = Object.values(DepartmentType)[Math.floor(this.rng.next() * Object.values(DepartmentType).length)] as DepartmentType;
      const parentId = i > 0 ? `department-${ Math.floor(i / 2) }` : undefined;

      const department: Department = { departmentId: `department-${ i }`,
        name: `${ deptType } ${ i + 1 }`,
        type: deptType,
        level: Math.floor(i / 2) + 1,
        parentDepartmentId: parentId,
        subDepartments: [],
        budget: 100000 + this.rng.next() * 200000,
        teamSize: 3 + Math.floor(this.rng.next() * 8),
        autonomyLevel: 0.3 + this.rng.next() * 0.7,
        efficiency: 0.5 + this.rng.next() * 0.5,
        effectiveness: 0.5 + this.rng.next() * 0.5,
        latency: this.rng.next() * 50,
        redundancy: this.rng.next() * 0.3,
        complexity: this.rng.next() * 2 };

      if (parentId) { const parentDept = departments.find(d => d.departmentId === parentId);
        if (parentDept) { parentDept.subDepartments.push(department.departmentId); }
      }

      departments.push(department); }

    this.departmentHierarchies.set(companyId, departments); }

  private updateInformationFlows(companyId: string): void { const departments = this.departmentHierarchies.get(companyId) || [];
    const flows: InformationFlow[] = [];

    for (let i = 0; i < departments.length; i++) { for (let j = i + 1; j < departments.length; j++) { const source = departments[i]!;
        const target = departments[j]!;

        const flow: InformationFlow = { flowId: `flow-${ i }-${ j }-${ createDeterministicUuid(this.seed, this._counter++) }`,
          sourceDepartmentId: source.departmentId,
          targetDepartmentId: target.departmentId,
          primaryPath: [],
          backupPaths: [],
          efficiency: 0.6 + this.rng.next() * 0.4,
          redundancy: this.rng.next() * 0.5 };

        flows.push(flow); }
    }

    for (const flow of flows) { this.informationFlows.set(flow.flowId, flow); }
  }

  private calculateLinkEfficiency(link: CommunicationLink): number { return (1 - link.redundancy) * link.quality; }

  private optimizeCommunicationLink(link: CommunicationLink): CommunicationLink { const latencyReduction = Math.min(0.2, (100 - link.latency) / 500);
    const improvedLatency = Math.max(1, link.latency - latencyReduction * 20);
    const improvedReliability = Math.min(1, link.quality + latencyReduction * 0.1);

    return { ...link,
      latency: improvedLatency,
      redundancy: Math.max(0, link.redundancy - latencyReduction * 0.05),
      cost: improvedLatency * 10,
      quality: improvedReliability }; }

  private generateSplitGenome(current: CompanyGenome): CompanyGenome { const newGenome: Partial<CompanyGenome> = { ...current };
    newGenome.departmentCount = Math.min(15, current.departmentCount + 3);
    newGenome.hierarchyDepth = Math.min(4, current.hierarchyDepth + 1);
    return newGenome as CompanyGenome; }

  private generateMergeGenome(current: CompanyGenome): CompanyGenome { const newGenome: Partial<CompanyGenome> = { ...current };
    newGenome.departmentCount = Math.max(3, current.departmentCount - 2);
    newGenome.hierarchyDepth = Math.max(1, current.hierarchyDepth - 1);
    return newGenome as CompanyGenome; }

  private optimizeCurrentGenome(current: CompanyGenome): CompanyGenome { const newGenome: Partial<CompanyGenome> = { ...current };
    newGenome.autonomyLevel = Math.max(0.2, Math.min(0.8, current.autonomyLevel + (this.rng.next() - 0.5) * 0.2));
    newGenome.coordinationComplexity = Math.max(0.5, Math.min(2, current.coordinationComplexity + (this.rng.next() - 0.5) * 0.3));
    return newGenome as CompanyGenome; }

  private determineOptimalChannel(latency: number, reliability: number): CommunicationChannel { if (latency < 10 && reliability > 0.9) return 'HIGH_BANDWIDTH';
    if (latency < 20 && reliability > 0.8) return 'STANDARD';
    if (latency < 50 && reliability > 0.7) return 'RELIABLE';
    return 'BASIC'; }

  private calculateDepartmentFitness(companyId: string): number { const departments = this.departmentHierarchies.get(companyId) || [];
    const avgEfficiency = departments.reduce((sum, dept) => sum + dept.efficiency, 0) / Math.max(1, departments.length);
    const avgEffectiveness = departments.reduce((sum, dept) => sum + dept.effectiveness, 0) / Math.max(1, departments.length);
    return (avgEfficiency + avgEffectiveness) / 2; }

  private calculateCommunicationFitness(companyId: string): number { const links = this.communicationNetworks.get(companyId) || new Map();
    if (links.size === 0) return 0.5;

    const avgEfficiency = Array.from(links.values()).reduce((sum, link) => sum + this.calculateLinkEfficiency(link), 0) / links.size;
    return avgEfficiency; }

  private calculateCultureFitness(genome: CompanyGenome): number { const cultureImpact = ((genome.culture?.innovation ?? 0.5) + (genome.culture?.riskTaking ?? 0.5)) / 2;
    return Math.min(1, cultureImpact); }

  private calculateEconomicFitness(companyId: string): number { return this.rng.next(); }

  private applyRestructureStrategy(departments: Department[], strategy: RestructureStrategy): Department[] { switch (strategy.type) { case 'CONSOLIDATION':
        return this.consolidateSimilarFunctions(departments);
      case 'SPECIALIZATION':
        return this.specializeByFunction(departments);
      case 'OPTIMIZATION':
        return this.optimizeByPerformance(departments);
      case 'DECENTRALIZATION':
        return this.decentralizeStructure(departments);
      case 'CONSERVATIVE':
        return this.minimizeChanges(departments);
      case 'EXPERIMENTAL':
        return this.experimentalChanges(departments);
      default:
        return departments; }
  }

  private consolidateSimilarFunctions(departments: Department[]): Department[] { const engineeringDepts = departments.filter(d => d.type === DepartmentType.ENGINEERING);
    const researchDepts = departments.filter(d => d.type === DepartmentType.RESEARCH);
    const productDepts = departments.filter(d => d.type === DepartmentType.PRODUCT);

    if (engineeringDepts.length === 0) return departments;

    const consolidated = [...engineeringDepts, ...researchDepts, ...productDepts];

    const firstEng = engineeringDepts[0]!;
    const newEngineering: Department = { departmentId: firstEng.departmentId,
      name: 'Engineering & Research',
      type: DepartmentType.ENGINEERING,
      level: firstEng.level,
      parentDepartmentId: firstEng.parentDepartmentId,
      subDepartments: [...engineeringDepts.map(d => d.departmentId), ...researchDepts.map(d => d.departmentId)],
      budget: firstEng.budget,
      teamSize: firstEng.teamSize,
      autonomyLevel: firstEng.autonomyLevel,
      efficiency: firstEng.efficiency,
      effectiveness: firstEng.effectiveness,
      latency: firstEng.latency,
      redundancy: firstEng.redundancy,
      complexity: firstEng.complexity };

    const remaining = consolidated.filter(d => d.type !== DepartmentType.ENGINEERING && d.type !== DepartmentType.RESEARCH && d.type !== DepartmentType.PRODUCT);

    return [newEngineering, ...remaining]; }

  private specializeByFunction(departments: Department[]): Department[] { const types = Object.values(DepartmentType);
    const specialized = types.map((type, index) => { const existing = departments.find(d => d.type === type);
      if (existing) return existing;

      return { departmentId: `specialized-${index}`,
        name: `${type} specialization`,
        level: 1,
        parentDepartmentId: undefined,
        subDepartments: [],
        budget: 150000,
        teamSize: 6,
        autonomyLevel: 0.8,
        efficiency: 0.7,
        effectiveness: 0.8,
        latency: 20,
        redundancy: 0.1,
        complexity: 1.2,
        type: DepartmentType.ENGINEERING }; });

    return specialized; }

  private optimizeByPerformance(departments: Department[]): Department[] { return departments.map(dept => ({ ...dept,
      efficiency: Math.min(1, dept.efficiency + 0.1),
      effectiveness: Math.min(1, dept.effectiveness + 0.1),
      autonomyLevel: Math.max(0.2, dept.autonomyLevel - 0.1) })); }

  private decentralizeStructure(departments: Department[]): Department[] { return departments.map(dept => ({ ...dept,
      autonomyLevel: Math.min(1, dept.autonomyLevel + 0.2),
      efficiency: Math.max(0.3, dept.efficiency - 0.1) })); }

  private minimizeChanges(departments: Department[]): Department[] { return departments.map(dept => ({ ...dept,
      autonomyLevel: Math.max(0.4, dept.autonomyLevel - 0.05),
      efficiency: Math.min(0.9, dept.efficiency + 0.05) })); }

  private experimentalChanges(departments: Department[]): Department[] { const experimental = departments.map(dept => ({ ...dept,
      autonomyLevel: Math.min(1, dept.autonomyLevel + 0.3),
      efficiency: Math.max(0.2, dept.efficiency - 0.2),
      latency: Math.max(10, dept.latency + 20),
      redundancy: Math.min(0.5, dept.redundancy + 0.2),
      complexity: Math.min(3, dept.complexity + 0.5) }));

    const newDepartment: Department = { departmentId: 'experimental-' + Date.now(),
      name: 'Experimental Division',
      type: DepartmentType.INNOVATION,
      level: 1,
      parentDepartmentId: departments[0]?.departmentId,
      subDepartments: [],
      budget: 200000,
      teamSize: 8,
      autonomyLevel: 0.9,
      efficiency: 0.4,
      effectiveness: 0.6,
      latency: 40,
      redundancy: 0.3,
      complexity: 2.5 };

    return [...experimental, newDepartment]; }

  private updateGenomeFromDepartments(departments: Department[], newDepartments: Department[]): CompanyGenome { const genome: Partial<CompanyGenome> = { companyId: 'temp-id',
      hierarchyDepth: Math.max(1, Math.ceil(Math.log2(newDepartments.length + 1))),
      departmentCount: newDepartments.length,
      centralization: 0.5,
      specializationRatio: 0.5,
      communicationDensity: 0.6,
      coordinationComplexity: 1.0,
      autonomyLevel: 0.5,
      repairStrategy: RepairStrategy.AI_DIRECTED,
      innovationPolicy: InnovationPolicy.EXPERIMENTAL,
      hiringPhilosophy: HiringPhilosophy.GROWTH_ORIENTED,
      culture: { innovation: 0.7,
        riskTaking: 0.6,
        collaboration: 0.8,
        efficiency: 0.6,
        qualityFocus: 0.8,
        autonomy: 0.7,
        hierarchyPreference: 0.3,
        changeAdaptation: 0.8,
        learningOrientation: 0.9,
        competitionLevel: 0.4 },
      lastEvolutionTimestamp: deterministicNow(this.seed) };

    return genome as CompanyGenome; }

  private calculateRestructuringCost(original: Department[], newDepts: Department[]): number { const cost = newDepts.reduce((sum, dept) => sum + dept.budget, 0) - original.reduce((sum, dept) => sum + dept.budget, 0);
    const teamSizeChange = Math.abs(newDepts.reduce((sum, dept) => sum + dept.teamSize, 0) - original.reduce((sum, dept) => sum + dept.teamSize, 0)) * 1000;
    return cost + teamSizeChange; }

  private calculateRestructureImpact(original: Department[], newDepts: Department[]): number { const originalEfficiency = original.reduce((sum, dept) => sum + dept.efficiency, 0) / original.length;
    const newEfficiency = newDepts.reduce((sum, dept) => sum + dept.efficiency, 0) / newDepts.length;

    const improvement = (newEfficiency - originalEfficiency) * 100;
    return Math.max(0, Math.min(1, improvement / 100));
  }
}

# Hack-A-Gent Figure & Diagram Descriptions

This document provides structured textual descriptions for all figures and diagrams in the paper, as text-only descriptions suitable for arXiv submission and accessible publication.

---

## Figure 1: System Architecture Diagram

**Description:** A layered architecture diagram showing the three-tier structure of Hack-A-Gent.

**Top Layer — Benchmark Definition:**
Five benchmark cards (AI, SaaS, WebApp, Healthcare, Education) feed into a `BenchmarkSpec` validator. Each card shows: name, category icon, difficulty badge (Easy/Medium/Hard), deliverable count, and success criterion count.

**Middle Layer — Evaluation Pipeline:**
Eight sequential phase boxes connected by rightward arrows forming a horizontal pipeline:

1. **Planning** (blue) — input: BenchmarkSpec, output: PlannerOutput
2. **Architecture** (blue) — input: PlannerOutput, output: ArchitectureBlueprint
3. **Building** (green) — input: ArchitectureBlueprint, output: GeneratedRepository
4. **Materialization** (green) — input: GeneratedRepository, output: Materialized Workspace
5. **Adversarial Mutation** (red, dashed border) — input: Repository, output: Mutated Repository. Label: "Conditional: adversarialMode=true"
6. **Verify & Repair** (orange, looping arrow back to itself) — input: Repository, output: Verified Repository. Label: "Up to repairLimit iterations"
7. **Testing** (blue) — input: Verified Repository, output: TestSuiteResult
8. **Judging** (purple) — input: all previous outputs, output: FinalEvaluationResult

Below the pipeline, a dashed box labeled "Artifacts" collects all phase outputs into structured storage.

**Bottom Layer — Multi-Agent League:**
Three agent icons (labeled Agent A, Agent B, Agent C) arranged horizontally, each connected to the pipeline through a shared interface arrow. Below agents: a Leaderboard table with columns Rank, Agent, Robustness, Survival, Specialization. To the right: a MutationGenome icon showing evolving DNA helix (generation counter g=0..n) and a Difficulty Controller icon showing BDI gauge.

**Connecting elements:**
- Solid lines = data flow
- Dashed lines = conditional flow
- Looping arrow = iterative process
- Color gradient from blue (deterministic) through orange (adaptive) to red (adversarial)

---

## Figure 2: Mutation Lifecycle Diagram

**Description:** A state-transition diagram showing the complete lifecycle of a mutation from selection to outcome evaluation.

**States (rounded rectangles):**

```
[Select Mutation Type]
         |
         v
[Select Target Module & File]
         |
         v
[Compute Intensity]
         |
         v
[Apply Mutation] ---(failure)---> [Log Null Result]
         | (success)
         v
[Record Mutation Metadata]
         |
         v
[Verification Detection] --(undetected)--> [Survived Mutation]
         | (detected)
         v
[Repair Attempt] --(no repair configured)--> [Unrepaired Error]
         | (repair attempted)
         v
[Successful Repair?]
    /            \
   yes            no
   |               |
   v               v
[Repaired]    [Persistent Error]
   |               |
   +-------+-------+
           |
           v
[Update Metrics & Genome Fitness]
```

**Decorations:**
- Each state shows the responsible system component in parentheses
- Intensity-dependent branches shown as small decision diamonds
- Mutation type icon (cross, wrench, bug) next to each path
- Dotted box around the entire lifecycle labeled "Repeat k times per run"

**Side panel:** Severity Legend showing four colored boxes:
- low (green) → mild typos, cosmetic changes
- medium (yellow) → functional corruption, detectable
- high (orange) → build-breaking changes
- critical (red) → destructive changes, likely unrecoverable

---

## Figure 3: Repair Loop Diagram

**Description:** A detailed flow diagram of the iterative verification-repair cycle.

**Start condition:** Repository after mutation application.

**Flow:**

```
[Mutated Repository]
        |
        v
[BuildVerifier.checkRepositoryStructure()]
        |
        v
[BuildVerifier.checkRequiredFiles()]
        |
        v
[BuildVerifier.checkModuleConsistency()]
        |
        v
[BuildVerifier.checkContentValidity()]
        |
        v
[BuildVerifier.checkMutationAwareStructure()]
        |
        v
[All checks passed?]
    /               \
   yes               no
   |                  |
   v                  v
[Proceed to       [Collect Errors]
 Testing/         [Group by Module]
 Judging]         [Categorize by Type]
                   |
                   v
              [CodeRepairProvider.repair()]
                   |
                   v
            [Strategy Selection]
             /    |    |    \
     no-op   regen patch rollback
             \    |    |    /
                   |
                   v
            [Apply Repair]
                   |
                   v
            [Re-verify]
                   |
                   v
            [iterations < limit?]
               /          \
              yes          no
              |             |
              v             v
         [Loop back]   [Max iterations
         to Verify]    reached → fail]
```

**Annotations:**
- Repair strategies are shown as branching paths with icons
- Dotted arrow from "Apply Repair" back to "Verify" with counter `i++`
- Solid arrow from "Proceed" exiting the loop to the right
- Error count display at each verification node (e.g., "3 errors found → 1 repaired")

---

## Figure 4: Multi-Agent League Structure

**Description:** A competition diagram showing how multiple agents interact with the benchmark pipeline and each other.

**Layout:** Center-out radial design.

**Center:** "Benchmark Pipeline" circle with 8 phase icons arranged clockwise around it.

**Outer ring:** Three agent nodes (A, B, C) at 120° intervals, each connected to the benchmark pipeline with bidirectional arrows.

**Agent node detail (expandable callout):**
Each agent node shows:
- Agent ID and name
- Specialization profile bar chart (mutation type on x-axis, performance on y-axis)
- Current rank badge
- Evolutionary trend line (10 most recent scores)

**League dynamics (annotated connections):**
- A→B: "Competitive pressure" (dashed line)
- B→C: "Specialization overlap" (dotted line)
- C→A: "Performance gap" (dashed line)

**Bottom panel — Shared State:**
- "SharedMutationState" box connected to all three agents with dotted lines
- "MutationGenome" box with evolution counter
- "DifficultyController" box with BDI gauge

**Right panel — Leaderboard:**
Live-updating leaderboard table with animated rank changes shown as arrows:
- ↑ rank improved
- ↓ rank declined
- → rank unchanged

---

## Figure 5: Adversarial Curriculum Evolution Graph

**Description:** A line chart showing how the adversarial curriculum adapts over successive benchmark rounds.

**X-axis:** "Benchmark Round" (1 through 20)

**Y-axis (left):** "BDI Score" (0–100)

**Y-axis (right):** "Global Difficulty Multiplier" (0.5–1.5)

**Three overlaid line plots:**

1. **BDI Score** (solid blue line) — oscillates between 30–80, trending upward as agents improve, with sharp drops when difficulty is increased
2. **Global Difficulty Multiplier** (dashed red line) — steps between 0.7, 1.0, and 1.3 corresponding to curriculum states "too hard", "balanced", "too easy"
3. **Agent Robustness** (dotted green line) — average across all agents, inverse correlation with BDI

**Shaded regions behind the chart:**
- Red zone (BDI < 30): "too easy" — curriculum increases difficulty
- Green zone (BDI 30–70): "balanced"
- Red zone (BDI > 70): "too hard" — curriculum decreases difficulty

**Annotations:**
- Vertical dashed lines at rounds where the curriculum state transitions
- Text labels: "Increased diversity target to high", "Reduced difficulty to 0.7x"
- Circular markers on the BDI line at curriculum decision points

---

## Figure 6: Leaderboard Evolution Over Time

**Description:** A multi-line chart tracking per-agent performance across benchmark rounds.

**X-axis:** "Benchmark Round" (1 through 20)

**Y-axis:** "Canonical Score" (0–100)

**Line series (one per agent):**
- Agent A (blue, solid) — starts at 60, climbs to 92 with some variance
- Agent B (green, dashed) — starts at 55, climbs to 78 with more variance
- Agent C (orange, dotted) — starts at 50, plateaus at 65 with high variance

**Additional data series:**
- Light gray shaded band showing ±1 standard deviation across all agents
- Red horizontal line at `passing_threshold = 70`
- Triangular markers at runs where agent ranked #1 for that round

**Annotations:**
- "Agent A achieves specialization in remove_file" at round 8 (blue upward arrow)
- "Genome crossover introduced new mutation strategy" at round 12 (vertical dashed line)
- "Difficulty controller increased pressure" at round 15 (shaded vertical band)
- Legend box in upper-left corner

---

## Figure 7: Ablation Study Comparison

**Description:** Grouped bar chart comparing agent performance across four ablation conditions.

**X-axis:** Four condition groups:
1. Full System
2. Without Mutations (A1)
3. Without Repair (A2)
4. Without Adaptive Curriculum (A3)

**Y-axis:** "Score" (0–100)

**Within each group, three bars (one per agent):**
- Agent A (blue)
- Agent B (green)
- Agent C (orange)

**Two subplots (side by side):**
- Left: Robustness Score
- Right: Canonical Score

**Error bars:** ±1 standard deviation across 3 runs per condition.

**Annotations:**
- Brackets showing significant differences (p < 0.05)
- "Robustness floor" horizontal line at the "Without Mutations" condition level
- "Repair contribution" labeled arrow showing score drop from Full System to Without Repair

---

## Figure 8: Mutation Response Heatmap

**Description:** A 15×3 heatmap showing per-mutation-type performance for each agent.

**X-axis:** 15 mutation types (grouped by category: File Structure, Content Distortion, Schema Violation, Semantic Inconsistency)

**Y-axis:** 3 agents (Agent A, Agent B, Agent C)

**Cell color:** Green (high performance 0.8–1.0) → Yellow (medium 0.4–0.8) → Red (low 0.0–0.4)

**Two adjacent heatmaps:**
- Left: Detection Rate
- Right: Repair Rate

**Row annotations:**
- Agent A: "Highest overall" label
- Agent B: "Strong against file structure" label
- Agent C: "Weak against semantic mutations" label

**Column annotations:**
- Stars (★) next to mutation types where any agent achieves > 0.9
- Warning triangles (⚠) next to mutation types where all agents score < 0.3
- Vertical divider lines between mutation categories

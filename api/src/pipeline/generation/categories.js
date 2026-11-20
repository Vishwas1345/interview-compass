// Which question categories to generate, and which requirements each one gets
// (spec step 6). Decided in code so that "a published system design round changes
// the kit" is visible and testable, not left to a prompt.

const SENIOR = new Set(["senior", "staff", "principal", "lead", "manager"]);

// → [{ category, requirements, count, reason }]
export function planCategories({ requirements, stages = [], seniority = "" }) {
  const technical = requirements.filter((r) => r.kind === "technical" || r.kind === "domain");
  const behavioural = requirements.filter((r) => r.kind === "behavioural");
  const domain = requirements.filter((r) => r.kind === "domain");
  const kinds = new Set(stages.map((s) => s.kind));
  const plan = [];

  if (technical.length > 0) {
    plan.push({
      category: "technical",
      requirements: technical,
      count: clamp(Math.ceil(technical.length * 1.5), 3, 8),
      reason: `${technical.length} technical or domain requirement(s)`,
    });
  }

  plan.push({
    category: "behavioural",
    requirements: behavioural,
    count: behavioural.length > 0 ? clamp(behavioural.length * 2, 3, 5) : 2,
    reason: behavioural.length > 0 ? `${behavioural.length} behavioural requirement(s)` : "general questions about the role's responsibilities",
  });

  const designRound = kinds.has("system-design");
  const seniorTechnical = SENIOR.has(seniority) && technical.length > 0;
  if (designRound || seniorTechnical) {
    plan.push({
      category: "system-design",
      requirements: technical.filter((r) => r.kind === "technical"),
      count: designRound ? 3 : 2,
      reason: designRound ? "the published interview process includes a system design round" : `the role is ${seniority} with technical requirements`,
    });
  }

  plan.push({
    category: "company-fit",
    requirements: domain,
    count: 3,
    reason: "always: motivation and fit with the company",
  });

  return plan;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

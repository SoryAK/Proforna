/**
 * Generates knowledge-graph batch JSON for doc/config/data batches.
 * Handles: markdown docs, JSON configs, YAML infra, data files, etc.
 */
const fs = require('fs');
const path = require('path');

const PROJECT = 'C:\\Users\\Sory kaba\\OneDrive\\RESUMSIFY\\Personal_Projects\\Dev_Pojects\\resumsify';
const INTERMEDIATE = path.join(PROJECT, '.understand-anything', 'intermediate');
const TMP = path.join(PROJECT, '.understand-anything', 'tmp');

function getComplexity(sizeLines) {
  if (sizeLines > 200) return 'complex';
  if (sizeLines > 50) return 'moderate';
  return 'simple';
}

// Summaries for known files
const KNOWN_SUMMARIES = {
  '.github/workflows/squad-heartbeat.yml': 'CI/CD workflow that periodically triggers the Squad AI agent system health check, ensuring agent state remains consistent.',
  '.github/workflows/squad-issue-assign.yml': 'CI/CD workflow that automatically assigns new GitHub issues to squad agent queues based on content and routing rules.',
  '.github/workflows/squad-triage.yml': 'CI/CD workflow handling GitHub issue triage — analyzes new issues and applies routing labels for the agent-based development squad.',
  '.github/workflows/sync-squad-labels.yml': 'CI/CD workflow that synchronizes squad routing labels in the GitHub repository to match the squad routing configuration.',
  '.Manual/README.md': 'Index and usage guide for the .Manual/ directory — explains the manual template format and how to maintain feature documentation.',
  '.Manual/_template.md': 'Template for feature manual entries — defines the Industry Manual format with sections for feature name, description, workflow, config, and constraints.',
  '.Manual/worklog-bulk-actions.md': 'Manual documenting the worklog bulk-actions feature — explains how multi-select, batch pin/delete, and bulk folder assignment work.',
  '.Manual/worklog-dnd-reorder.md': 'Manual documenting the worklog drag-and-drop reorder feature — explains UI interactions, folder tree reordering, and persistence model.',
  '.Manual/worklog-folders.md': 'Manual documenting the worklog folder system — explains creation, nesting, renaming, and entry assignment to folders.',
  '.Manual/worklog-notes-three-pane.md': 'Manual documenting the worklog three-pane note editor — explains the split-layout UI, Tiptap editor integration, and pane resizing.',
  '.Manual/worklog-search.md': 'Manual documenting the worklog full-text search feature — explains search input, filtering, and result highlighting.',
  '.features/job-search/focus-mode-cleanup.md': 'Feature specification for focus-mode cleanup in job search — details UI simplification and distraction-reduction improvements.',
  '.features/job-search/job-search.md': 'Feature specification for the job search module — describes search functionality, filters, and result display requirements.',
  '.features/job-search/multi-query-search.md': 'Feature specification for multi-query job search — describes the ability to run multiple simultaneous job searches with combined results.',
  '.github/agents/axiom.agent.md': 'Agent definition for Axiom — Backend/API engineer squad agent responsible for route handlers, Prisma schema, migrations, and external APIs.',
  '.github/agents/echo.agent.md': 'Agent definition for Echo — QA/Testing squad agent responsible for Vitest tests, TypeScript compliance, security review, and edge case analysis.',
  '.github/agents/nova.agent.md': 'Agent definition for Nova — Frontend engineer squad agent responsible for React components, Next.js pages, TanStack Query hooks, and UI.',
  '.github/agents/ralph.agent.md': 'Agent definition for Ralph — Issue triage & watch squad agent that monitors GitHub issues, applies labels, and escalates blockers.',
  '.github/agents/rex.agent.md': 'Agent definition for Rex — Lead/Architect squad agent responsible for sprint planning, ADRs, and architectural trade-off decisions.',
  '.github/agents/scribe.agent.md': 'Agent definition for Scribe — Documentation specialist squad agent managing session handoffs, decisions log, and wisdom distillation.',
  '.github/agents/squad.agent.md': 'Master squad orchestrator agent definition — coordinates all specialized squad agents (Axiom, Nova, Echo, Rex, Ralph, Scribe) for full-stack development workflows.',
  '.github/ui/global.md': 'UI design graph defining global shared patterns — buttons, empty states, loading indicators, and common component behaviors shared across all features.',
  '.github/ui/index.md': 'Index of the UI design graph files — lists all feature-specific design files and governance rules for the graph system.',
  '.github/ui/maps.md': 'UI design graph for the maps feature — documents map component patterns, drawing tools, and interactive overlay behaviors.',
  '.github/ui/resume.md': 'UI design graph for the resume feature — documents resume editor and preview component patterns.',
  '.github/ui/tokens.md': 'UI design token definitions — defines all approved color, spacing, and scale values used across the application. Authoritative source for Tailwind token decisions.',
  '.github/ui/worklog.md': 'UI design graph for the worklog feature — documents three-pane layout, editor patterns, folder tree, and worklog-specific design tokens.',
  '.squad/casting/history.json': 'Squad casting history log — records past agent assignments and task dispatches.',
  '.squad/casting/policy.json': 'Squad casting policy configuration — defines rules for how tasks are routed to squad agents based on content and type.',
  '.squad/casting/registry.json': 'Squad agent registry — lists active squad agents and their capabilities for casting decisions.',
  '.squad/ceremonies.md': 'Squad ceremony definitions — describes sprint ceremonies (planning, retro, review) and their formats within the AI-driven squad workflow.',
  '.squad/config.json': 'Squad top-level configuration — stores global squad settings and feature flags.',
  '.squad/decisions.md': 'Squad decisions log — records key technical decisions made by the squad during development.',
  '.squad/routing.md': 'Squad task routing rules — defines how GitHub issues and tasks are assigned to specific squad agents based on content analysis.',
  '.squad/team.md': 'Squad team composition — lists all active squad members, their roles, and areas of responsibility.',
  'IMPROVEMENTS.md': 'Comprehensive improvement backlog — documents planned enhancements across all features with priority ratings and implementation notes.',
  'Improvents.md': 'Supplementary improvements document — additional enhancement ideas and quick wins for the codebase.',
  'PROJECT_PLAN.md': 'High-level project plan — outlines development phases, milestones, and feature roadmap for Resumsify.',
  'README.md': 'Project overview README — brief introduction to Resumsify, development setup instructions, and contribution guidelines.',
  'TESTING.md': 'Testing guide — documents the testing strategy, test organization, Vitest configuration, and how to run/write tests.',
  'UI_UX_IMPROVEMENTS.md': 'UI/UX improvement backlog — documents planned user experience and interface enhancements with before/after descriptions.',
  'components.json': 'shadcn/ui component configuration — specifies the component library settings, base-ui adapter, style configuration, and alias paths.',
  'package.json': 'Root package manifest — defines all project dependencies (Next.js 16, React 19, Prisma, Tiptap, TanStack Query, Yjs, etc.), scripts, and build configuration.',
  'tsconfig.json': 'TypeScript compiler configuration — enables strict mode, configures Next.js plugin, sets path aliases for @/ imports, and targets ES2017.',
  '.copilot/mcp-config.json': 'GitHub Copilot MCP (Model Context Protocol) configuration — registers tool servers and their endpoints for AI assistant integration.',
  '.features/_TEMPLATE.md': 'Template for feature specification documents in the .features/ directory — provides standard format for describing feature requirements and design.',
  '.features/applications/applications.md': 'Feature specification for the job applications tracking module — describes application lifecycle management, status tracking, and pipeline view.',
  '.features/career-analytics/career-analytics.md': 'Feature specification for career analytics — describes KPI dashboards, application funnel metrics, and career progression tracking.',
  '.features/career-analytics/career-directional-model.md': 'Feature specification for the Career Directional Model (CDM) — describes skill decomposition, SOC code mapping, and career trajectory analysis.',
  '.features/company-deep-dive/company-deep-dive.md': 'Feature specification for company deep-dive research — describes company knowledge graph, financial data integration, and research workflows.',
  '.features/current-position/current-position.md': 'Feature specification for current position tracking — describes how users document and update their present job role and responsibilities.',
  '.features/dashboard/dashboard.md': 'Feature specification for the main dashboard — describes layout, widget composition, and key information surface on the home screen.',
  '.features/documents/documents.md': 'Feature specification for the documents module — describes document upload, management, and linking to job applications.',
  '.features/email/email.md': 'Feature specification for email integration — describes email parsing, lead capture, and automated data extraction workflows.',
  '.features/experience-diffusion-model/experience-diffusion-model.md': 'Feature specification for the Experience Diffusion Model — describes how work experience is analyzed and diffused across multiple resume contexts.',
  '.features/learning/learning.md': 'Feature specification for the learning module — describes micro-learning content, skill gap identification, and learning path recommendations.',
  '.features/portal/portal.md': 'Feature specification for the recruiter portal — describes public-facing profile pages, recruiter access controls, and share link management.',
  '.features/README.md': 'Index for the .features/ directory — explains the feature specification format and lists all active feature documents.',
  '.features/research/research.md': 'Feature specification for the research module — describes company research tools, news aggregation, and market intelligence features.',
  '.features/resumes/resumes.md': 'Feature specification for the resume builder — describes template selection, section editing, and PDF export capabilities.',
  '.features/worker-rights/worker-rights.md': 'Feature specification for worker rights information — describes regulatory guidance, labor law lookups, and rights education content.',
  '.gitattributes': 'Git attributes configuration — defines line ending normalization and file-specific git behaviors.',
  '.github/copilot-instructions.md': 'GitHub Copilot customization instructions — defines the Elite Engineering Agent operating procedure, skill pipeline, and coding standards for this repository.',
  '.squad/.first-run': 'Squad first-run marker — indicates the squad system has been initialized in this repository.',
  '.squad/identity/now.md': 'Squad current identity snapshot — describes the squad\'s current operational context, active sprint, and present focus.',
  '.squad/identity/wisdom.md': 'Squad accumulated wisdom — records lessons learned, patterns observed, and institutional knowledge gathered by the squad.',
  '.understand-anything/.understandignore': 'Understand-Anything ignore configuration — specifies files and directories to exclude from knowledge graph analysis.',
  '.understand-anything/tmp/ua-scan-files.json': 'Intermediate scan result file — raw output from the project scanner listing all discovered files before filtering.',
  'docs/plans/skill-graph-revamp.md': 'Technical plan for revamping the skill knowledge graph — describes new node types, edge relationships, and UI improvements.',
  'docs/plans/worklog-w1-w2-roadmap.md': 'Worklog development roadmap for W1/W2 sprints — details planned features, technical tasks, and milestones for the worklog feature.',
  'eslint.config.mjs': 'ESLint flat configuration — defines TypeScript linting rules, Next.js plugin settings, and code quality constraints for the project.',
  'fix.js': 'Utility script for ad-hoc code fixes and batch transformations — used for one-off code corrections during development.',
  'next.config.ts': 'Next.js configuration — sets up Turbopack, image optimization settings, experimental features, and server-side configuration.',
  'postcss.config.mjs': 'PostCSS configuration — configures TailwindCSS and Autoprefixer plugins for CSS processing.',
  'public/data/us-states.json': 'Static data file listing all US states with abbreviations and FIPS codes — used for geographic filtering and display.',
  'public/manifest.json': 'Progressive Web App (PWA) manifest — defines app name, icons, theme colors, and display mode for PWA installation.',
  'public/sw.js': 'Service worker script — implements offline caching strategy and push notification handling for the PWA.',
  'scripts/check-profile.js': 'Development utility script — checks and validates user profile completeness in the database.',
  'vitest.config.ts': 'Vitest test runner configuration — sets up test environment, coverage settings, and module resolution for the test suite.',
  'src/app/globals.css': 'Global CSS stylesheet — defines base TailwindCSS directives, CSS custom properties (design tokens), and global style resets.',
};

// Tags for known file types/paths
function getTags(filePath, fileCategory, language, sizeLines) {
  if (fileCategory === 'infra') return ['ci-cd', 'deployment', 'automation'];
  if (filePath.includes('.Manual/')) return ['documentation', 'feature-manual', 'development'];
  if (filePath.includes('.features/')) return ['documentation', 'feature-specification', 'planning'];
  if (filePath.includes('.github/agents/')) return ['documentation', 'ai-agent', 'squad'];
  if (filePath.includes('.github/ui/')) return ['documentation', 'design-system', 'ui-tokens'];
  if (filePath.includes('.squad/')) return ['configuration', 'squad', 'development'];
  if (filePath.includes('docs/adr/')) return ['documentation', 'architecture-decision', 'adr'];
  if (filePath.includes('docs/plans/')) return ['documentation', 'planning', 'roadmap'];
  if (filePath === 'package.json') return ['configuration', 'dependencies', 'build-system'];
  if (filePath === 'tsconfig.json') return ['configuration', 'typescript', 'build-system'];
  if (filePath === 'components.json') return ['configuration', 'ui-library', 'shadcn'];
  if (filePath === 'next.config.ts') return ['configuration', 'nextjs', 'build-system'];
  if (filePath === 'eslint.config.mjs') return ['configuration', 'linting', 'code-quality'];
  if (filePath === 'postcss.config.mjs') return ['configuration', 'css', 'build-system'];
  if (filePath === 'vitest.config.ts') return ['configuration', 'testing', 'build-system'];
  if (filePath === 'public/manifest.json') return ['configuration', 'pwa', 'infrastructure'];
  if (filePath === 'public/sw.js') return ['service-worker', 'pwa', 'offline'];
  if (filePath.includes('src/data/')) return ['data', 'reference-data', 'static'];
  if (filePath === 'prisma/schema.prisma') return ['schema-definition', 'database', 'prisma'];
  if (filePath.includes('.github/copilot-instructions')) return ['configuration', 'ai-instructions', 'development'];
  if (filePath === 'README.md') return ['documentation', 'entry-point', 'overview'];
  if (filePath.endsWith('.md')) return ['documentation', 'reference'];
  if (fileCategory === 'config') return ['configuration'];
  return ['reference'];
}

function getNodeType(fileCategory, filePath) {
  if (fileCategory === 'infra') return 'pipeline';
  if (fileCategory === 'docs') return 'document';
  if (fileCategory === 'data' && filePath.endsWith('.prisma')) return 'schema';
  if (fileCategory === 'data') return 'table';
  return 'config';
}

function getNodeIdPrefix(fileCategory, filePath) {
  if (fileCategory === 'infra') return 'pipeline';
  if (fileCategory === 'docs') return 'document';
  if (fileCategory === 'data' && filePath.endsWith('.prisma')) return 'schema';
  if (fileCategory === 'data') return 'table';
  return 'config';
}

function generateDocBatch(batchIndex) {
  const dispatchData = JSON.parse(fs.readFileSync(path.join(TMP, `ua-dispatch-data-${batchIndex}.json`), 'utf8'));
  
  const nodes = [];
  const edges = [];

  for (const file of dispatchData.files) {
    const { path: filePath, language, sizeLines, fileCategory } = file;
    const complexity = getComplexity(sizeLines);
    
    const summary = KNOWN_SUMMARIES[filePath] || 
      `${fileCategory === 'docs' ? 'Documentation' : fileCategory === 'infra' ? 'Infrastructure' : 'Configuration'} file: ${path.basename(filePath)}.`;
    
    const tags = getTags(filePath, fileCategory, language, sizeLines);
    const nodeType = getNodeType(fileCategory, filePath);
    const prefix = getNodeIdPrefix(fileCategory, filePath);
    const nodeId = `${prefix}:${filePath}`;
    
    nodes.push({
      id: nodeId,
      type: nodeType,
      name: path.basename(filePath),
      filePath,
      summary,
      tags,
      complexity
    });

    // Import edges (usually empty for docs but just in case)
    const imports = (dispatchData.batchImportData || {})[filePath] || [];
    for (const imp of imports) {
      edges.push({ source: nodeId, target: `file:${imp}`, type: 'imports', direction: 'forward', weight: 0.7 });
    }
  }

  // Add cross-doc edges for known relationships
  const nodeIds = new Set(nodes.map(n => n.id));

  const output = { nodes, edges };
  const outPath = path.join(INTERMEDIATE, `batch-${batchIndex}.json`);
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`Batch ${batchIndex}: ${nodes.length} nodes, ${edges.length} edges → batch-${batchIndex}.json`);
}

// Process doc/config batches 22-32
for (let i = 22; i <= 32; i++) {
  generateDocBatch(i);
}
console.log('Done with doc/config batches.');

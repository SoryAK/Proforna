/**
 * Generates batch-33.json — mixed config/code/docs/prisma batch.
 */
const fs = require('fs');
const path = require('path');

const PROJECT = 'C:\\Users\\Sory kaba\\OneDrive\\RESUMSIFY\\Personal_Projects\\Dev_Pojects\\resumsify';
const INTERMEDIATE = path.join(PROJECT, '.understand-anything', 'intermediate');
const TMP = path.join(PROJECT, '.understand-anything', 'tmp');

const dispatch = JSON.parse(fs.readFileSync(path.join(TMP, 'ua-dispatch-data-33.json'), 'utf8'));
const extract = JSON.parse(fs.readFileSync(path.join(TMP, 'ua-file-extract-results-33.json'), 'utf8'));

const extractMap = {};
for (const r of extract.results) extractMap[r.path] = r;

function complexity(lines) {
  if (lines > 200) return 'complex';
  if (lines > 50) return 'moderate';
  return 'simple';
}

const FILE_META = {
  'docs/plans/worklog-w1-w2-roadmap.md': { summary: 'Worklog W1/W2 development roadmap — details sprint milestones, technical tasks, and planned feature rollouts for the worklog subsystem.', tags: ['documentation', 'planning', 'roadmap'], type: 'document', prefix: 'document' },
  'eslint.config.mjs': { summary: 'ESLint flat configuration — sets up TypeScript linting rules, Next.js plugin integration, and code quality constraints.', tags: ['configuration', 'linting', 'code-quality'], type: 'config', prefix: 'config' },
  'fix.js': { summary: 'Ad-hoc utility script for batch code fixes and one-off transformations during active development.', tags: ['utility', 'script', 'development'], type: 'file', prefix: 'file' },
  'next.config.ts': { summary: 'Next.js 16 configuration — enables Turbopack, configures image optimization, body size limits, and experimental features.', tags: ['configuration', 'nextjs', 'build-system'], type: 'config', prefix: 'config' },
  'postcss.config.mjs': { summary: 'PostCSS configuration — activates TailwindCSS and Autoprefixer plugins for CSS processing pipeline.', tags: ['configuration', 'css', 'build-system'], type: 'config', prefix: 'config' },
  'prisma/schema.prisma': { summary: 'Complete Prisma database schema — defines all models (User, JobPosting, WorkHistory, WorklogEntry, etc.), relations, and indexes for the SQLite database.', tags: ['schema-definition', 'database', 'prisma'], type: 'schema', prefix: 'schema' },
  'public/data/us-states.json': { summary: 'Static reference data listing all US states with codes and metadata — used for geographic filtering across the job search and commute features.', tags: ['data', 'reference-data', 'static'], type: 'config', prefix: 'config' },
  'public/manifest.json': { summary: 'Progressive Web App manifest — defines Resumsify PWA metadata including app name, icons, theme color, and display mode for installability.', tags: ['configuration', 'pwa', 'manifest'], type: 'config', prefix: 'config' },
  'public/sw.js': { summary: 'Service worker script — implements offline caching strategy and handles background sync for the Resumsify PWA.', tags: ['service-worker', 'pwa', 'offline'], type: 'file', prefix: 'file' },
  'public/uploads/attachments/att-e0dccefb72ab3efb.docx': { summary: 'Uploaded attachment file stored in the public uploads directory.', tags: ['data', 'attachment', 'upload'], type: 'file', prefix: 'file' },
  'scripts/check-profile.js': { summary: 'Development utility script for validating and inspecting user profile data in the database.', tags: ['utility', 'script', 'development'], type: 'file', prefix: 'file' },
  'src/app/(app)/interviews/page.tsx': { summary: 'Interview prep page component — renders the interviews feature under the authenticated app layout.', tags: ['component', 'page', 'interviews'], type: 'file', prefix: 'file' },
  'src/app/(app)/portal/layout.tsx': { summary: 'Portal section layout component — wraps recruiter portal pages with shared layout and metadata.', tags: ['component', 'layout', 'portal'], type: 'file', prefix: 'file' },
  'src/app/api/building-footprints/nearby/route.ts': { summary: 'API route returning building footprints near a given coordinate — used for office building visualization on the job map.', tags: ['api-handler', 'rest-api', 'maps'], type: 'file', prefix: 'file' },
  'src/app/api/building-footprints/route.ts': { summary: 'Complex API route for building footprint data — parses OpenStreetMap Overpass API responses, identifies campus buildings, and returns structured polygon data.', tags: ['api-handler', 'rest-api', 'maps'], type: 'file', prefix: 'file' },
  'src/app/api/commute-matrix/route.ts': { summary: 'API route computing commute time matrix from a location to job sites — integrates with mapping APIs to calculate driving/transit durations.', tags: ['api-handler', 'rest-api', 'commute'], type: 'file', prefix: 'file' },
  'src/app/api/company-research/news/route.ts': { summary: 'API route fetching and tagging company news articles — used to surface recent news on company research pages.', tags: ['api-handler', 'rest-api', 'company-research'], type: 'file', prefix: 'file' },
  'src/app/api/detect-duplicates/route.ts': { summary: 'API route detecting duplicate job postings — uses token similarity and city extraction to identify redundant entries.', tags: ['api-handler', 'rest-api', 'deduplication'], type: 'file', prefix: 'file' },
  'src/app/api/extract-location/route.ts': { summary: 'API route extracting and normalizing location data from free-text job postings — parses state names and abbreviations.', tags: ['api-handler', 'rest-api', 'location-parsing'], type: 'file', prefix: 'file' },
  'src/app/api/gas-prices/route.ts': { summary: 'API route fetching current gas prices from the US EIA (Energy Information Administration) — used for commute cost calculations.', tags: ['api-handler', 'rest-api', 'commute-data'], type: 'file', prefix: 'file' },
  'src/app/api/isochrone/route.ts': { summary: 'API route generating isochrone (reachability) polygons for a given origin — returns time-based travel distance zones for job proximity analysis.', tags: ['api-handler', 'rest-api', 'maps'], type: 'file', prefix: 'file' },
  'src/app/api/vehicle-lookup/route.ts': { summary: 'API route for vehicle information lookup by VIN or model — used for commute vehicle fuel efficiency data.', tags: ['api-handler', 'rest-api', 'commute-data'], type: 'file', prefix: 'file' },
  'src/app/api/work-history/[id]/link/route.ts': { summary: 'API route for linking a work history entry to a job posting or company record by ID.', tags: ['api-handler', 'rest-api', 'work-history'], type: 'file', prefix: 'file' },
  'src/app/globals.css': { summary: 'Global CSS stylesheet — defines TailwindCSS base directives, CSS custom properties for the design system tokens, and global style resets.', tags: ['stylesheet', 'design-system', 'global'], type: 'file', prefix: 'file' },
  'src/app/interview/[roomId]/layout.tsx': { summary: 'Layout for individual interview room pages — wraps the real-time interview room with minimal chrome for focus.', tags: ['component', 'layout', 'interview-room'], type: 'file', prefix: 'file' },
};

const nodes = [];
const edges = [];

for (const file of dispatch.files) {
  const meta = FILE_META[file.path];
  const ext = extractMap[file.path] || {};
  const nonEmptyLines = ext.nonEmptyLines || 0;
  const cmplx = complexity(file.sizeLines > nonEmptyLines ? file.sizeLines : nonEmptyLines);

  const summary = meta?.summary || `Source file: ${path.basename(file.path)}.`;
  const tags = meta?.tags || ['code'];
  const type = meta?.type || 'file';
  const prefix = meta?.prefix || 'file';
  const nodeId = `${prefix}:${file.path}`;

  nodes.push({ id: nodeId, type, name: path.basename(file.path), filePath: file.path, summary, tags, complexity: cmplx });

  // Import edges
  const imports = (dispatch.batchImportData || {})[file.path] || [];
  for (const imp of imports) {
    edges.push({ source: nodeId, target: `file:${imp}`, type: 'imports', direction: 'forward', weight: 0.7 });
  }

  // Function/class nodes for code files
  const fns = (ext.functions || []).filter(fn => {
    const lineCount = (fn.endLine || 0) - (fn.startLine || 0) + 1;
    const isExported = (ext.exports || []).some(e => (e.name || e) === fn.name);
    return lineCount >= 10 || isExported;
  });

  for (const fn of fns) {
    const fnId = `function:${file.path}:${fn.name}`;
    nodes.push({
      id: fnId, type: 'function', name: fn.name, filePath: file.path,
      lineRange: [fn.startLine, fn.endLine],
      summary: `Function ${fn.name} in ${path.basename(file.path)}.`,
      tags: ['utility'], complexity: 'simple'
    });
    edges.push({ source: nodeId, target: fnId, type: 'contains', direction: 'forward', weight: 1.0 });
    const isExported = (ext.exports || []).some(e => (e.name || e) === fn.name);
    if (isExported) {
      edges.push({ source: nodeId, target: fnId, type: 'exports', direction: 'forward', weight: 0.8 });
    }
  }
}

const outPath = path.join(INTERMEDIATE, 'batch-33.json');
fs.writeFileSync(outPath, JSON.stringify({ nodes, edges }, null, 2));
console.log(`Batch 33: ${nodes.length} nodes, ${edges.length} edges`);

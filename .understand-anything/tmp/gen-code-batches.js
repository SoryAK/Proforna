/**
 * Programmatic generator for complex code batches 8-10, 13-21, 34.
 * Uses structural extraction data + import map to produce knowledge graph nodes/edges.
 * Infers summaries from file paths and function names.
 */
const fs = require('fs');
const path = require('path');

const PROJECT = 'C:\\Users\\Sory kaba\\OneDrive\\RESUMSIFY\\Personal_Projects\\Dev_Pojects\\resumsify';
const INTERMEDIATE = path.join(PROJECT, '.understand-anything', 'intermediate');
const TMP = path.join(PROJECT, '.understand-anything', 'tmp');

// Batches to generate (skip 11 and 12 — already done)
const BATCHES = [8, 9, 10, 13, 14, 15, 16, 17, 18, 19, 20, 21, 34];

// ─── Summary inference helpers ─────────────────────────────────────────────

function inferSummary(filePath) {
  const base = path.basename(filePath, path.extname(filePath));
  const parts = filePath.replace(/\\/g, '/').split('/');

  if (filePath.includes('/worklog/')) return inferWorklogSummary(base, filePath);
  if (filePath.includes('/api/')) return inferApiSummary(base, filePath);
  if (filePath.includes('page.tsx') || filePath.includes('page.ts')) return inferPageSummary(parts, filePath);
  if (filePath.includes('layout.tsx')) return `Layout component for the ${inferSection(parts)} section.`;
  if (filePath.includes('loading.tsx')) return `Loading skeleton for the ${inferSection(parts)} section.`;
  if (filePath.includes('error.tsx')) return `Error boundary for the ${inferSection(parts)} section.`;
  if (filePath.includes('/lib/')) return inferLibSummary(base, filePath);
  if (filePath.includes('/types/')) return `TypeScript type definitions for ${base.replace(/-/g, ' ')}.`;
  if (filePath.includes('/components/ui/')) return `Shadcn/ui (base-ui) component: ${base} — reusable UI primitive.`;
  if (filePath.includes('/components/')) return inferComponentSummary(base, filePath);
  if (filePath.includes('.test.') || filePath.includes('.spec.')) return `Vitest test suite for ${base.replace('.test','').replace('.spec','')} module.`;
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) return `TypeScript module: ${base}.`;
  return `Source file: ${base}.`;
}

function inferSection(parts) {
  const appIdx = parts.indexOf('(app)');
  if (appIdx >= 0 && parts[appIdx + 1]) return parts[appIdx + 1];
  const appIdx2 = parts.indexOf('app');
  if (appIdx2 >= 0 && parts[appIdx2 + 1] && parts[appIdx2 + 1] !== 'api') return parts[appIdx2 + 1];
  return parts[parts.length - 2] || 'unknown';
}

function inferPageSummary(parts, filePath) {
  const section = parts.find((p, i) => i > 0 && p !== 'app' && p !== '(app)' && p !== 'src' && !p.startsWith('[') && p !== 'page.tsx' && p !== 'page.ts');
  if (filePath.includes('/jobs/')) return 'Jobs page — displays job postings with filtering, search, and map integration.';
  if (filePath.includes('/worklog/')) return 'Worklog page — renders the three-pane worklog editor with folder tree, entry list, and Tiptap editor.';
  if (filePath.includes('/interview')) return 'Interview page — renders interview prep tools or real-time interview room UI.';
  if (filePath.includes('/profile')) return 'Profile page — allows user to view and edit their professional profile, resume sections, and career preferences.';
  if (filePath.includes('/market')) return 'Market data page — displays salary ranges, job market trends, and industry insights.';
  if (filePath.includes('/commute')) return 'Commute analyzer page — computes commute times, costs, and isochrone maps for job locations.';
  if (filePath.includes('/company-research') || filePath.includes('/research')) return 'Company research page — aggregates news, financials, and metadata about target companies.';
  if (filePath.includes('/recruiter') || filePath.includes('/portal')) return 'Recruiter portal page — manages recruiter access, job postings, and applicant views.';
  if (filePath.includes('/settings')) return 'Settings page — manages user preferences, account configuration, and integration settings.';
  if (filePath.includes('/annotations')) return 'Annotations page — displays document annotation review interface.';
  if (filePath.includes('/resume')) return 'Resume page — interactive resume builder/viewer.';
  if (filePath.includes('/dashboard') || filePath.includes('/(app)/page')) return 'Dashboard page — main authenticated landing page with activity summary and quick actions.';
  return `Page component for the ${section || 'app'} section.`;
}

function inferWorklogSummary(base, filePath) {
  if (base.includes('editor')) return 'Tiptap 3 rich-text editor component for worklog entries — supports Yjs collaboration, slash commands, and inline mentions.';
  if (base.includes('toolbar') || base.includes('menu-bar')) return 'Editor toolbar component providing formatting controls for the worklog Tiptap editor.';
  if (base.includes('folder')) return 'Folder tree component for organizing worklog entries by project and category.';
  if (base.includes('entry') || base.includes('list')) return 'Worklog entry list component — displays entries with timestamps, tags, and preview text.';
  if (base.includes('draft')) return 'Draft persistence layer for worklog — saves in-progress entries to IndexedDB for offline resilience.';
  if (base.includes('note') || base.includes('notes')) return 'Notes panel component in the worklog three-pane layout.';
  if (base.includes('provider') || base.includes('collab')) return 'Yjs collaboration provider for the worklog editor — manages WebSocket sync and IndexedDB persistence.';
  if (base.includes('extension') || base.includes('plugin')) return 'Custom Tiptap extension for the worklog editor.';
  if (base.includes('slash')) return 'Slash command menu extension for the worklog Tiptap editor.';
  if (base.includes('mention')) return 'Mention extension for tagging entries in the worklog editor.';
  if (base.includes('capture')) return 'Quick-capture component for fast worklog entry creation without opening the full editor.';
  if (base.includes('panel')) return 'Panel component in the worklog three-pane layout.';
  if (base.includes('header')) return 'Header component for the worklog section.';
  if (base.includes('sidebar')) return 'Sidebar component for worklog navigation.';
  if (base.includes('worklog') && (base.includes('page') || filePath.includes('page.tsx'))) return 'Worklog feature page — three-pane layout: folder tree, entry list, and rich-text editor.';
  return `Worklog subsystem component: ${base} — part of the Tiptap/Yjs worklog editor.`;
}

function inferApiSummary(base, filePath) {
  if (filePath.includes('/worklog/')) return `Worklog API route — handles CRUD operations for worklog entries, folders, or drafts.`;
  if (filePath.includes('/interview')) return `Interview API route — manages interview rooms, session tokens, or recording data.`;
  if (filePath.includes('/resume')) return `Resume API route — handles interactive resume CRUD or rendering.`;
  if (filePath.includes('/jobs')) return `Jobs API route — manages job posting data, searches, or recommendations.`;
  if (filePath.includes('/profile')) return `Profile API route — reads or updates user profile data.`;
  if (filePath.includes('/upload')) return `Upload API route — handles file/image uploads to the public uploads directory.`;
  if (filePath.includes('/cache')) return `Cache management API route.`;
  if (filePath.includes('/email')) return `Email API route — handles email sending or parsing.`;
  return `API route handler for ${base.replace(/-/g, ' ')}.`;
}

function inferLibSummary(base, filePath) {
  if (base === 'utils') return 'Shared utility functions — includes Tailwind cn() merger, date formatters, and string helpers.';
  if (base.includes('auth')) return 'Authentication helpers — manages session validation and user auth state.';
  if (base.includes('worklog')) return 'Worklog library module — business logic for worklog entry management, folder operations, and data transformations.';
  if (base.includes('cache')) return 'Server-side in-memory cache module — caches expensive API responses with TTL-based expiry.';
  if (base.includes('email')) return 'Email parsing and sending utilities.';
  if (base.includes('interview')) return 'Interview rooms library — manages room creation, participant tokens, and session state.';
  if (base.includes('taxes') || base.includes('tax')) return 'Tax calculation utilities for commute cost analysis — computes state income tax estimates.';
  if (base.includes('prisma') || base === 'db') return 'Prisma client singleton — shared database connection instance for server-side queries.';
  if (base.includes('map') || base.includes('geo')) return 'Geographic/mapping utilities — coordinate transformations, distance calculations, and GeoJSON helpers.';
  if (base.includes('pdf')) return 'PDF generation utilities for resume export.';
  if (base.includes('search')) return 'Search utilities — text normalization, token similarity, and saved search management.';
  return `Library module: ${base.replace(/-/g, ' ')}.`;
}

function inferComponentSummary(base, filePath) {
  if (base.includes('job-map') || (base.includes('map') && base.includes('job'))) return 'Google Maps job location map — renders job sites with custom markers, polygon filters, and commute zone overlays.';
  if (base.includes('gallery') || base.includes('master-gallery')) return 'Master gallery component — grid view for managing uploaded assets (resumes, documents, images).';
  if (base.includes('interactive-resume')) return 'Interactive resume component — split-pane resume builder/viewer with live preview.';
  if (base.includes('industry-research')) return 'Industry research component — aggregates salary, growth, and trend data for a selected industry.';
  if (base.includes('video-call')) return 'Video call component — WebRTC-based video/audio interface for interview rooms.';
  if (base.includes('provider') || base === 'providers') return 'React context providers — wraps the app with TanStack Query, theme, auth, and toast providers.';
  if (base.includes('pwa')) return 'PWA registration component — registers the service worker for offline support.';
  if (base.includes('asset-picker')) return 'Asset picker component — file browser/selector for choosing uploaded documents and images.';
  if (base.includes('drawing') || base.includes('polygon')) return 'Map drawing component — allows users to draw polygon filters on the job map.';
  if (base.includes('annotation')) return 'Document annotation component — inline commenting and markup on resume/document views.';
  if (base.includes('recruiter')) return 'Recruiter-facing component for the portal section.';
  if (base.includes('navbar') || base.includes('nav')) return 'Navigation bar component.';
  if (base.includes('sidebar')) return 'Sidebar navigation component.';
  if (base.includes('toast') || base.includes('notification')) return 'Toast/notification component for user feedback messages.';
  if (base.includes('modal') || base.includes('dialog')) return 'Modal/dialog component.';
  if (base.includes('button')) return 'Button UI primitive component.';
  if (base.includes('input')) return 'Input field UI primitive.';
  if (base.includes('select')) return 'Select/dropdown UI primitive.';
  if (base.includes('table')) return 'Data table component.';
  if (base.includes('card')) return 'Card layout component.';
  if (base.includes('badge')) return 'Badge/tag UI element.';
  if (base.includes('skeleton')) return 'Loading skeleton placeholder component.';
  if (base.includes('avatar')) return 'User avatar component.';
  if (base.includes('tabs')) return 'Tabs navigation component.';
  if (base.includes('sheet')) return 'Slide-in sheet/drawer component.';
  if (base.includes('accordion')) return 'Accordion expand/collapse component.';
  if (base.includes('tooltip')) return 'Tooltip hover-over component.';
  if (base.includes('popover')) return 'Popover floating content component.';
  if (base.includes('dropdown')) return 'Dropdown menu component.';
  if (base.includes('checkbox')) return 'Checkbox input component.';
  if (base.includes('radio')) return 'Radio button group component.';
  if (base.includes('switch')) return 'Toggle switch component.';
  if (base.includes('slider')) return 'Range slider component.';
  if (base.includes('progress')) return 'Progress bar/indicator component.';
  if (base.includes('separator')) return 'Horizontal/vertical separator component.';
  if (base.includes('label')) return 'Form label component.';
  if (base.includes('form')) return 'Form wrapper component with validation support.';
  if (base.includes('command')) return 'Command palette component for keyboard-driven navigation.';
  if (base.includes('calendar')) return 'Date picker calendar component.';
  if (base.includes('scroll')) return 'Scroll area component.';
  if (base.includes('resizable')) return 'Resizable panel component.';
  if (base.includes('collapsible')) return 'Collapsible expand/collapse container.';
  if (base.includes('context-menu')) return 'Right-click context menu component.';
  if (base.includes('menubar')) return 'Horizontal menubar component.';
  if (base.includes('navigation-menu')) return 'Navigation menu component.';
  if (base.includes('pagination')) return 'Pagination component for data tables.';
  if (base.includes('hover-card')) return 'Hover card floating content component.';
  if (base.includes('alert')) return 'Alert/notification banner component.';
  if (base.includes('aspect-ratio')) return 'Aspect ratio container component.';
  if (base.includes('toggle')) return 'Toggle button component.';
  if (base.includes('breadcrumb')) return 'Breadcrumb navigation component.';
  if (base.includes('sonner')) return 'Sonner toast notification integration.';
  if (base.includes('chart')) return 'Chart/data visualization component.';
  return `React component: ${base.replace(/-/g, ' ')}.`;
}

function inferTags(filePath) {
  const tags = [];
  if (filePath.includes('/worklog/')) tags.push('worklog');
  if (filePath.includes('/api/')) tags.push('api-handler');
  if (filePath.includes('/components/ui/')) tags.push('ui-primitive');
  if (filePath.includes('/components/')) tags.push('component');
  if (filePath.includes('/lib/')) tags.push('utility');
  if (filePath.includes('/types/')) tags.push('types');
  if (filePath.includes('/app/')) {
    if (filePath.includes('page.tsx')) tags.push('page');
    if (filePath.includes('layout.tsx')) tags.push('layout');
    if (filePath.includes('loading.tsx')) tags.push('loading');
    if (filePath.includes('error.tsx')) tags.push('error-boundary');
  }
  if (filePath.includes('(app)')) tags.push('auth');
  if (filePath.includes('/interview')) tags.push('interview');
  if (filePath.includes('/jobs') || filePath.includes('job-')) tags.push('jobs');
  if (filePath.includes('/map') || filePath.includes('map-') || filePath.includes('-map')) tags.push('maps');
  if (filePath.includes('/profile')) tags.push('profile');
  if (filePath.includes('/recruiter') || filePath.includes('/portal')) tags.push('recruiter');
  if (filePath.includes('/commute') || filePath.includes('commute-') || filePath.includes('taxes') || filePath.includes('gas-')) tags.push('commute');
  if (filePath.includes('/market')) tags.push('market-data');
  if (filePath.includes('/resume')) tags.push('resume');
  if (filePath.includes('.test.') || filePath.includes('.spec.')) tags.push('test');
  if (filePath.includes('tiptap') || filePath.includes('editor') || filePath.includes('toolbar')) tags.push('tiptap');
  if (filePath.includes('yjs') || filePath.includes('collab') || filePath.includes('provider')) tags.push('yjs');
  if (filePath.includes('/gallery')) tags.push('gallery');
  if (filePath.includes('video') || filePath.includes('call')) tags.push('video');
  if (filePath.includes('annotation')) tags.push('annotation');
  if (filePath.includes('drawing') || filePath.includes('polygon')) tags.push('drawing');
  if (tags.length === 0) tags.push('code');
  return [...new Set(tags)];
}

function complexity(lines) {
  if (lines > 200) return 'complex';
  if (lines > 50) return 'moderate';
  return 'simple';
}

function isReactFile(filePath, ext) {
  return (ext === '.tsx' || ext === '.jsx') && !filePath.includes('/lib/') && !filePath.includes('/types/');
}

// ─── Main generation ────────────────────────────────────────────────────────

for (const batchNum of BATCHES) {
  const outPath = path.join(INTERMEDIATE, `batch-${batchNum}.json`);
  if (fs.existsSync(outPath)) {
    console.log(`batch-${batchNum}: already exists — skipping`);
    continue;
  }

  const summaryPath = path.join(TMP, `ua-agent-summary-${batchNum}.json`);
  const dispatchPath = path.join(TMP, `ua-dispatch-data-${batchNum}.json`);

  if (!fs.existsSync(summaryPath)) {
    // Create it from the raw files
    const r = JSON.parse(fs.readFileSync(path.join(TMP, `ua-file-extract-results-${batchNum}.json`), 'utf8'));
    const d = JSON.parse(fs.readFileSync(path.join(TMP, `ua-dispatch-data-${batchNum}.json`), 'utf8'));
    const summary = r.results.map(f => ({
      path: f.path, nonEmptyLines: f.nonEmptyLines,
      fns: (f.functions || []).filter(fn => (fn.endLine - fn.startLine) >= 10 || (f.exports || []).some(e => (e.name || e) === fn.name)).map(fn => ({ name: fn.name, start: fn.startLine, end: fn.endLine })),
      exports: (f.exports || []).map(e => e.name || e),
      classes: (f.classes || []).map(c => ({ name: c.name, start: c.startLine, end: c.endLine })),
      imports: d.batchImportData[f.path] || []
    }));
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  }

  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  const dispatch = JSON.parse(fs.readFileSync(dispatchPath, 'utf8'));

  const nodes = [];
  const edges = [];

  for (const file of summary) {
    const ext = path.extname(file.path);
    const base = path.basename(file.path, ext);
    const fileId = `file:${file.path}`;
    const tags = inferTags(file.path);
    const cmplx = complexity(file.nonEmptyLines || 0);
    const summary_ = inferSummary(file.path);

    nodes.push({ id: fileId, type: 'file', name: path.basename(file.path), filePath: file.path, summary: summary_, tags, complexity: cmplx });

    // React component node
    if (isReactFile(file.path, ext)) {
      const componentName = file.exports.find(e => e && e[0] === e[0].toUpperCase() && e !== 'default') || toPascalCase(base);
      const compId = `component:${file.path}:${componentName}`;
      nodes.push({ id: compId, type: 'component', name: componentName, filePath: file.path, summary: summary_, tags: [...tags, 'react-component'], complexity: cmplx });
      edges.push({ source: fileId, target: compId, type: 'contains', direction: 'forward', weight: 1.0 });
      edges.push({ source: fileId, target: compId, type: 'exports', direction: 'forward', weight: 0.9 });
    }

    // Function nodes
    for (const fn of (file.fns || [])) {
      const fnId = `function:${file.path}:${fn.name}`;
      const isExported = file.exports.includes(fn.name);
      nodes.push({
        id: fnId, type: 'function', name: fn.name, filePath: file.path,
        lineRange: [fn.start, fn.end],
        summary: `Function ${fn.name} — ${inferFnSummary(fn.name, file.path)}.`,
        tags: [...tags], complexity: complexity((fn.end || 0) - (fn.start || 0) + 1)
      });
      edges.push({ source: fileId, target: fnId, type: 'contains', direction: 'forward', weight: 1.0 });
      if (isExported) edges.push({ source: fileId, target: fnId, type: 'exports', direction: 'forward', weight: 0.8 });
    }

    // Class nodes
    for (const cls of (file.classes || [])) {
      const clsId = `class:${file.path}:${cls.name}`;
      const isExported = file.exports.includes(cls.name);
      nodes.push({
        id: clsId, type: 'class', name: cls.name, filePath: file.path,
        lineRange: [cls.start, cls.end],
        summary: `Class ${cls.name} in ${path.basename(file.path)}.`,
        tags: [...tags], complexity: complexity((cls.end || 0) - (cls.start || 0) + 1)
      });
      edges.push({ source: fileId, target: clsId, type: 'contains', direction: 'forward', weight: 1.0 });
      if (isExported) edges.push({ source: fileId, target: clsId, type: 'exports', direction: 'forward', weight: 0.8 });
    }

    // Import edges
    for (const imp of (file.imports || [])) {
      edges.push({ source: fileId, target: `file:${imp}`, type: 'imports', direction: 'forward', weight: 0.7 });
    }
  }

  fs.writeFileSync(outPath, JSON.stringify({ nodes, edges }, null, 2));
  console.log(`batch-${batchNum}: ${nodes.length} nodes, ${edges.length} edges`);
}

function toPascalCase(str) {
  return str.split(/[-_.]/).map(s => s ? s[0].toUpperCase() + s.slice(1) : '').join('');
}

function inferFnSummary(name, filePath) {
  const n = name.toLowerCase();
  if (n.startsWith('get')) return `retrieves ${name.slice(3)} data`;
  if (n.startsWith('set')) return `sets ${name.slice(3)} state`;
  if (n.startsWith('handle')) return `handles ${name.slice(6)} user event`;
  if (n.startsWith('on')) return `callback for ${name.slice(2)} event`;
  if (n.startsWith('use')) return `React hook for ${name.slice(3)}`;
  if (n.startsWith('create')) return `creates ${name.slice(6)}`;
  if (n.startsWith('update')) return `updates ${name.slice(6)}`;
  if (n.startsWith('delete') || n.startsWith('remove')) return `removes ${name.slice(6)}`;
  if (n.startsWith('fetch') || n.startsWith('load')) return `fetches ${name.slice(5)} from API`;
  if (n.startsWith('format') || n.startsWith('parse')) return `formats/parses ${name.slice(6)} value`;
  if (n.startsWith('is') || n.startsWith('has') || n.startsWith('can')) return `predicate check`;
  if (n.startsWith('render')) return `renders ${name.slice(6)} UI element`;
  if (n.startsWith('build') || n.startsWith('generate')) return `builds ${name.slice(5)} output`;
  return `utility function`;
}

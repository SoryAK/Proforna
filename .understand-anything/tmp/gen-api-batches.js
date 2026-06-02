/**
 * Generates knowledge-graph batch JSON for Next.js API route batches.
 * Used for batches 1-7 (src/app/api/**\/route.ts files).
 */
const fs = require('fs');
const path = require('path');

const PROJECT = 'C:\\Users\\Sory kaba\\OneDrive\\RESUMSIFY\\Personal_Projects\\Dev_Pojects\\resumsify';
const INTERMEDIATE = path.join(PROJECT, '.understand-anything', 'intermediate');
const TMP = path.join(PROJECT, '.understand-anything', 'tmp');

function inferRouteSummary(filePath, exports, functions, nonEmptyLines) {
  // Extract URL segment from path
  const parts = filePath.split('/');
  const apiIdx = parts.indexOf('api');
  const routeSegments = parts.slice(apiIdx + 1, -1); // remove 'route.ts'
  const urlPath = '/' + routeSegments.join('/');

  // Determine if it's a specific item route ([id]) or collection route
  const isItemRoute = routeSegments.some(s => s.startsWith('[') && s.endsWith(']'));
  const resource = routeSegments
    .filter(s => !s.startsWith('['))
    .map(s => s.replace(/-/g, ' '))
    .join(' / ');

  // Map HTTP exports to operations
  const methods = exports.map(e => e.name || e).filter(n => ['GET','POST','PATCH','PUT','DELETE'].includes(n));
  const methodDesc = methods.map(m => {
    switch (m) {
      case 'GET': return isItemRoute ? 'fetches' : 'lists';
      case 'POST': return 'creates';
      case 'PATCH': return 'updates';
      case 'PUT': return 'replaces';
      case 'DELETE': return 'deletes';
      default: return m;
    }
  }).join(', ');

  const routeType = isItemRoute ? `individual ${resource} by ID` : `${resource} collection`;

  // Special cases for known routes
  const specialCases = {
    '/auth/[...nextauth]': 'NextAuth.js catch-all route exporting GET and POST handlers — delegates to the nextauth configuration.',
    '/auth/google': 'Initiates the Google OAuth flow by redirecting to Google authorization URL.',
    '/auth/google/callback': 'Handles the Google OAuth callback — exchanges authorization code for tokens and creates/updates the user session.',
    '/auth/microsoft': 'Initiates the Microsoft OAuth flow by redirecting to Microsoft authorization URL.',
    '/auth/microsoft/callback': 'Handles the Microsoft OAuth callback — exchanges authorization code for tokens and creates/updates the user session.',
    '/auth/register': 'Handles new user registration via POST — validates credentials, hashes password, and creates account.',
    '/avatar': 'Handles user avatar upload via POST — processes and stores the profile image.',
    '/backfill-place-ids': 'Admin utility POST endpoint that reverse-geocodes existing work history entries to populate missing Google Place IDs.',
    '/analytics': 'Provides comprehensive career analytics data via GET — aggregates application statistics, pipeline stages, and activity trends.',
  };

  for (const [key, val] of Object.entries(specialCases)) {
    if (urlPath === key) return val;
  }

  const complexity = nonEmptyLines > 200 ? 'complex' : nonEmptyLines > 75 ? 'moderate' : 'simple';

  return `REST API route handler for ${routeType} (${urlPath}) — ${methodDesc || 'handles requests'}.`;
}

function inferTags(filePath, exports, functions) {
  const tags = ['api-handler', 'rest-api'];
  const methods = exports.map(e => e.name || e).filter(n => ['GET','POST','PATCH','PUT','DELETE'].includes(n));
  if (filePath.includes('/auth/')) tags.push('authentication');
  if (filePath.includes('/ai/')) tags.push('ai-integration');
  if (filePath.includes('/admin/') || filePath.includes('/backfill')) tags.push('admin');
  if (methods.includes('GET') && methods.includes('POST') && methods.includes('PATCH') && methods.includes('DELETE')) tags.push('crud');
  else if (methods.includes('GET') && methods.includes('POST')) tags.push('crud');
  return tags.slice(0, 5);
}

function getComplexity(nonEmptyLines) {
  if (nonEmptyLines > 200) return 'complex';
  if (nonEmptyLines > 75) return 'moderate';
  return 'simple';
}

function generateBatchJson(batchIndex) {
  const dispatchData = JSON.parse(fs.readFileSync(path.join(TMP, `ua-dispatch-data-${batchIndex}.json`), 'utf8'));
  const extractData = JSON.parse(fs.readFileSync(path.join(TMP, `ua-file-extract-results-${batchIndex}.json`), 'utf8'));

  const nodes = [];
  const edges = [];
  const nodeIds = new Set();

  // Build a map of extraction results by path
  const extractMap = {};
  for (const r of extractData.results) {
    extractMap[r.path] = r;
  }

  for (const file of dispatchData.files) {
    const ext = extractMap[file.path] || {};
    const exports_ = ext.exports || [];
    const functions = ext.functions || [];
    const classes = ext.classes || [];
    const nonEmptyLines = ext.nonEmptyLines || 0;
    const totalLines = ext.totalLines || file.sizeLines;
    const complexity = getComplexity(nonEmptyLines);
    const summary = inferRouteSummary(file.path, exports_, functions, nonEmptyLines);
    const tags = inferTags(file.path, exports_, functions);

    const fileNodeId = `file:${file.path}`;
    nodes.push({
      id: fileNodeId,
      type: 'file',
      name: file.path.split('/').pop(),
      filePath: file.path,
      summary,
      tags,
      complexity
    });
    nodeIds.add(fileNodeId);

    // Import edges
    const imports = dispatchData.batchImportData[file.path] || [];
    for (const imp of imports) {
      edges.push({
        source: fileNodeId,
        target: `file:${imp}`,
        type: 'imports',
        direction: 'forward',
        weight: 0.7
      });
    }

    // Significant functions (>= 10 lines or exported)
    const significantFns = functions.filter(fn => {
      const lineCount = fn.endLine - fn.startLine + 1;
      const isExported = exports_.some(e => (e.name || e) === fn.name);
      return lineCount >= 10 || isExported;
    });

    for (const fn of significantFns) {
      const httpMethods = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];
      const isHttpHandler = httpMethods.includes(fn.name);
      const fnNodeId = `function:${file.path}:${fn.name}`;
      
      let fnSummary;
      if (isHttpHandler) {
        const isItemRoute = file.path.includes('[');
        switch (fn.name) {
          case 'GET': fnSummary = isItemRoute ? 'Fetches a single resource by ID from the database.' : 'Lists resources with optional filtering and pagination.'; break;
          case 'POST': fnSummary = 'Creates a new resource after validating the request body.'; break;
          case 'PATCH': fnSummary = 'Updates an existing resource by ID.'; break;
          case 'DELETE': fnSummary = 'Deletes a resource by ID.'; break;
          default: fnSummary = `Handles ${fn.name} HTTP requests.`;
        }
      } else {
        fnSummary = `Utility function ${fn.name} used in this route handler.`;
      }

      nodes.push({
        id: fnNodeId,
        type: 'function',
        name: fn.name,
        filePath: file.path,
        lineRange: [fn.startLine, fn.endLine],
        summary: fnSummary,
        tags: isHttpHandler ? ['api-handler', 'http-handler'] : ['utility'],
        complexity: getComplexity(fn.endLine - fn.startLine)
      });
      nodeIds.add(fnNodeId);

      // contains edge
      edges.push({ source: fileNodeId, target: fnNodeId, type: 'contains', direction: 'forward', weight: 1.0 });

      // exports edge if exported
      const isExported = exports_.some(e => (e.name || e) === fn.name);
      if (isExported) {
        edges.push({ source: fileNodeId, target: fnNodeId, type: 'exports', direction: 'forward', weight: 0.8 });
      }
    }
  }

  const output = { nodes, edges };
  const outPath = path.join(INTERMEDIATE, `batch-${batchIndex}.json`);
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`Batch ${batchIndex}: ${nodes.length} nodes, ${edges.length} edges → batch-${batchIndex}.json`);
}

// Process API route batches 1-7
for (let i = 1; i <= 7; i++) {
  generateBatchJson(i);
}
console.log('Done.');

const MIN_TEXT_FOR_RENDER = 1;
const HORIZONTAL_GAP = 140;
const DEPTH_SCALE = 40;
const DEPTH_GUIDE_STEP = 5;
const TOOLTIP_OFFSET = 14;

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('source-text');
  const status = document.getElementById('status');
  const complexityValue = document.getElementById('complexity-value');
  const tableBody = document.querySelector('#substring-table tbody');
  const chartSvg = document.getElementById('complexity-chart');
  const tooltip = document.getElementById('graph-tooltip');
  let activeEdge = null;

  const cy = cytoscape({
    container: document.getElementById('cy'),
    autounselectify: true,
    boxSelectionEnabled: false,
    wheelSensitivity: 0.2,
    wheelEventDebounceTime: 60,
    style: [
      {
        selector: 'node',
        style: {
          'background-color': '#0ea5e9',
          width: '42px',
          height: '42px',
          label: 'data(label)',
          color: '#0f172a',
          'font-size': '12px',
          'text-valign': 'center',
          'font-weight': 600,
          'text-outline-color': '#0ea5e9',
          'text-outline-width': 2,
          'border-width': 2,
          'border-color': '#0f172a'
        }
      },
      {
        selector: 'node.root',
        style: {
          'background-color': '#f97316',
          'text-outline-color': '#f97316'
        }
      },
      {
        selector: 'node.internal',
        style: {
          'background-color': '#2563eb',
          'text-outline-color': '#2563eb'
        }
      },
      {
        selector: 'node.leaf',
        style: {
          'background-color': '#f43f5e',
          'text-outline-color': '#f43f5e',
          color: '#0f172a'
        }
      },
      {
        selector: 'node.guide',
        style: {
          width: 1,
          height: 1,
          opacity: 0,
          'background-opacity': 0,
          'border-width': 0
        }
      },
      {
        selector: 'edge.suffix-edge',
        style: {
          width: 3,
          'line-color': '#94a3b8',
          'target-arrow-color': '#94a3b8',
          'target-arrow-shape': 'triangle',
          'curve-style': 'straight-line',
          label: 'data(label)',
          'font-size': '12px',
          'text-background-color': 'rgba(15,23,42,0.8)',
          'text-background-opacity': 0.9,
          'text-background-padding': 2,
          color: '#e2e8f0',
          'text-rotation': 'autorotate'
        }
      },
      {
        selector: 'edge.suffix-edge.edge-selected',
        style: {
          width: 5,
          'line-color': '#f8fafc',
          'target-arrow-color': '#f8fafc',
          'text-background-opacity': 1,
          'text-background-color': 'rgba(15,23,42,0.95)',
          'text-background-padding': 4,
          'text-outline-width': 3,
          'text-outline-color': '#f8fafc',
          color: '#0f172a'
        }
      },
      {
        selector: 'edge.guide',
        style: {
          width: 1.6,
          'line-color': 'rgba(148,163,184,0.4)',
          'line-style': 'dashed',
          'target-arrow-shape': 'none',
          'source-arrow-shape': 'none',
          'curve-style': 'straight-line',
          opacity: 0.6
        }
      }
    ]
  });

  const showTooltip = (content, renderedPosition) => {
    if (!renderedPosition) {
      return;
    }
    const rect = cy.container().getBoundingClientRect();
    tooltip.innerHTML = content;
    tooltip.style.display = 'block';
    tooltip.style.left = `${rect.left + renderedPosition.x + TOOLTIP_OFFSET}px`;
    tooltip.style.top = `${rect.top + renderedPosition.y + TOOLTIP_OFFSET}px`;
  };

  const hideTooltip = () => {
    tooltip.style.display = 'none';
  };

  const clearActiveEdge = () => {
    if (activeEdge && !activeEdge.removed()) {
      activeEdge.removeClass('edge-selected');
    }
    activeEdge = null;
  };

  const handleNodeHover = (event) => {
    if (event.target.hasClass('guide')) {
      return;
    }
    const content = formatNodeTooltipContent(event.target.data());
    showTooltip(content, event.renderedPosition);
  };

  const handleEdgeHover = (event) => {
    const content = formatEdgeTooltipContent(event.target.data());
    showTooltip(content, event.renderedPosition);
  };

  const render = (text) => {
    const trimmed = text ?? '';
    clearActiveEdge();
    hideTooltip();
    if (trimmed.length < MIN_TEXT_FOR_RENDER) {
      cy.elements().remove();
      status.textContent = 'Type at least one character to draw the suffix tree.';
      complexityValue.textContent = '-';
      updateSubstringTable(tableBody, [], null);
      updateSubstringChart(chartSvg, [], null);
      return;
    }

    const tree = buildSuffixTree(trimmed);
    const graph = treeToGraph(tree);

    cy.elements().remove();
    cy.add([...graph.nodes, ...graph.edges]);
    const suffixEdges = cy.elements('.suffix-edge');
    if (suffixEdges.length) {
      cy.fit(suffixEdges, 60);
    } else {
      cy.fit(cy.elements(), 60);
    }

    const substringStats = computeSubstringStats(trimmed);
    const summary = summarizeSubstringStats(substringStats);
    const bestPoints = summary.bestPoints || [];
    const complexityText = substringStats.length ? formatRatio(summary.maxRatio) : '-';

    status.textContent = `Length: ${trimmed.length} / Nodes: ${graph.nodeCount} / Edges: ${graph.edgeCount}`;
    complexityValue.textContent = complexityText;

    updateSubstringTable(tableBody, substringStats, bestPoints);
    updateSubstringChart(chartSvg, substringStats, bestPoints);
  };

  input.addEventListener('input', (event) => render(event.target.value));

  cy.on('mouseover', 'node', handleNodeHover);
  cy.on('mousemove', 'node', handleNodeHover);
  cy.on('mouseout', 'node', hideTooltip);

  cy.on('mouseover', 'edge.suffix-edge', handleEdgeHover);
  cy.on('mousemove', 'edge.suffix-edge', handleEdgeHover);
  cy.on('mouseout', 'edge.suffix-edge', () => {
    hideTooltip();
  });

  cy.on('tap', 'node', (event) => {
    if (event.target.hasClass('guide')) {
      return;
    }
    clearActiveEdge();
    showTooltip(formatNodeTooltipContent(event.target.data()), event.renderedPosition);
  });

  cy.on('tap', 'edge.suffix-edge', (event) => {
    if (activeEdge && activeEdge !== event.target && !activeEdge.removed()) {
      activeEdge.removeClass('edge-selected');
    }
    activeEdge = event.target;
    activeEdge.addClass('edge-selected');
    showTooltip(formatEdgeTooltipContent(event.target.data()), event.renderedPosition);
  });

  cy.on('tap', (event) => {
    if (event.target === cy) {
      clearActiveEdge();
      hideTooltip();
    }
  });

  cy.container().addEventListener('mouseleave', hideTooltip);

  render(input.value);
});

function buildSuffixTree(text) {
  const root = createNode();

  for (let start = 0; start < text.length; start += 1) {
    let current = root;
    for (let i = start; i < text.length; i += 1) {
      const char = text[i];
      if (!current.children.has(char)) {
        current.children.set(char, createNode());
      }
      current = current.children.get(char);
    }
    current.isLeaf = true;
  }

  return compressTree(root);
}

function createNode() {
  return {
    children: new Map(),
    isLeaf: false
  };
}

function compressTree(node) {
  const compressedNode = {
    isLeaf: node.isLeaf,
    children: []
  };

  node.children.forEach((child, char) => {
    let label = char;
    let current = child;

    while (current.children.size === 1 && !current.isLeaf) {
      const [nextChar, nextNode] = current.children.entries().next().value;
      label += nextChar;
      current = nextNode;
    }

    compressedNode.children.push({
      label,
      node: compressTree(current)
    });
  });

  return compressedNode;
}

function treeToGraph(root) {
  const nodes = [];
  const edges = [];
  let nodeCounter = 0;
  let edgeCounter = 0;
  let leafCounter = 0;
  let maxDepth = 0;

  const traverse = (treeNode, depth = 0, pathLabel = '') => {
    const nodeId = `n${nodeCounter++}`;
    const isLeaf = treeNode.children.length === 0;
    maxDepth = Math.max(maxDepth, depth);
    const classes = isLeaf ? 'leaf' : depth === 0 ? 'root' : 'internal';
    const childXs = [];
    let leafCount = isLeaf ? 1 : 0;
    const sortedChildren = [...treeNode.children].sort((a, b) => a.label.localeCompare(b.label));

    sortedChildren.forEach((child) => {
      const childDepth = depth + child.label.length;
      const childPathLabel = pathLabel + child.label;
      const childInfo = traverse(child.node, childDepth, childPathLabel);
      childXs.push(childInfo.position.x);
      leafCount += childInfo.leafCount;
      edges.push({
        data: {
          id: `e${edgeCounter++}`,
          source: nodeId,
          target: childInfo.id,
          label: child.label,
          edgeString: child.label,
          edgeLength: child.label.length,
          parentPath: pathLabel,
          fullString: childPathLabel
        },
        classes: 'suffix-edge',
        selectable: false
      });
    });

    let x;
    if (isLeaf) {
      x = leafCounter * HORIZONTAL_GAP;
      leafCounter += 1;
    } else if (childXs.length) {
      x = childXs.reduce((sum, value) => sum + value, 0) / childXs.length;
    } else {
      x = leafCounter * HORIZONTAL_GAP;
    }

    const nodeEntry = {
      data: {
        id: nodeId,
        label: isLeaf ? String(depth) : '',
        depth,
        pathLabel,
        leafCount
      },
      position: { x, y: depth * DEPTH_SCALE },
      classes,
      grabbable: false,
      selectable: false
    };

    nodes.push(nodeEntry);
    return { id: nodeId, position: nodeEntry.position, leafCount };
  };

  traverse(root, 0, '');

  const guideElements = buildDepthGuides(nodes, maxDepth);

  return {
    nodes: [...nodes, ...guideElements.nodes],
    edges: [...edges, ...guideElements.edges],
    nodeCount: nodes.length,
    edgeCount: edges.length,
    maxDepth
  };
}

function buildDepthGuides(nodes, maxDepth) {
  if (!nodes.length) {
    return { nodes: [], edges: [] };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  nodes.forEach((node) => {
    minX = Math.min(minX, node.position.x);
    maxX = Math.max(maxX, node.position.x);
  });

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    minX = 0;
    maxX = HORIZONTAL_GAP;
  }

  const startX = minX - HORIZONTAL_GAP * 0.6;
  const endX = maxX + HORIZONTAL_GAP * 0.6;
  const guideNodes = [];
  const guideEdges = [];
  const limit = Math.max(DEPTH_GUIDE_STEP, Math.ceil(maxDepth / DEPTH_GUIDE_STEP) * DEPTH_GUIDE_STEP);

  for (let depth = 0; depth <= limit; depth += DEPTH_GUIDE_STEP) {
    const y = depth * DEPTH_SCALE;
    const startId = `guide-${depth}-start`;
    const endId = `guide-${depth}-end`;

    guideNodes.push({
      data: { id: startId },
      position: { x: startX, y },
      classes: 'guide',
      grabbable: false,
      selectable: false
    });

    guideNodes.push({
      data: { id: endId },
      position: { x: endX, y },
      classes: 'guide',
      grabbable: false,
      selectable: false
    });

    guideEdges.push({
      data: { id: `guide-edge-${depth}`, source: startId, target: endId },
      classes: 'guide',
      selectable: false
    });
  }

  return { nodes: guideNodes, edges: guideEdges };
}

function computeSubstringStats(text) {
  const stats = [];
  for (let k = 1; k <= text.length; k += 1) {
    const seen = new Set();
    for (let i = 0; i <= text.length - k; i += 1) {
      seen.add(text.slice(i, i + k));
    }
    const count = seen.size;
    stats.push({ k, count, ratio: count / k });
  }
  return stats;
}

function summarizeSubstringStats(stats) {
  if (!stats.length) {
    return { bestPoints: [], maxRatio: 0 };
  }

  let maxRatio = -Infinity;
  const bestPoints = [];
  stats.forEach((stat) => {
    if (stat.ratio > maxRatio) {
      maxRatio = stat.ratio;
      bestPoints.length = 0;
      bestPoints.push(stat);
    } else if (stat.ratio === maxRatio) {
      bestPoints.push(stat);
    }
  });

  return { bestPoints, maxRatio };
}

function updateSubstringTable(body, stats, bestPoints = []) {
  if (!stats.length) {
    body.innerHTML =
      '<tr><td colspan="3" style="text-align:center;color:#94a3b8;padding:0.6rem 0;">Start typing to populate this table</td></tr>';
    return;
  }

  const bestSet = new Set(bestPoints.map((point) => point.k));
  body.innerHTML = stats
    .map((stat) => {
      const isBest = bestSet.has(stat.k);
      return `
        <tr class="${isBest ? 'best-row' : ''}">
          <td>${stat.k}</td>
          <td>${stat.count}</td>
          <td>${formatRatio(stat.ratio)}</td>
        </tr>
      `;
    })
    .join('');
}

function updateSubstringChart(svg, stats, bestPoints = []) {
  const width = 520;
  const height = 260;
  const padding = { top: 20, right: 20, bottom: 32, left: 60 };
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  if (!stats.length) {
    svg.innerHTML =
      '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#94a3b8" font-size="14">Type text to render the graph</text>';
    return;
  }

  const actualMaxK = stats[stats.length - 1].k;
  const countValues = stats.map((s) => s.count);
  const actualMaxCount = countValues.length ? Math.max(...countValues) : 0;
  const maxK = Math.max(actualMaxK + 1, 1);
  const maxCount = Math.max(actualMaxCount + 1, 1);
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const scaleX = (value) => padding.left + (value / maxK) * innerWidth;
  const scaleY = (value) => padding.top + innerHeight - (value / maxCount) * innerHeight;

  const origin = { x: scaleX(0), y: scaleY(0) };
  const linePoints = [origin, ...stats.map((stat) => ({ x: scaleX(stat.k), y: scaleY(stat.count) }))];
  const polylinePoints = linePoints.map((pt) => `${pt.x},${pt.y}`).join(' ');

  const xTicks = generateTicks(maxK, 6);
  const yTicks = generateTicks(maxCount, 6);

  const verticalGrid = xTicks
    .filter((value) => value !== 0)
    .map((value) => {
      const x = scaleX(value);
      return `<line x1="${x}" y1="${padding.top}" x2="${x}" y2="${padding.top + innerHeight}" stroke="rgba(148,163,184,0.2)" stroke-width="1" />`;
    })
    .join('');

  const horizontalGrid = yTicks
    .filter((value) => value !== 0)
    .map((value) => {
      const y = scaleY(value);
      return `<line x1="${padding.left}" y1="${y}" x2="${padding.left + innerWidth}" y2="${y}" stroke="rgba(148,163,184,0.2)" stroke-width="1" />`;
    })
    .join('');

  const xTickLabels = xTicks
    .map((value) => {
      const x = scaleX(value);
      return `<text x="${x}" y="${padding.top + innerHeight + 18}" text-anchor="middle" fill="#cbd5f5" font-size="11">${value}</text>`;
    })
    .join('');

  const yTickLabels = yTicks
    .map((value) => {
      const y = scaleY(value);
      return `<text x="${padding.left - 6}" y="${y + 4}" text-anchor="end" fill="#cbd5f5" font-size="11">${value}</text>`;
    })
    .join('');

  const bestSet = new Set(bestPoints.map((point) => point.k));

  const pointMarkup = stats
    .map((stat) => {
      const isBest = bestSet.has(stat.k);
      const radius = isBest ? 5 : 4;
      const fill = isBest ? '#f87171' : '#38bdf8';
      return `<circle cx="${scaleX(stat.k)}" cy="${scaleY(stat.count)}" r="${radius}" fill="${fill}" />`;
    })
    .join('');

  const rayMarkup = (() => {
    const anchorPoint = bestPoints[0];
    if (!anchorPoint || !stats.length) {
      return '';
    }
    const slope = anchorPoint.ratio;
    if (!Number.isFinite(slope) || slope <= 0) {
      return '';
    }
    let targetK = maxK;
    let targetCount = slope * targetK;
    if (targetCount > maxCount) {
      targetCount = maxCount;
      targetK = maxCount / slope;
    }
    const x2 = scaleX(targetK);
    const y2 = scaleY(targetCount);
    return `<line x1="${origin.x}" y1="${origin.y}" x2="${x2}" y2="${y2}" stroke="#fda4af" stroke-width="2" stroke-dasharray="4 4" />`;
  })();

  svg.innerHTML = `
    <rect x="0" y="0" width="${width}" height="${height}" fill="rgba(15,23,42,0.6)" />
    <g>
      ${verticalGrid}
      ${horizontalGrid}
    </g>
    <g stroke="#94a3b8" stroke-width="1.2">
      <line x1="${padding.left}" y1="${padding.top + innerHeight}" x2="${padding.left + innerWidth}" y2="${padding.top + innerHeight}" />
      <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + innerHeight}" />
    </g>
    <polyline points="${polylinePoints}" fill="none" stroke="#38bdf8" stroke-width="2.4" />
    ${rayMarkup}
    ${pointMarkup}
    ${xTickLabels}
    ${yTickLabels}
    <text x="${padding.left + innerWidth}" y="${padding.top + innerHeight + 30}" fill="#94a3b8" font-size="12">k</text>
    <text x="${padding.left - 36}" y="${padding.top + 10}" fill="#94a3b8" font-size="12">S(k)</text>
  `;
}

function formatRatio(value) {
  if (!Number.isFinite(value)) {
    return '-';
  }
  return (Math.round(value * 100) / 100).toFixed(2);
}

function generateTicks(maxValue, maxTickCount) {
  if (maxValue === 0) {
    return [0];
  }
  const approximateStep = maxValue / maxTickCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(approximateStep)));
  const normalized = approximateStep / magnitude;
  let step;
  if (normalized < 1.5) {
    step = 1;
  } else if (normalized < 3) {
    step = 2;
  } else if (normalized < 7) {
    step = 5;
  } else {
    step = 10;
  }
  step *= magnitude;

  const ticks = [];
  for (let value = 0; value <= maxValue + step * 0.1; value += step) {
    ticks.push(Math.round(value * 100) / 100);
  }
  if (ticks[ticks.length - 1] !== maxValue) {
    ticks.push(maxValue);
  }
  return ticks;
}

function formatNodeTooltipContent(data) {
  const label = data.pathLabel || '';
  const parts = [
    '<div class="tooltip-title">Node</div>',
    `<div>Depth: <strong>${data.depth}</strong></div>`
  ];
  if (label) {
    parts.push(`<div>Label: <code>${escapeHtml(label)}</code></div>`);
  }
  parts.push(`<div>Count: <strong>${data.leafCount}</strong></div>`);
  return parts.join('');
}

function formatEdgeTooltipContent(data) {
  const parentPath = data.parentPath || '';
  const edgeLabel = data.edgeString || '';
  const parentMarkup = parentPath
    ? `<span class="tooltip-parent">${escapeHtml(parentPath)}</span>`
    : '';
  const edgeMarkup = `<span class="tooltip-edge">${escapeHtml(edgeLabel)}</span>`;
  const combined = parentMarkup + edgeMarkup;
  return `
    <div class="tooltip-title">Edge</div>
    <div>String: ${combined}</div>
    <div>Length: <strong>${data.edgeLength}</strong></div>
  `;
}

function escapeHtml(value = '') {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

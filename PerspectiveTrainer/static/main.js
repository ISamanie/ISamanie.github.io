(function(){
  "use strict";

  // ---------------------------------------------------------------------
  // Setup & state
  // ---------------------------------------------------------------------
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  let challenge = null;
  let userStrokes = [];     // [[{x,y}, {x,y}, ...], ...] — each stroke is a freehand ink path
  let drawing = false;
  let activeStroke = null;  // the in-progress stroke's points, while the pointer is down
  let solutionVisible = false;
  let hasEvaluated = false;   // whether an Evaluate has run yet (gates the solution toggle)
  let lastLocalResult = null; // {score, details}
  let mode = 'local';         // 'local' | 'ai'
  let bestScore = null;
  let attempts = 0;
  let history = [];           // [{score, mode}]
  let aiLoading = false;
  let showVPs = true;         // whether the horizon, VP markers & hint guides are drawn

  const els = {
    resetBtn: document.getElementById('resetBtn'),
    undoBtn: document.getElementById('undoBtn'),
    clearBtn: document.getElementById('clearBtn'),
    solutionBtn: document.getElementById('solutionBtn'),
    vpToggle: document.getElementById('vpToggle'),
    evaluateBtn: document.getElementById('evaluateBtn'),
    modeToggle: document.getElementById('modeToggle'),
    modeHelp: document.getElementById('modeHelp'),
    modeLeftLabel: document.getElementById('modeLeftLabel'),
    modeRightLabel: document.getElementById('modeRightLabel'),
    scoreValue: document.getElementById('scoreValue'),
    scoreRing: document.getElementById('scoreRing'),
    bestScoreValue: document.getElementById('bestScoreValue'),
    attemptsValue: document.getElementById('attemptsValue'),
    feedbackText: document.getElementById('feedbackText'),
    historyRow: document.getElementById('historyRow'),
    challengeGiven: document.getElementById('challengeGiven'),
    challengeRemaining: document.getElementById('challengeRemaining'),
    challengeEdgeList: document.getElementById('challengeEdgeList'),
  };

  const FACE_NAMES = { left: 'left face', right: 'right face', top: 'top face', bottom: 'bottom face' };

  // ---------------------------------------------------------------------
  // Geometry helpers
  // ---------------------------------------------------------------------
  function dist(a, b){
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

  // ---------------------------------------------------------------------
  // Challenge generation (a genuine 3D cube with equal edge lengths)
  // ---------------------------------------------------------------------
  function tryBuildChallenge(){
    const flip = Math.random() < 0.5;
    const thirdFaceName = flip ? 'bottom' : 'top';

    const theta = (25 + Math.random() * 40) * Math.PI / 180;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    const f = 900 + Math.random() * 500;

    const vp1Dist = f * (cosT / sinT);
    const vp2Dist = f * (sinT / cosT);

    const dirVP1 = { x: -cosT, y: 0, z: sinT };
    const dirVP2 = { x: sinT, y: 0, z: cosT };

    const S = 1;
    const Hpx = 280 + Math.random() * 80;
    const zn = f * S / Hpx;

    const xn = 0;

    const marginFrac = 0.16 + Math.random() * 0.24;
    const yNear = marginFrac * S;
    const yFar = yNear + S;
    const yUpper = flip ? yFar : -yNear;
    const yLower = flip ? yNear : -yFar;

    const Ptop3 = { x: xn, y: yUpper, z: zn };
    const Pbot3 = { x: xn, y: yLower, z: zn };
    const Ctl3 = { x: xn + S * dirVP1.x, y: yUpper, z: zn + S * dirVP1.z };
    const Cbl3 = { x: xn + S * dirVP1.x, y: yLower, z: zn + S * dirVP1.z };
    const Ctr3 = { x: xn + S * dirVP2.x, y: yUpper, z: zn + S * dirVP2.z };
    const Cbr3 = { x: xn + S * dirVP2.x, y: yLower, z: zn + S * dirVP2.z };
    const D3 = {
      x: xn + S * dirVP1.x + S * dirVP2.x,
      y: flip ? yLower : yUpper,
      z: zn + S * dirVP1.z + S * dirVP2.z,
    };

    function projectRaw(p){ return { x: f * p.x / p.z, y: -f * p.y / p.z }; }
    const raw = {
      A: projectRaw(Ptop3), B: projectRaw(Pbot3),
      Ctl: projectRaw(Ctl3), Cbl: projectRaw(Cbl3),
      Ctr: projectRaw(Ctr3), Cbr: projectRaw(Cbr3),
      D: projectRaw(D3),
    };
    const rawPts = Object.values(raw);
    const xs = rawPts.map(p => p.x), ys = rawPts.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);

    const PAD = 50;
    if (maxX - minX > W - PAD * 2 || maxY - minY > H - PAD * 2) return null;

    const edgePairs = [
      [raw.A, raw.B], [raw.A, raw.Ctl], [raw.A, raw.Ctr],
      [raw.B, raw.Cbl], [raw.B, raw.Cbr], [raw.Ctl, raw.Cbl],
      [raw.Ctr, raw.Cbr], [raw.Ctl, raw.D], [raw.Ctr, raw.D],
    ];
    if (!edgePairs.every(([p1, p2]) => dist(p1, p2) > 25)) return null;

    const shapeCx = (minX + maxX) / 2, shapeCy = (minY + maxY) / 2;
    const targetCx = W / 2 + (Math.random() * 60 - 30);
    const targetCy = H / 2 + (Math.random() * 40 - 20);
    const cx0 = targetCx - shapeCx;
    const cy0 = targetCy - shapeCy;
    const shift = p => ({ x: p.x + cx0, y: p.y + cy0 });

    const A = shift(raw.A), B = shift(raw.B), Ctl = shift(raw.Ctl),
          Cbl = shift(raw.Cbl), Ctr = shift(raw.Ctr), Cbr = shift(raw.Cbr),
          D = shift(raw.D);

    const horizonY = cy0;
    const vp1 = { x: cx0 - vp1Dist, y: horizonY };
    const vp2 = { x: cx0 + vp2Dist, y: horizonY };

    const facePolygons = {
      left:  [A, B, Cbl, Ctl],
      right: [A, B, Cbr, Ctr],
      [thirdFaceName]: flip ? [B, Cbl, D, Cbr] : [A, Ctl, D, Ctr],
    };
    const faceVertexNames = {
      left:  ['A', 'B', 'Cbl', 'Ctl'],
      right: ['A', 'B', 'Cbr', 'Ctr'],
      [thirdFaceName]: flip ? ['B', 'Cbl', 'D', 'Cbr'] : ['A', 'Ctl', 'D', 'Ctr'],
    };
    const vertexByName = { A, B, Cbl, Ctl, Cbr, Ctr, D };

    const anchorSide = Math.random() < 0.5 ? 'left' : 'right';
    const thirdAlsoGiven = Math.random() < 0.5;
    const givenFaces = thirdAlsoGiven ? [anchorSide, thirdFaceName] : [anchorSide];
    const remainingFaces = ['left', 'right', thirdFaceName].filter(f => !givenFaces.includes(f));

    const edgeDefs = [
      { id: 'front',        p1: A,   p2: B,    type: 'front',    faces: ['left', 'right'],
        label: 'front edge' },
      { id: 'leftNear',     p1: B,   p2: Cbl,  type: 'recede',   vp: 'VP1', nearName: 'B',
        faces: flip ? ['left', thirdFaceName] : ['left'],  label: 'left bottom edge' },
      { id: 'leftVertical', p1: Cbl, p2: Ctl,  type: 'vertical', faces: ['left'],
        label: 'left vertical edge' },
      { id: 'leftFar',      p1: Ctl, p2: A,    type: 'recede',   vp: 'VP1', nearName: 'A',
        faces: flip ? ['left'] : ['left', thirdFaceName], label: 'left top edge' },
      { id: 'rightNear',    p1: B,   p2: Cbr,  type: 'recede',   vp: 'VP2', nearName: 'B',
        faces: flip ? ['right', thirdFaceName] : ['right'], label: 'right bottom edge' },
      { id: 'rightVertical',p1: Cbr, p2: Ctr,  type: 'vertical', faces: ['right'],
        label: 'right vertical edge' },
      { id: 'rightFar',     p1: Ctr, p2: A,    type: 'recede',   vp: 'VP2', nearName: 'A',
        faces: flip ? ['right'] : ['right', thirdFaceName], label: 'right top edge' },
      { id: 'thirdBackLeft',  p1: flip ? Cbl : Ctl, p2: D,               type: 'recede', vp: 'VP2',
        nearName: flip ? 'Cbl' : 'Ctl', faces: [thirdFaceName],
        label: (flip ? 'bottom' : 'top') + '-left back edge' },
      { id: 'thirdBackRight', p1: D,               p2: flip ? Cbr : Ctr, type: 'recede', vp: 'VP1',
        nearName: flip ? 'Cbr' : 'Ctr', faces: [thirdFaceName],
        label: (flip ? 'bottom' : 'top') + '-right back edge' },
    ];

    const isGiven = e => e.faces.some(f => givenFaces.includes(f));
    const givenEdges = edgeDefs.filter(isGiven);
    const targets = edgeDefs
      .filter(e => !isGiven(e))
      .map(e => ({ label: e.label, type: e.type, vp: e.vp, p1: e.p1, p2: e.p2 }));

    const knownNames = new Set();
    givenFaces.forEach(f => faceVertexNames[f].forEach(n => knownNames.add(n)));

    const guides = edgeDefs
      .filter(e => !isGiven(e) && e.type === 'recede' && knownNames.has(e.nearName))
      .map(e => ({ p1: vertexByName[e.nearName], p2: e.vp === 'VP1' ? vp1 : vp2 }));

    const givenVertexNames = new Set();
    givenFaces.forEach(f => faceVertexNames[f].forEach(n => givenVertexNames.add(n)));
    const givenVertexPoints = [...givenVertexNames].map(n => vertexByName[n]);

    return {
      horizonY, vp1, vp2, A, B, Ctl, Cbl, Ctr, Cbr, D,
      flip, thirdFaceName,
      anchorSide, givenFaces, remainingFaces,
      givenFacePolygons: givenFaces.map(f => facePolygons[f]),
      givenEdges, givenVertexPoints,
      guides, targets,
    };
  }

  function generateChallenge(){
    for (let attempt = 0; attempt < 60; attempt++){
      const result = tryBuildChallenge();
      if (result) return result;
    }
    return generateChallenge();
  }

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------
  function drawBackground(c){
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#eef1f6';
    const step = 28;
    for (let x = step; x < W; x += step){
      for (let y = step; y < H; y += step){
        c.beginPath();
        c.arc(x, y, 1.1, 0, Math.PI * 2);
        c.fill();
      }
    }
  }

  function drawHorizonAndVPs(c){
    c.save();
    c.strokeStyle = '#9ca3af';
    c.lineWidth = 1.3;
    c.setLineDash([7, 6]);
    c.beginPath();
    c.moveTo(0, challenge.horizonY);
    c.lineTo(W, challenge.horizonY);
    c.stroke();
    c.setLineDash([]);

    [['VP1', challenge.vp1, '#4f46e5'], ['VP2', challenge.vp2, '#06b6d4']].forEach(([label, p, color]) => {
      c.fillStyle = color;
      c.beginPath();
      c.arc(p.x, p.y, 5, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#374151';
      c.font = '600 12px system-ui, sans-serif';
      c.textAlign = 'center';
      c.fillText(label, p.x, p.y - 12);
    });
    c.restore();
  }

  function drawGuides(c){
    c.save();
    c.strokeStyle = 'rgba(79,70,229,0.30)';
    c.lineWidth = 1.4;
    c.setLineDash([5, 5]);
    challenge.guides.forEach(g => {
      c.beginPath();
      c.moveTo(g.p1.x, g.p1.y);
      c.lineTo(g.p2.x, g.p2.y);
      c.stroke();
    });
    c.setLineDash([]);
    c.restore();
  }

  function drawGivenFaces(c){
    c.save();
    challenge.givenFacePolygons.forEach(poly => {
      c.beginPath();
      c.moveTo(poly[0].x, poly[0].y);
      for (let i = 1; i < poly.length; i++) c.lineTo(poly[i].x, poly[i].y);
      c.closePath();
      c.fillStyle = 'rgba(79,70,229,0.08)';
      c.fill();
    });

    c.strokeStyle = '#111827';
    c.lineWidth = 4;
    c.lineCap = 'round';
    challenge.givenEdges.forEach(e => {
      c.beginPath();
      c.moveTo(e.p1.x, e.p1.y);
      c.lineTo(e.p2.x, e.p2.y);
      c.stroke();
    });

    c.fillStyle = '#111827';
    challenge.givenVertexPoints.forEach(p => {
      c.beginPath();
      c.arc(p.x, p.y, 4, 0, Math.PI * 2);
      c.fill();
    });
    c.restore();
  }

  function classifyUserLine(idx){
    if (!solutionVisible || !lastLocalResult) return '#f97316';
    const match = lastLocalResult.details.find(d => !d.missing && d.lineIndex === idx);
    if (!match) return '#9ca3af';
    const angleErr = Math.abs(match.angleDiff || 0);
    if (match.error < 14 && angleErr < 4) return '#16a34a';
    if (match.error < 40 && angleErr < 10) return '#d97706';
    return '#dc2626';
  }

  function strokePath(c, points){
    c.beginPath();
    c.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) c.lineTo(points[i].x, points[i].y);
    c.stroke();
  }

  function drawUserLines(c){
    c.save();
    c.lineCap = 'round';
    c.lineJoin = 'round';
    userStrokes.forEach((stroke, idx) => {
      c.strokeStyle = classifyUserLine(idx);
      c.lineWidth = 3.5;
      strokePath(c, stroke);
      c.fillStyle = c.strokeStyle;
      const first = stroke[0], last = stroke[stroke.length - 1];
      [first, last].forEach(p => {
        c.beginPath();
        c.arc(p.x, p.y, 3, 0, Math.PI * 2);
        c.fill();
      });
    });
    c.restore();
  }

  function drawPreviewLine(c, points){
    if (!points || points.length < 2) return;
    c.save();
    c.strokeStyle = '#f97316';
    c.lineWidth = 3.5;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    strokePath(c, points);
    c.restore();
  }

  function drawSolutionOverlay(c){
    c.save();
    c.strokeStyle = '#16a34a';
    c.lineWidth = 2.2;
    c.setLineDash([6, 4]);
    challenge.targets.forEach(t => {
      c.beginPath();
      c.moveTo(t.p1.x, t.p1.y);
      c.lineTo(t.p2.x, t.p2.y);
      c.stroke();
    });
    c.setLineDash([]);
    c.fillStyle = '#16a34a';
    c.beginPath();
    c.arc(challenge.D.x, challenge.D.y, 4, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function drawAll(c, opts){
    opts = opts || {};
    c.clearRect(0, 0, W, H);
    drawBackground(c);
    if (showVPs){
      drawHorizonAndVPs(c);
      drawGuides(c);
    }
    drawGivenFaces(c);
    if (opts.includeSolution) drawSolutionOverlay(c);
    drawUserLines(c);
    if (opts.includePreview && drawing && activeStroke) drawPreviewLine(c, activeStroke);
  }

  function render(){
    drawAll(ctx, { includeSolution: solutionVisible, includePreview: true });
  }

  function getCleanImageDataURL(){
    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const octx = off.getContext('2d');
    drawAll(octx, { includeSolution: false, includePreview: false });
    return off.toDataURL('image/png');
  }

  // ---------------------------------------------------------------------
  // Pointer handling
  // ---------------------------------------------------------------------
  function toCanvasPoint(clientX, clientY){
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: clamp((clientX - rect.left) * scaleX, 0, W),
      y: clamp((clientY - rect.top) * scaleY, 0, H),
    };
  }

  function strokeLength(points){
    let len = 0;
    for (let i = 1; i < points.length; i++) len += dist(points[i - 1], points[i]);
    return len;
  }

  function beginStroke(x, y){
    drawing = true;
    activeStroke = [toCanvasPoint(x, y)];
    render();
  }
  function moveStroke(x, y){
    if (!drawing || !activeStroke) return;
    const p = toCanvasPoint(x, y);
    const last = activeStroke[activeStroke.length - 1];
    if (dist(last, p) > 1.5) activeStroke.push(p);
    render();
  }
  function endStroke(x, y){
    if (!drawing || !activeStroke) return;
    activeStroke.push(toCanvasPoint(x, y));
    const first = activeStroke[0];
    const last = activeStroke[activeStroke.length - 1];
    if (dist(first, last) > 6 || strokeLength(activeStroke) > 10){
      userStrokes.push(activeStroke);
    }
    drawing = false;
    activeStroke = null;
    solutionVisible = false;
    if (hasEvaluated){
      els.solutionBtn.textContent = 'Show Solution';
    }
    render();
  }

  canvas.addEventListener('mousedown', e => beginStroke(e.clientX, e.clientY));
  canvas.addEventListener('mousemove', e => moveStroke(e.clientX, e.clientY));
  window.addEventListener('mouseup', e => endStroke(e.clientX, e.clientY));

  canvas.addEventListener('touchstart', e => {
    const t = e.touches[0]; beginStroke(t.clientX, t.clientY); e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    const t = e.touches[0]; moveStroke(t.clientX, t.clientY); e.preventDefault();
  }, { passive: false });
  window.addEventListener('touchend', e => {
    const t = e.changedTouches[0];
    if (t) endStroke(t.clientX, t.clientY);
  });

  // ---------------------------------------------------------------------
  // Local Math evaluation engine
  // ---------------------------------------------------------------------
  const MAX_ERR = 150;

  function evaluateLocal(){
    if (userStrokes.length === 0){
      renderFeedback('Draw at least one line before evaluating.', null, false);
      return;
    }

    const targets = challenge.targets;
    const lines = userStrokes.map(s => ({ p1: s[0], p2: s[s.length - 1] }));

    const n = targets.length, m = lines.length;
    const cost = [], orient = [];
    for (let i = 0; i < n; i++){
      cost.push([]); orient.push([]);
      for (let j = 0; j < m; j++){
        const direct = (dist(targets[i].p1, lines[j].p1) + dist(targets[i].p2, lines[j].p2)) / 2;
        const swapped = (dist(targets[i].p1, lines[j].p2) + dist(targets[i].p2, lines[j].p1)) / 2;
        if (swapped < direct){ cost[i][j] = swapped; orient[i][j] = true; }
        else { cost[i][j] = direct; orient[i][j] = false; }
      }
    }

    const pairs = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) pairs.push([cost[i][j], i, j]);
    pairs.sort((a, b) => a[0] - b[0]);
    const usedTargets = new Set(), usedLines = new Set();
    const assignment = new Array(n).fill(-1);
    for (const [, i, j] of pairs){
      if (usedTargets.has(i) || usedLines.has(j)) continue;
      assignment[i] = j; usedTargets.add(i); usedLines.add(j);
    }

    const details = [];
    let totalError = 0;
    for (let i = 0; i < n; i++){
      const t = targets[i];
      if (assignment[i] === -1){
        totalError += MAX_ERR;
        details.push({ label: t.label, type: t.type, vp: t.vp, missing: true, error: MAX_ERR });
        continue;
      }
      const j = assignment[i];
      const swap = orient[i][j];
      const line = lines[j];
      const uP1 = swap ? line.p2 : line.p1;
      const uP2 = swap ? line.p1 : line.p2;
      const err = Math.min(cost[i][j], MAX_ERR);
      totalError += err;

      const idealVec = { x: t.p2.x - t.p1.x, y: t.p2.y - t.p1.y };
      const userVec = { x: uP2.x - uP1.x, y: uP2.y - uP1.y };
      const angleIdeal = Math.atan2(idealVec.y, idealVec.x) * 180 / Math.PI;
      const angleUser = Math.atan2(userVec.y, userVec.x) * 180 / Math.PI;
      let angleDiff = angleUser - angleIdeal;
      while (angleDiff > 180) angleDiff -= 360;
      while (angleDiff < -180) angleDiff += 360;

      details.push({ label: t.label, type: t.type, vp: t.vp, missing: false, error: err, angleDiff, lineIndex: j });
    }

    const avgError = totalError / n;
    let score = Math.round(100 * (1 - avgError / MAX_ERR));
    score = clamp(score, 1, 100);

    const feedback = buildLocalFeedback(details, score);
    lastLocalResult = { score, details };
    hasEvaluated = true;
    solutionVisible = true;
    els.solutionBtn.disabled = false;
    els.solutionBtn.textContent = 'Hide Solution';

    recordAttempt(score, feedback, 'local');
  }

  // Concise, simplified feedback builder
  function buildLocalFeedback(details, score){
    const sentences = [];
    const missing = details.filter(d => d.missing);
    const present = details
      .filter(d => !d.missing)
      .sort((a, b) => (Math.abs(b.angleDiff || 0) + b.error) - (Math.abs(a.angleDiff || 0) + a.error));

    if (missing.length > 0){
      sentences.push(`Missing ${missing.length} edge${missing.length > 1 ? 's' : ''}.`);
    }

    const worstCount = missing.length > 0 ? 1 : 2;
    for (const d of present.slice(0, worstCount)){
      if (d.error < 10 && Math.abs(d.angleDiff) < 3) continue;
      if (d.type === 'vertical'){
        sentences.push(`${d.label}: keep line vertical.`);
      } else {
        sentences.push(`${d.label}: check alignment with ${d.vp}.`);
      }
    }

    if (sentences.length === 0){
      sentences.push(score >= 90 ? 'Great job! Accurate alignment.' : 'Good effort with minor alignment drift.');
    }
    return sentences.join(' ');
  }

  // ---------------------------------------------------------------------
  // AI Vision evaluation
  // ---------------------------------------------------------------------
  async function evaluateAI(){
    if (userStrokes.length === 0){
      renderFeedback('Draw at least one line before evaluating.', null, false);
      return;
    }
    setAiLoading(true);
    try{
      const image = getCleanImageDataURL();
      const context = {
        canvasWidth: W,
        canvasHeight: H,
        vp1: challenge.vp1,
        vp2: challenge.vp2,
        horizonY: challenge.horizonY,
        givenFaces: challenge.givenFaces,
        remainingFaces: challenge.remainingFaces,
        expectedNewEdges: challenge.targets.length,
        userStrokeCount: userStrokes.length,
      };
      const res = await fetch('https://isamanie-github-io.onrender.com/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, context }),
      });

      const data = await res.json();
      if (!res.ok || data.error){
        renderFeedback(`⚠️ ${data.error || 'The AI evaluator is unavailable.'}`, null, true);
        return;
      }
      hasEvaluated = true;
      solutionVisible = true;
      els.solutionBtn.disabled = false;
      els.solutionBtn.textContent = 'Hide Solution';
      recordAttempt(data.score, data.feedback, 'ai');
    } catch (err){
      renderFeedback(`⚠️ Network error contacting the AI evaluator: ${err.message}`, null, true);
    } finally {
      setAiLoading(false);
    }
  }

  function setAiLoading(isLoading){
    aiLoading = isLoading;
    els.evaluateBtn.disabled = isLoading;
    els.evaluateBtn.innerHTML = isLoading ? 'Evaluating<span class="loading-dots"></span>' : 'Evaluate Drawing →';
  }

  // ---------------------------------------------------------------------
  // Dashboard / feedback rendering
  // ---------------------------------------------------------------------
  function recordAttempt(score, feedback, modeTag){
    attempts += 1;
    bestScore = bestScore === null ? score : Math.max(bestScore, score);
    history.unshift({ score, mode: modeTag });
    history = history.slice(0, 8);
    renderFeedback(feedback, score, false);
    render();
  }

  function renderFeedback(text, score, isError){
    els.feedbackText.textContent = text;
    els.feedbackText.classList.toggle('error', !!isError);

    if (score !== null){
      els.scoreValue.textContent = score;
      els.scoreRing.style.setProperty('--pct', score);
    }
    els.bestScoreValue.textContent = bestScore === null ? '–' : bestScore;
    els.attemptsValue.textContent = attempts;

    els.historyRow.innerHTML = '';
    history.forEach(h => {
      const chip = document.createElement('span');
      chip.className = 'chip' + (h.mode === 'ai' ? ' mode-ai' : '');
      chip.textContent = `${h.score} · ${h.mode === 'ai' ? 'AI' : 'Math'}`;
      els.historyRow.appendChild(chip);
    });
  }

  // ---------------------------------------------------------------------
  // Toolbar wiring
  // ---------------------------------------------------------------------
  function updateChallengeStatus(){
    const givenNames = challenge.givenFaces.map(f => FACE_NAMES[f]);
    const remainingNames = challenge.remainingFaces.map(f => FACE_NAMES[f]);
    const givenLabel = givenNames.length === 1
      ? `the ${givenNames[0]}`
      : `the ${givenNames.slice(0, -1).join(', ')} and ${givenNames[givenNames.length - 1]}`;
    const remainingLabel = remainingNames.length === 1
      ? `1 more visible face (${remainingNames[0]})`
      : `${remainingNames.length} more visible faces (${remainingNames.join(' + ')})`;

    els.challengeGiven.innerHTML = `You're given <strong>${givenLabel}</strong>, already drawn as a solid, shaded plane.`;
    els.challengeRemaining.textContent =
      `Complete the cube by drawing the edges of the remaining ${remainingLabel} — ` +
      `${challenge.targets.length} edge${challenge.targets.length === 1 ? '' : 's'} in total.`;

    els.challengeEdgeList.innerHTML = '';
    challenge.targets.forEach(t => {
      const li = document.createElement('li');
      li.textContent = t.type === 'vertical' ? `${t.label} (straight up/down)` : `${t.label} (→ ${t.vp})`;
      els.challengeEdgeList.appendChild(li);
    });
  }

  function resetChallenge(){
    challenge = generateChallenge();
    userStrokes = [];
    activeStroke = null;
    solutionVisible = false;
    hasEvaluated = false;
    lastLocalResult = null;
    els.solutionBtn.disabled = true;
    els.solutionBtn.textContent = 'Show Solution';
    updateChallengeStatus();
    renderFeedback('Draw your cube and click “Evaluate Drawing” to get feedback.', 0, false);
    els.scoreValue.textContent = '–';
    els.scoreRing.style.setProperty('--pct', 0);
    render();
  }

  els.vpToggle.addEventListener('change', () => {
    showVPs = els.vpToggle.checked;
    render();
  });

  els.resetBtn.addEventListener('click', resetChallenge);

  els.undoBtn.addEventListener('click', () => {
    userStrokes.pop();
    solutionVisible = false;
    if (hasEvaluated) els.solutionBtn.textContent = 'Show Solution';
    render();
  });

  els.clearBtn.addEventListener('click', () => {
    userStrokes = [];
    solutionVisible = false;
    if (hasEvaluated) els.solutionBtn.textContent = 'Show Solution';
    render();
  });

  els.solutionBtn.addEventListener('click', () => {
    if (!hasEvaluated) return;
    solutionVisible = !solutionVisible;
    els.solutionBtn.textContent = solutionVisible ? 'Hide Solution' : 'Show Solution';
    render();
  });

  els.evaluateBtn.addEventListener('click', () => {
    if (aiLoading) return;
    if (mode === 'local') evaluateLocal();
    else evaluateAI();
  });

  els.modeToggle.addEventListener('change', () => {
    mode = els.modeToggle.checked ? 'ai' : 'local';
    els.modeHelp.textContent = mode === 'ai'
      ? 'Sends a snapshot of your canvas to gpt-4o-mini for a geometric critique.'
      : 'Instant, offline geometric scoring against the exact target coordinates.';
    els.modeLeftLabel.style.color = mode === 'local' ? 'var(--accent-dark)' : 'var(--muted)';
    els.modeRightLabel.style.color = mode === 'ai' ? 'var(--accent-dark)' : 'var(--muted)';
  });

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------
  resetChallenge();
})();
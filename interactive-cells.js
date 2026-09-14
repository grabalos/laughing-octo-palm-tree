(function () {
  "use strict";

  const CFG = {
    CELL_W: 8,
    CELL_H: 10,
    maxRadius: 110,
    growDuration: 700,
    divisionMinR: 55,
    divisionRate: 0.005,
    ambientSpawnRate: 0.04,
    maxOrgs: 12,
    mergeGraceMs: 400,
  };

  function seededRng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  const canvas = document.getElementById("cells-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  let orgs = [];
  let isVisible = true;
  let rafId = null;
  let W = 0, H = 0;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let orgCounter = 0;
  let hasInteracted = false;

  // ─── RESIZE ────────────────────────────────────────────────────────────────
  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const prevW = W, prevH = H;
    W = rect.width;
    H = rect.height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (prevW > 0 && prevH > 0) {
      orgs.forEach(o => { o.cx *= W / prevW; o.cy *= H / prevH; });
    }
  }
  window.addEventListener("resize", resize);
  resize();

  // ─── SPAWN ─────────────────────────────────────────────────────────────────
  function spawnOrg(x, y, opts) {
    opts = opts || {};
    const seed = ((++orgCounter * 48271) + 12345) >>> 0;
    const rng = seededRng(seed);
    const targetR = opts.targetR !== undefined ? opts.targetR : (60 + rng() * 40);
    const speed = 1.5 + rng() * 2.0;
    const angle = rng() * Math.PI * 2;
    const srng = seededRng(seed ^ 0xF00D);
    orgs.push({
      cx: x, cy: y,
      r: opts.startR !== undefined ? opts.startR : targetR,
      targetR: targetR,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      phase: rng() * Math.PI * 2,
      phaseY: rng() * Math.PI * 2,
      seed: seed,
      opacity: 1,
      age: 0,
      mortal: false,
      merged: false,
      maxSpeed: opts.maxSpeed || (2.5 + rng() * 1.5),
      moveRng: seededRng(seed ^ 0xDEAD),
      aspectX: 0.88 + srng() * 0.24,
      touching: false,
    });
  }

  // ─── IDLE ORGANISMS ────────────────────────────────────────────────────────
  // Some clusters start already grouped (touching/overlapping) instead of
  // every organism beginning as a lone circle.
  const IDLE_GROUPS = [
    { pos: [0.08, 0.32], count: 2 },
    { pos: [0.34, 0.28], count: 2 },
    { pos: [0.53, 0.72], count: 1 },
    { pos: [0.85, 0.44], count: 3 },
  ];

  function spawnIdleOrganisms() {
    IDLE_GROUPS.forEach(({ pos: [rx, ry], count }, gi) => {
      const baseSeed = ((gi + 1) * 777) >>> 0;
      const baseRng = seededRng(baseSeed);
      const baseX = rx * W;
      const baseY = ry * H;
      let clusterAngle = baseRng() * Math.PI * 2;

      for (let k = 0; k < count; k++) {
        const seed = ((gi + 1) * 777 + k * 131) >>> 0;
        const rng = seededRng(seed);
        const r = 34 + rng() * 20;
        const speed = 0.7 + rng() * 1.3;
        const angle = rng() * Math.PI * 2;
        const srng = seededRng(seed ^ 0xF00D);

        // Each additional member overlaps the cluster center so it reads
        // as an already-joined group from the very first frame.
        let cx = baseX, cy = baseY;
        if (k > 0) {
          clusterAngle += Math.PI * 0.55 + rng() * 0.6;
          const off = r * 0.85 * k;
          cx = baseX + Math.cos(clusterAngle) * off;
          cy = baseY + Math.sin(clusterAngle) * off;
        }

        orgs.push({
          cx, cy,
          r: r, targetR: r,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          phase: rng() * Math.PI * 2,
          phaseY: rng() * Math.PI * 2,
          seed: seed,
          opacity: 1,
          age: 0,
          mortal: false,
          merged: false,
          maxSpeed: 2.2,
          moveRng: seededRng(seed ^ 0xDEAD),
          aspectX: 0.88 + srng() * 0.24,
          touching: false,
        });
      }
    });
  }

  // ─── MARK VARIANT ──────────────────────────────────────────────────────────
  function getMarkVariant(col, row) {
    const rng = seededRng(((col * 9973) ^ (row * 6571)) >>> 0);
    return rng() < 0.72 ? 1 : 2;
  }

  // ─── RENDER ORGANISM ───────────────────────────────────────────────────────
  function renderOrganismTo(targetCtx, cellW, cellH, boundsW, boundsH, org, time) {
    const breathSpeed = org.touching ? 0.0025 : 0.0009;
    const bX = 1 + 0.06 * Math.sin(time * breathSpeed + org.phase);
    const bY = 1 + 0.06 * Math.sin(time * breathSpeed + org.phaseY);
    const rX = org.r * bX * (org.aspectX || 1.0);
    const rY = org.r * bY;

    targetCtx.fillStyle = "rgba(0,0,0," + org.opacity + ")";

    const searchR = Math.max(rX, rY) + cellW;
    const colL = Math.floor((org.cx - searchR) / cellW) - 1;
    const colR = Math.ceil((org.cx + searchR) / cellW) + 1;
    const rowT = Math.floor((org.cy - searchR) / cellH) - 1;
    const rowB = Math.ceil((org.cy + searchR) / cellH) + 1;

    for (let col = colL; col <= colR; col++) {
      for (let row = rowT; row <= rowB; row++) {
        const gx = col * cellW;
        const gy = row * cellH;
        if (gx < -cellW || gx > boundsW || gy < -cellH || gy > boundsH) continue;

        const ndx = (gx + cellW * 0.5 - org.cx) / rX;
        const ndy = (gy + cellH * 0.5 - org.cy) / rY;
        const nd = Math.sqrt(ndx * ndx + ndy * ndy);

        let draw = false;
        let heightScale = 1.0;

        if (nd < 0.27) {
          // Nucleus: dense gradient cluster, shorter marks
          const nr = seededRng(((col * 7919) ^ (row * 4093) ^ org.seed) >>> 0);
          const t = nd / 0.27;
          draw = nr() < (0.62 - 0.20 * t);
          heightScale = 0.58;
        } else if (nd >= 0.44 && nd <= 1.06) {
          // Ring / membrane — wide, dense, strong polar variation
          const angle = Math.atan2(ndy, ndx);
          const polar = 0.38 + 0.62 * Math.abs(Math.sin(angle));
          const ringT = (nd - 0.44) / 0.62;
          const distF = Math.sin(ringT * Math.PI);
          const density = 0.24 + 0.72 * polar * (0.40 + 0.60 * distF);
          const rr = seededRng(((col * 9973) ^ (row * 6571) ^ org.seed) >>> 0);
          draw = rr() < density;
        }

        if (!draw) continue;

        const variant = getMarkVariant(col, row);
        const baseH = cellH * 0.82 * heightScale;
        let drawH = baseH;
        let gyAdj = gy + (cellH - baseH) * 0.5;

        if (!reducedMotion) {
          const mr = seededRng(((col * 9973) ^ (row * 6571) ^ org.seed) >>> 0);
          const mp = mr() * Math.PI * 2;
          const flickSpeed = org.touching ? 0.0030 : 0.0016;
          const s = 0.62 + 0.38 * Math.sin(time * flickSpeed + mp);
          drawH = baseH * s;
          gyAdj = gy + (cellH - drawH) * 0.5;
        }

        const dashW = cellW * 0.25;
        if (variant === 1) {
          targetCtx.fillRect(gx + cellW * 0.25, gyAdj, dashW, drawH);
        } else {
          targetCtx.fillRect(gx + cellW * 0.06, gyAdj, dashW * 0.75, drawH);
          targetCtx.fillRect(gx + cellW * 0.56, gyAdj, dashW * 0.75, drawH);
        }
      }
    }
  }

  function renderOrganism(org, time) {
    renderOrganismTo(ctx, CFG.CELL_W, CFG.CELL_H, W, H, org, time);
  }

  // ─── RENDER FRAME ──────────────────────────────────────────────────────────
  function renderFrame(time) {
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < orgs.length; i++) {
      const o = orgs[i];
      if (!o.merged && o.opacity > 0 && o.r >= 1) renderOrganism(o, time);
    }
  }

  // ─── TICK ──────────────────────────────────────────────────────────────────
  let lastTick = performance.now();

  function tick(now) {
    if (!isVisible) { rafId = requestAnimationFrame(tick); return; }

    const dt = Math.min(now - lastTick, 64);
    lastTick = now;
    const dtS = dt / 1000;
    const toSpawn = [];

    // Reset touching state
    for (let i = 0; i < orgs.length; i++) orgs[i].touching = false;

    for (let i = 0; i < orgs.length; i++) {
      const o = orgs[i];
      if (o.merged) continue;

      o.age += dt;

      // Ease toward target radius
      if (o.r < o.targetR) {
        const p = Math.min(o.age / CFG.growDuration, 1);
        o.r = o.targetR * (1 - Math.pow(1 - p, 3));
      }

      // Division — random, large orgs only, and only once the user has
      // interacted at least once (nothing splits off on its own before that)
      if (hasInteracted && !o.merged && o.r >= CFG.divisionMinR) {
        if (Math.random() < CFG.divisionRate * dtS) {
          const da = Math.random() * Math.PI * 2;
          const dr = o.r * (0.35 + Math.random() * 0.20);
          toSpawn.push({
            x: o.cx + Math.cos(da) * (o.r + dr * 0.9),
            y: o.cy + Math.sin(da) * (o.r + dr * 0.9),
            targetR: dr,
          });
          o.r = Math.max(o.r * 0.74, 42);
          o.targetR = o.r;
        }
      }

      // Gentle random drift
      o.vx += (o.moveRng() - 0.5) * 0.16 * dt / 16;
      o.vy += (o.moveRng() - 0.5) * 0.16 * dt / 16;
      const spd = Math.sqrt(o.vx * o.vx + o.vy * o.vy);
      if (spd > o.maxSpeed) { o.vx = (o.vx / spd) * o.maxSpeed; o.vy = (o.vy / spd) * o.maxSpeed; }

      o.cx += o.vx * dtS;
      o.cy += o.vy * dtS;

      // Edge wrap
      const buf = o.r;
      if (o.cx < -buf) o.cx = W + buf;
      else if (o.cx > W + buf) o.cx = -buf;
      if (o.cy < -buf) o.cy = H + buf;
      else if (o.cy > H + buf) o.cy = -buf;
    }

    // Spawn daughters (cap total orgs)
    for (const s of toSpawn) {
      if (orgs.filter(o => !o.merged).length < CFG.maxOrgs) {
        spawnOrg(s.x, s.y, { targetR: s.targetR, startR: 8, mortal: false });
      }
    }

    // Ambient random spawning — once the user has interacted, new cells keep
    // appearing on their own too, not only on click
    if (hasInteracted && orgs.filter(o => !o.merged).length < CFG.maxOrgs) {
      if (Math.random() < CFG.ambientSpawnRate * dtS) {
        spawnOrg(Math.random() * W, Math.random() * H, {
          targetR: 30 + Math.random() * 26,
          startR: 6,
        });
      }
    }

    // Attraction and merge
    for (let i = 0; i < orgs.length - 1; i++) {
      const a = orgs[i];
      if (a.merged) continue;
      for (let j = i + 1; j < orgs.length; j++) {
        const b = orgs[j];
        if (b.merged) continue;
        const dx = b.cx - a.cx;
        const dy = b.cy - a.cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const sumR = a.r + b.r;

        if (dist < sumR) {
          // Both cells are touching — faster breathing
          a.touching = true;
          b.touching = true;
          // Pull toward each other (figure-8 attraction)
          const pull = 7 * dtS;
          const nx = dx / (dist + 0.001);
          const ny = dy / (dist + 0.001);
          a.vx += nx * pull; a.vy += ny * pull;
          b.vx -= nx * pull; b.vy -= ny * pull;
        }

        // Absorb only when very deeply overlapping, and only once both cells
        // have had a moment to actually appear on screen — otherwise a click
        // landing near/on an existing cell can get absorbed before it's ever
        // visibly spawned, making that spot feel dead
        if (dist < sumR * 0.26 && a.age >= CFG.mergeGraceMs && b.age >= CFG.mergeGraceMs) {
          const aA = a.r * a.r, bA = b.r * b.r, tot = aA + bA;
          const keep = a.r >= b.r ? a : b;
          const drop = a.r >= b.r ? b : a;
          keep.cx = (a.cx * aA + b.cx * bA) / tot;
          keep.cy = (a.cy * aA + b.cy * bA) / tot;
          keep.r = Math.min(Math.sqrt(tot) * 0.88, CFG.maxRadius);
          keep.targetR = keep.r;
          keep.vx = (a.vx * aA + b.vx * bA) / tot;
          keep.vy = (a.vy * aA + b.vy * bA) / tot;
          keep.mortal = false;
          keep.touching = false;
          drop.merged = true;
        }
      }
    }

    orgs = orgs.filter(o => !o.merged && o.opacity > 0);
    renderFrame(now);
    rafId = requestAnimationFrame(tick);
  }

  // ─── EVENTS ────────────────────────────────────────────────────────────────
  function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }

  canvas.addEventListener("click", (e) => {
    hasInteracted = true;
    if (orgs.filter(o => !o.merged).length >= CFG.maxOrgs) return;
    const { x, y } = getCanvasPos(e);
    spawnOrg(x, y, { targetR: 40 + Math.random() * 24, startR: 8 });
  });

  canvas.addEventListener("touchstart", (e) => {
    hasInteracted = true;
    if (orgs.filter(o => !o.merged).length >= CFG.maxOrgs) return;
    const { x, y } = getCanvasPos(e);
    spawnOrg(x, y, { targetR: 40 + Math.random() * 24, startR: 8 });
  }, { passive: true });

  // ─── CUSTOM CURSOR (click-to-place hint) ─────────────────────────────────────
  const cursorEl = document.getElementById("cells-cursor");

  if (cursorEl) {
    function showCursor() {
      cursorEl.style.opacity = "1";
    }

    function hideCursor() {
      cursorEl.style.opacity = "0";
    }

    function positionCursor(e) {
      const offsetX = 20;
      const offsetY = -20;
      cursorEl.style.transform =
        "translate(" + (e.clientX + offsetX) + "px, " + (e.clientY + offsetY) + "px)";
    }

    canvas.addEventListener("mouseenter", (e) => { showCursor(); positionCursor(e); });
    canvas.addEventListener("mousemove", positionCursor);
    canvas.addEventListener("mouseleave", hideCursor);
  }

  // ─── VISIBILITY PAUSE ──────────────────────────────────────────────────────
  const observer = new IntersectionObserver(
    entries => { isVisible = entries[0].isIntersecting; },
    { threshold: 0.01 }
  );
  observer.observe(canvas.parentElement);

  // ─── START ─────────────────────────────────────────────────────────────────
  spawnIdleOrganisms();
  rafId = requestAnimationFrame(tick);
})();

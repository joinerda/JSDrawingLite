
/*  Lightweight graphics lib — drop in as a single JS file */
(() => {
  // ---------- Canvas bootstrapping ----------
  const dpr = () => (window.devicePixelRatio || 1);
  let canvas = document.getElementById('gfx-canvas'); // <-- use existing if present
  let ctx;

  function _attachCanvas(el, { width, height, autoResize } = {}) {
    canvas = el;
    // If caller provided width/height, set CSS pixel size; otherwise preserve existing.
    if (typeof width === 'number' && typeof height === 'number') {
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
    }
    ctx = canvas.getContext('2d');
    // set up (or remove) resize handler
    window.removeEventListener('resize', _resize);
    if (autoResize) {
      window.addEventListener('resize', _resize, { passive: true });
    }
    _resize();
  }

  function _resize() {
    // Prefer CSS size if present, else clientWidth/Height, else attributes.
    const cssW = parseFloat(getComputedStyle(canvas).width);
    const cssH = parseFloat(getComputedStyle(canvas).height);
    const w = Math.floor(cssW || canvas.clientWidth || canvas.width || 300);
    const h = Math.floor(cssH || canvas.clientHeight || canvas.height || 150);
    const r = dpr();
    canvas.width = Math.max(1, Math.floor(w * r));
    canvas.height = Math.max(1, Math.floor(h * r));
    const c = ctx || canvas.getContext('2d');
    ctx = c;
    c.setTransform(r, 0, 0, r, 0, 0); // user space in CSS pixels
  }

  // If no existing canvas, create full-window one (legacy behavior)
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'gfx-canvas';
    Object.assign(canvas.style, {
      position: 'fixed',
      inset: '0',
      width: '100vw',
      height: '100vh',
      display: 'block'
    });
    document.body.appendChild(canvas);
    window.addEventListener('resize', _resize, { passive: true });
  }

  _attachCanvas(canvas); // initial attach

  // Expose a tiny public init API (without breaking globals)
  const API = {
    init(target, opts) {
      // target: canvas element
      _attachCanvas(target, opts);
    },
    initById(id, opts) {
      const el = document.getElementById(id);
      if (!el) throw new Error(`Canvas with id "${id}" not found`);
      _attachCanvas(el, opts);
    },
    setCanvasSize(width, height) {
      // set CSS size and re-DPR-scale
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      _resize();
    },
    getCanvas() { return canvas; },
    getContext() { return ctx; },
  };
  // make available as a namespace (keeps your globals for shapes intact)
  window.JSDrawingLite = Object.freeze(API);

  // ... rest of your library (globals getWidth/getHeight, shapes, scene, loop) ...
  window.getWidth  = () => Math.floor(canvas.width / dpr());
  window.getHeight = () => Math.floor(canvas.height / dpr());


  // ---------- Globals  ----------
  window.getWidth  = () => Math.floor(canvas.width / dpr());
  window.getHeight = () => Math.floor(canvas.height / dpr());

  const _scene = [];
  const _timers = new Set();

  // repeating timer like CodeHS setTimer(fn, ms)
  window.setTimer = (fn, ms) => {
    const id = setInterval(fn, ms);
    _timers.add(id);
    return id; // allow clearInterval if desired
  };

  window.add = (shape) => {
    if (!shape || shape._inScene) return;
    shape._inScene = true;
    _scene.push(shape);
  };

  window.remove = (shape) => {
    const i = _scene.indexOf(shape);
    if (i >= 0) {
      _scene.splice(i, 1);
      shape._inScene = false;
    }
  };

  // ---------- Base Shape ----------
  class Shape {
    constructor() {
      this.x = 0;
      this.y = 0;
      this.rotation = 0;      // radians
      this.fill = '#000000';  // default fill
      this.stroke = null;     // no stroke by default
      this.lineWidth = 1;
      this.visible = true;
      this._inScene = false;
    }
    setPosition(x, y) { this.x = x; this.y = y; return this; }
    setX(x) { this.x = x; return this; }
    setY(y) { this.y = y; return this; }
    getX() { return this.x; }
    getY() { return this.y; }
    setRotationRadians(r) { this.rotation = r; return this; }
    setRotationDegrees(deg) { this.rotation = deg * Math.PI / 180; return this; }
    setColor(css) { this.fill = css; return this; }     // CodeHS-style fill color
    setFill(css) { this.fill = css; return this; }
    setStroke(css) { this.stroke = css; return this; }
    setLineWidth(w) { this.lineWidth = w; return this; }
    // optional hook called each frame; user may override
    update(dt) {}
    // subclasses must implement _path(ctx) and optionally _postDraw(ctx)
    _draw(ctx) {
      if (!this.visible) return;
      ctx.save();
      ctx.translate(this.x, this.y);
      if (this.rotation) ctx.rotate(this.rotation);
      ctx.beginPath();
      this._path(ctx);
      if (this.fill) { ctx.fillStyle = this.fill; ctx.fill(); }
      if (this.stroke) { ctx.lineWidth = this.lineWidth; ctx.strokeStyle = this.stroke; ctx.stroke(); }
      this._postDraw?.(ctx);
      ctx.restore();
    }
  }

  // ---------- Primitives ----------
  class Circle extends Shape {
    constructor(radius = 10) { super(); this.radius = radius; }
    setRadius(r) { this.radius = r; return this; }
    _path(ctx) { ctx.arc(0, 0, this.radius, 0, Math.PI * 2); }
  }

  class Square extends Shape {
    constructor(size = 20) { super(); this.size = size; }
    setSize(s) { this.size = s; return this; }
    _path(ctx) {
      const s = this.size;
      ctx.rect(-s/2, -s/2, s, s);
    }
  }

  // Triangle defined by three points relative to (x,y)
  class Triangle extends Shape {
    constructor(x1 = -10, y1 = 10, x2 = 10, y2 = 10, x3 = 0, y3 = -10) {
      super();
      this.points = [x1, y1, x2, y2, x3, y3];
    }
    setPoints(x1,y1,x2,y2,x3,y3) { this.points = [x1,y1,x2,y2,x3,y3]; return this; }
    _path(ctx) {
      const [x1,y1,x2,y2,x3,y3] = this.points;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x3, y3);
      ctx.closePath();
    }
  }

  // Line with endpoints (x1,y1)-(x2,y2) relative to (x,y)
  class Line extends Shape {
    constructor(x1 = 0, y1 = 0, x2 = 50, y2 = 0) {
      super();
      this.x1 = x1; this.y1 = y1; this.x2 = x2; this.y2 = y2;
      this.fill = null;          // lines default to stroke-only
      this.stroke = '#000000';
    }
    setEnds(x1, y1, x2, y2) { this.x1 = x1; this.y1 = y1; this.x2 = x2; this.y2 = y2; return this; }
    _path(ctx) { ctx.moveTo(this.x1, this.y1); ctx.lineTo(this.x2, this.y2); }
  }

  // Expose classes globally
  window.Circle = Circle;
  window.Square = Square;
  window.Triangle = Triangle;
  window.Line = Line;

  // ---------- Render loop ----------
  let last = performance.now();
  function frame(t) {
    const dt = Math.min(0.1, (t - last) / 1000); // seconds, clamp to avoid big jumps
    last = t;
    // clear
    ctx.clearRect(0, 0, getWidth(), getHeight());
    // update & draw
    for (let i = 0; i < _scene.length; i++) {
      const obj = _scene[i];
      obj.update?.(dt);
      obj._draw(ctx);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- Convenience: background color ----------
  let _bg = null;
  Object.defineProperty(window, 'background', {
    get() { return _bg; },
    set(v) {
      _bg = v;
      if (v === null) return;
      // replace clear with a fill
      const _clear = ctx.clearRect.bind(ctx);
      ctx.clearRect = function(x, y, w, h) {
        _clear(x, y, w, h);
        ctx.save();
        ctx.fillStyle = v;
        ctx.fillRect(0, 0, getWidth(), getHeight());
        ctx.restore();
      };
    }
  });

  // ---------- Optional: simple random helper ----------
  window.random = (min, max) => Math.random() * (max - min) + min;
})();

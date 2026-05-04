/* ═══════════════════════════════════════════════════════════════
   MAIN.JS — A Noisy Little Disaster
   GSAP + WebGL (Three.js-less, raw WebGL) + Lenis
═══════════════════════════════════════════════════════════════ */

// ── GSAP Setup ──────────────────────────────────────────────────
gsap.registerPlugin(ScrollTrigger);

// ── Lenis smooth scroll ─────────────────────────────────────────
const lenis = new Lenis({
  duration: 1.3,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  touchMultiplier: 1.8,
});

function raf(time) {
  lenis.raf(time);
  ScrollTrigger.update();
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

// ── WebGL Noise Shader ──────────────────────────────────────────
const canvas = document.getElementById('webgl-canvas');
const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

const vsSource = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const fsSource = `
  precision mediump float;
  varying vec2 v_uv;
  uniform float u_time;
  uniform vec2 u_resolution;

  // Simplex-like noise helpers
  vec3 mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m * m; m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  void main() {
    vec2 uv = v_uv;
    float aspect = u_resolution.x / u_resolution.y;
    uv.x *= aspect;

    float t = u_time * 0.08;

    // Layered noise for organic movement
    float n1 = snoise(uv * 1.2 + vec2(t * 0.3, t * 0.2));
    float n2 = snoise(uv * 2.8 + vec2(-t * 0.15, t * 0.4) + n1 * 0.4);
    float n3 = snoise(uv * 5.5 + vec2(t * 0.25, -t * 0.1) + n2 * 0.25);

    float noise = n1 * 0.55 + n2 * 0.3 + n3 * 0.15;
    noise = noise * 0.5 + 0.5;

    // Dark, atmospheric — keep it moody
    float dark = pow(noise, 2.2) * 0.07;

    // Subtle vignette
    vec2 center = uv - vec2(aspect * 0.5, 0.5);
    float vignette = 1.0 - smoothstep(0.3, 1.1, length(center));
    dark *= vignette;

    gl_FragColor = vec4(vec3(dark), 1.0);
  }
`;

function compileShader(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

let program, posLoc, timeLoc, resLoc, quadBuf;

if (gl) {
  const vs = compileShader(gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl.FRAGMENT_SHADER, fsSource);
  program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.useProgram(program);

  posLoc = gl.getAttribLocation(program, 'a_position');
  timeLoc = gl.getUniformLocation(program, 'u_time');
  resLoc = gl.getUniformLocation(program, 'u_resolution');

  quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,  1, -1,  -1, 1,
    -1,  1,  1, -1,   1, 1,
  ]), gl.STATIC_DRAW);
}

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio, 2);
  canvas.width  = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width  = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

let startTime = performance.now();

function renderGL() {
  requestAnimationFrame(renderGL);
  if (!gl || !program) return;

  const t = (performance.now() - startTime) * 0.001;
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
  gl.uniform1f(timeLoc, t);
  gl.uniform2f(resLoc, canvas.width, canvas.height);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}
renderGL();

// ── Loader ──────────────────────────────────────────────────────
function runLoader(fromPost) {
  const loaderEl = document.getElementById('loader');
  const percentEl = document.querySelector('.loader-percent');
  const continueBtn = document.querySelector('.loader-continue');

  const onContinue = () => {
    loaderEl.style.display = 'none';
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    runHeroEntrance();
  };

  if (fromPost) {
    continueBtn.addEventListener('click', onContinue);

    const barDuration = 6.4;
    const proxy = { pct: 0 };

    const tl = gsap.timeline({
      onComplete: () => {
        loaderEl.classList.add('loader--done');
        gsap.to('.loader-done', { opacity: 1, duration: 0.5, ease: 'power2.out' });
        gsap.to(continueBtn, { opacity: 1, duration: 0.5, ease: 'power2.out', delay: 1.5 });
      },
    });

    tl
      .to(proxy, {
        pct: 100,
        duration: barDuration,
        ease: 'power3.inOut',
        onUpdate: () => {
          percentEl.textContent = Math.round(proxy.pct) + '%';
        },
      }, 0)
      .to('.loader-bar-fill', {
        width: '100%',
        duration: barDuration,
        ease: 'power3.inOut',
      }, 0);
  } else {
    const tl = gsap.timeline({
      onComplete: () => {
        loaderEl.style.display = 'none';
        runHeroEntrance();
      },
    });
    tl
      .to('.loader-line', {
        width: '140px',
        duration: 1.0,
        ease: 'power3.inOut',
      })
      .to('.loader-text', {
        opacity: 1,
        duration: 0.4,
        ease: 'power2.out',
      }, '-=0.3')
      .to('#loader', {
        yPercent: -100,
        duration: 1.1,
        ease: 'expo.inOut',
        delay: 0.4,
      });
  }
}

// ── Hero Entrance ───────────────────────────────────────────────
function runHeroEntrance() {
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' }, onComplete: setupHeroParallax });

  tl
    .to('.hero-top-bar', { opacity: 1, duration: 0.6 }, 0)
    .to('.hero-title .line span', {
      y: 0,
      duration: 1.3,
      stagger: 0.1,
    }, 0.1)
    .to('.hero-at', { opacity: 1, duration: 0.6 }, 0.55)
    .to('.cta-btn', { opacity: 1, duration: 0.6 }, 0.8)
    .to('.hero-scroll-hint', { opacity: 1, duration: 0.5 }, 1.0)
    .to('.hero-bands-label', { opacity: 1, duration: 0.6 }, 0.9);
}

// ── ScrollTrigger Reveals ────────────────────────────────────────
function setupScrollAnimations() {
  // Info items
  gsap.utils.toArray('.info-item').forEach((el, i) => {
    gsap.to(el, {
      scrollTrigger: {
        trigger: el,
        start: 'top 85%',
        toggleActions: 'play none none none',
      },
      opacity: 1,
      y: 0,
      duration: 0.9,
      delay: i * 0.12,
      ease: 'power3.out',
    });
  });


  // Section label
  gsap.to('.section-label', {
    scrollTrigger: {
      trigger: '.section-label',
      start: 'top 88%',
    },
    opacity: 1,
    y: 0,
    duration: 0.8,
    ease: 'power3.out',
  });

  // Band blocks
  gsap.utils.toArray('.band-block').forEach((el) => {
    gsap.to(el, {
      scrollTrigger: {
        trigger: el,
        start: 'top 82%',
      },
      opacity: 1,
      y: 0,
      duration: 1.1,
      ease: 'expo.out',
    });

    // Parallax on the photo
    const photo = el.querySelector('.band-photo');
    gsap.to(photo, {
      scrollTrigger: {
        trigger: el,
        start: 'top bottom',
        end: 'bottom top',
        scrub: true,
      },
      scale: 1.08,
      ease: 'none',
    });
  });

  // Tickets section
  gsap.to('#tickets', {
    scrollTrigger: {
      trigger: '#tickets',
      start: 'top 80%',
    },
    opacity: 1,
    y: 0,
    duration: 1.2,
    ease: 'expo.out',
  });
}

// ── Magnetic Button ─────────────────────────────────────────────
function setupMagneticButtons() {
  document.querySelectorAll('.cta-btn, .tickets-btn').forEach(btn => {
    btn.addEventListener('mousemove', (e) => {
      const rect = btn.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) * 0.25;
      const dy = (e.clientY - cy) * 0.25;
      gsap.to(btn, { x: dx, y: dy, duration: 0.4, ease: 'power2.out' });
    });
    btn.addEventListener('mouseleave', () => {
      gsap.to(btn, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.4)' });
    });
  });
}

// ── Hero parallax on scroll ──────────────────────────────────────
function setupHeroParallax() {
  gsap.to('.hero-title', {
    scrollTrigger: {
      trigger: '#hero',
      start: 'top top',
      end: 'bottom top',
      scrub: true,
    },
    y: -80,
    ease: 'none',
  });

  gsap.to('.hero-tagline', {
    scrollTrigger: {
      trigger: '#hero',
      start: 'top top',
      end: 'bottom top',
      scrub: true,
    },
    y: -40,
    opacity: 0,
    ease: 'none',
  });
}

// ── Init ─────────────────────────────────────────────────────────
if (typeof history !== 'undefined' && history.scrollRestoration) {
  history.scrollRestoration = 'manual';
}

window.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const fromPost = urlParams.get('ok') === '1';

  if (fromPost) {
    document.getElementById('loader').classList.add('loader--ok');
    if (window.history.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.delete('ok');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }

  runLoader(fromPost);

  document.querySelectorAll('.hero-title .line').forEach(line => {
    const span = document.createElement('span');
    span.innerHTML = line.innerHTML;
    line.innerHTML = '';
    line.appendChild(span);
  });

  setupScrollAnimations();
  setupMagneticButtons();
});

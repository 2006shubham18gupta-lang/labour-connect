/**
 * Shramik Setu - Premium 3D Animation Engine
 * Smooth, classic, professional animations across the entire web experience.
 */

(function () {
  'use strict';

  // ============================================================
  // 1. FLOATING 3D PARTICLE CANVAS BACKGROUND
  // ============================================================
  class ParticleCanvas {
    constructor() {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');
      this.particles = [];
      this.connections = [];
      this.mouse = { x: -9999, y: -9999 };
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.animationId = null;

      this.canvas.id = 'particle-canvas-3d';
      this.canvas.style.cssText = `
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 0;
        opacity: 0;
        transition: opacity 1.5s ease;
      `;
      document.body.prepend(this.canvas);

      requestAnimationFrame(() => {
        this.canvas.style.opacity = '1';
      });

      this.resize();
      this.createParticles();
      this.bindEvents();
      this.animate();
    }

    resize() {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.canvas.width = this.width * this.dpr;
      this.canvas.height = this.height * this.dpr;
      this.ctx.scale(this.dpr, this.dpr);
    }

    createParticles() {
      const count = Math.min(Math.floor((this.width * this.height) / 18000), 80);
      this.particles = [];

      for (let i = 0; i < count; i++) {
        this.particles.push({
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          z: Math.random() * 300,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          vz: (Math.random() - 0.5) * 0.2,
          size: Math.random() * 2.5 + 0.8,
          opacity: Math.random() * 0.4 + 0.15,
          hue: Math.random() > 0.5 ? 215 : 165, // blue or teal
          shape: Math.random() > 0.7 ? 'diamond' : (Math.random() > 0.5 ? 'triangle' : 'circle'),
          pulsePhase: Math.random() * Math.PI * 2,
          pulseSpeed: 0.008 + Math.random() * 0.012,
        });
      }
    }

    bindEvents() {
      window.addEventListener('resize', () => {
        this.resize();
        this.createParticles();
      });

      window.addEventListener('mousemove', (e) => {
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
      });
    }

    drawParticle(p) {
      const depthFactor = 1 - p.z / 400;
      const size = p.size * depthFactor;
      const pulse = Math.sin(p.pulsePhase) * 0.3 + 0.7;
      const alpha = p.opacity * depthFactor * pulse;

      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.fillStyle = `hsla(${p.hue}, 80%, 68%, 1)`;
      this.ctx.shadowColor = `hsla(${p.hue}, 90%, 60%, 0.4)`;
      this.ctx.shadowBlur = 8 * depthFactor;

      this.ctx.translate(p.x, p.y);

      if (p.shape === 'diamond') {
        this.ctx.rotate(Math.PI / 4);
        this.ctx.fillRect(-size, -size, size * 2, size * 2);
      } else if (p.shape === 'triangle') {
        this.ctx.beginPath();
        this.ctx.moveTo(0, -size * 1.5);
        this.ctx.lineTo(size * 1.3, size);
        this.ctx.lineTo(-size * 1.3, size);
        this.ctx.closePath();
        this.ctx.fill();
      } else {
        this.ctx.beginPath();
        this.ctx.arc(0, 0, size, 0, Math.PI * 2);
        this.ctx.fill();
      }

      this.ctx.restore();
    }

    drawConnections() {
      const maxDist = 140;
      for (let i = 0; i < this.particles.length; i++) {
        for (let j = i + 1; j < this.particles.length; j++) {
          const dx = this.particles[i].x - this.particles[j].x;
          const dy = this.particles[i].y - this.particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < maxDist) {
            const alpha = (1 - dist / maxDist) * 0.08;
            this.ctx.beginPath();
            this.ctx.strokeStyle = `rgba(79, 140, 255, ${alpha})`;
            this.ctx.lineWidth = 0.5;
            this.ctx.moveTo(this.particles[i].x, this.particles[i].y);
            this.ctx.lineTo(this.particles[j].x, this.particles[j].y);
            this.ctx.stroke();
          }
        }
      }
    }

    animate() {
      this.ctx.clearRect(0, 0, this.width, this.height);

      this.drawConnections();

      for (const p of this.particles) {
        // Mouse interaction - gentle push
        const dx = p.x - this.mouse.x;
        const dy = p.y - this.mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150) {
          const force = (150 - dist) / 150;
          p.vx += (dx / dist) * force * 0.015;
          p.vy += (dy / dist) * force * 0.015;
        }

        p.x += p.vx;
        p.y += p.vy;
        p.z += p.vz;
        p.pulsePhase += p.pulseSpeed;

        // Damping
        p.vx *= 0.998;
        p.vy *= 0.998;

        // Wrap around
        if (p.x < -20) p.x = this.width + 20;
        if (p.x > this.width + 20) p.x = -20;
        if (p.y < -20) p.y = this.height + 20;
        if (p.y > this.height + 20) p.y = -20;
        if (p.z < 0) p.z = 300;
        if (p.z > 300) p.z = 0;

        this.drawParticle(p);
      }

      this.animationId = requestAnimationFrame(() => this.animate());
    }
  }

  // ============================================================
  // 2. 3D TILT EFFECT ON CARDS
  // ============================================================
  class TiltEffect {
    constructor() {
      this.elements = [];
      this.init();
      this.observe();
    }

    init() {
      const selectors = [
        '.login-page__card',
        '.feature-v2',
        '.product-card',
        '.labour-quick-stats__card',
        '.cust-search-hero',
        '.cust-profile-bar',
        '.labour-welcome-banner',
        '.labour-edit-section',
        '.labour-summary-strip',
        '.stats-v2',
        '.steps-v2',
        '.hero__graphic-frame',
      ];

      document.querySelectorAll(selectors.join(', ')).forEach((el) => {
        if (!el.dataset.tiltBound) {
          el.dataset.tiltBound = 'true';
          this.bindTilt(el);
        }
      });
    }

    bindTilt(el) {
      let rafId = null;
      let currentX = 0, currentY = 0;
      let targetX = 0, targetY = 0;

      const maxTilt = 6;
      const perspective = 1200;

      const handleMove = (e) => {
        const rect = el.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const percentX = (e.clientX - centerX) / (rect.width / 2);
        const percentY = (e.clientY - centerY) / (rect.height / 2);

        targetX = -percentY * maxTilt;
        targetY = percentX * maxTilt;

        if (!rafId) {
          rafId = requestAnimationFrame(function update() {
            currentX += (targetX - currentX) * 0.08;
            currentY += (targetY - currentY) * 0.08;

            el.style.transform = `perspective(${perspective}px) rotateX(${currentX}deg) rotateY(${currentY}deg) translateZ(10px)`;

            if (Math.abs(targetX - currentX) > 0.01 || Math.abs(targetY - currentY) > 0.01) {
              rafId = requestAnimationFrame(update);
            } else {
              rafId = null;
            }
          });
        }
      };

      const handleLeave = () => {
        targetX = 0;
        targetY = 0;

        if (!rafId) {
          rafId = requestAnimationFrame(function reset() {
            currentX += (0 - currentX) * 0.06;
            currentY += (0 - currentY) * 0.06;

            el.style.transform = `perspective(${perspective}px) rotateX(${currentX}deg) rotateY(${currentY}deg) translateZ(0px)`;

            if (Math.abs(currentX) > 0.01 || Math.abs(currentY) > 0.01) {
              rafId = requestAnimationFrame(reset);
            } else {
              el.style.transform = '';
              rafId = null;
            }
          });
        }
      };

      el.addEventListener('mousemove', handleMove, { passive: true });
      el.addEventListener('mouseleave', handleLeave);
    }

    observe() {
      const observer = new MutationObserver(() => {
        requestAnimationFrame(() => this.init());
      });
      observer.observe(document.getElementById('app'), { childList: true, subtree: true });
    }
  }

  // ============================================================
  // 3. SCROLL-TRIGGERED REVEAL ANIMATIONS (Intersection Observer)
  // ============================================================
  class ScrollReveal {
    constructor() {
      this.init();
      this.observe();
    }

    init() {
      const selectors = [
        '.section-block',
        '.feature-v2',
        '.step-v2',
        '.stats-v2__item',
        '.section-block__label',
        '.hero__content-v2',
        '.hero__visual-v2',
        '.stats-v2',
        '.login-page__card',
        '.product-card',
        '.cust-search-hero',
        '.cust-stats-strip',
        '.cust-profile-bar',
        '.labour-welcome-banner',
        '.labour-quick-stats__card',
        '.labour-summary-strip',
        '.labour-edit-section',
      ];

      document.querySelectorAll(selectors.join(', ')).forEach((el, index) => {
        if (!el.dataset.revealed) {
          el.dataset.revealed = 'false';
          el.classList.add('scroll-reveal-3d');
          el.style.transitionDelay = `${Math.min(index * 0.06, 0.6)}s`;
        }
      });

      this.createObserver();
    }

    createObserver() {
      if (this.observer) this.observer.disconnect();

      this.observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && entry.target.dataset.revealed === 'false') {
              entry.target.dataset.revealed = 'true';
              entry.target.classList.add('scroll-reveal-3d--visible');
            }
          });
        },
        { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
      );

      document.querySelectorAll('.scroll-reveal-3d').forEach((el) => {
        if (el.dataset.revealed === 'false') {
          this.observer.observe(el);
        }
      });
    }

    observe() {
      const mutObserver = new MutationObserver(() => {
        requestAnimationFrame(() => this.init());
      });
      mutObserver.observe(document.getElementById('app'), { childList: true, subtree: true });
    }
  }

  // ============================================================
  // 4. MAGNETIC BUTTON EFFECT
  // ============================================================
  class MagneticButtons {
    constructor() {
      this.init();
      this.observe();
    }

    init() {
      const selectors = [
        '.button-v2',
        '.login-page__btn',
        '.button--primary',
        '.btn-hire',
        '.nav-link',
      ];

      document.querySelectorAll(selectors.join(', ')).forEach((btn) => {
        if (!btn.dataset.magneticBound) {
          btn.dataset.magneticBound = 'true';
          this.bindMagnetic(btn);
        }
      });
    }

    bindMagnetic(btn) {
      const strength = 0.25;
      let rafId = null;

      btn.addEventListener('mousemove', (e) => {
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;

        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          btn.style.transform = `translate(${x * strength}px, ${y * strength}px) scale(1.03)`;
        });
      }, { passive: true });

      btn.addEventListener('mouseleave', () => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          btn.style.transform = '';
        });
      });
    }

    observe() {
      const observer = new MutationObserver(() => {
        requestAnimationFrame(() => this.init());
      });
      observer.observe(document.getElementById('app'), { childList: true, subtree: true });
    }
  }

  // ============================================================
  // 5. SMOOTH VIEW TRANSITION WRAPPER
  // ============================================================
  class ViewTransitions {
    constructor() {
      this.lastView = null;
      this.patchShowView();
    }

    patchShowView() {
      if (typeof window.showView !== 'function') {
        // showView is not a global — find it via event delegation approach
        // We'll use MutationObserver to detect view changes
        const appEl = document.getElementById('app');
        if (!appEl) return;

        const observer = new MutationObserver((mutations) => {
          mutations.forEach((m) => {
            m.addedNodes.forEach((node) => {
              if (node.nodeType === 1) {
                this.animateIn(node);
              }
            });
          });

          // Check for newly visible sections
          document.querySelectorAll('#app > section:not(.hidden), #app .dashboard:not(.hidden)').forEach((sec) => {
            if (sec !== this.lastView) {
              this.animateIn(sec);
              this.lastView = sec;
            }
          });
        });

        observer.observe(appEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
      }
    }

    animateIn(el) {
      if (!el || !el.classList) return;
      el.style.animation = 'none';
      el.offsetHeight; // trigger reflow
      el.style.animation = '';
      el.classList.add('view-enter-3d');
      el.addEventListener('animationend', () => {
        el.classList.remove('view-enter-3d');
      }, { once: true });
    }
  }

  // ============================================================
  // 6. FLOATING ORB PARALLAX (on mouse move)
  // ============================================================
  class OrbParallax {
    constructor() {
      this.orbs = [];
      this.mouse = { x: 0.5, y: 0.5 };
      this.bindEvents();
      this.animate();
    }

    bindEvents() {
      window.addEventListener('mousemove', (e) => {
        this.mouse.x = e.clientX / window.innerWidth;
        this.mouse.y = e.clientY / window.innerHeight;
      }, { passive: true });
    }

    animate() {
      const orbs = document.querySelectorAll('.hero__orb, .login-page__orb');
      orbs.forEach((orb, i) => {
        const depth = (i + 1) * 15;
        const moveX = (this.mouse.x - 0.5) * depth;
        const moveY = (this.mouse.y - 0.5) * depth;
        orb.style.transform = `translate(${moveX}px, ${moveY}px)`;
      });

      requestAnimationFrame(() => this.animate());
    }
  }

  // ============================================================
  // 7. SMOOTH GLOWING CURSOR TRAIL
  // ============================================================
  class CursorGlow {
    constructor() {
      this.glow = document.createElement('div');
      this.glow.id = 'cursor-glow-3d';
      this.glow.style.cssText = `
        position: fixed;
        width: 400px;
        height: 400px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(79, 140, 255, 0.06) 0%, transparent 70%);
        pointer-events: none;
        z-index: 1;
        transform: translate(-50%, -50%);
        transition: opacity 0.5s ease;
        opacity: 0;
      `;
      document.body.appendChild(this.glow);

      let currentX = 0, currentY = 0;
      let targetX = 0, targetY = 0;

      window.addEventListener('mousemove', (e) => {
        targetX = e.clientX;
        targetY = e.clientY;
        this.glow.style.opacity = '1';
      }, { passive: true });

      window.addEventListener('mouseout', () => {
        this.glow.style.opacity = '0';
      });

      const animate = () => {
        currentX += (targetX - currentX) * 0.06;
        currentY += (targetY - currentY) * 0.06;
        this.glow.style.left = currentX + 'px';
        this.glow.style.top = currentY + 'px';
        requestAnimationFrame(animate);
      };
      animate();
    }
  }

  // ============================================================
  // 8. TYPING EFFECT FOR HERO TITLE
  // ============================================================
  class TypewriterEffect {
    constructor() {
      const highlight = document.querySelector('.hero__title-highlight');
      if (!highlight || highlight.dataset.typed) return;
      highlight.dataset.typed = 'true';

      const text = highlight.textContent;
      highlight.textContent = '';
      highlight.style.borderRight = '2px solid rgba(79, 140, 255, 0.8)';

      let i = 0;
      const type = () => {
        if (i < text.length) {
          highlight.textContent += text[i];
          i++;
          setTimeout(type, 60 + Math.random() * 40);
        } else {
          setTimeout(() => {
            highlight.style.borderRight = 'none';
          }, 800);
        }
      };

      // Wait for the hero to be visible
      setTimeout(type, 800);
    }
  }

  // ============================================================
  // 9. COUNTER ANIMATION ON STATS (on scroll)
  // ============================================================
  class StatsCounter {
    constructor() {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target;
            const text = el.textContent.trim();
            const match = text.match(/^([\d,]+)/);

            if (match && !el.dataset.counted) {
              el.dataset.counted = 'true';
              const target = parseInt(match[1].replace(/,/g, ''), 10);
              const suffix = text.replace(match[1], '');

              if (!isNaN(target) && target > 0) {
                this.countUp(el, target, suffix);
              }
            }

            observer.unobserve(el);
          }
        });
      }, { threshold: 0.5 });

      document.querySelectorAll('.stats-v2__item strong').forEach((el) => {
        observer.observe(el);
      });
    }

    countUp(el, target, suffix) {
      const duration = 1200;
      const start = performance.now();

      const update = (now) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 4);
        const current = Math.floor(target * eased);
        el.textContent = current.toLocaleString() + suffix;

        if (progress < 1) {
          requestAnimationFrame(update);
        } else {
          el.textContent = target.toLocaleString() + suffix;
        }
      };

      requestAnimationFrame(update);
    }
  }

  // ============================================================
  // INITIALIZE ALL MODULES
  // ============================================================
  function boot() {
    // Only init if we have the app
    if (!document.getElementById('app')) return;

    new ParticleCanvas();
    new CursorGlow();
    new TiltEffect();
    new ScrollReveal();
    new MagneticButtons();
    new ViewTransitions();
    new OrbParallax();
    new TypewriterEffect();
    new StatsCounter();

    // Re-init tilt on view changes
    document.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setTimeout(() => {
          new TiltEffect();
          new ScrollReveal();
          new MagneticButtons();
        }, 100);
      });
    });
  }

  // Boot on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

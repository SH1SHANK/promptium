/**
 * File: popup/onboarding.js
 * Purpose: Premium onboarding with per-card animations, dual ambient glow, gradient text, and confetti.
 * Design language: Crafted glass-dark — deep backgrounds, gradient accents, motion-forward.
 * Communicates with: popup/popup.js, chrome.storage.local.
 */

(() => {
  const ONBOARDING_KEY = "onboardingComplete";

  /* ===========================
     CARD DATA
     =========================== */

  const CARDS = [
    {
      id: "welcome",
      headline: "Meet Promptium",
      subline: "Your AI workspace, elevated.",
      hint: "private \u00B7 local \u00B7 powerful",
    },
    {
      id: "templates",
      headline: "Templates that adapt",
      subline: "Save prompts with [variables] that fill in on the fly.",
      hint: "[topic] required \u00B7 [tone?] optional",
    },
    {
      id: "platforms",
      headline: "One prompt, every platform",
      subline:
        "Inject saved prompts into ChatGPT, Claude, Gemini, and 30+ more.",
      hint: "30+ platforms \u00B7 cross-LLM",
    },
    {
      id: "export",
      headline: "Export anything, your way",
      subline:
        "Markdown, PDF, JSON, Notion, Obsidian — with smart names and bookmarks.",
      hint: "8 formats \u00B7 smart filenames",
    },
    {
      id: "ai",
      headline: "Finds prompts by meaning",
      subline: "Semantic vector search \u2014 no exact match needed.",
      hint: "\u2726 powered by transformers.js",
    },
    {
      id: "ready",
      headline: "You\u2019re all set",
      subline: "Start building your prompt library.",
      hint: "your workspace awaits \u2192",
      isFinal: true,
    },
  ];

  /* Primary glow orb positions (card 0–5) */
  const GLOW_POSITIONS = [
    { top: "22%", left: "32%" },
    { top: "58%", left: "55%" },
    { top: "30%", left: "18%" },
    { top: "62%", left: "42%" },
    { top: "24%", left: "62%" },
    { top: "42%", left: "36%" },
  ];

  /* Secondary glow orb positions — offset from primary */
  const GLOW_2_POSITIONS = [
    { top: "70%", left: "68%" },
    { top: "25%", left: "22%" },
    { top: "72%", left: "64%" },
    { top: "20%", left: "28%" },
    { top: "68%", left: "30%" },
    { top: "28%", left: "65%" },
  ];

  /* ===========================
     STATE
     =========================== */

  const state = {
    currentCard: 0,
    totalCards: CARDS.length,
    transitioning: false,
    dotsRevealed: false,
  };

  const dom = {
    overlay: null,
    deck: null,
    glow: null,
    glow2: null,
    cards: [],
    dots: [],
    timers: [],
  };

  let completionResolver = null;

  /* ===========================
     UTILITIES
     =========================== */

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const schedule = (fn, delay) => {
    const id = setTimeout(fn, delay);
    dom.timers.push(id);
    return id;
  };

  const clearTimers = () => {
    dom.timers.forEach((id) => clearTimeout(id));
    dom.timers.length = 0;
  };

  /* ===========================
     TEXT ANIMATION SYSTEM
     =========================== */

  const animateText = (el, type, delay) => {
    if (!el) return;

    const text = el.getAttribute("data-text") || el.textContent;
    el.setAttribute("data-text", text);

    if (type === "charReveal") {
      el.innerHTML = "";
      const chars = text.split("");

      schedule(() => {
        chars.forEach((ch, i) => {
          if (ch === " ") {
            el.appendChild(document.createTextNode("\u00A0"));
          } else {
            const span = document.createElement("span");
            span.className = "char";
            span.textContent = ch;
            span.style.animationDelay = `${i * 28}ms`;
            el.appendChild(span);
          }
        });
      }, delay);
    }

    if (type === "wordFade") {
      el.innerHTML = "";
      const words = text.split(" ");

      schedule(() => {
        words.forEach((word, i) => {
          const span = document.createElement("span");
          span.className = "word";
          span.textContent = word;
          span.style.animationDelay = `${i * 55}ms`;
          el.appendChild(span);

          if (i < words.length - 1) {
            el.appendChild(document.createTextNode("\u00A0"));
          }
        });
      }, delay);
    }

    if (type === "lineDraw") {
      el.classList.remove("typing", "typed");
      el.textContent = text;
      el.style.removeProperty("--hint-width");

      schedule(() => {
        el.style.visibility = "hidden";
        el.style.width = "auto";
        const naturalWidth = el.scrollWidth;
        el.style.width = "0";
        el.style.setProperty("--hint-width", naturalWidth + "px");
        el.classList.add("typing");

        schedule(() => {
          el.classList.remove("typing");
          el.classList.add("typed");
        }, 2500);
      }, delay);
    }
  };

  /* ===========================
     GLOW ORBS
     =========================== */

  const moveGlow = (index) => {
    if (dom.glow) {
      const pos = GLOW_POSITIONS[index] || GLOW_POSITIONS[0];
      dom.glow.style.top = pos.top;
      dom.glow.style.left = pos.left;
    }

    if (dom.glow2) {
      const pos2 = GLOW_2_POSITIONS[index] || GLOW_2_POSITIONS[0];
      dom.glow2.style.top = pos2.top;
      dom.glow2.style.left = pos2.left;
    }
  };

  /* ===========================
     PROGRESS DOTS
     =========================== */

  const revealDots = (baseDelay) => {
    if (state.dotsRevealed) return;
    state.dotsRevealed = true;

    dom.dots.forEach((dot, i) => {
      schedule(
        () => {
          dot.classList.add("visible");
        },
        baseDelay + i * 45,
      );
    });
  };

  const updateDots = () => {
    dom.dots.forEach((dot, i) => {
      dot.classList.remove("active");

      if (i < state.currentCard && !dot.classList.contains("visited")) {
        dot.classList.add("visited");
      }

      if (i === state.currentCard) {
        dot.classList.add("active");
      }
    });
  };

  /* ===========================
     PER-CARD VISUAL HTML
     =========================== */

  const getVisualHTML = (cardId) => {
    switch (cardId) {
      case "welcome":
        return `
          <div class="pn-ob-welcome-scene">
            <div class="pn-ob-grid-bg"></div>
            <div class="pn-ob-logo-container">
              <svg class="pn-ob-logo-svg" viewBox="0 0 80 80" width="76" height="76">
                <defs>
                  <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#8b7cf6"/>
                    <stop offset="100%" stop-color="#a78bfa"/>
                  </linearGradient>
                  <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#8b7cf6" stop-opacity="0.8"/>
                    <stop offset="100%" stop-color="#6366f1" stop-opacity="0.3"/>
                  </linearGradient>
                </defs>
                <circle cx="40" cy="40" r="36" class="pn-ob-logo-ring" />
                <path class="logo-stroke"
                  d="M28,58 L28,22 L40,22 C48,22 54,27 54,34 C54,41 48,46 40,46 L28,46" />
                <path class="logo-fill"
                  d="M30,56 L30,24 L40,24 C47,24 52,28.5 52,34 C52,39.5 47,44 40,44 L30,44 Z" />
              </svg>
              <div class="pn-ob-sparkles">
                <span class="pn-ob-sparkle">\u2726</span>
                <span class="pn-ob-sparkle">\u00B7</span>
                <span class="pn-ob-sparkle">\u2726</span>
              </div>
            </div>
          </div>`;

      case "templates":
        return `
          <div class="pn-ob-prompt-card">
            Write a <span class="pn-ob-var-highlight" data-var="1">[topic]</span> essay<br>
            in a <span class="pn-ob-var-highlight" data-var="2">[tone?]</span> voice
            <div class="pn-ob-fill-badge">\u2191 Fill in to use</div>
          </div>`;

      case "platforms":
        return `
          <div class="pn-ob-platforms">
            <div class="pn-ob-platform-icon" data-platform="gpt">GPT</div>
            <div class="pn-ob-platform-icon" data-platform="claude">Cla</div>
            <div class="pn-ob-platform-icon" data-platform="gemini">Gem</div>
            <div class="pn-ob-platform-icon" data-platform="perp">Perp</div>
            <div class="pn-ob-platform-icon" data-platform="more">+30</div>
            <svg class="pn-ob-connect-line" viewBox="0 0 200 36">
              <defs>
                <linearGradient id="connectGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#6366f1" stop-opacity="0.3"/>
                  <stop offset="50%" stop-color="#8b7cf6" stop-opacity="0.7"/>
                  <stop offset="100%" stop-color="#6366f1" stop-opacity="0.3"/>
                </linearGradient>
              </defs>
              <path d="M10,28 Q55,4 100,18 Q145,32 190,8" />
            </svg>
          </div>`;

      case "export":
        return `
          <div class="pn-ob-export-grid">
            <div class="pn-ob-format-tag" data-fmt="MD">MD</div>
            <div class="pn-ob-format-tag" data-fmt="PDF">PDF</div>
            <div class="pn-ob-format-tag" data-fmt="JSON">JSON</div>
            <div class="pn-ob-format-tag" data-fmt="Notion">Notion</div>
            <div class="pn-ob-format-tag" data-fmt="PNG">PNG</div>
            <div class="pn-ob-format-tag" data-fmt="TXT">TXT</div>
          </div>`;

      case "ai":
        return `
          <div class="pn-ob-search-scene">
            <div class="pn-ob-search-bar">
              <span class="pn-ob-search-icon">\u25C8</span>
              <span class="pn-ob-search-query" data-query="analyze this data">analyze this data</span>
            </div>
            <div class="pn-ob-search-results">
              <div class="pn-ob-result-row" data-rank="1">
                <span class="pn-ob-result-score">98%</span>
                Data analysis prompt
              </div>
              <div class="pn-ob-result-row" data-rank="2">
                <span class="pn-ob-result-score">91%</span>
                Chart interpretation
              </div>
              <div class="pn-ob-result-row" data-rank="3">
                <span class="pn-ob-result-score">84%</span>
                Statistical summary
              </div>
            </div>
          </div>`;

      case "ready":
        return `
          <div class="pn-ob-check-wrap">
            <svg class="pn-ob-check-svg" viewBox="0 0 64 64" width="68" height="68">
              <defs>
                <linearGradient id="checkGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#8b7cf6"/>
                  <stop offset="100%" stop-color="#6366f1"/>
                </linearGradient>
              </defs>
              <circle cx="32" cy="32" r="29" class="check-fill" />
              <circle cx="32" cy="32" r="29" class="check-circle" />
              <polyline points="20,34 28,42 44,24" class="check-mark" />
            </svg>
            <div class="pn-ob-check-ripple"></div>
            <div class="pn-ob-check-ripple-2"></div>
          </div>`;

      default:
        return "";
    }
  };

  /* ===========================
     PER-CARD VISUAL ANIMATIONS
     =========================== */

  const triggerCardVisual = (cardEl, cardId) => {
    const visual = cardEl.querySelector(".pn-ob-visual");
    if (!visual) return;

    switch (cardId) {
      /* Card 1 — Logo stroke draw + fill + ring expand + sparkles */
      case "welcome": {
        const svg = visual.querySelector(".pn-ob-logo-svg");
        if (svg) {
          svg.classList.remove("animate");
          schedule(() => svg.classList.add("animate"), 80);
        }

        const sparkles = visual.querySelectorAll(".pn-ob-sparkle");
        sparkles.forEach((s, i) => {
          s.classList.remove("reveal");
          schedule(() => s.classList.add("reveal"), 500 + i * 120);
        });
        break;
      }

      /* Card 2 — Variable underlines + fill badge */
      case "templates": {
        const v1 = visual.querySelector('[data-var="1"]');
        const v2 = visual.querySelector('[data-var="2"]');
        const badge = visual.querySelector(".pn-ob-fill-badge");

        if (v1) {
          v1.classList.remove("reveal");
          schedule(() => v1.classList.add("reveal"), 200);
        }
        if (v2) {
          v2.classList.remove("reveal");
          schedule(() => v2.classList.add("reveal"), 480);
        }
        if (badge) {
          badge.classList.remove("reveal");
          schedule(() => badge.classList.add("reveal"), 700);
        }
        break;
      }

      /* Card 3 — Platform icons stagger + connecting line */
      case "platforms": {
        const icons = visual.querySelectorAll(".pn-ob-platform-icon");
        const line = visual.querySelector(".pn-ob-connect-line");

        icons.forEach((icon, i) => {
          icon.classList.remove("reveal");
          schedule(() => icon.classList.add("reveal"), 60 + i * 90);
        });

        if (line) {
          line.classList.remove("reveal");
          schedule(
            () => line.classList.add("reveal"),
            60 + icons.length * 90 + 80,
          );
        }
        break;
      }

      /* Card 4 — Format tags stagger in */
      case "export": {
        const tags = visual.querySelectorAll(".pn-ob-format-tag");
        tags.forEach((tag, i) => {
          tag.classList.remove("reveal");
          schedule(() => tag.classList.add("reveal"), 80 + i * 70);
        });
        break;
      }

      /* Card 5 — Search bar reveal + typewriter + result rows appear */
      case "ai": {
        const searchBar = visual.querySelector(".pn-ob-search-bar");
        const results = visual.querySelector(".pn-ob-search-results");
        const resultRows = visual.querySelectorAll(".pn-ob-result-row");

        if (searchBar) {
          searchBar.classList.remove("reveal", "typing", "typed");
          schedule(() => {
            searchBar.classList.add("reveal");
            schedule(() => {
              searchBar.classList.add("typing");
              schedule(() => {
                searchBar.classList.remove("typing");
                searchBar.classList.add("typed");
              }, 1200);
            }, 180);
          }, 0);
        }

        if (results) {
          results.classList.remove("reveal");
          schedule(() => results.classList.add("reveal"), 680);
        }

        resultRows.forEach((row, i) => {
          row.classList.remove("reveal");
          schedule(() => row.classList.add("reveal"), 720 + i * 90);
        });
        break;
      }

      /* Card 6 — Check draw + ripples + confetti */
      case "ready": {
        const svg = visual.querySelector(".pn-ob-check-svg");
        const ripple = visual.querySelector(".pn-ob-check-ripple");
        const ripple2 = visual.querySelector(".pn-ob-check-ripple-2");

        if (svg) {
          svg.classList.remove("animate");
          schedule(() => svg.classList.add("animate"), 80);
        }
        if (ripple) {
          ripple.classList.remove("animate");
          schedule(() => ripple.classList.add("animate"), 80);
        }
        if (ripple2) {
          ripple2.classList.remove("animate");
          schedule(() => ripple2.classList.add("animate"), 80);
        }

        schedule(() => fireConfetti(cardEl), 700);
        break;
      }

      default:
        break;
    }
  };

  /* ===========================
     CONFETTI SYSTEM
     =========================== */

  const fireConfetti = (container) => {
    const canvas = document.createElement("canvas");
    canvas.className = "pn-ob-confetti-canvas";
    canvas.width = container.offsetWidth || 400;
    canvas.height = container.offsetHeight || 500;
    container.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    const particles = [];
    const colors = [
      "#8b7cf6",
      "#ffffff",
      "#6366f1",
      "#a78bfa",
      "#c4b5fd",
      "#818cf8",
      "#e0d7ff",
    ];

    const cx = canvas.width / 2;
    const cy = canvas.height * 0.4;

    for (let i = 0; i < 48; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 5;

      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3.5,
        size: 2.5 + Math.random() * 4.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1,
        decay: 0.011 + Math.random() * 0.009,
        gravity: 0.09,
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 9,
      });
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;

      for (const p of particles) {
        if (p.life <= 0) continue;
        alive = true;

        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.life -= p.decay;
        p.rotation += p.rotSpeed;

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;

        if (p.size > 5) {
          ctx.fillRect(-p.size / 2, -p.size / 3.5, p.size, p.size / 2.5);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }

      if (alive) {
        requestAnimationFrame(animate);
      } else {
        canvas.remove();
      }
    };

    requestAnimationFrame(animate);
  };

  /* ===========================
     CARD ENTER SEQUENCE
     =========================== */

  const triggerCardEnter = (index) => {
    clearTimers();

    const cardEl = dom.cards[index];
    const data = CARDS[index];

    if (!cardEl || !data) return;

    const headlineEl = cardEl.querySelector(".pn-ob-headline");
    animateText(headlineEl, "charReveal", 160);

    const sublineEl = cardEl.querySelector(".pn-ob-subline");
    animateText(sublineEl, "wordFade", 360);

    const hintEl = cardEl.querySelector(".pn-ob-hint");
    animateText(hintEl, "lineDraw", 560);

    triggerCardVisual(cardEl, data.id);
    revealDots(680);
    updateDots();
    moveGlow(index);
  };

  /* ===========================
     CARD RESET
     =========================== */

  const resetCard = (cardEl) => {
    if (!cardEl) return;

    cardEl.classList.remove("active", "exit");

    const headline = cardEl.querySelector(".pn-ob-headline");
    if (headline) {
      const text = headline.getAttribute("data-text") || headline.textContent;
      headline.setAttribute("data-text", text);
      headline.textContent = text;
    }

    const subline = cardEl.querySelector(".pn-ob-subline");
    if (subline) {
      const text = subline.getAttribute("data-text") || subline.textContent;
      subline.setAttribute("data-text", text);
      subline.textContent = text;
    }

    const hint = cardEl.querySelector(".pn-ob-hint");
    if (hint) {
      hint.classList.remove("typing", "typed");
      hint.style.width = "0";
      hint.style.removeProperty("--hint-width");
    }

    const classesToReset = [
      ".pn-ob-logo-svg",
      ".pn-ob-sparkle",
      ".pn-ob-var-highlight",
      ".pn-ob-fill-badge",
      ".pn-ob-platform-icon",
      ".pn-ob-connect-line",
      ".pn-ob-format-tag",
      ".pn-ob-search-bar",
      ".pn-ob-search-results",
      ".pn-ob-result-row",
      ".pn-ob-ai-badge",
      ".pn-ob-ai-dot",
      ".pn-ob-waveform",
      ".pn-ob-check-svg",
      ".pn-ob-check-ripple",
      ".pn-ob-check-ripple-2",
    ];

    classesToReset.forEach((sel) => {
      cardEl.querySelectorAll(sel).forEach((el) => {
        el.classList.remove(
          "animate",
          "reveal",
          "reveal-left",
          "reveal-right",
          "travel",
          "blink",
          "visible",
          "typing",
          "typed",
        );
      });
    });

    const confetti = cardEl.querySelector(".pn-ob-confetti-canvas");
    if (confetti) confetti.remove();
  };

  /* ===========================
     NAVIGATION
     =========================== */

  const nextCard = async () => {
    if (state.transitioning) return;

    if (state.currentCard >= state.totalCards - 1) {
      await completeOnboarding();
      return;
    }

    state.transitioning = true;
    const currentEl = dom.cards[state.currentCard];
    const nextIndex = state.currentCard + 1;
    const nextEl = dom.cards[nextIndex];

    currentEl.classList.remove("active");
    currentEl.classList.add("exit");

    await sleep(220);

    currentEl.classList.remove("exit");
    resetCard(nextEl);

    state.currentCard = nextIndex;
    nextEl.classList.add("active");
    triggerCardEnter(nextIndex);

    state.transitioning = false;
  };

  const skipToEnd = async () => {
    if (state.transitioning) return;

    state.transitioning = true;
    const currentEl = dom.cards[state.currentCard];
    const endIndex = state.totalCards - 1;
    const endEl = dom.cards[endIndex];

    currentEl.classList.remove("active");
    currentEl.classList.add("exit");

    await sleep(220);

    currentEl.classList.remove("exit");

    for (let i = state.currentCard; i < endIndex; i += 1) {
      if (dom.dots[i] && !dom.dots[i].classList.contains("visited")) {
        dom.dots[i].classList.add("visited");
      }
    }

    resetCard(endEl);
    state.currentCard = endIndex;
    endEl.classList.add("active");
    triggerCardEnter(endIndex);

    state.transitioning = false;
  };

  /* ===========================
     OVERLAY LIFECYCLE
     =========================== */

  const completeOnboarding = async () => {
    await chrome.storage.local.set({ [ONBOARDING_KEY]: true });
    clearTimers();

    const overlay = dom.overlay || document.getElementById("pn-onboarding");

    if (overlay) {
      overlay.classList.add("pn-ob-exit");
      await sleep(350);
      overlay.remove();
    }

    if (dom.glow) {
      dom.glow.remove();
      dom.glow = null;
    }

    if (dom.glow2) {
      dom.glow2.remove();
      dom.glow2 = null;
    }

    if (typeof completionResolver === "function") {
      await completionResolver({ aiInitialized: false });
    }
  };

  /* ===========================
     EVENT HANDLING
     =========================== */

  const onOverlayClick = async (event) => {
    const action = String(event.target?.dataset?.action || "");

    if (action === "continue") {
      event.preventDefault();
      await nextCard();
      return;
    }

    if (action === "skip") {
      event.preventDefault();
      await skipToEnd();
      return;
    }

    if (action === "get-started") {
      event.preventDefault();
      await completeOnboarding();
    }
  };

  const onKeyDown = async (event) => {
    if (!dom.overlay) return;

    if (event.key === "ArrowRight" || event.key === "Enter") {
      event.preventDefault();
      await nextCard();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      await skipToEnd();
    }
  };

  const bindEvents = () => {
    if (!dom.overlay) return;

    dom.overlay.addEventListener("click", (event) => {
      void onOverlayClick(event);
    });

    document.addEventListener("keydown", (event) => {
      void onKeyDown(event);
    });
  };

  /* ===========================
     CARD RENDERING
     =========================== */

  const renderCard = (data, index) => {
    const node = document.createElement("section");
    node.className = "pn-onboarding-card";
    node.dataset.index = String(index);
    node.dataset.cardId = data.id;

    const btnLabel = data.isFinal ? "Get Started" : "Continue";
    const btnAction = data.isFinal ? "get-started" : "continue";
    const skipMarkup = data.isFinal
      ? ""
      : `<button class="pn-ob-skip" type="button" data-action="skip">Skip intro</button>`;

    node.innerHTML = `
      <div class="pn-ob-visual">${getVisualHTML(data.id)}</div>
      <h2 class="pn-ob-headline" data-text="${data.headline}">${data.headline}</h2>
      <p class="pn-ob-subline" data-text="${data.subline}">${data.subline}</p>
      <span class="pn-ob-hint" data-text="${data.hint}">${data.hint}</span>
      <button class="pn-onboarding-primary" type="button" data-action="${btnAction}">${btnLabel}</button>
      ${skipMarkup}
    `;

    return node;
  };

  /* ===========================
     RENDER ONBOARDING
     =========================== */

  const renderOnboarding = () => {
    const mount =
      document.getElementById("pn-onboarding-mount") || document.body;

    /* Primary glow orb */
    dom.glow = document.createElement("div");
    dom.glow.className = "pn-onboarding-glow";
    dom.glow.style.top = GLOW_POSITIONS[0].top;
    dom.glow.style.left = GLOW_POSITIONS[0].left;

    /* Secondary glow orb */
    dom.glow2 = document.createElement("div");
    dom.glow2.className = "pn-onboarding-glow-2";
    dom.glow2.style.top = GLOW_2_POSITIONS[0].top;
    dom.glow2.style.left = GLOW_2_POSITIONS[0].left;

    dom.overlay = document.createElement("div");
    dom.overlay.id = "pn-onboarding";
    dom.overlay.innerHTML = `
      <div class="pn-ob-deck"></div>
      <div class="pn-ob-dots"></div>
    `;

    dom.overlay.appendChild(dom.glow);
    dom.overlay.appendChild(dom.glow2);

    mount.appendChild(dom.overlay);

    dom.deck = dom.overlay.querySelector(".pn-ob-deck");
    const dotsRow = dom.overlay.querySelector(".pn-ob-dots");

    dom.cards = [];
    dom.dots = [];

    for (let i = 0; i < CARDS.length; i += 1) {
      const cardNode = renderCard(CARDS[i], i);
      dom.cards.push(cardNode);
      dom.deck.appendChild(cardNode);
    }

    for (let i = 0; i < CARDS.length; i += 1) {
      const dot = document.createElement("span");
      dot.className = "pn-ob-dot";
      dotsRow.appendChild(dot);
      dom.dots.push(dot);
    }

    dom.cards[0].classList.add("active");
    triggerCardEnter(0);

    bindEvents();
  };

  /* ===========================
     PUBLIC API
     =========================== */

  const start = async ({ onComplete } = {}) => {
    state.currentCard = 0;
    state.totalCards = CARDS.length;
    state.transitioning = false;
    state.dotsRevealed = false;
    completionResolver = typeof onComplete === "function" ? onComplete : null;

    const existing = document.getElementById("pn-onboarding");
    if (existing) existing.remove();

    renderOnboarding();
  };

  window.Onboarding = {
    CARDS,
    state,
    start,
    renderOnboarding,
    renderCard,
    completeOnboarding,
  };
})();

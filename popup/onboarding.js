/**
 * File: popup/onboarding.js
 * Purpose: Premium onboarding with per-card animations, ambient glow, text reveals, and confetti.
 * Design language: Linear.app onboarding meets Vercel dashboard — dark, precise, motion-forward.
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
      hint: "private \u00B7 flexible \u00B7 powerful",
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
      subline: "Inject saved prompts into ChatGPT, Claude, Gemini, and more.",
      hint: "5 platforms supported",
    },
    {
      id: "export",
      headline: "Export with intention",
      subline:
        "Markdown, PDF, JSON, Notion \u2014 your conversations, your format.",
      hint: "smart names \u00B7 bookmarks included",
    },
    {
      id: "ai",
      headline: "Smart AI built in",
      subline:
        "Semantic search and provider routing \u2014 ready when you are.",
      hint: "\u2726 Search model ready",
    },
    {
      id: "ready",
      headline: "You're all set",
      subline: "Start building your prompt library.",
      hint: "let's go \u2192",
      isFinal: true,
    },
  ];

  const GLOW_POSITIONS = [
    { top: "20%", left: "30%" },
    { top: "60%", left: "55%" },
    { top: "35%", left: "20%" },
    { top: "55%", left: "40%" },
    { top: "25%", left: "60%" },
    { top: "40%", left: "35%" },
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
    cards: [],
    dots: [],
    timers: [],
  };

  let completionResolver = null;

  /* ===========================
     UTILITIES
     =========================== */

  /** Pauses execution for the specified milliseconds. */
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /** Schedules a callback and tracks the timer for cleanup. */
  const schedule = (fn, delay) => {
    const id = setTimeout(fn, delay);
    dom.timers.push(id);
    return id;
  };

  /** Clears all scheduled timers. */
  const clearTimers = () => {
    dom.timers.forEach((id) => clearTimeout(id));
    dom.timers.length = 0;
  };

  /* ===========================
     TEXT ANIMATION SYSTEM
     =========================== */

  /**
   * Reveals text with character, word, or typewriter animation.
   * @param {HTMLElement} el - The element containing the text.
   * @param {'charReveal'|'wordFade'|'lineDraw'} type - Animation type.
   * @param {number} delay - Milliseconds before animation starts.
   */
  const animateText = (el, type, delay) => {
    if (!el) {
      return;
    }

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
            span.style.animationDelay = `${i * 30}ms`;
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
          span.style.animationDelay = `${i * 60}ms`;
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
        // Measure natural width
        el.style.visibility = "hidden";
        el.style.width = "auto";
        const naturalWidth = el.scrollWidth;
        el.style.width = "0";
        el.style.setProperty("--hint-width", naturalWidth + "px");
        el.classList.add("typing");

        // After typeOut (0.8s) + 3 cursor blinks (2.4s), hide cursor
        schedule(() => {
          el.classList.remove("typing");
          el.classList.add("typed");
        }, 2500);
      }, delay);
    }
  };

  /* ===========================
     GLOW ORB
     =========================== */

  /** Moves the ambient glow orb to the position for the given card index. */
  const moveGlow = (index) => {
    if (!dom.glow) {
      return;
    }

    const pos = GLOW_POSITIONS[index] || GLOW_POSITIONS[0];
    dom.glow.style.top = pos.top;
    dom.glow.style.left = pos.left;
  };

  /* ===========================
     PROGRESS DOTS
     =========================== */

  /** Reveals all dots with staggered scaleIn animation (runs once on first card enter). */
  const revealDots = (baseDelay) => {
    if (state.dotsRevealed) {
      return;
    }

    state.dotsRevealed = true;
    dom.dots.forEach((dot, i) => {
      schedule(
        () => {
          dot.classList.add("visible");
        },
        baseDelay + i * 40,
      );
    });
  };

  /** Updates dot states to reflect the current card index. */
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

  /** Returns the SVG/HTML markup for each card's illustration area. */
  const getVisualHTML = (cardId) => {
    switch (cardId) {
      case "welcome":
        return `
          <svg class="pn-ob-logo-svg" viewBox="0 0 80 80" width="80" height="80">
            <circle cx="40" cy="40" r="36" class="pn-ob-logo-ring" />
            <path class="logo-stroke"
              d="M28,58 L28,22 L40,22 C48,22 54,27 54,34 C54,41 48,46 40,46 L28,46" />
            <path class="logo-fill"
              d="M30,56 L30,24 L40,24 C47,24 52,28.5 52,34 C52,39.5 47,44 40,44 L30,44 Z" />
          </svg>`;

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
            <div class="pn-ob-platform-icon">G</div>
            <div class="pn-ob-platform-icon">C</div>
            <div class="pn-ob-platform-icon">\u2726</div>
            <div class="pn-ob-platform-icon">P</div>
            <div class="pn-ob-platform-icon">\u229E</div>
            <svg class="pn-ob-connect-line" viewBox="0 0 200 36">
              <path d="M10,28 Q55,4 100,18 Q145,32 190,8" />
            </svg>
          </div>`;

      case "export":
        return `
          <div class="pn-ob-bridge">
            <div class="pn-ob-bridge-panel left">
              <span class="panel-icon">\uD83D\uDCC4</span>
              Export
            </div>
            <svg class="pn-ob-bridge-arrow" viewBox="0 0 40 20">
              <path class="arrow-path" d="M2,10 L30,10 M26,5 L32,10 L26,15" />
              <g class="travel-group">
                <circle r="2.5" cx="2" cy="10" />
              </g>
            </svg>
            <div class="pn-ob-bridge-panel right">
              <span class="panel-icon">\uD83D\uDCAC</span>
              Continue
            </div>
          </div>`;

      case "ai":
        return `
          <div class="pn-ob-ai-section">
            <div class="pn-ob-ai-badge">
              <span class="pn-ob-ai-dot"></span>
              <span class="pn-ob-ai-text">\u2726 Search model ready</span>
            </div>
            <div class="pn-ob-waveform">
              <div class="pn-waveform-bar"></div>
              <div class="pn-waveform-bar"></div>
              <div class="pn-waveform-bar"></div>
              <div class="pn-waveform-bar"></div>
              <div class="pn-waveform-bar"></div>
            </div>
          </div>`;

      case "ready":
        return `
          <div class="pn-ob-check-wrap">
            <svg class="pn-ob-check-svg" viewBox="0 0 64 64" width="64" height="64">
              <circle cx="32" cy="32" r="29" class="check-fill" />
              <circle cx="32" cy="32" r="29" class="check-circle" />
              <polyline points="20,34 28,42 44,24" class="check-mark" />
            </svg>
            <div class="pn-ob-check-ripple"></div>
          </div>`;

      default:
        return "";
    }
  };

  /* ===========================
     PER-CARD VISUAL ANIMATIONS
     =========================== */

  /** Triggers card-specific visual animations after the visual fades in. */
  const triggerCardVisual = (cardEl, cardId) => {
    const visual = cardEl.querySelector(".pn-ob-visual");

    if (!visual) {
      return;
    }

    switch (cardId) {
      /* Card 1 — Logo stroke draw + fill + ring expand */
      case "welcome": {
        const svg = visual.querySelector(".pn-ob-logo-svg");

        if (svg) {
          svg.classList.remove("animate");
          schedule(() => {
            svg.classList.add("animate");
          }, 80);
        }

        break;
      }

      /* Card 2 — Variable highlight underlines + fill badge */
      case "templates": {
        const v1 = visual.querySelector('[data-var="1"]');
        const v2 = visual.querySelector('[data-var="2"]');
        const badge = visual.querySelector(".pn-ob-fill-badge");

        if (v1) {
          v1.classList.remove("reveal");
          schedule(() => {
            v1.classList.add("reveal");
          }, 200);
        }

        if (v2) {
          v2.classList.remove("reveal");
          schedule(() => {
            v2.classList.add("reveal");
          }, 500);
        }

        if (badge) {
          badge.classList.remove("reveal");
          schedule(() => {
            badge.classList.add("reveal");
          }, 700);
        }

        break;
      }

      /* Card 3 — Platform logos stagger + connecting line */
      case "platforms": {
        const icons = visual.querySelectorAll(".pn-ob-platform-icon");
        const line = visual.querySelector(".pn-ob-connect-line");

        icons.forEach((icon, i) => {
          icon.classList.remove("reveal");
          schedule(
            () => {
              icon.classList.add("reveal");
            },
            80 + i * 80,
          );
        });

        if (line) {
          line.classList.remove("reveal");
          schedule(
            () => {
              line.classList.add("reveal");
            },
            80 + icons.length * 80 + 100,
          );
        }

        break;
      }

      /* Card 4 — Panels slide in + arrow draw + traveling dot */
      case "export": {
        const leftPanel = visual.querySelector(".pn-ob-bridge-panel.left");
        const rightPanel = visual.querySelector(".pn-ob-bridge-panel.right");
        const arrow = visual.querySelector(".pn-ob-bridge-arrow");

        if (leftPanel) {
          leftPanel.classList.remove("reveal-left");
          schedule(() => {
            leftPanel.classList.add("reveal-left");
          }, 100);
        }

        if (rightPanel) {
          rightPanel.classList.remove("reveal-right");
          schedule(() => {
            rightPanel.classList.add("reveal-right");
          }, 100);
        }

        if (arrow) {
          arrow.classList.remove("reveal", "travel");
          schedule(() => {
            arrow.classList.add("reveal");
          }, 400);
          schedule(() => {
            arrow.classList.add("travel");
          }, 800);
        }

        break;
      }

      /* Card 5 — Badge fade + green blink + charReveal on text + waveform */
      case "ai": {
        const badge = visual.querySelector(".pn-ob-ai-badge");
        const dot = visual.querySelector(".pn-ob-ai-dot");
        const textEl = visual.querySelector(".pn-ob-ai-text");
        const waveform = visual.querySelector(".pn-ob-waveform");

        if (badge) {
          badge.classList.remove("reveal");
          schedule(() => {
            badge.classList.add("reveal");
          }, 0);
        }

        if (dot) {
          dot.classList.remove("blink");
          schedule(() => {
            dot.classList.add("blink");
          }, 80);
        }

        if (textEl) {
          animateText(textEl, "charReveal", 200);
        }

        if (waveform) {
          waveform.classList.remove("reveal");
          schedule(() => {
            waveform.classList.add("reveal");
          }, 0);
        }

        break;
      }

      /* Card 6 — Check draw + ripple + confetti */
      case "ready": {
        const svg = visual.querySelector(".pn-ob-check-svg");
        const ripple = visual.querySelector(".pn-ob-check-ripple");

        if (svg) {
          svg.classList.remove("animate");
          schedule(() => {
            svg.classList.add("animate");
          }, 80);
        }

        if (ripple) {
          ripple.classList.remove("animate");
          schedule(() => {
            ripple.classList.add("animate");
          }, 80);
        }

        schedule(() => {
          fireConfetti(cardEl);
        }, 800);

        break;
      }

      default:
        break;
    }
  };

  /* ===========================
     CONFETTI SYSTEM
     =========================== */

  /** Fires 30 physics-based confetti particles from the card center. */
  const fireConfetti = (container) => {
    const canvas = document.createElement("canvas");
    canvas.className = "pn-ob-confetti-canvas";
    canvas.width = container.offsetWidth || 400;
    canvas.height = container.offsetHeight || 500;
    container.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    const particles = [];
    const colors = ["#8b7cf6", "#ffffff", "#6366f1", "#a78bfa", "#c4b5fd"];

    const cx = canvas.width / 2;
    const cy = canvas.height * 0.42;

    for (let i = 0; i < 30; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 4;

      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3.5,
        size: 3 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1,
        decay: 0.012 + Math.random() * 0.008,
        gravity: 0.08,
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 8,
      });
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;

      for (const p of particles) {
        if (p.life <= 0) {
          continue;
        }

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

        // Mix of rectangles and small circles for variety
        if (p.size > 5) {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
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

  /**
   * Triggers the full card enter choreography for the given index.
   * Follows the exact delay table from the spec.
   */
  const triggerCardEnter = (index) => {
    clearTimers();

    const cardEl = dom.cards[index];
    const data = CARDS[index];

    if (!cardEl || !data) {
      return;
    }

    // headline: charReveal at 180ms
    const headlineEl = cardEl.querySelector(".pn-ob-headline");
    animateText(headlineEl, "charReveal", 180);

    // subline: wordFade at 380ms
    const sublineEl = cardEl.querySelector(".pn-ob-subline");
    animateText(sublineEl, "wordFade", 380);

    // hint: typeOut at 580ms
    const hintEl = cardEl.querySelector(".pn-ob-hint");
    animateText(hintEl, "lineDraw", 580);

    // Per-card visual animation triggers
    triggerCardVisual(cardEl, data.id);

    // Progress dots: staggered scaleIn at 700ms (first time only)
    revealDots(700);
    updateDots();

    // Move glow orb
    moveGlow(index);
  };

  /* ===========================
     CARD RESET (for re-entry)
     =========================== */

  /** Resets all animation states on a card so it can re-enter cleanly. */
  const resetCard = (cardEl) => {
    if (!cardEl) {
      return;
    }

    cardEl.classList.remove("active", "exit");

    // Reset headline
    const headline = cardEl.querySelector(".pn-ob-headline");

    if (headline) {
      const text = headline.getAttribute("data-text") || headline.textContent;
      headline.setAttribute("data-text", text);
      headline.textContent = text;
    }

    // Reset subline
    const subline = cardEl.querySelector(".pn-ob-subline");

    if (subline) {
      const text = subline.getAttribute("data-text") || subline.textContent;
      subline.setAttribute("data-text", text);
      subline.textContent = text;
    }

    // Reset hint
    const hint = cardEl.querySelector(".pn-ob-hint");

    if (hint) {
      hint.classList.remove("typing", "typed");
      hint.style.width = "0";
      hint.style.removeProperty("--hint-width");
    }

    // Reset visual classes — remove common animation trigger classes
    const classesToReset = [
      ".pn-ob-logo-svg",
      ".pn-ob-var-highlight",
      ".pn-ob-fill-badge",
      ".pn-ob-platform-icon",
      ".pn-ob-connect-line",
      ".pn-ob-bridge-panel",
      ".pn-ob-bridge-arrow",
      ".pn-ob-ai-badge",
      ".pn-ob-ai-dot",
      ".pn-ob-waveform",
      ".pn-ob-check-svg",
      ".pn-ob-check-ripple",
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
        );
      });
    });

    // Remove confetti canvas if present
    const confetti = cardEl.querySelector(".pn-ob-confetti-canvas");

    if (confetti) {
      confetti.remove();
    }
  };

  /* ===========================
     NAVIGATION
     =========================== */

  /** Navigates to the next card with exit/enter choreography. */
  const nextCard = async () => {
    if (state.transitioning) {
      return;
    }

    if (state.currentCard >= state.totalCards - 1) {
      await completeOnboarding();
      return;
    }

    state.transitioning = true;
    const currentEl = dom.cards[state.currentCard];
    const nextIndex = state.currentCard + 1;
    const nextEl = dom.cards[nextIndex];

    // 1. Exit current card
    currentEl.classList.remove("active");
    currentEl.classList.add("exit");

    // 2. Wait for exit animation (200ms)
    await sleep(200);

    // 3. Clean up current, prepare next
    currentEl.classList.remove("exit");
    resetCard(nextEl);

    // 4. Enter next card
    state.currentCard = nextIndex;
    nextEl.classList.add("active");
    triggerCardEnter(nextIndex);

    state.transitioning = false;
  };

  /** Skips directly to the final card. */
  const skipToEnd = async () => {
    if (state.transitioning) {
      return;
    }

    state.transitioning = true;
    const currentEl = dom.cards[state.currentCard];
    const endIndex = state.totalCards - 1;
    const endEl = dom.cards[endIndex];

    // Exit current
    currentEl.classList.remove("active");
    currentEl.classList.add("exit");

    await sleep(200);

    currentEl.classList.remove("exit");

    // Mark all intermediate dots as visited
    for (let i = state.currentCard; i < endIndex; i += 1) {
      if (dom.dots[i] && !dom.dots[i].classList.contains("visited")) {
        dom.dots[i].classList.add("visited");
      }
    }

    // Enter final card
    resetCard(endEl);
    state.currentCard = endIndex;
    endEl.classList.add("active");
    triggerCardEnter(endIndex);

    state.transitioning = false;
  };

  /* ===========================
     OVERLAY LIFECYCLE
     =========================== */

  /** Finalizes onboarding, saves flag, removes overlay, calls completion callback. */
  const completeOnboarding = async () => {
    await chrome.storage.local.set({ [ONBOARDING_KEY]: true });
    clearTimers();

    const overlay = dom.overlay || document.getElementById("pn-onboarding");

    if (overlay) {
      overlay.classList.add("pn-ob-exit");
      await sleep(350);
      overlay.remove();
    }

    // Remove glow orb
    if (dom.glow) {
      dom.glow.remove();
      dom.glow = null;
    }

    if (typeof completionResolver === "function") {
      await completionResolver({ aiInitialized: false });
    }
  };

  /* ===========================
     EVENT HANDLING
     =========================== */

  /** Handles button clicks within the onboarding overlay. */
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

  /** Handles keyboard navigation (right/left arrow, Enter, Escape). */
  const onKeyDown = async (event) => {
    if (!dom.overlay) {
      return;
    }

    if (event.key === "ArrowRight" || event.key === "Enter") {
      event.preventDefault();
      await nextCard();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      await skipToEnd();
    }
  };

  /** Binds all event listeners for the onboarding overlay. */
  const bindEvents = () => {
    if (!dom.overlay) {
      return;
    }

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

  /** Builds one onboarding card element with visual, text, and actions. */
  const renderCard = (data, index) => {
    const node = document.createElement("section");
    node.className = "pn-onboarding-card";
    node.dataset.index = String(index);
    node.dataset.cardId = data.id;

    const btnLabel = data.isFinal ? "Get Started" : "Continue";
    const btnAction = data.isFinal ? "get-started" : "continue";
    const skipMarkup = data.isFinal
      ? ""
      : `<button class="pn-ob-skip" type="button" data-action="skip">Skip</button>`;

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

  /** Builds the complete onboarding overlay with glow, cards, and dots. */
  const renderOnboarding = () => {
    const mount =
      document.getElementById("pn-onboarding-mount") || document.body;

    // Create glow orb
    dom.glow = document.createElement("div");
    dom.glow.className = "pn-onboarding-glow";
    dom.glow.style.top = GLOW_POSITIONS[0].top;
    dom.glow.style.left = GLOW_POSITIONS[0].left;

    // Create overlay
    dom.overlay = document.createElement("div");
    dom.overlay.id = "pn-onboarding";
    dom.overlay.innerHTML = `
      <div class="pn-ob-deck"></div>
      <div class="pn-ob-dots"></div>
    `;

    // Append glow inside overlay
    dom.overlay.appendChild(dom.glow);

    mount.appendChild(dom.overlay);

    dom.deck = dom.overlay.querySelector(".pn-ob-deck");
    const dotsRow = dom.overlay.querySelector(".pn-ob-dots");

    dom.cards = [];
    dom.dots = [];

    // Render all cards
    for (let i = 0; i < CARDS.length; i += 1) {
      const cardNode = renderCard(CARDS[i], i);
      dom.cards.push(cardNode);
      dom.deck.appendChild(cardNode);
    }

    // Render dots
    for (let i = 0; i < CARDS.length; i += 1) {
      const dot = document.createElement("span");
      dot.className = "pn-ob-dot";
      dotsRow.appendChild(dot);
      dom.dots.push(dot);
    }

    // Activate first card
    dom.cards[0].classList.add("active");
    triggerCardEnter(0);

    bindEvents();
  };

  /* ===========================
     PUBLIC API
     =========================== */

  /** Starts the onboarding flow from card 0 and calls onComplete when finished. */
  const start = async ({ onComplete } = {}) => {
    state.currentCard = 0;
    state.totalCards = CARDS.length;
    state.transitioning = false;
    state.dotsRevealed = false;
    completionResolver = typeof onComplete === "function" ? onComplete : null;

    const existing = document.getElementById("pn-onboarding");

    if (existing) {
      existing.remove();
    }

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

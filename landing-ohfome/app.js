const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const header = document.querySelector("[data-header]");
if (header) {
  addEventListener("scroll", () => header.classList.toggle("is-scrolled", scrollY > 20), { passive: true });
}
const yearEl = document.querySelector("[data-year]");
if (yearEl) yearEl.textContent = new Date().getFullYear();

function fallbackReveal() {
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); }
  }), { threshold: 0.14 });
  document.querySelectorAll(".reveal").forEach((item) => observer.observe(item));

  document.querySelectorAll('a[href^="#"]').forEach((link) => link.addEventListener("click", (event) => {
    const targetSel = link.getAttribute("href");
    const target = targetSel && targetSel.length > 1 ? document.querySelector(targetSel) : null;
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
}

async function setupMotion() {
  if (reducedMotion) {
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-visible"));
    return;
  }

  try {
    // gsap core + ScrollTrigger must come from the same bundle (the "all" build) or
    // jsdelivr's per-path +esm bundler hands back two separate gsap cores and the
    // plugin silently never drives the tweens it thinks it's controlling.
    const [{ default: Lenis }, { gsap, ScrollTrigger }] = await Promise.all([
      import("https://cdn.jsdelivr.net/npm/@studio-freight/lenis@1.0.42/+esm"),
      import("https://cdn.jsdelivr.net/npm/gsap@3.12.5/all/+esm"),
    ]);

    gsap.registerPlugin(ScrollTrigger);
    document.documentElement.classList.add("motion-ready");

    // Lenis drives the actual scroll; GSAP's ticker drives Lenis so both stay in sync.
    const lenis = new Lenis({ duration: 1.05, smoothWheel: true, touchMultiplier: 1.15, easing: (t) => 1 - Math.pow(1 - t, 4) });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);

    document.querySelectorAll('a[href^="#"]').forEach((link) => link.addEventListener("click", (event) => {
      const targetSel = link.getAttribute("href");
      const target = targetSel && targetSel.length > 1 ? document.querySelector(targetSel) : null;
      if (!target) return;
      event.preventDefault();
      lenis.scrollTo(target, { offset: -90 });
    }));

    // Every .reveal block fades and lifts into place as it clears the fold, staggered
    // by a hair within each section so groups of cards don't pop in as one flat block.
    const groups = new Map();
    document.querySelectorAll(".reveal").forEach((el) => {
      const section = el.closest("section") || document.body;
      if (!groups.has(section)) groups.set(section, []);
      groups.get(section).push(el);
    });
    groups.forEach((els) => {
      gsap.set(els, { autoAlpha: 0, y: 34 });
      gsap.to(els, {
        autoAlpha: 1,
        y: 0,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.09,
        scrollTrigger: { trigger: els[0], start: "top 90%" },
      });
    });
  } catch {
    fallbackReveal();
  }
}

setupMotion();

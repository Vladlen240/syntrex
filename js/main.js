// Smooth scroll for the whole site (Lenis); anchor links glide too
(() => {
  if (!window.Lenis || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const lenis = new Lenis({ duration: 1.2, easing: (t) => 1 - Math.pow(1 - t, 4) });
  const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  window.lenis = lenis;
  // every button to the form glides there; the farther the block, the longer the ride (1.2s..3.2s)
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    const target = a && a.hash.length > 1 && document.querySelector(a.hash);
    if (!target) return;
    e.preventDefault();
    const dist = Math.abs(target.getBoundingClientRect().top) / innerHeight;
    lenis.scrollTo(target, {
      duration: Math.min(1.2 + dist * .25, 3.2),
      easing: (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    });
  });
})();

// Hero container: on scroll it lags behind the page and slides under the bottom edge of the hero,
// so Block 02 rides over it (the cable top stays above the screen the whole time)
(() => {
  const box = document.querySelector('.hero__container');
  if (!box || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // the container drops by y * SPEED inside the hero and is cut at the top of Block 02 (hero height
  // + gap below it), so it is fully hidden once y * SPEED = that distance: with 1.2 this happens
  // while Block 02 is still ~20% of the screen below the top
  const SPEED = 1.2;
  const CUT = 8; // the container is cut this many rem above Block 02 (= clip-path of .hero in CSS)
  // cables stay glued to the top of the screen: a pixel row of the PNG from the bare-cable part (row 100)
  // is stretched upward above the image, so the container drops on longer cables, not detached ones
  const img = box.querySelector('img');
  const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize);
  // the row is read from a plain copy of the current file (its real pixels, whatever the screen picked)
  // and kept as a picture, not a live canvas: a canvas can be wiped by the browser after a while
  const cables = document.createElement('div');
  cables.className = 'hero__cables';
  (img.closest('picture') || img).before(cables);
  const addCables = () => {
    const src = new Image();
    src.onload = () => {
      const c = document.createElement('canvas');
      c.width = src.naturalWidth; c.height = 1;
      const row = Math.round(src.naturalHeight * 100 / 1080); // row 100 of 1080 (the phone image is smaller)
      c.getContext('2d').drawImage(src, 0, row, c.width, 1, 0, 0, c.width, 1);
      cables.style.backgroundImage = `url(${c.toDataURL()})`;
    };
    src.src = img.currentSrc || img.src;
  };
  if (img.complete && img.naturalWidth) addCables();
  img.addEventListener('load', addCables); // again when the phone / PC file is swapped on resize
  const mobile = matchMedia('(max-width: 1023px)'); // on phones the container only drops in, no scroll ride
  const update = () => {
    if (mobile.matches) { box.style.translate = ''; box.classList.remove('is-gone'); return; }
    const next = box.parentElement.nextElementSibling; // Block 02
    const end = ((next ? next.offsetTop : box.offsetHeight) - CUT * rem()) / SPEED; // the container is fully cut off
    const y = Math.min(scrollY, end);
    box.style.translate = y ? `0 ${Math.round(y * SPEED)}px` : ''; // whole px: no shimmer at the cable joint
    // once the pulley (row 217 of 1080 in the PNG, everything above is bare cable) is under Block 02,
    // only cables would be left on screen: the whole picture fades out a bit before that, while the
    // pulley is still 8rem above Block 02 (back on scroll up)
    const r = img.getBoundingClientRect();
    box.classList.toggle('is-gone', !!next && r.top + r.height * 217 / 1080 + 8 * rem() >= next.getBoundingClientRect().top - CUT * rem());
  };
  addEventListener('scroll', update, { passive: true });
  mobile.addEventListener('change', update);
  update();
})();

// Block 02 heading: letters fade in from 0 in random order once the heading reaches 80% of the screen
// (as in orgnzm.studio "About": 2s per letter, .01s stagger, power1.out)
(() => {
  const DURATION = 2, STAGGER = 0.01;
  document.querySelectorAll('[data-scroll-reveal]').forEach((el) => {
    // wrap every word (the Parabole accent letter stays glued to its word)
    el.innerHTML = el.innerHTML.replace(/(<i[^>]*>.*?<\/i>)?([^\s<]+)/g, (m) => `<span class="w">${m}</span>`);
    const all = [...el.querySelectorAll('.w')];
    const orange = +el.dataset.orangeWords || 0; // leading words that are always orange
    all.slice(0, orange).forEach((w) => w.classList.add('w--orange'));

    // split words into letters (the accent <i> counts as one letter)
    const chars = [];
    all.forEach((w) => [...w.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        [...n.textContent].forEach((c) => { const s = document.createElement('span'); s.className = 'ch'; s.textContent = c; frag.append(s); chars.push(s); });
        n.replaceWith(frag);
      } else { n.classList.add('ch'); chars.push(n); }
    }));
    // random order
    const order = chars.map((_, i) => i).sort(() => Math.random() - 0.5);
    order.forEach((ci, k) => { chars[ci].style.transitionDelay = `${k * STAGGER}s`; chars[ci].style.transitionDuration = `${DURATION}s`; });

    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      el.classList.add('is-in');
      io.disconnect();
    }, { rootMargin: '0px 0px -20% 0px' });
    io.observe(el);
  });
})();

// Block 02 clients slider: the same four cards cycle left / right
(() => {
  const track = document.querySelector('.clients__track');
  const prev = document.querySelector('.slider-nav__btn--prev');
  const next = document.querySelector('.slider-nav__btn--next');
  if (!track) return;

  const DURATION = 700;
  const EASE = 'cubic-bezier(.22, 1, .36, 1)';
  let busy = false;
  const step = () => track.children[0].getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap);

  const slide = (dir) => {
    if (busy) return;
    busy = true;
    const d = step();
    // a copy of the card entering from the edge keeps the row full while it moves
    if (dir > 0) {
      track.append(track.firstElementChild.cloneNode(true));
      track.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${-d}px)` }], { duration: DURATION, easing: EASE })
        .onfinish = () => { track.firstElementChild.remove(); busy = false; };
    } else {
      track.prepend(track.lastElementChild.cloneNode(true));
      track.animate([{ transform: `translateX(${-d}px)` }, { transform: 'translateX(0)' }], { duration: DURATION, easing: EASE })
        .onfinish = () => { track.lastElementChild.remove(); busy = false; };
    }
  };

  next.addEventListener('click', () => slide(1));
  prev.addEventListener('click', () => slide(-1));

  // phones: the row follows the finger; a copy of the neighbour card on each side keeps it endless,
  // past 20% of a card it snaps to the next / previous one, otherwise back
  const box = track.parentElement;
  let x0, y0, dx, d, drag = null;
  box.addEventListener('touchstart', (e) => {
    if (busy) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; drag = false;
  }, { passive: true });
  box.addEventListener('touchmove', (e) => {
    if (drag === null) return;
    dx = e.touches[0].clientX - x0;
    const dy = e.touches[0].clientY - y0;
    if (!drag) {
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; } // page scroll
      if (Math.abs(dx) < 8) return;
      drag = true; busy = true; d = step();
      track.prepend(track.lastElementChild.cloneNode(true));
      track.append(track.children[1].cloneNode(true));
    }
    track.style.transform = `translateX(${-d + dx}px)`;
  }, { passive: true });
  box.addEventListener('touchend', () => {
    if (!drag) { drag = null; return; }
    drag = null;
    const dir = dx < -d * .2 ? 1 : dx > d * .2 ? -1 : 0;
    track.style.transform = '';
    track.animate([{ transform: `translateX(${-d + dx}px)` }, { transform: `translateX(${-d - dir * d}px)` }], { duration: DURATION * .8, easing: EASE })
      .onfinish = () => {
        track.firstElementChild.remove(); track.lastElementChild.remove(); // the two copies
        if (dir > 0) track.append(track.firstElementChild);
        if (dir < 0) track.prepend(track.lastElementChild);
        busy = false;
      };
  });
})();




// Block 04 video: loaded only when the block comes near the screen (its own lighter file on phones)
(() => {
  const v = document.querySelector('.mission__video');
  if (!v) return;
  const mobile = matchMedia('(max-width: 1023px)');
  const load = () => {
    v.poster = mobile.matches ? v.dataset.posterMob : v.dataset.poster;
    v.src = mobile.matches ? v.dataset.srcMob : v.dataset.src;
    v.play().catch(() => {});
  };
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    load();
    mobile.addEventListener('change', load); // window resized across the breakpoint: switch to the other cut
  }, { rootMargin: '100% 0px' });
  io.observe(v);
})();

// Block 04 stats: numbers count up from zero when the cards scroll into view
(() => {
  const nums = document.querySelectorAll('[data-count]');
  const fmt = (n) => n.toLocaleString('en-US');
  const run = (el) => {
    const end = +el.dataset.count, suffix = el.dataset.suffix || '', t0 = performance.now(), DUR = 1800;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / DUR);
      el.textContent = fmt(Math.round(end * (1 - Math.pow(1 - p, 3)))) + suffix; // ease-out cubic
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  nums.forEach((el) => { el.textContent = '0' + (el.dataset.suffix || ''); });
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { run(e.target); io.unobserve(e.target); }
  }), { threshold: 0.6 });
  nums.forEach((el) => io.observe(el));
})();

/* Block 06 — card deck as in the reference video: the next card slides up over the current one,
   the covered card goes back (shrinks, dims a little) and up, peeking out above */
(() => {
  const cards = [...document.querySelectorAll('.stage')];
  if (!cards.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize);
  const top = (c) => c.getBoundingClientRect().top + (+c.dataset.lift || 0); // position without our transform
  const update = () => {
    const r = rem();
    // how much each card overlaps the one before it (0..1)
    const p = cards.map((c, i) => i ? Math.min(1, Math.max(0, (top(cards[i - 1]) + cards[i - 1].offsetHeight - top(c)) / cards[i - 1].offsetHeight)) : 0);
    // while the last card slides in, the whole deck closes up onto the first card
    const close = 1 - p[p.length - 1];
    cards.forEach((c, i) => {
      let depth = 0;
      for (let j = i + 1; j < cards.length; j++) depth += p[j];
      depth *= close;
      c.dataset.lift = depth * 2 * r;
      c.style.transform = depth ? `translateY(${-depth * 2}rem) scale(${1 - depth * 0.06})` : '';
      c.style.filter = depth ? `brightness(${1 - depth * 0.04})` : '';
    });
  };
  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', update);
  update();
})();

/* Block 07 — quote form: required fields + e-mail/phone format, invalid fields get a dashed outline.
   Set data-endpoint="<url>" on the form to POST the data there (no backend yet) */
(() => {
  const form = document.querySelector('.quote__form');
  if (!form) return;
  const btn = form.querySelector('.quote__submit'), label = btn.innerHTML;
  const fields = [...form.querySelectorAll('.field__input')];
  const check = (f) => {
    f.value = f.value.trimStart();
    const ok = f.checkValidity() && !(f.required && !f.value.trim());
    f.classList.toggle('is-invalid', !ok);
    return ok;
  };
  fields.forEach((f) => f.addEventListener('input', () => f.classList.contains('is-invalid') && check(f)));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bad = fields.filter((f) => !check(f));
    if (bad.length) { bad[0].focus(); return; }
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      if (form.dataset.endpoint) {
        const res = await fetch(form.dataset.endpoint, { method: 'POST', body: new FormData(form) });
        if (!res.ok) throw new Error(res.status);
      }
      form.reset();
      btn.textContent = 'Thank you! We’ll contact you shortly.';
    } catch {
      btn.textContent = 'Something went wrong. Please try again.';
    }
    setTimeout(() => { btn.disabled = false; btn.innerHTML = label; }, 4000);
  });
})();

// Accent letters that open a line: pull them left by the glyph's own side bearing,
// so the visible letter (not its empty box) sits exactly on the grid line
(() => {
  const ctx = document.createElement('canvas').getContext('2d');
  const align = () => document.querySelectorAll('.acc').forEach((el) => {
    el.style.marginLeft = '';
    const prev = el.previousSibling;
    if (prev && prev.textContent.trim()) return; // not at the start of its line
    const cs = getComputedStyle(el);
    ctx.font = `${cs.fontWeight} 100px ${cs.fontFamily}`;
    const bearing = -ctx.measureText(el.textContent).actualBoundingBoxLeft; // px at 100px
    if (bearing > 0) el.style.marginLeft = `${-bearing / 100}em`;
  });
  document.fonts.ready.then(align);
})();

// Footer: Privacy Policy / Terms of Use / Website by — no pages yet, so the click does nothing
document.querySelectorAll('[data-soon]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); }));

// Footer newsletter: checks the e-mail; no backend yet, so it just thanks the visitor
(() => {
  const form = document.querySelector('.footer__mail');
  if (!form) return;
  const input = form.elements.email;
  input.addEventListener('input', () => input.classList.remove('is-error'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim())) { input.classList.add('is-error'); input.focus(); return; }
    input.value = '';
    input.placeholder = 'Thank you for subscribing!';
  });
})();

// Mobile menu: Menu opens the orange panel, Close / any link closes it (page doesn't scroll while it's open)
(() => {
  const menu = document.getElementById('mmenu');
  const open = document.querySelector('.menu__toggle');
  if (!menu || !open) return;
  const theme = document.querySelector('meta[name="theme-color"]'); // Safari's bars take this colour
  const set = (on) => {
    menu.classList.toggle('is-open', on);
    if (theme) theme.content = on ? '#FF5D00' : '#FAFAFA';
    menu.setAttribute('aria-hidden', String(!on));
    document.documentElement.style.overflow = on ? 'hidden' : '';
    if (window.lenis) on ? lenis.stop() : lenis.start();
  };
  open.addEventListener('click', () => set(true));
  menu.querySelector('.mmenu__close').addEventListener('click', () => set(false));
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.classList.contains('is-open')) set(false); });
})();

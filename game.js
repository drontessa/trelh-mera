/* Движок игры. Содержимое — в content.js */
(() => {
  "use strict";
  const G = window.GAME;
  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };

  // ---------- Звук (пока все sound: null — заглушки) ----------
  const Sound = {
    current: null, src: null,
    play(src) {
      if (src === this.src) return;
      this.stop();
      this.src = src || null;
      if (!src) return;
      const a = new Audio(src);
      a.loop = true; a.volume = 0.5;
      a.play().catch(() => {}); // нет файла или автоплей запрещён — молча игнорируем
      this.current = a;
    },
    stop() { if (this.current) { this.current.pause(); this.current = null; } this.src = null; }
  };

  // ---------- Состояние ----------
  let S;
  function reset() {
    S = { i: -1, stats: {}, flags: new Set(), log: [] };
    for (const k in G.stats) S.stats[k] = 0;
  }

  const cond = (list) => !list || list.every((c) =>
    c.startsWith("!") ? !S.flags.has(c.slice(1)) : S.flags.has(c));
  const resolve = (v) => Array.isArray(v) ? (v.find((x) => cond(x.if)) || {}).text || "" : v;

  function apply(o) {
    if (!o) return;
    for (const [k, v] of Object.entries(o.effects || {})) S.stats[k] += v;
    (o.set || []).forEach((f) => S.flags.add(f));
  }
  function addLog(time, log) { if (log) S.log.push({ time, ...log }); }

  // ---------- Экран ----------
  const stage = $("#stage"), art = $("#art"), clock = $("#clock"), box = $("#box");

  function setScene(bg, artText, time) {
    stage.className = "stage bg-" + (bg || "default");
    art.textContent = artText || "";
    art.classList.remove("pop"); void art.offsetWidth; art.classList.add("pop");
    clock.textContent = time ? "🕒 " + time : "";
    clock.hidden = !time;
  }
  function clearBox() { box.innerHTML = ""; box.classList.remove("fade"); void box.offsetWidth; box.classList.add("fade"); }

  function nextButton(label, fn) {
    const b = el("button", "btn next", label || G.ui.next);
    b.onclick = fn;
    b.dataset.hotkey = "next";
    return b;
  }

  // ---------- Старт ----------
  function startScreen() {
    reset();
    Sound.stop();
    setScene("title", "😵 ⏰ 🏃 🎂 😴", null);
    clearBox();
    box.append(el("h1", "title", G.title));
    G.intro.forEach((p, i) => box.append(el("p", i ? "intro em" : "intro", p)));
    box.append(nextButton(G.ui.start, nextScene));
  }

  function nextScene() {
    S.i++;
    const sc = G.scenes[S.i];
    if (!sc) return results();
    sc._time = resolve(sc.time);
    setScene(sc.bg, sc.art, sc._time);
    Sound.play(sc.sound);
    clearBox();
    box.append(el("div", "head", `<span class="hicon">${sc.icon}</span> ${sc.title}`));
    box.append(el("p", "text", resolve(sc.text)));
    if (sc.type === "event") return eventScene(sc);
    if (sc.type === "checks") return checksScene(sc);
    choiceScene(sc);
  }

  // ---------- Обычный выбор ----------
  function choiceScene(sc) {
    const opts = sc.options.filter((o) => cond(o.if));
    const wrap = el("div", "choices" + (opts.length > 2 ? " many" : ""));
    opts.forEach((o, idx) => {
      const b = el("button", "choice");
      b.dataset.hotkey = String(idx + 1);
      const key = o.key || String(idx + 1);
      b.innerHTML =
        `<span class="key">${key}</span><span class="cicon">${o.icon || ""}</span>` +
        `<span class="ctext">${o.hint ? `<small>${o.hint}</small>` : ""}${o.text}</span>`;
      b.onclick = () => choose(sc, o, b, wrap);
      wrap.append(b);
    });
    box.append(wrap);
  }

  function choose(sc, o, btn, wrap) {
    [...wrap.children].forEach((c) => { c.disabled = true; if (c !== btn) c.classList.add("dim"); });
    btn.classList.add("picked");
    apply(o);
    addLog(sc._time, o.log);
    if (o.result) box.append(el("p", "result", "→ " + o.result));
    (sc.notes || []).filter((n) => cond(n.if)).forEach((n) =>
      box.append(el("p", "note", `${n.icon || ""} ${n.text}`)));
    box.append(nextButton(null, nextScene));
  }

  // ---------- Шаг 6: карты / кубик d4 ----------
  function eventScene(sc) {
    const cards = el("div", "cards");
    sc.events.forEach((ev) => {
      const c = el("button", "card", `<span>${ev.n}</span>`);
      c.dataset.hotkey = String(ev.n);
      c.onclick = () => reveal(ev);
      cards.append(c);
    });
    const roll = el("button", "btn roll", G.ui.roll);
    roll.dataset.hotkey = "r";
    roll.onclick = () => {
      lock();
      const result = sc.events[Math.floor(Math.random() * sc.events.length)];
      const die = el("div", "die", "?");
      box.append(die);
      let t = 0;
      const spin = setInterval(() => {
        die.textContent = 1 + (t++ % 4);
        if (t > 14) { clearInterval(spin); die.textContent = result.n; die.classList.add("land"); setTimeout(() => reveal(result, true), 500); }
      }, 70);
    };
    box.append(cards, roll);

    function lock() { [...cards.children, roll].forEach((b) => (b.disabled = true)); }
    function reveal(ev) {
      lock();
      [...cards.children].forEach((c, i) => {
        c.classList.add(sc.events[i] === ev ? "flipped" : "dim");
        if (sc.events[i] === ev) c.innerHTML = `<span>${ev.icon}</span>`;
      });
      roll.remove();
      apply(ev);
      addLog(sc._time, ev.log);
      art.textContent = ev.icon;
      box.append(el("p", "result", `${ev.icon} ${ev.text}`));
      box.append(nextButton(null, nextScene));
    }
  }

  // ---------- Шаг 8: последствия на вечеринке ----------
  function checksScene(sc) {
    addLog(sc._time, sc.log);
    const list = el("div", "checks");
    box.append(list);
    let k = 0;
    const step = () => {
      if (k >= sc.checks.length) { box.append(nextButton(null, nextScene)); return; }
      const ch = sc.checks[k++];
      const yes = S.flags.has(ch.flag);
      const out = yes ? ch.yes : ch.no;
      apply(out);
      const row = el("div", "check " + (yes ? "yes" : "no"),
        `<span class="cq">${ch.icon} ${ch.question}</span>` +
        `<span class="ca">${yes ? "✔ Ναι" : "✘ Όχι"} — ${out.text}</span>`);
      list.append(row);
      setTimeout(step, 650);
    };
    step();
  }

  // ---------- Финал ----------
  function pickEndings() {
    const vals = Object.entries(S.stats);
    const max = Math.max(...vals.map(([, v]) => Math.abs(v)));
    if (max === 0) return [];
    return vals
      .filter(([, v]) => Math.abs(v) === max)
      .map(([k, v]) => G.endings.find((e) => e.stat === k && e.sign === Math.sign(v)))
      .filter(Boolean)
      .sort((a, b) => a.order - b.order);
  }

  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  function joinGreek(parts) {
    if (parts.length <= 1) return parts.join("");
    return parts.slice(0, -1).join(", ") + " και " + parts[parts.length - 1];
  }

  function endingLines(e) {
    const out = [];
    for (const ln of e.lines) {
      if (!cond(ln.if)) continue;
      if (ln.spent) {
        const w = G.spentWords.filter((x) => cond(x.if)).map((x) => x.text);
        if (w.length) out.push(cap(w.join(", ")) + "…");
      } else if (ln.yesterday) {
        const p = ln.yesterday.filter((x) => cond(x.if)).map((x) => x.text);
        if (p.length) out.push("Χτες " + joinGreek(p) + ".");
      } else if (ln.messages) {
        ln.messages.filter((x) => cond(x.if)).forEach((m, i) =>
          out.push((i === 0 ? "Αλλά " : "Και ") + m.text));
      } else out.push(ln.text);
    }
    return out;
  }

  function results() {
    Sound.stop();
    setScene("morning", "🌅 ☕ 📱", null);
    clearBox();
    box.classList.add("final");
    box.append(el("div", "head", `<span class="hicon">🌙</span> ${G.ui.results}`));

    // таймлайн для пересказа
    const tl = el("div", "timeline");
    S.log.forEach((x) => tl.append(el("div", "tl", `<span class="tli">${x.icon}</span><span class="tlt">${x.time}</span>`)));
    tl.querySelectorAll(".tl").forEach((n, i) => (n.title = S.log[i].label));
    box.append(el("h3", "sub", G.ui.yourDay), tl);

    // концовки
    const ends = pickEndings();
    const endsWrap = el("div", "endings");
    ends.forEach((e) => {
      const c = el("div", "ending");
      c.append(el("div", "etitle", `<span>${e.icon}</span> ${e.title || "…"}`));
      c.append(el("p", "eh", G.endingHeader));
      const lines = endingLines(e);
      (lines.length ? lines : [G.emptyEnding]).forEach((l) => c.append(el("p", "et", l)));
      endsWrap.append(c);
    });
    box.append(endsWrap);

    // очки (раскрываются только сейчас)
    const st = el("div", "stats");
    for (const [k, v] of Object.entries(S.stats)) {
      const m = G.stats[k];
      st.append(el("div", "stat " + (v > 0 ? "pos" : v < 0 ? "neg" : "zero"),
        `<span>${m.icon}</span><b>${v > 0 ? "+" : ""}${v}</b><small>${m.name}</small>`));
    }
    box.append(el("h3", "sub", G.ui.yourStats), st);

    box.append(el("p", "retell", "🗣️ " + G.retell));
    box.append(nextButton(G.ui.restart, startScreen));
  }

  // ---------- Клавиатура: 1–4 / A,B / Α,Β, Enter/пробел, R ----------
  document.addEventListener("keydown", (ev) => {
    if (ev.repeat) return;
    let k = ev.key.toLowerCase();
    if (k === "a" || k === "α") k = "1";
    if (k === "b" || k === "β") k = "2";
    if (k === "enter" || k === " ") k = "next";
    const b = [...box.querySelectorAll("button[data-hotkey]")].find((x) => x.dataset.hotkey === k && !x.disabled);
    if (b) { ev.preventDefault(); b.click(); }
  });

  startScreen();
})();

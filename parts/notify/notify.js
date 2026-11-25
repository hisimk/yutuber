/* =========================================================
   Notify — スマホの上に出る「メッセージアプリの通知」の部品
   ・どのゲーム・ページでも使える。ほかのファイルには頼らない（このファイル1つ＋アイコン画像）
   ・差出人・文・アイコンを渡すと1通出る。上から出てくる → 横か上へスワイプで消える／放っておくと消える
   ・見た目（色・大きさ・出る位置・消えるまでの時間）は、作る時に変えられる
   ・同じ絵をキャンバスにも描く（録画やWebGLの画面に重ねたい時に使える）
   使い方は README.md と demo.html を見る
   2026-11-25 『幽tuber』の通知（SPH）から取り出した
   ========================================================= */
(function (root) {
  'use strict';
  var BASE = (function () {   /* このファイルの置き場所（アイコンの場所を決めるため） */
    try { var s = document.currentScript; if (s && s.src) return s.src.replace(/[^/]*$/, ''); } catch (e) { }
    return '';
  })();

  var DEF = {
    root: null,            /* 表示を入れる要素（なければ document.body） */
    zIndex: 34,
    auto: true,            /* true：自分で時間を進めて動く。false：使う側が tick(dt) と layout() を呼ぶ */
    life: 6,               /* さわらなければ、この秒数で消える */
    maxLife: 20,           /* swipeOnly の通知でも、この秒数で消える */
    slideIn: 0.25,         /* 出てくるまでの秒数 */
    outSpeed: 6,           /* 消える速さ（大きいほど速い） */
    swipeX: 60, swipeY: 30, /* これ以上動かしたらスワイプで消す（px） */
    /* 大きさ・位置（geo を渡すと、そちらを使う） */
    width: 0.92, maxWidth: 520, heightRatio: 0.24, top: function (H) { return Math.max(H * 0.12, 64); },
    geo: null,             /* function () { return { W, H, w, h, top, left, ox, oy } } */
    /* 見た目 */
    bg: 'rgba(236,236,240,0.94)', bgDom: 'rgba(236,236,240,0.96)', nameColor: '#111', timeColor: '#777', textColor: '#222',
    radius: 18, font: '-apple-system,"Hiragino Sans",sans-serif',
    timeLabel: '今',       /* 右上の「今」。文字か、function (note) { return '…' } */
    canvas: true, canvasWidth: 720,   /* キャンバスにも描く（録画用など）。幅は360の倍数にするときれい */
    sound: null,           /* 出た時に鳴らす音のURL（使う側で鳴らすなら null） */
    vibrate: 0,            /* 出た時にふるわせる長さ（ミリ秒。0で無し） */
    onShow: null,          /* function (note) */
    onHide: null,          /* function (note, reason)  reason: 'swipe' | 'timeout' | 'replace' | 'clear' */
    onDraw: null           /* キャンバスを描き直した時 function (canvas) */
  };
  var CW = 360;   /* 絵の基準の幅 */
  var BREAK = ['！', '？', '。', '、'];

  function css(o) {
    return '.ntf-root{position:fixed;inset:0;pointer-events:none;z-index:' + o.zIndex + '}' +
      '.ntf-ban{position:absolute;display:none;box-sizing:border-box;pointer-events:auto;touch-action:none;overflow:hidden;will-change:transform,opacity;cursor:grab;background:var(--ntf-bg);color:var(--ntf-name);font-family:var(--ntf-font)}' +
      '.ntf-ban .ic{position:absolute;left:3.3%;top:50%;transform:translateY(-50%);height:46%;aspect-ratio:1;border-radius:22%}' +
      '.ntf-ban .nm{position:absolute;left:17.2%;top:20%;font-weight:700;white-space:nowrap}' +
      '.ntf-ban .tm{position:absolute;right:3.9%;top:22%;color:var(--ntf-time)}' +
      '.ntf-ban .tx{position:absolute;left:17.2%;right:3.9%;top:52%;color:var(--ntf-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.ntf-ban .tx.two{top:40%;white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.3;word-break:keep-all;overflow-wrap:anywhere}';
  }

  function Notifier(opts) {
    var o = this.o = {}; var k; for (k in DEF) o[k] = DEF[k]; for (k in (opts || {})) o[k] = opts[k];
    this.active = null; this.drag = false; this.img = {};
    var r = this.el = document.createElement('div'); r.className = 'ntf-root';
    r.style.setProperty('--ntf-bg', o.bgDom); r.style.setProperty('--ntf-name', o.nameColor); r.style.setProperty('--ntf-time', o.timeColor); r.style.setProperty('--ntf-text', o.textColor); r.style.setProperty('--ntf-font', o.font);
    r.innerHTML = '<div class="ntf-ban"><img class="ic" alt=""><b class="nm"></b><span class="tm"></span><span class="tx"></span></div>';
    if (!document.getElementById('ntf-style-' + o.zIndex)) { var st = document.createElement('style'); st.id = 'ntf-style-' + o.zIndex; st.textContent = css(o); document.head.appendChild(st); }
    (o.root || document.body).appendChild(r);
    this.ban = r.querySelector('.ntf-ban');
    if (o.canvas) { var c = this.canvas = document.createElement('canvas'); c.width = o.canvasWidth; c.height = Math.round(o.canvasWidth * o.heightRatio); }
    this._swipe();
    if (o.auto) this._loop();
  }

  Notifier.prototype = {
    /* 1通出す。o：{ name, text, icon（画像のURL か Notify.icon('msg') など）, life, swipeOnly, data } */
    show: function (n) {
      var old = this.active; if (old) this._hide(old, 'replace');
      var N = { name: n.name || '', text: n.text || '', icon: n.icon || '', life: n.life != null ? n.life : this.o.life, swipeOnly: !!n.swipeOnly, data: n.data, t: 0, dx: 0, dy: 0, out: 0, drawn: false };
      this.active = N; this.drag = false; this._draw(N);
      var im = this._icon(N.icon), self = this;
      if (im && !im.complete) im.addEventListener('load', function () { if (self.active === N) self._draw(N); }, { once: true });
      if (this.o.sound) try { var a = new Audio(this.o.sound); a.play().catch(function () { }); } catch (e) { }
      if (this.o.vibrate && navigator.vibrate) try { navigator.vibrate(this.o.vibrate); } catch (e) { }
      if (this.o.onShow) try { this.o.onShow(N); } catch (e) { }
      return N;
    },
    /* 出ている通知を、すぐ消す */
    clear: function () { var N = this.active; if (N) this._hide(N, 'clear'); this.drag = false; this.ban.style.display = 'none'; },
    /* アイコンを先に読み込んでおく */
    preload: function (urls) { for (var i = 0; i < urls.length; i++) this._icon(urls[i]); },
    destroy: function () { this.dead = true; this.clear(); try { this.el.remove(); } catch (e) { } },

    /* 時間を進める（auto:false の時は使う側が毎フレーム呼ぶ） */
    tick: function (dt) {
      var B = this.active, o = this.o; if (!B) return; B.t += dt;
      if (!B.out && !this.drag && B.t > B.life && !B.swipeOnly) { B.out = 1; B.why = 'timeout'; }
      if (!B.out && B.swipeOnly && B.t > o.maxLife) { B.out = 1; B.why = 'timeout'; }
      if (B.out) { B.out += dt * o.outSpeed; if (B.dx === 0 && B.dy === 0) B.dy = -1; if (B.out > 2) { this._hide(B, B.why || 'timeout'); return; } }
      if (!this.drag && !B.out) { B.dx *= 0.75; B.dy *= 0.75; }
    },
    /* 大きさと位置（px） */
    geo: function () {
      var o = this.o; if (o.geo) return o.geo();
      var W = innerWidth, H = innerHeight, w = Math.min(W * o.width, o.maxWidth), h = w * o.heightRatio, top = typeof o.top === 'function' ? o.top(H, W) : o.top;
      return { W: W, H: H, w: w, h: h, top: top, left: (W - w) / 2, ox: 0, oy: 0 };
    },
    /* 今のずれと濃さ（WebGLなどに重ねる時に使う）。G は geo() の答え */
    frame: function (G) {
      G = G || this.geo(); var B = this.active; if (!B) return { visible: false };
      var slide = Math.min(1, B.t / this.o.slideIn), dyIn = (1 - slide) * -(G.top + G.h);
      var dx = B.dx + (B.out ? Math.sign(B.dx || 0) * G.W * (B.out - 1) : 0);
      var dy = B.dy + dyIn + (B.out && !B.dx ? -(G.top + G.h) * Math.min(1, B.out - 1) : 0);
      return { visible: B.drawn, dx: dx, dy: dy, opacity: B.out ? Math.max(0, 2 - B.out) : 1, x: G.left + dx, y: G.top + dy, w: G.w, h: G.h, out: !!B.out };
    },
    /* 画面の表示（HTML）を今の位置に合わせる。hidden：一時的に隠す */
    layout: function (G, hidden) {
      G = G || this.geo(); var B = this.active, e = this.ban, F = this.frame(G);
      if (!B || !F.visible || hidden) { e.style.display = 'none'; return; }
      var f = G.w / CW, s = e.style;
      s.display = 'block'; s.left = (G.ox + G.left) + 'px'; s.top = (G.oy + G.top) + 'px'; s.width = G.w + 'px'; s.height = G.h + 'px'; s.borderRadius = (this.o.radius * f) + 'px';
      s.transform = 'translate(' + F.dx + 'px,' + F.dy + 'px)'; s.opacity = F.opacity; s.pointerEvents = B.out ? 'none' : 'auto';
      e.querySelector('.nm').style.fontSize = (14 * f) + 'px'; e.querySelector('.tm').style.fontSize = (12 * f) + 'px'; e.querySelector('.tx').style.fontSize = (13 * f) + 'px';
      if (B.fitW !== G.w) { B.fitW = G.w; var tx = e.querySelector('.tx'); tx.classList.remove('two'); if (tx.scrollWidth > tx.clientWidth + 1) tx.classList.add('two'); }   /* 見えてから、長い文は2行に */
    },

    /* ── ここから中のしくみ ── */
    _hide: function (N, why) { if (this.active === N) this.active = null; if (!N.gone) { N.gone = true; if (this.o.onHide) try { this.o.onHide(N, why); } catch (e) { } } },
    _icon: function (u) { if (!u) return null; var im = this.img[u]; if (!im) { im = new Image(); im.src = u; this.img[u] = im; } return im; },
    _time: function (N) { var t = this.o.timeLabel; return typeof t === 'function' ? t(N) : t; },
    _draw: function (N) {
      var o = this.o, im = this._icon(N.icon), tm = this._time(N);
      if (this.canvas) {
        var c = this.canvas, k = c.width / CW, cw = CW, ch = c.height / k, g = c.getContext('2d'), F = o.font;
        g.setTransform(k, 0, 0, k, 0, 0); g.clearRect(0, 0, cw, ch);
        g.fillStyle = o.bg; g.beginPath(); if (g.roundRect) g.roundRect(1, 1, cw - 2, ch - 2, o.radius); else g.rect(1, 1, cw - 2, ch - 2); g.fill();
        if (im && im.complete && im.naturalWidth) g.drawImage(im, 12, (ch - 40) / 2, 40, 40);
        g.textAlign = 'left'; g.fillStyle = o.nameColor; g.font = '700 14px ' + F; g.fillText(N.name, 62, 32);
        g.fillStyle = o.timeColor; g.font = '12px ' + F; g.textAlign = 'right'; g.fillText(tm, cw - 14, 31);
        g.textAlign = 'left'; g.fillStyle = o.textColor; g.font = '13px ' + F;
        var L = this._lines(g, N.text, cw - 62 - 14);
        for (var i = 0; i < L.length; i++) g.fillText(L[i], 62, (L.length > 1 ? 51 : 56) + i * 18);
        if (o.onDraw) try { o.onDraw(c); } catch (e) { }
      }
      N.drawn = true;
      var e = this.ban; e.querySelector('.ic').src = (im && im.src) || ''; e.querySelector('.ic').style.visibility = im ? '' : 'hidden';
      e.querySelector('.nm').textContent = N.name; e.querySelector('.tm').textContent = tm;
      var tx = e.querySelector('.tx'); tx.textContent = N.text; tx.classList.remove('two'); if (tx.scrollWidth > tx.clientWidth + 1) tx.classList.add('two');
    },
    /* 文を2行までに分ける。日本語は「！？。、」の後ろ、英語は空白で切る。入らない分は「…」 */
    _lines: function (g, t, mw) {
      var L = [], rest = t || '', en = !/[　-鿿＀-￯]/.test(rest);
      for (var li = 0; li < 2 && rest; li++) {
        var n = rest.length; while (n > 1 && g.measureText(rest.slice(0, n)).width > mw) n--;
        if (n < rest.length) {
          var cut = en ? rest.lastIndexOf(' ', n) : Math.max.apply(null, BREAK.map(function (c) { return rest.lastIndexOf(c, n - 1) + 1; }));
          if (cut > 0) n = en ? cut + 1 : cut;
        }
        var line = rest.slice(0, n); rest = rest.slice(n);
        if (li === 1 && rest) { while (line.length > 1 && g.measureText(line + '…').width > mw) line = line.slice(0, -1); line += '…'; }
        L.push(line.trim());
      }
      return L;
    },
    _swipe: function () {
      var self = this, e = this.ban, x0 = 0, y0 = 0;
      ['pointerdown', 'touchstart', 'click'].forEach(function (t) { e.addEventListener(t, function (ev) { ev.stopPropagation(); }); });
      e.addEventListener('pointerdown', function (ev) { var B = self.active; if (!B || B.out) return; self.drag = true; x0 = ev.clientX; y0 = ev.clientY; try { e.setPointerCapture(ev.pointerId); } catch (er) { } });
      e.addEventListener('pointermove', function (ev) { var B = self.active; if (!self.drag || !B) return; B.dx = ev.clientX - x0; B.dy = Math.min(0, ev.clientY - y0); });
      var up = function () { if (!self.drag) return; self.drag = false; var B = self.active; if (B && (Math.abs(B.dx) > self.o.swipeX || B.dy < -self.o.swipeY)) { B.out = 1; B.why = 'swipe'; if (Math.abs(B.dx) < 10) B.dy = Math.min(B.dy, -1); } };
      e.addEventListener('pointerup', up); e.addEventListener('pointercancel', up);
    },
    _loop: function () {
      var self = this, last = performance.now();
      var step = function (now) { if (self.dead) return; var dt = Math.min(0.1, (now - last) / 1000); last = now; self.tick(dt); self.layout(); requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
  };

  var Notify = {
    version: '1.0.0',
    base: BASE,
    /* 部品に入っているアイコン：'msg' 'photo' 'point' 'dating' 'eng' */
    icon: function (name) { return BASE + 'icons/' + name + '.webp'; },
    create: function (opts) { return new Notifier(opts); }
  };
  root.Notify = Notify;
})(typeof window !== 'undefined' ? window : this);

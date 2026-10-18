/* pwa.js — ลงทะเบียน Service Worker, ปุ่มติดตั้งแอป, ป้ายสถานะออฟไลน์, ปุ่มกลับหน้าหลัก */
(function () {
  'use strict';

  var inFrame = window.self !== window.top;           // เปิดอยู่ในหน้าพรีวิว (iframe)
  var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  var isIndex = /(^|\/)(index\.html)?$/.test(location.pathname);
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var deferredPrompt = null;

  /* ---------- 1) Service Worker ---------- */
  if ('serviceWorker' in navigator && !inFrame) {
    var hadController = !!navigator.serviceWorker.controller;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (err) {
        console.warn('Service Worker ลงทะเบียนไม่สำเร็จ (ต้องเปิดผ่าน https หรือ localhost):', err);
      });
    });
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (hadController) showPill('update');          // มีเวอร์ชันใหม่ทำงานแล้ว
      hadController = true;
    });
    // ขอให้เบราว์เซอร์ไม่ลบข้อมูลที่บันทึกในเครื่องเมื่อพื้นที่เต็ม
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(function () {});
    }
  }

  /* ---------- 2) UI ลอย (มุมซ้ายล่าง) ---------- */
  var box;
  function ensureBox() {
    if (box || inFrame) return box;
    box = document.createElement('div');
    box.setAttribute('style', 'position:fixed;left:12px;bottom:max(12px,env(safe-area-inset-bottom));z-index:9998;display:flex;flex-direction:column;gap:8px;align-items:flex-start;font-family:Sarabun,system-ui,sans-serif;');
    document.body.appendChild(box);
    return box;
  }
  var pillStyle = 'display:inline-flex;align-items:center;gap:6px;border:0;border-radius:999px;padding:8px 14px;font:600 13px/1.2 Sarabun,system-ui,sans-serif;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer;text-decoration:none;';
  var pills = {};
  function showPill(kind, text, onClick, bg) {
    if (!ensureBox()) return;
    var map = {
      update: ['🔄 มีเวอร์ชันใหม่ — แตะเพื่อโหลดใหม่', '#b45309', function () { location.reload(); }],
      offline: ['📴 ออฟไลน์ — ข้อมูลยังบันทึกในเครื่องได้', '#475569', null]
    };
    var d = map[kind] || [text, bg || '#065f46', onClick];
    var el = pills[kind] || document.createElement(d[2] ? 'button' : 'div');
    el.setAttribute('style', pillStyle + 'background:' + d[1] + ';' + (d[2] ? '' : 'cursor:default;'));
    el.textContent = d[0];
    el.onclick = d[2];
    if (!pills[kind]) { pills[kind] = el; box.appendChild(el); }
  }
  function hidePill(kind) {
    if (pills[kind]) { pills[kind].remove(); delete pills[kind]; }
  }

  // ปุ่มกลับหน้าหลัก (เฉพาะหน้า farm / health ที่เปิดเต็มจอ)
  function addHomeButton() {
    if (inFrame || isIndex || !ensureBox()) return;
    var a = document.createElement('a');
    a.href = 'index.html';
    a.textContent = '← หน้าหลัก';
    a.setAttribute('style', pillStyle + 'background:rgba(6,78,59,.92);');
    box.insertBefore(a, box.firstChild);
  }

  /* ---------- 3) สถานะออนไลน์ / ออฟไลน์ ---------- */
  function syncOnline() {
    if (navigator.onLine) hidePill('offline'); else showPill('offline');
  }
  window.addEventListener('online', syncOnline);
  window.addEventListener('offline', syncOnline);

  /* ---------- 4) ติดตั้งแอป ---------- */
  function installTargets() { return document.querySelectorAll('[data-pwa-install]'); }
  function setInstallVisible(v) {
    Array.prototype.forEach.call(installTargets(), function (el) { el.style.display = v ? '' : 'none'; });
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    setInstallVisible(true);
    if (!inFrame && !isIndex) showPill('install', '⬇️ ติดตั้งแอป', window.PWA.install, '#065f46');
  });
  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    setInstallVisible(false);
    hidePill('install');
  });

  function iosHelp() {
    alert('ติดตั้งบน iPhone / iPad\n\n1) เปิดหน้านี้ด้วย Safari\n2) แตะปุ่มแชร์ (สี่เหลี่ยมมีลูกศรขึ้น)\n3) เลือก "เพิ่มไปยังหน้าจอโฮม" (Add to Home Screen)');
  }

  window.PWA = {
    install: function () {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        return deferredPrompt.userChoice.then(function () { deferredPrompt = null; setInstallVisible(false); hidePill('install'); });
      }
      if (isIOS) { iosHelp(); return; }
      alert('เบราว์เซอร์นี้ยังไม่แสดงตัวเลือกติดตั้งอัตโนมัติ\nลองเมนู ⋮ หรือไอคอนติดตั้งในแถบที่อยู่ แล้วเลือก "ติดตั้งแอป" / "Add to Home screen"');
    },
    isStandalone: isStandalone
  };

  document.addEventListener('DOMContentLoaded', function () {
    addHomeButton();
    syncOnline();
    // ปุ่มติดตั้งในหน้าแรก: ซ่อนไว้ก่อน แสดงเมื่อติดตั้งได้ (iOS แสดงเป็นปุ่ม "วิธีติดตั้ง")
    Array.prototype.forEach.call(installTargets(), function (el) {
      el.addEventListener('click', function (ev) { ev.preventDefault(); window.PWA.install(); });
    });
    setInstallVisible(!!deferredPrompt || (!isStandalone && isIOS && !inFrame));
  });
})();

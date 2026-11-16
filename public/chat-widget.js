/* Website live chat widget. Embed: <script src="https://YOUR-APP/chat-widget.js" data-key="wk_..." async></script>
 * No cookies, no tracking. The visitor id is random and kept in this browser's localStorage. */
(function () {
  var s =
    document.currentScript || document.querySelector('script[data-key][src*="chat-widget.js"]');
  if (!s) return;
  var key = s.getAttribute("data-key");
  if (!/^wk_[A-Za-z0-9]{24}$/.test(key || "")) return;
  var api = new URL(s.src).origin + "/api/public/chat/" + key;
  var store = "tt_chat_" + key;
  var visitor;
  try {
    visitor = localStorage.getItem(store);
  } catch (e) {}
  if (!visitor || !/^v_[0-9a-f-]{36}$/.test(visitor)) {
    visitor =
      "v_" +
      (crypto.randomUUID
        ? crypto.randomUUID()
        : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, function (c) {
            return (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(
              16,
            );
          }));
    try {
      localStorage.setItem(store, visitor);
    } catch (e) {}
  }
  var last = null,
    seen = {},
    timer = null,
    open = false;
  var css =
    "#ttc-btn{position:fixed;right:16px;bottom:16px;z-index:2147483000;width:56px;height:56px;border-radius:50%;border:0;background:#2563eb;color:#fff;font-size:24px;box-shadow:0 6px 20px rgba(0,0,0,.25);cursor:pointer}" +
    "#ttc-box{position:fixed;right:16px;bottom:84px;z-index:2147483000;width:min(360px,calc(100vw - 32px));height:min(520px,calc(100vh - 120px));background:#fff;color:#111;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.3);display:none;flex-direction:column;overflow:hidden;font:14px/1.4 system-ui,sans-serif}" +
    "#ttc-box header{background:#2563eb;color:#fff;padding:12px 14px;font-weight:600;display:flex;justify-content:space-between;align-items:center}" +
    "#ttc-log{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:#f8fafc}" +
    ".ttc-m{max-width:80%;padding:8px 10px;border-radius:12px;white-space:pre-wrap;word-wrap:break-word}.ttc-v{align-self:flex-end;background:#2563eb;color:#fff}.ttc-t{align-self:flex-start;background:#fff;border:1px solid #e2e8f0}" +
    "#ttc-form{display:flex;gap:6px;padding:8px;border-top:1px solid #e2e8f0}#ttc-in{flex:1;border:1px solid #cbd5e1;border-radius:10px;padding:8px;font:inherit;resize:none}#ttc-send{border:0;border-radius:10px;background:#2563eb;color:#fff;padding:0 14px;font-weight:600;cursor:pointer}";
  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);
  var btn = document.createElement("button");
  btn.id = "ttc-btn";
  btn.type = "button";
  btn.setAttribute("aria-label", "Open chat");
  btn.textContent = "\uD83D\uDCAC";
  var box = document.createElement("div");
  box.id = "ttc-box";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", "Chat");
  box.innerHTML =
    '<header><span id="ttc-title">Chat</span><button type="button" id="ttc-x" aria-label="Close chat" style="background:none;border:0;color:#fff;font-size:20px;cursor:pointer">\u00D7</button></header><div id="ttc-log" aria-live="polite"></div><form id="ttc-form"><textarea id="ttc-in" rows="2" maxlength="2000" placeholder="Type your message\u2026" aria-label="Message"></textarea><button id="ttc-send" type="submit">Send</button></form>';
  document.body.appendChild(btn);
  document.body.appendChild(box);
  var log = box.querySelector("#ttc-log"),
    input = box.querySelector("#ttc-in");
  function add(from, text, id) {
    if (id && seen[id]) return;
    if (id) seen[id] = 1;
    var d = document.createElement("div");
    d.className = "ttc-m " + (from === "visitor" ? "ttc-v" : "ttc-t");
    d.textContent = text;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  }
  var greeted = false;
  function poll() {
    fetch(
      api +
        "?visitor=" +
        encodeURIComponent(visitor) +
        (last ? "&after=" + encodeURIComponent(last) : ""),
    )
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (j) {
        if (!j) return;
        box.querySelector("#ttc-title").textContent = j.business || "Chat";
        if (!greeted) {
          greeted = true;
          add("team", j.greeting);
        }
        (j.messages || []).forEach(function (m) {
          add(m.from, m.text, m.id);
          last = m.at;
        });
      })
      .catch(function () {});
  }
  function toggle(v) {
    open = v;
    box.style.display = v ? "flex" : "none";
    btn.setAttribute("aria-label", v ? "Close chat" : "Open chat");
    clearInterval(timer);
    if (v) {
      poll();
      timer = setInterval(poll, 5000);
      input.focus();
    }
  }
  btn.onclick = function () {
    toggle(!open);
  };
  box.querySelector("#ttc-x").onclick = function () {
    toggle(false);
  };
  box.querySelector("#ttc-form").onsubmit = function (e) {
    e.preventDefault();
    var t = input.value.trim();
    if (!t) return;
    input.value = "";
    add("visitor", t);
    fetch(api, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visitor: visitor, text: t }),
    })
      .then(function (r) {
        if (!r.ok)
          add(
            "team",
            r.status === 429
              ? "You're sending messages too fast \u2014 please wait a moment."
              : "Message not sent. Please try again.",
          );
        else setTimeout(poll, 1500);
      })
      .catch(function () {
        add("team", "Message not sent. Check your connection.");
      });
  };
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      box.querySelector("#ttc-form").requestSubmit();
    }
  });
})();

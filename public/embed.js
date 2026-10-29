/* Drop-in booking widget. Served by this scheduler.
   <div data-open-scheduler></div>
   <script src="https://your-host.example/embed.js" async></script>
   The same script also upgrades <open-scheduler>. */
(function () {
  var SOURCE = "open-scheduler";
  var EMBED_JS = /\/embed\.js(?:\?|#|$)/;

  function schedulerOrigin() {
    var current = document.currentScript;
    if (current && current.src) return new URL(current.src).origin;
    var scripts = document.getElementsByTagName("script");
    for (var i = scripts.length - 1; i >= 0; i -= 1) {
      var src = scripts[i].src || "";
      if (EMBED_JS.test(src)) return new URL(src, window.location.href).origin;
    }
    return "";
  }

  var origin = schedulerOrigin();

  function mount(el) {
    if (!(el instanceof HTMLElement)) return;
    if (el.getAttribute("data-open-scheduler-mounted") === "true") return;
    if (!origin) return;
    el.setAttribute("data-open-scheduler-mounted", "true");

    var iframe = document.createElement("iframe");
    iframe.src = origin + "/embed";
    iframe.title = "Book a meeting";
    iframe.setAttribute("scrolling", "no");
    iframe.style.cssText = [
      "width:100%",
      "border:0",
      "display:block",
      "overflow:hidden",
      "background:#fff",
      "color-scheme:light",
      "height:" + (el.getAttribute("data-height") || "720px"),
    ].join(";");
    el.style.display = "block";
    el.replaceChildren(iframe);

    window.addEventListener("message", function (event) {
      if (event.origin !== origin || event.source !== iframe.contentWindow) return;
      var data = event.data;
      if (!data || data.source !== SOURCE) return;
      if (data.type === "resize" && typeof data.height === "number" && isFinite(data.height)) {
        iframe.style.height = Math.max(160, Math.ceil(data.height) + 2) + "px";
      }
      if (data.type === "booked") {
        el.dispatchEvent(
          new CustomEvent("open-scheduler:booked", {
            bubbles: true,
            detail: { startsAt: typeof data.startsAt === "string" ? data.startsAt : null },
          })
        );
      }
    });
  }

  function scan() {
    var nodes = document.querySelectorAll("[data-open-scheduler], open-scheduler");
    for (var i = 0; i < nodes.length; i += 1) mount(nodes[i]);
  }

  if (!customElements.get(SOURCE)) {
    customElements.define(
      SOURCE,
      class extends HTMLElement {
        connectedCallback() {
          mount(this);
        }
      }
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan);
  } else {
    scan();
  }
})();

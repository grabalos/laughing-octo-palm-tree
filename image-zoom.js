/* ─── IMAGE ZOOM (phones) ────────────────────────────────────────────────── */
// Case-study sections are desktop compositions exported as images, so on a
// phone their text is too small to read. Tapping one opens it at a readable
// size in a full-screen view that pans by dragging, centred on the tap point.
// Desktop is unaffected: the handlers only act below the phone breakpoint.
(function () {
  const phone = window.matchMedia("(max-width: 640px)");
  const images = document.querySelectorAll(".cs-img");
  if (!images.length) return;

  let viewer = null;
  let opener = null;

  function setInteractive() {
    images.forEach((img) => {
      if (phone.matches) {
        img.setAttribute("role", "button");
        img.setAttribute("tabindex", "0");
      } else {
        img.removeAttribute("role");
        img.removeAttribute("tabindex");
      }
    });
  }

  function open(img, tapX, tapY) {
    opener = img;
    viewer = document.createElement("div");
    viewer.className = "zoom-viewer";
    viewer.setAttribute("role", "dialog");
    viewer.setAttribute("aria-modal", "true");
    viewer.setAttribute("aria-label", img.alt);
    viewer.innerHTML =
      '<button type="button" class="zoom-viewer__close">✕ Close</button>' +
      '<div class="zoom-viewer__scroller"></div>';

    const big = document.createElement("img");
    big.className = "zoom-viewer__img";
    big.src = img.currentSrc || img.src;
    big.alt = img.alt;
    big.width = img.naturalWidth || img.width;
    big.height = img.naturalHeight || img.height;

    const scroller = viewer.querySelector(".zoom-viewer__scroller");
    scroller.appendChild(big);
    viewer.querySelector(".zoom-viewer__close").addEventListener("click", () => history.back());

    document.body.appendChild(viewer);
    document.documentElement.classList.add("is-zoom-open");

    // Land on the spot that was tapped rather than the top-left corner
    const rect = img.getBoundingClientRect();
    const fx = rect.width ? (tapX - rect.left) / rect.width : 0;
    const fy = rect.height ? (tapY - rect.top) / rect.height : 0;
    scroller.scrollLeft = fx * scroller.scrollWidth - scroller.clientWidth / 2;
    scroller.scrollTop = fy * scroller.scrollHeight - scroller.clientHeight / 2;

    viewer.querySelector(".zoom-viewer__close").focus();

    // The phone's Back gesture closes the viewer instead of leaving the page
    history.pushState({ zoom: true }, "");
  }

  function teardown() {
    if (!viewer) return;
    viewer.remove();
    viewer = null;
    document.documentElement.classList.remove("is-zoom-open");
    if (opener) opener.focus({ preventScroll: true });
  }

  images.forEach((img) => {
    img.addEventListener("click", (e) => {
      if (phone.matches && !viewer) open(img, e.clientX, e.clientY);
    });
    img.addEventListener("keydown", (e) => {
      if (!phone.matches || viewer || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      const r = img.getBoundingClientRect();
      open(img, r.left + r.width / 2, r.top + r.height / 2);
    });
  });

  window.addEventListener("popstate", teardown);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && viewer) history.back();
  });

  phone.addEventListener("change", () => {
    setInteractive();
    if (!phone.matches && viewer) history.back();
  });
  // Inside an iframe the query can be evaluated before layout and never fire
  // `change`; re-syncing on load/resize keeps the button role accurate there.
  window.addEventListener("load", setInteractive);
  window.addEventListener("resize", setInteractive);
  setInteractive();
})();

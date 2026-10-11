// KaTeX can wrap between .base spans; each span must remain mathematically intact.
export function createMathLayout(root) {
  let formulas = [];
  let frame = 0;
  let widths = new WeakMap();

  function contentWidth(element) {
    const style = getComputedStyle(element);
    return element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  }

  function availableWidth(math) {
    const prose = math.closest('.prose');
    let block = math.parentElement;
    while (block !== prose && getComputedStyle(block).display === 'inline') {
      block = block.parentElement;
    }
    return Math.min(contentWidth(block), contentWidth(prose));
  }

  function fit() {
    frame = 0;
    formulas = formulas.filter(math => math.isConnected);
    // Always measure at the original size, so formulas grow back on wider screens.
    for (const math of formulas) math.style.removeProperty('font-size');
    const sizes = formulas.map(math => {
      const bases = math.querySelectorAll(':scope > .katex-html > .base');
      const widest = Math.max(0, ...Array.from(bases, base => base.getBoundingClientRect().width));
      const available = availableWidth(math) - 2;
      const size = parseFloat(getComputedStyle(math).fontSize);
      return available > 0 && widest > available ? size * available / widest : null;
    });
    formulas.forEach((math, index) => {
      if (sizes[index] !== null) math.style.fontSize = `${sizes[index]}px`;
    });
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(fit);
  }

  const observer = new ResizeObserver(entries => {
    for (const entry of entries) {
      const width = entry.contentRect.width;
      if (widths.get(entry.target) !== width) {
        widths.set(entry.target, width);
        schedule();
      }
    }
  });
  document.fonts.ready.then(schedule);
  document.fonts.addEventListener('loadingdone', schedule);

  return {
    refresh() {
      observer.disconnect();
      widths = new WeakMap();
      cancelAnimationFrame(frame);
      formulas = Array.from(root.querySelectorAll('.prose .katex'));
      fit();
      for (const prose of root.querySelectorAll('.prose')) observer.observe(prose);
    }
  };
}

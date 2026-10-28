// Animate semantic changes only: snapshot refreshes must not replay the UI.
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const running = new WeakMap();
function enter(element, emphasis = false) {
  if (reducedMotion.matches || !element?.isConnected || element.closest('[hidden]')) return;
  running.get(element)?.cancel();
  const animation = element.animate(emphasis
    ? [{ transform: 'scale(.96)', opacity: .65 }, { transform: 'scale(1)', opacity: 1 }]
    : [{ transform: 'translateY(10px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
  { duration: emphasis ? 260 : 340, easing: 'cubic-bezier(.22,1,.36,1)' });
  running.set(element, animation);
  animation.onfinish = () => { if (running.get(element) === animation) running.delete(element); };
}
const observer = new MutationObserver(records => {
  const targets = new Map();
  for (const record of records) {
    const element = record.target;
    if (record.attributeName === 'hidden' && !element.hidden && record.oldValue !== null) {
      if (element.matches('[role=tabpanel],.app-settings-page,main>section,#petView,#marketDetail,#marketList,[id^=market-],.session-panel,#petWorkspace,#noPet,#marketReceipt')) targets.set(element, false);
    } else if (record.attributeName === 'data-state' && record.oldValue !== element.dataset.state) {
      targets.set(element, true);
    } else if (record.attributeName === 'class' && element.matches('.character-card,.theme-card,.pet-list-row') &&
      element.classList.contains('selected') && !record.oldValue?.split(/\s+/).includes('selected')) {
      targets.set(element, true);
    }
  }
  for (const [element, emphasis] of targets) {
    // A newly visible page already carries its nested panels with it.
    if (![...targets.keys()].some(parent => parent !== element && parent.contains(element))) enter(element, emphasis);
  }
});
observer.observe(document.body, { subtree: true, attributes: true, attributeOldValue: true,
  attributeFilter: ['hidden', 'data-state', 'class'] });
// Details and select menus use native CSS transitions, including their closing phase.

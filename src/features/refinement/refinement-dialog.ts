export const open = (): void => {
  const panel = document.getElementById('pn-improve-panel');
  if (panel) panel.classList.remove('pn-hidden');
};

export const close = (): void => {
  const panel = document.getElementById('pn-improve-panel');
  if (panel) panel.classList.add('pn-hidden');
};

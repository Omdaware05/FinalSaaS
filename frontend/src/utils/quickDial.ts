export const triggerQuickDial = (agentId?: string) => {
  window.dispatchEvent(new CustomEvent('voxora-quick-dial', { detail: { agentId } }));
};
